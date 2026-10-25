import type { MatchOutput } from "./run-match.js";
import type { Executor } from "./runner.js";
import type { Job } from "./sweep.js";

/** Messages between the pool and a worker (packages/batch/src/worker.ts). */
export type WorkerRequest = { type: "run"; id: number; job: Job };
export type WorkerResponse = { type: "result"; id: number; output: MatchOutput } | { type: "error"; id: number; message: string };

export interface WorkerPoolOptions {
  /** Default: logical cores minus one (at least 1). */
  size?: number;
  /** Pause between jobs on each worker, for low-power devices. */
  throttleMs?: number;
  /** Override worker creation (tests, custom bundlers). */
  createWorker?: () => Worker;
}

/** Default worker factory; Vite bundles the worker from this `new URL(..., import.meta.url)` pattern. */
export function defaultWorker(): Worker {
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "goldsim-batch" });
}

interface Slot {
  worker: Worker;
  busy: boolean;
}

/** Browser executor: a pool of Web Workers each running the headless core. All compute stays on the client. */
export class WorkerPoolExecutor implements Executor {
  readonly concurrency: number;
  private slots: Slot[] = [];
  private pending = new Map<number, { resolve: (o: MatchOutput) => void; reject: (e: Error) => void; slot: Slot }>();
  private waiting: ((s: Slot) => void)[] = [];
  private nextId = 1;
  private create: () => Worker;
  private throttleMs: number;

  constructor(opts: WorkerPoolOptions = {}) {
    const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
    this.concurrency = Math.max(1, opts.size ?? cores - 1);
    this.create = opts.createWorker ?? defaultWorker;
    this.throttleMs = opts.throttleMs ?? 0;
    for (let i = 0; i < this.concurrency; i++) this.slots.push(this.spawn());
  }

  private spawn(): Slot {
    const slot: Slot = { worker: this.create(), busy: false };
    slot.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      this.release(slot);
      if (msg.type === "result") p.resolve(msg.output);
      else p.reject(new Error(msg.message));
    };
    slot.worker.onerror = (e) => {
      for (const [id, p] of this.pending)
        if (p.slot === slot) {
          this.pending.delete(id);
          p.reject(new Error(e.message || "Worker crashed."));
        }
      this.replace(slot);
    };
    return slot;
  }

  private release(slot: Slot): void {
    const handoff = () => {
      const w = this.waiting.shift();
      if (w) w(slot);
      else slot.busy = false;
    };
    if (this.throttleMs > 0) setTimeout(handoff, this.throttleMs);
    else handoff();
  }

  private replace(slot: Slot): void {
    slot.worker.terminate();
    const i = this.slots.indexOf(slot);
    const fresh = this.spawn();
    if (i >= 0) this.slots[i] = fresh;
    this.release(fresh);
  }

  private acquire(): Promise<Slot> {
    const free = this.slots.find((s) => !s.busy);
    if (free) {
      free.busy = true;
      return Promise.resolve(free);
    }
    return new Promise((r) => this.waiting.push(r));
  }

  async run(job: Job): Promise<MatchOutput> {
    if (typeof job.spec.game !== "string")
      throw new Error("Worker jobs must name the game module by id (spec.game = module id); modules with hooks cannot be sent to workers.");
    const slot = await this.acquire();
    slot.busy = true;
    const id = this.nextId++;
    return new Promise<MatchOutput>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, slot });
      slot.worker.postMessage({ type: "run", id, job } satisfies WorkerRequest);
    });
  }

  /** Terminates in-flight work and restarts the workers. */
  abort(): void {
    for (const [id, p] of this.pending) {
      this.pending.delete(id);
      p.reject(new Error("Cancelled."));
    }
    this.waiting = [];
    this.slots = this.slots.map((s) => {
      s.worker.terminate();
      return this.spawn();
    });
  }

  dispose(): void {
    for (const s of this.slots) s.worker.terminate();
    this.slots = [];
    this.waiting = [];
  }
}
