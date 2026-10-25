import type { MatchEvent, MatchResult } from "@goldsim/core";
import type { Alliance } from "@goldsim/schema";

/** Seconds between shots that still count as the same scoring burst. */
export const BURST_GAP = 1.5;

export interface CycleMetrics {
  /** Scoring bursts (one per cycle, including a preload burst). */
  cycles: number;
  /** Seconds between consecutive burst starts. */
  cycleTimes: number[];
  /** Seconds from the first pickup of a cycle to the start of its scoring burst. */
  pickupToScore: number[];
  /** Seconds from match start to the first piece scored in an active goal (null if none). */
  timeToFirstScore: number | null;
}

export interface RobotMatchSummary {
  matchSeed: number;
  index: number;
  alliance: Alliance;
  name: string;
  points: number;
  allianceScore: number;
  opponentScore: number;
  won: boolean;
  tied: boolean;
  acquired: number;
  shots: number;
  scoredActive: number;
  scoredInactive: number;
  /** scoredActive / shots (null when no shots). */
  accuracy: number | null;
  fouls: number;
  climbLevel: number;
  pointsPerSecond: number;
  cycles: CycleMetrics;
  /** Per-robot game stats from stats.json. */
  game: Record<string, number>;
}

export interface AllianceMatchSummary {
  matchSeed: number;
  alliance: Alliance;
  robots: string[];
  total: number;
  auto: number;
  teleop: number;
  endgame: number;
  foul: number;
  rp: number;
  outcome: "win" | "tie" | "loss";
  bonus: Record<string, boolean>;
  counters: Record<string, number>;
  game: Record<string, number>;
}

export interface MatchSummary {
  seed: number;
  durationSeconds: number;
  robots: RobotMatchSummary[];
  alliances: Record<Alliance, AllianceMatchSummary>;
  coverage: MatchResult["coverage"];
}

/** Cycle metrics for one robot from the event stream. */
export function cycleMetrics(events: MatchEvent[], robot: number): CycleMetrics {
  const bursts: { start: number; firstPickup: number | null }[] = [];
  let lastShot = -Infinity;
  let pendingPickup: number | null = null;
  let firstScore: number | null = null;
  for (const e of events) {
    if (!("robot" in e) || e.robot !== robot) continue;
    if (e.type === "piece_acquired") pendingPickup ??= e.t;
    else if (e.type === "shot_launched") {
      if (e.t - lastShot > BURST_GAP) {
        bursts.push({ start: e.t, firstPickup: pendingPickup });
        pendingPickup = null;
      }
      lastShot = e.t;
    } else if (e.type === "piece_scored" && e.active && firstScore === null) firstScore = e.t;
  }
  const cycleTimes: number[] = [];
  for (let i = 1; i < bursts.length; i++) cycleTimes.push(bursts[i]!.start - bursts[i - 1]!.start);
  const pickupToScore = bursts.filter((b) => b.firstPickup !== null).map((b) => b.start - b.firstPickup!);
  return { cycles: bursts.length, cycleTimes, pickupToScore, timeToFirstScore: firstScore };
}

/** Summarizes one match. Pass the event stream for cycle metrics; without it, cycle fields are empty. */
export function summarizeMatch(result: MatchResult, events: MatchEvent[] = []): MatchSummary {
  const last = events.length ? events[events.length - 1]!.t : 0;
  const matchSeconds = events.filter((e) => e.type === "phase_end").reduce((t, e) => Math.max(t, e.t), 0) || last || 160;
  const alliances = {} as Record<Alliance, AllianceMatchSummary>;
  for (const a of ["blue", "red"] as const) {
    const s = result.score[a];
    const game: Record<string, number> = {};
    for (const [k, v] of Object.entries(result.gameStats.perAlliance)) game[k] = v[a];
    alliances[a] = {
      matchSeed: result.seed,
      alliance: a,
      robots: result.robots.filter((r) => r.alliance === a).map((r) => r.name),
      total: s.total,
      auto: s.auto,
      teleop: s.teleop,
      endgame: s.endgame,
      foul: s.foul,
      rp: result.rp[a].total,
      outcome: result.rp[a].outcome,
      bonus: result.rp[a].bonus,
      counters: { ...result.counters[a] },
      game,
    };
  }
  const robots = result.robots.map((r): RobotMatchSummary => {
    const own = result.score[r.alliance].total;
    const opp = result.score[r.alliance === "blue" ? "red" : "blue"].total;
    const game: Record<string, number> = {};
    for (const [k, v] of Object.entries(result.gameStats.perRobot)) game[k] = v[r.index] ?? 0;
    return {
      matchSeed: result.seed,
      index: r.index,
      alliance: r.alliance,
      name: r.name,
      points: r.points,
      allianceScore: own,
      opponentScore: opp,
      won: own > opp,
      tied: own === opp,
      acquired: r.acquired,
      shots: r.shots,
      scoredActive: r.scoredActive,
      scoredInactive: r.scoredInactive,
      accuracy: r.shots ? r.scoredActive / r.shots : null,
      fouls: r.fouls,
      climbLevel: r.climbLevel,
      pointsPerSecond: r.points / matchSeconds,
      cycles: cycleMetrics(events, r.index),
      game,
    };
  });
  return { seed: result.seed, durationSeconds: matchSeconds, robots, alliances, coverage: result.coverage };
}
