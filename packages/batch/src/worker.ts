// Web Worker entry: runs batch jobs headless. Spawned by WorkerPoolExecutor via defaultWorker().
import { rebuilt } from "@goldsim/game-rebuilt";
import { registerGame } from "./registry.js";
import { runMatch } from "./run-match.js";
import type { WorkerRequest, WorkerResponse } from "./worker-pool.js";

// Register every game module workers may run. Stay Gold: add next season's module here.
registerGame(rebuilt);

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(msg: WorkerResponse): void;
};

ctx.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type !== "run") return;
  try {
    const output = await runMatch(msg.job.spec);
    ctx.postMessage({ type: "result", id: msg.id, output });
  } catch (err) {
    ctx.postMessage({ type: "error", id: msg.id, message: (err as Error).message });
  }
};
