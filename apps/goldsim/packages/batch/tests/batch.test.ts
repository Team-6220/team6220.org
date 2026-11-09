import { describe, expect, it } from "vitest";
import { rebuilt, rebuiltPresets } from "@goldsim/game-rebuilt";
import { profileById } from "@goldsim/agents";
import { responseCurve, responseTable, toCSV } from "@goldsim/analytics";
import type { MatchRobot } from "@goldsim/schema";
import {
  BatchRunner,
  InProcessExecutor,
  WorkerPoolExecutor,
  buildJobs,
  completedJobIds,
  getAtPath,
  grid,
  jobsFromFile,
  latinHypercube,
  makeResultsFile,
  registerGame,
  runMatch,
  seedsFrom,
  setAtPath,
  toSamples,
  type DriverSpec,
  type MatchSpec,
  type SweepParam,
  type WorkerRequest,
  type WorkerResponse,
} from "../src/index.js";

const [OTB, TURRET] = rebuiltPresets;
const robots: MatchRobot[] = [
  { design: TURRET!, alliance: "blue", station: 1 },
  { design: OTB!, alliance: "red", station: 1 },
];
const drivers: DriverSpec[] = [{ kind: "agent", profile: profileById("balanced") }, { kind: "idle" }];
registerGame(rebuilt);

describe("runMatch", () => {
  it("is deterministic: same spec twice gives identical results and summaries", async () => {
    const spec: MatchSpec = { game: "rebuilt-2026", robots, drivers, seed: 77, stopAtSeconds: 30, telemetry: true };
    const a = await runMatch(spec);
    const b = await runMatch(spec);
    expect(JSON.stringify(a.result)).toBe(JSON.stringify(b.result));
    expect(JSON.stringify(a.summary)).toBe(JSON.stringify(b.summary));
    expect(a.events!.length).toBeGreaterThan(0);
    expect(a.summary.robots[0]!.acquired).toBe(a.result.robots[0]!.acquired);
  });

  it("names unregistered modules clearly", async () => {
    await expect(runMatch({ game: "nope-1999", robots, drivers, seed: 1 })).rejects.toThrow(/not registered/);
  });
});

describe("sweep generation", () => {
  it("sets values by index or mechanism id without touching the original", () => {
    const d = setAtPath(TURRET!, "/mechanisms/turret1/params/ballsPerSecond", 3);
    expect(getAtPath(d, "/mechanisms/3/params/ballsPerSecond")).toBe(3);
    expect(getAtPath(TURRET!, "/mechanisms/3/params/ballsPerSecond")).toBe(6);
    expect(() => setAtPath(TURRET!, "/mechanisms/nope/params/x", 1)).toThrow(/no element with id/);
  });

  it("grid is a deterministic cartesian product; LHS covers each stratum once", () => {
    const params: SweepParam[] = [
      { id: "bps", target: { kind: "design", robot: 0, path: "/mechanisms/turret1/params/ballsPerSecond" }, values: [4, 6, 8], min: 2, max: 10 },
      { id: "speed", target: { kind: "profile", robot: 0, knob: "speedScale" }, values: [0.7, 1], min: 0.5, max: 1 },
    ];
    expect(grid(params).map((c) => c.values)).toEqual([
      { bps: 4, speed: 0.7 },
      { bps: 4, speed: 1 },
      { bps: 6, speed: 0.7 },
      { bps: 6, speed: 1 },
      { bps: 8, speed: 0.7 },
      { bps: 8, speed: 1 },
    ]);
    const lhs = latinHypercube(params, 10, 3);
    expect(latinHypercube(params, 10, 3)).toEqual(lhs);
    const strata = lhs.map((c) => Math.floor(((c.values.bps! - 2) / 8) * 10)).sort((a, b) => a - b);
    expect(strata).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const jobs = buildJobs({ game: "rebuilt-2026", robots, drivers }, params, grid(params), seedsFrom(2));
    expect(jobs.length).toBe(12);
    expect(jobs[0]!.seed).toBe(jobs[2]!.seed);
    const d0 = jobs[0]!.spec.drivers[0]!;
    expect(d0.kind === "agent" && d0.profile.speedScale).toBe(0.7);
    expect(getAtPath(jobs[4]!.spec.robots[0]!.design, "/mechanisms/3/params/ballsPerSecond")).toBe(6);
  });
});

describe("BatchRunner", () => {
  it("runs a ballsPerSecond sweep in-process, feeds a response curve, and saves a reproducible results file", async () => {
    const params: SweepParam[] = [
      { id: "ballsPerSecond", target: { kind: "design", robot: 0, path: "/mechanisms/turret1/params/ballsPerSecond" }, values: [2, 5, 10] },
    ];
    const configs = grid(params);
    const seeds = seedsFrom(4, 11);
    const base = { game: "rebuilt-2026", robots, drivers, stopAtSeconds: 45 };
    const jobs = buildJobs(base, params, configs, seeds);
    const progress: number[] = [];
    const runner = new BatchRunner(jobs, new InProcessExecutor(), { onProgress: (p) => progress.push(p.done) });
    const t0 = performance.now();
    const outcome = await runner.start();
    const ms = performance.now() - t0;
    expect(outcome.status).toBe("done");
    expect(outcome.results.length).toBe(12);
    expect(progress.at(-1)).toBe(12);

    const samples = toSamples(outcome.results, (o) => o.result.score.blue.total);
    const curve = responseCurve(samples, "ballsPerSecond");
    expect(curve.map((p) => p.value)).toEqual([2, 5, 10]);
    expect(curve.every((p) => p.n === 4)).toBe(true);
    expect(curve[2]!.mean).toBeGreaterThan(curve[0]!.mean);
    expect(toCSV(responseTable(curve, "ballsPerSecond", "Blue score"))).toContain("ballsPerSecond");

    const file = makeResultsFile({ name: "bps sweep", game: rebuilt, base, params, configs, seeds, outcome });
    expect(file.module.manualVersion).toBe("TU22");
    const again = jobsFromFile(JSON.parse(JSON.stringify(file)));
    expect(again.map((j) => j.id)).toEqual(jobs.map((j) => j.id));
    expect(JSON.stringify(again[11]!.spec)).toBe(JSON.stringify(jobs[11]!.spec));

    const simSeconds = 45 * 12;
    console.log(
      `sweep: 12 matches x 45 s in ${(ms / 1000).toFixed(1)} s -> ${((simSeconds / 166) / (ms / 60000)).toFixed(1)} full-match-equivalents/min/core; ` +
        `curve ${curve.map((p) => `${p.value}:${p.mean.toFixed(0)}`).join(" ")}`,
    );
  });

  it("pause stops new jobs, resume continues, cancel resolves with partial results; skip resumes", async () => {
    const jobs = buildJobs({ game: "rebuilt-2026", robots, drivers: [{ kind: "idle" }, { kind: "idle" }], stopAtSeconds: 1 }, [], [{ id: "c0", values: {} }], seedsFrom(6));
    let pausedAt = -1;
    const runner: BatchRunner = new BatchRunner(jobs, new InProcessExecutor(), {
      onResult: () => {
        if (runner.results.length === 2 && pausedAt < 0) {
          runner.pause();
          pausedAt = runner.results.length;
          setTimeout(() => {
            expect(runner.results.length).toBe(pausedAt);
            expect(runner.status).toBe("paused");
            runner.resume();
          }, 50);
        }
        if (runner.results.length === 4) runner.cancel();
      },
    });
    const outcome = await runner.start();
    expect(outcome.status).toBe("cancelled");
    expect(outcome.results.length).toBe(4);

    const resumed = new BatchRunner(jobs, new InProcessExecutor(), { skip: completedJobIds({ results: outcome.results.map((r) => ({ jobId: r.jobId })) as never }) });
    const rest = await resumed.start();
    expect(rest.results.length).toBe(2);
  });

  it("WorkerPoolExecutor dispatches by module id across a pool (fake in-process workers)", async () => {
    class FakeWorker {
      onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
      onerror: ((e: ErrorEvent) => void) | null = null;
      terminated = false;
      postMessage(msg: WorkerRequest) {
        void runMatch(msg.job.spec).then(
          (output) => !this.terminated && this.onmessage?.({ data: { type: "result", id: msg.id, output } } as MessageEvent<WorkerResponse>),
          (err: Error) => !this.terminated && this.onmessage?.({ data: { type: "error", id: msg.id, message: err.message } } as MessageEvent<WorkerResponse>),
        );
      }
      terminate() {
        this.terminated = true;
      }
    }
    const pool = new WorkerPoolExecutor({ size: 3, createWorker: () => new FakeWorker() as unknown as Worker });
    const jobs = buildJobs({ game: "rebuilt-2026", robots, drivers: [{ kind: "idle" }, { kind: "idle" }], stopAtSeconds: 1 }, [], [{ id: "c0", values: {} }], seedsFrom(5));
    const outcome = await new BatchRunner(jobs, pool).start();
    expect(outcome.results.length).toBe(5);
    expect(new Set(outcome.results.map((r) => r.jobId)).size).toBe(5);
    await expect(pool.run({ ...jobs[0]!, spec: { ...jobs[0]!.spec, game: rebuilt } })).rejects.toThrow(/by id/);
    pool.dispose();
  });
});
