import { pointInShape, Rng, type Match, type MatchEvent, type MatchResult } from "@goldsim/core";
import { OBJ } from "./agent.js";
import { DEFAULT_PROFILE, PROFILE_KNOBS, type DriverProfile } from "./profile.js";

/**
 * Statistics used to fit driver-profile knobs to recorded human matches (PRD §11.4).
 * All are per robot, computed from the generic event stream (plus an optional zone timer).
 */
export type FitStat =
  | "secondsBetweenPickups"
  | "shotsPerCycle"
  | "cycleSeconds"
  | "scoredPerMinute"
  | "accuracy"
  | "defenseTimeFraction";

export const FIT_STATS: FitStat[] = ["secondsBetweenPickups", "shotsPerCycle", "cycleSeconds", "scoredPerMinute", "accuracy", "defenseTimeFraction"];

/** Shots separated by more than this start a new shooting sequence (cycle). */
const SEQUENCE_GAP_S = 1.5;

/**
 * Extracts fit statistics for one robot. `enabledSeconds` is the time robots could move (from the game timeline);
 * `defenseTimeFraction` comes from a ZoneTimer when available.
 */
export function extractFitStats(
  events: MatchEvent[],
  robot: number,
  enabledSeconds: number,
  defenseTimeFraction = 0,
): Record<FitStat, number> {
  const pickups = events.filter((e) => e.type === "piece_acquired" && e.robot === robot).map((e) => e.t);
  const shots = events.filter((e) => e.type === "shot_launched" && e.robot === robot).map((e) => e.t);
  const scored = events.filter((e) => e.type === "piece_scored" && e.robot === robot && e.active).length;

  const gaps = pickups.slice(1).map((t, i) => t - pickups[i]!);
  const sequenceStarts: number[] = [];
  shots.forEach((t, i) => {
    if (i === 0 || t - shots[i - 1]! > SEQUENCE_GAP_S) sequenceStarts.push(t);
  });
  const cycleGaps = sequenceStarts.slice(1).map((t, i) => t - sequenceStarts[i]!);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  return {
    secondsBetweenPickups: mean(gaps),
    shotsPerCycle: sequenceStarts.length ? shots.length / sequenceStarts.length : 0,
    cycleSeconds: mean(cycleGaps),
    scoredPerMinute: enabledSeconds > 0 ? (scored / enabledSeconds) * 60 : 0,
    accuracy: shots.length ? scored / shots.length : 0,
    defenseTimeFraction,
  };
}

/** Seconds of a game's timeline with robots enabled. */
export function enabledSeconds(match: Match): number {
  return match.game.game.timeline.phases.filter((p) => p.robotsEnabled).reduce((s, p) => s + p.duration, 0);
}

/**
 * Measures the fraction of enabled time a robot spends in the opponent's alliance zone (a defense proxy).
 * Call sample() after each match.step().
 */
export class ZoneTimer {
  private inside = 0;
  private total = 0;
  private zone;

  constructor(
    private match: Match,
    private robot: number,
  ) {
    const alliance = match.robots[robot]!.alliance;
    this.zone = match.elements.find(
      (e): e is Extract<typeof e, { kind: "zone" }> => e.kind === "zone" && !!e.alliance && e.alliance !== alliance && (e.tags ?? []).includes(OBJ.allianceZoneTag),
    );
  }

  sample(): void {
    if (!this.zone || !this.match.robotsEnabled) return;
    this.total++;
    const p = this.match.robotPose(this.robot);
    if (pointInShape(p.x, p.y, this.zone.shape)) this.inside++;
  }

  get fraction(): number {
    return this.total ? this.inside / this.total : 0;
  }
}

/** Mean of fit stats over several matches (e.g. several recorded human matches). */
export function meanStats(samples: Record<FitStat, number>[]): Record<FitStat, number> {
  const out = {} as Record<FitStat, number>;
  for (const k of FIT_STATS) out[k] = samples.length ? samples.reduce((s, x) => s + x[k], 0) / samples.length : 0;
  return out;
}

export interface FitOptions {
  /** Seed for the knob visiting order (fits are reproducible). */
  seed?: number;
  /** Maximum number of simulate() calls. */
  maxEvaluations?: number;
  /** Profile to start from (default: DEFAULT_PROFILE). */
  start?: DriverProfile;
  /** Knobs to fit (default: all PROFILE_KNOBS). */
  knobs?: (keyof DriverProfile)[];
}

export interface FitResult {
  profile: DriverProfile;
  loss: number;
  evaluations: number;
  history: { profile: DriverProfile; loss: number }[];
}

/** Squared relative error over the target stats that were given. */
export function fitLoss(target: Partial<Record<FitStat, number>>, actual: Record<FitStat, number>): number {
  let loss = 0;
  for (const [k, want] of Object.entries(target) as [FitStat, number][]) {
    const scale = Math.max(Math.abs(want), 1e-3);
    loss += ((actual[k] - want) / scale) ** 2;
  }
  return loss;
}

/**
 * Fits driver-profile knobs so simulated statistics match target statistics (PRD §11.4).
 * Seeded coordinate descent: try each knob up and down by its step size, keep improvements, and halve the
 * step sizes when a full pass finds none. `simulate` should run one or more seeded matches with the profile.
 */
export function fitProfile(
  target: Partial<Record<FitStat, number>>,
  simulate: (p: DriverProfile) => Record<FitStat, number>,
  opts: FitOptions = {},
): FitResult {
  const rng = new Rng(opts.seed ?? 1);
  const maxEval = opts.maxEvaluations ?? 60;
  const specs = PROFILE_KNOBS.filter((k) => !opts.knobs || opts.knobs.includes(k.key));
  const steps = new Map(specs.map((k) => [k.key, (k.max - k.min) / 4]));
  let best = { ...(opts.start ?? DEFAULT_PROFILE), id: "fitted", label: "Fitted" };
  let bestLoss = fitLoss(target, simulate(best));
  let evaluations = 1;
  const history = [{ profile: best, loss: bestLoss }];

  while (evaluations < maxEval) {
    const order = [...specs];
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    let improved = false;
    for (const k of order) {
      for (const dir of [1, -1]) {
        if (evaluations >= maxEval) break;
        const cur = best[k.key] as number;
        const raw = cur + dir * steps.get(k.key)!;
        const next = Math.min(k.max, Math.max(k.min, Math.round(raw / k.step) * k.step));
        if (next === cur) continue;
        const candidate = { ...best, [k.key]: next };
        const loss = fitLoss(target, simulate(candidate));
        evaluations++;
        if (loss < bestLoss) {
          best = candidate;
          bestLoss = loss;
          history.push({ profile: best, loss });
          improved = true;
          break;
        }
      }
    }
    if (!improved) {
      let any = false;
      for (const k of specs) {
        const s = steps.get(k.key)! / 2;
        steps.set(k.key, s);
        if (s >= k.step) any = true;
      }
      if (!any) break;
    }
  }
  return { profile: best, loss: bestLoss, evaluations, history };
}

/** Convenience: fit stats for every robot of a finished match. */
export function matchFitStats(match: Match, result: MatchResult, timers: (ZoneTimer | undefined)[] = []): Record<FitStat, number>[] {
  const secs = enabledSeconds(match);
  return result.robots.map((r) => extractFitStats(match.events, r.index, secs, timers[r.index]?.fraction ?? 0));
}
