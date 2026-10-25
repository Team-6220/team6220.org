import { runMatch, type MatchOutput } from "./run-match.js";
import type { Job } from "./sweep.js";

export interface JobResult {
  jobId: string;
  configId: string;
  values: Record<string, number>;
  output: MatchOutput;
}

/** Runs single jobs. The runner decides what runs when; executors only run what they are given. */
export interface Executor {
  readonly concurrency: number;
  run(job: Job): Promise<MatchOutput>;
  /** Abort in-flight work if possible (worker pools terminate their workers). */
  abort?(): void;
  dispose(): void;
}

/** Runs jobs on the current thread, one at a time, yielding between matches so pause/cancel are responsive. */
export class InProcessExecutor implements Executor {
  readonly concurrency = 1;
  constructor(private throttleMs = 0) {}
  async run(job: Job): Promise<MatchOutput> {
    await new Promise((r) => setTimeout(r, this.throttleMs));
    return runMatch(job.spec);
  }
  dispose(): void {}
}

export type BatchStatus = "idle" | "running" | "paused" | "cancelled" | "done" | "failed";

export interface BatchProgress {
  status: BatchStatus;
  done: number;
  total: number;
  running: number;
  failed: number;
  elapsedMs: number;
  /** Estimated time remaining from the average job time so far. */
  etaMs: number | null;
  /** Simulated matches per minute across all workers. */
  matchesPerMinute: number;
}

export interface BatchOutcome {
  status: BatchStatus;
  results: JobResult[];
  errors: { jobId: string; message: string }[];
  elapsedMs: number;
}

export interface BatchOptions {
  onProgress?: (p: BatchProgress) => void;
  onResult?: (r: JobResult) => void;
  /** Job ids already completed (resume from a saved results file). */
  skip?: Iterable<string>;
}

/**
 * Drives a list of jobs through an executor with pause, resume, and cancel (PRD §12).
 * Pause lets in-flight matches finish and starts no new ones. Cancel stops starting jobs, aborts in-flight
 * work when the executor supports it, and resolves with the results gathered so far.
 */
export class BatchRunner {
  status: BatchStatus = "idle";
  readonly results: JobResult[] = [];
  readonly errors: { jobId: string; message: string }[] = [];
  private queue: Job[];
  private next = 0;
  private running = 0;
  private startedAt = 0;
  private resumeWaiters: (() => void)[] = [];
  private total: number;

  constructor(
    jobs: Job[],
    private executor: Executor,
    private opts: BatchOptions = {},
  ) {
    const skip = new Set(opts.skip ?? []);
    this.queue = jobs.filter((j) => !skip.has(j.id));
    this.total = this.queue.length;
  }

  get progress(): BatchProgress {
    const elapsedMs = this.startedAt ? performance.now() - this.startedAt : 0;
    const done = this.results.length;
    const avg = done ? elapsedMs / done : null;
    return {
      status: this.status,
      done,
      total: this.total,
      running: this.running,
      failed: this.errors.length,
      elapsedMs,
      etaMs: avg === null ? null : avg * (this.total - done - this.errors.length),
      matchesPerMinute: elapsedMs > 0 ? (done / elapsedMs) * 60000 : 0,
    };
  }

  async start(): Promise<BatchOutcome> {
    if (this.status !== "idle") throw new Error("A batch can only be started once.");
    this.status = "running";
    this.startedAt = performance.now();
    this.emit();
    const lanes = Array.from({ length: Math.max(1, this.executor.concurrency) }, () => this.lane());
    await Promise.all(lanes);
    if (this.status === "running" || this.status === "paused") this.status = this.errors.length && !this.results.length ? "failed" : "done";
    this.emit();
    return { status: this.status, results: this.results, errors: this.errors, elapsedMs: performance.now() - this.startedAt };
  }

  pause(): void {
    if (this.status === "running") {
      this.status = "paused";
      this.emit();
    }
  }

  resume(): void {
    if (this.status !== "paused") return;
    this.status = "running";
    for (const w of this.resumeWaiters.splice(0)) w();
    this.emit();
  }

  cancel(): void {
    if (this.status === "done" || this.status === "cancelled") return;
    this.status = "cancelled";
    this.executor.abort?.();
    for (const w of this.resumeWaiters.splice(0)) w();
    this.emit();
  }

  private async lane(): Promise<void> {
    for (;;) {
      while (this.status === "paused") await new Promise<void>((r) => this.resumeWaiters.push(r));
      if (this.status === "cancelled" || this.next >= this.queue.length) return;
      const job = this.queue[this.next++]!;
      this.running++;
      this.emit();
      try {
        const output = await this.executor.run(job);
        // A match that finished is a valid result even if the batch was cancelled meanwhile.
        const r = { jobId: job.id, configId: job.configId, values: job.values, output };
        this.results.push(r);
        this.opts.onResult?.(r);
      } catch (e) {
        if ((this.status as BatchStatus) !== "cancelled") this.errors.push({ jobId: job.id, message: (e as Error).message });
      } finally {
        this.running--;
        this.emit();
      }
    }
  }

  private emit(): void {
    this.opts.onProgress?.(this.progress);
  }
}
