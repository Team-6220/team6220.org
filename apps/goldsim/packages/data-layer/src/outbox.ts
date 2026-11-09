import { DataLayerError } from "./types.js";

/** Errors worth retrying: lost connection or a backend that is briefly unavailable. */
export function isRetryable(e: unknown): boolean {
  if (e instanceof DataLayerError) return e.code === "network" || e.code === "unavailable";
  return e instanceof TypeError; // fetch() network failures
}

interface Entry {
  key: string;
  run: () => Promise<unknown>;
  attempts: number;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

export interface OutboxOptions {
  /** Delays between retries in ms; the last one repeats. */
  retryDelays?: number[];
  onChange?: (pending: number) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
}

/**
 * In-memory outbox for saves (PRD §14.9). Retries failed saves while the tab is open.
 * There is deliberately no durable local queue: closing the tab drops pending saves, so the app
 * warns before unload while anything is pending. Saves with the same key collapse (latest wins).
 */
export class Outbox {
  private queue: Entry[] = [];
  private running = false;
  private retryDelays: number[];
  private setTimer: (fn: () => void, ms: number) => unknown;

  constructor(private opts: OutboxOptions = {}) {
    this.retryDelays = opts.retryDelays ?? [1000, 2000, 5000, 10000, 30000];
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  }

  get pending(): number {
    return this.queue.length;
  }

  enqueue<T>(key: string, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const existing = this.queue.findIndex((e, i) => e.key === key && (i > 0 || !this.running));
      const entry: Entry = { key, run, attempts: 0, resolve: resolve as (v: unknown) => void, reject };
      if (existing >= 0) {
        // A newer save for the same item replaces the queued one; both callers get the newer result.
        const old = this.queue[existing]!;
        entry.resolve = (v) => {
          old.resolve(v);
          (resolve as (v: unknown) => void)(v);
        };
        entry.reject = (e) => {
          old.reject(e);
          reject(e);
        };
        this.queue[existing] = entry;
      } else this.queue.push(entry);
      this.opts.onChange?.(this.queue.length);
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const e = this.queue[0]!;
      try {
        const v = await e.run();
        this.queue.shift();
        e.resolve(v);
        this.opts.onChange?.(this.queue.length);
      } catch (err) {
        if (!isRetryable(err)) {
          this.queue.shift();
          e.reject(err);
          this.opts.onChange?.(this.queue.length);
          continue;
        }
        const delay = this.retryDelays[Math.min(e.attempts, this.retryDelays.length - 1)]!;
        e.attempts++;
        this.running = false;
        this.setTimer(() => void this.pump(), delay);
        return;
      }
    }
    this.running = false;
  }
}

/** Warns before the tab closes while saves are pending or work is unsaved. Returns a detach function. */
export function warnBeforeUnload(hasUnsaved: () => boolean, target: Pick<Window, "addEventListener" | "removeEventListener"> = window): () => void {
  const handler = (e: BeforeUnloadEvent) => {
    if (!hasUnsaved()) return;
    e.preventDefault();
    e.returnValue = "";
  };
  target.addEventListener("beforeunload", handler as EventListener);
  return () => target.removeEventListener("beforeunload", handler as EventListener);
}
