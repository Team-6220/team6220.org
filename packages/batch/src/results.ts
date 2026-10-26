import { ENGINE_VERSION, type GameModule } from "@goldsim/core";
import type { Sample } from "@goldsim/analytics";
import type { MatchSpec } from "./run-match.js";
import type { BatchOutcome, JobResult } from "./runner.js";
import { randomAllianceJobs, type RandomAllianceSettings } from "./random-alliances.js";
import { buildJobs, type Job, type SweepConfig, type SweepParam } from "./sweep.js";

/** A saved test run: everything needed to re-create it (PRD §12 reproducibility). */
export interface BatchResultsFile {
  schemaVersion: 1;
  kind: "goldsim.batch";
  name: string;
  createdAt: string;
  engineVersion: string;
  module: { id: string; version: string; manualVersion: string };
  settings: {
    base: Omit<MatchSpec, "seed" | "game"> & { game: string };
    params: SweepParam[];
    configs: SweepConfig[];
    seeds: number[];
    /** Present for "Test an archetype" runs; jobs are rebuilt from this instead of base/params/configs. */
    random?: RandomAllianceSettings;
    /** Base seed the match seeds were derived from (to duplicate a run's settings). */
    baseSeed?: number;
  };
  status: BatchOutcome["status"];
  elapsedMs: number;
  results: { jobId: string; configId: string; subject?: number; seed: number; values: Record<string, number>; result: JobResult["output"]["result"]; summary: JobResult["output"]["summary"] }[];
  errors: BatchOutcome["errors"];
}

export function makeResultsFile(args: {
  name: string;
  game: GameModule;
  base: Omit<MatchSpec, "seed">;
  params: SweepParam[];
  configs: SweepConfig[];
  seeds: number[];
  random?: RandomAllianceSettings;
  baseSeed?: number;
  outcome: BatchOutcome;
}): BatchResultsFile {
  const { game, base, outcome } = args;
  return {
    schemaVersion: 1,
    kind: "goldsim.batch",
    name: args.name,
    createdAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    module: { id: game.game.id, version: game.game.version, manualVersion: game.game.manualVersion },
    settings: { base: { ...base, game: game.game.id }, params: args.params, configs: args.configs, seeds: args.seeds, ...(args.random ? { random: args.random } : {}), ...(args.baseSeed !== undefined ? { baseSeed: args.baseSeed } : {}) },
    status: outcome.status,
    elapsedMs: outcome.elapsedMs,
    results: outcome.results.map((r) => ({
      jobId: r.jobId,
      configId: r.configId,
      subject: r.subject,
      seed: r.output.seed,
      values: r.values,
      result: r.output.result,
      summary: r.output.summary,
    })),
    errors: outcome.errors,
  };
}

/** Job ids already in a results file, for resuming an interrupted run. */
export function completedJobIds(file: Pick<BatchResultsFile, "results">): Set<string> {
  return new Set(file.results.map((r) => r.jobId));
}

/** Turns job results into analytics samples (swept values + one outcome per match). */
export function toSamples(results: Pick<JobResult, "values" | "output">[], outcome: (r: JobResult["output"]) => number): Sample[] {
  return results.map((r) => ({ params: r.values, outcome: outcome(r.output) }));
}

/** Rebuilds the job list from a saved file so the run can be repeated or resumed. */
export function jobsFromFile(file: BatchResultsFile): Job[] {
  const { base, params, configs, seeds, random } = file.settings;
  if (random) return randomAllianceJobs(random);
  return buildJobs(base, params, configs, seeds);
}
