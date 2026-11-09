import { Match, type GameModule, type MatchEvent, type MatchResult } from "@goldsim/core";
import { createAgent, type DriverProfile } from "@goldsim/agents";
import { summarizeMatch, type MatchSummary } from "@goldsim/analytics";
import type { MatchRobot } from "@goldsim/schema";
import { resolveGame } from "./registry.js";

export type DriverSpec = { kind: "agent"; profile: DriverProfile } | { kind: "idle" };

/** Everything needed to run (and re-run) one match. Serializable when `game` is a module id. */
export interface MatchSpec {
  game: string | GameModule;
  robots: MatchRobot[];
  drivers: DriverSpec[];
  seed: number;
  /** Threshold profile (default: the module's default). */
  profile?: string;
  /** Return the full event stream (off by default; summaries are always computed). */
  telemetry?: boolean;
  /** Stop early (seconds of match time). For quick tests; results are partial. */
  stopAtSeconds?: number;
}

export interface MatchOutput {
  seed: number;
  result: MatchResult;
  summary: MatchSummary;
  events?: MatchEvent[];
  ticks: number;
  wallMs: number;
}

/** Runs one match headless (no rendering). Works in Node and inside a Web Worker. */
export async function runMatch(spec: MatchSpec): Promise<MatchOutput> {
  const game = resolveGame(spec.game);
  const t0 = performance.now();
  const match = await Match.create({ game, robots: spec.robots, seed: spec.seed, profile: spec.profile, record: false });
  try {
    match.drivers = spec.robots.map((_, i) => {
      const d = spec.drivers[i];
      return d?.kind === "agent" ? createAgent(match, i, d.profile) : null;
    });
    const maxTicks = spec.stopAtSeconds !== undefined ? Math.round(spec.stopAtSeconds * match.hz) : Infinity;
    while (!match.isOver && match.tick < maxTicks) match.step();
    const result = match.result();
    const events = match.events;
    return {
      seed: spec.seed,
      result,
      summary: summarizeMatch(result, events),
      events: spec.telemetry ? [...events] : undefined,
      ticks: match.tick,
      wallMs: performance.now() - t0,
    };
  } finally {
    match.dispose();
  }
}
