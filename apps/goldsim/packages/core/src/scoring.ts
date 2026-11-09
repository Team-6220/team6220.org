import type { Alliance, Condition, ScoringDef, StatsDef } from "@goldsim/schema";
import type { MatchEvent } from "./events.js";
import { other } from "./field.js";

export interface ScoreBreakdown {
  total: number;
  auto: number;
  teleop: number;
  endgame: number;
  foul: number;
}

/** Plain-data scoring state (serializable for snapshots). */
export interface ScoringState {
  score: Record<Alliance, ScoreBreakdown>;
  counters: Record<Alliance, Record<string, number>>;
  firings: Record<string, Record<Alliance, number>>;
  robotPoints: number[];
  fouls: Record<Alliance, Record<string, number>>;
}

const emptyBreakdown = (): ScoreBreakdown => ({ total: 0, auto: 0, teleop: 0, endgame: 0, foul: 0 });

export function newScoringState(robotCount: number): ScoringState {
  return {
    score: { blue: emptyBreakdown(), red: emptyBreakdown() },
    counters: { blue: {}, red: {} },
    firings: {},
    robotPoints: Array(robotCount).fill(0),
    fouls: { blue: {}, red: {} },
  };
}

export function matches(event: Record<string, unknown>, when: Condition[] | undefined): boolean {
  if (!when) return true;
  for (const c of when) {
    const v = event[c.field];
    switch (c.op) {
      case "eq":
        if (v !== c.value) return false;
        break;
      case "neq":
        if (v === c.value) return false;
        break;
      case "in":
        if (!Array.isArray(c.value) || !(c.value as unknown[]).includes(v)) return false;
        break;
      case "gte":
        if (typeof v !== "number" || v < (c.value as number)) return false;
        break;
      case "lte":
        if (typeof v !== "number" || v > (c.value as number)) return false;
        break;
    }
  }
  return true;
}

/** Applies scoring.json rules to match events (PRD §8.3). */
export function applyScoring(def: ScoringDef, s: ScoringState, event: MatchEvent): void {
  const ev = event as unknown as Record<string, unknown>;
  const alliance = ev.alliance as Alliance | undefined;
  if (!alliance) return;
  const robot = typeof ev.robot === "number" ? ev.robot : null;

  if (event.type === "foul") {
    const pts = def.fouls[event.severity] ?? 0;
    const opp = other(alliance);
    s.score[opp].foul += pts;
    s.score[opp].total += pts;
    s.fouls[alliance][event.severity] = (s.fouls[alliance][event.severity] ?? 0) + 1;
  }

  for (const rule of def.rules) {
    if (rule.on !== event.type || !matches(ev, rule.when)) continue;
    const fired = (s.firings[rule.id] ??= { blue: 0, red: 0 });
    if (rule.limitPerAlliance !== undefined && fired[alliance] >= rule.limitPerAlliance) continue;
    fired[alliance]++;
    for (const e of rule.effects) {
      const to: Alliance = e.to === "opponent" ? other(alliance) : alliance;
      if (e.points) {
        const cat = e.category ?? event.period;
        s.score[to][cat] += e.points;
        s.score[to].total += e.points;
        if (robot !== null && to === alliance && s.robotPoints[robot] !== undefined) s.robotPoints[robot] += e.points;
      }
      if (e.counter) s.counters[to][e.counter] = (s.counters[to][e.counter] ?? 0) + (e.by ?? 1);
    }
  }
}

export interface RankingResult {
  total: number;
  outcome: "win" | "tie" | "loss";
  bonus: Record<string, boolean>;
}

export function rankingPoints(def: ScoringDef, s: ScoringState, profile: Record<string, number>): Record<Alliance, RankingResult> {
  const out = {} as Record<Alliance, RankingResult>;
  for (const a of ["blue", "red"] as const) {
    const mine = s.score[a].total;
    const theirs = s.score[other(a)].total;
    const outcome = mine > theirs ? "win" : mine === theirs ? "tie" : "loss";
    let total = outcome === "win" ? def.rankingPoints.win : outcome === "tie" ? def.rankingPoints.tie : 0;
    const bonus: Record<string, boolean> = {};
    for (const b of def.rankingPoints.bonus) {
      const threshold = profile[b.thresholdKey] ?? Infinity;
      bonus[b.id] = (s.counters[a][b.counter] ?? 0) >= threshold;
      if (bonus[b.id]) total += 1;
    }
    out[a] = { total, outcome, bonus };
  }
  return out;
}

/** Game-specific stats from stats.json, computed from the event stream (PRD §13.2). */
export function computeGameStats(def: StatsDef, events: MatchEvent[], robotCount: number) {
  const perRobot: Record<string, number[]> = {};
  const perAlliance: Record<string, Record<Alliance, number>> = {};
  for (const stat of def.stats) {
    const robots = Array(robotCount).fill(0);
    const alliances = { blue: 0, red: 0 };
    for (const e of events) {
      const ev = e as unknown as Record<string, unknown>;
      if (e.type !== stat.event || !matches(ev, stat.when)) continue;
      const amount = stat.sumField ? Number(ev[stat.sumField] ?? 0) : 1;
      if (typeof ev.robot === "number") robots[ev.robot] += amount;
      if (ev.alliance === "blue" || ev.alliance === "red") alliances[ev.alliance] += amount;
    }
    if (stat.per === "robot") perRobot[stat.id] = robots;
    perAlliance[stat.id] = alliances;
  }
  return { perRobot, perAlliance };
}
