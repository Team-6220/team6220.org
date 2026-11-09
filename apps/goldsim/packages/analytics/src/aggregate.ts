import type { MatchResult } from "@goldsim/core";
import type { MatchSummary, RobotMatchSummary } from "./summary.js";
import { mean, meanCI, median, proportionCI, type Interval } from "./stats.js";
import type { Table } from "./table.js";

export interface DesignStats {
  key: string;
  matches: number;
  points: Interval;
  allianceScore: Interval;
  acquired: Interval;
  scoredActive: Interval;
  scoredInactive: Interval;
  accuracy: Interval;
  fouls: Interval;
  climbLevel: Interval;
  cycles: Interval;
  cycleTimeMedian: number;
  pickupToScoreMedian: number;
  timeToFirstScore: Interval;
  winRate: Interval;
  game: Record<string, Interval>;
}

/** Groups robot summaries (by design name by default) and computes means with 95% CIs. */
export function aggregateByDesign(
  summaries: MatchSummary[],
  keyOf: (r: RobotMatchSummary) => string = (r) => r.name,
): DesignStats[] {
  const groups = new Map<string, RobotMatchSummary[]>();
  for (const s of summaries)
    for (const r of s.robots) {
      const k = keyOf(r);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
  const out: DesignStats[] = [];
  for (const [key, rs] of groups) {
    const pick = (f: (r: RobotMatchSummary) => number | null) => rs.map(f).filter((v): v is number => v !== null && Number.isFinite(v));
    const gameKeys = new Set(rs.flatMap((r) => Object.keys(r.game)));
    out.push({
      key,
      matches: rs.length,
      points: meanCI(pick((r) => r.points)),
      allianceScore: meanCI(pick((r) => r.allianceScore)),
      acquired: meanCI(pick((r) => r.acquired)),
      scoredActive: meanCI(pick((r) => r.scoredActive)),
      scoredInactive: meanCI(pick((r) => r.scoredInactive)),
      accuracy: meanCI(pick((r) => r.accuracy)),
      fouls: meanCI(pick((r) => r.fouls)),
      climbLevel: meanCI(pick((r) => r.climbLevel)),
      cycles: meanCI(pick((r) => r.cycles.cycles)),
      cycleTimeMedian: median(rs.flatMap((r) => r.cycles.cycleTimes)),
      pickupToScoreMedian: median(rs.flatMap((r) => r.cycles.pickupToScore)),
      timeToFirstScore: meanCI(pick((r) => r.cycles.timeToFirstScore)),
      winRate: proportionCI(rs.filter((r) => r.won).length, rs.length),
      game: Object.fromEntries([...gameKeys].map((k) => [k, meanCI(rs.map((r) => r.game[k] ?? 0))])),
    });
  }
  return out.sort((a, b) => b.points.mean - a.points.mean);
}

const fmtCI = (i: Interval) => (Number.isFinite(i.mean) ? i.mean : null);

/** Archetype comparison table: one row per design, with mean and 95% CI bounds. */
export function comparisonTable(stats: DesignStats[]): Table {
  const metrics: [keyof DesignStats, string, string?][] = [
    ["points", "Points contributed", "pts"],
    ["scoredActive", "Scored (active)"],
    ["scoredInactive", "Scored (inactive)"],
    ["accuracy", "Accuracy"],
    ["acquired", "Pieces acquired"],
    ["cycles", "Cycles"],
    ["climbLevel", "Climb level"],
    ["fouls", "Fouls"],
    ["winRate", "Win rate"],
  ];
  const columns = [
    { key: "design", label: "Design" },
    { key: "matches", label: "Matches" },
    ...metrics.flatMap(([k, label, unit]) => [
      { key: String(k), label, unit },
      { key: `${String(k)}_lo`, label: `${label} CI low` },
      { key: `${String(k)}_hi`, label: `${label} CI high` },
    ]),
    { key: "cycleTimeMedian", label: "Median cycle time", unit: "s" },
    { key: "pickupToScoreMedian", label: "Median pickup-to-score", unit: "s" },
  ];
  const rows = stats.map((s) => {
    const row: Table["rows"][number] = { design: s.key, matches: s.matches };
    for (const [k] of metrics) {
      const i = s[k] as Interval;
      row[String(k)] = fmtCI(i);
      row[`${String(k)}_lo`] = Number.isFinite(i.lo) ? i.lo : null;
      row[`${String(k)}_hi`] = Number.isFinite(i.hi) ? i.hi : null;
    }
    row.cycleTimeMedian = Number.isFinite(s.cycleTimeMedian) ? s.cycleTimeMedian : null;
    row.pickupToScoreMedian = Number.isFinite(s.pickupToScoreMedian) ? s.pickupToScoreMedian : null;
    return row;
  });
  return { title: "Archetype comparison", columns, rows };
}

/** Ranking-point outcome rates per alliance lineup (robot names joined), with Wilson CIs. */
export function rpRatesTable(summaries: MatchSummary[]): Table {
  const groups = new Map<string, { n: number; wins: number; ties: number; rp: number[]; bonus: Record<string, number> }>();
  for (const s of summaries)
    for (const a of Object.values(s.alliances)) {
      const key = a.robots.join(" + ");
      const g = groups.get(key) ?? { n: 0, wins: 0, ties: 0, rp: [], bonus: {} };
      g.n++;
      if (a.outcome === "win") g.wins++;
      if (a.outcome === "tie") g.ties++;
      g.rp.push(a.rp);
      for (const [b, hit] of Object.entries(a.bonus)) g.bonus[b] = (g.bonus[b] ?? 0) + (hit ? 1 : 0);
      groups.set(key, g);
    }
  const bonusKeys = [...new Set([...groups.values()].flatMap((g) => Object.keys(g.bonus)))];
  return {
    title: "Ranking point rates",
    columns: [
      { key: "lineup", label: "Alliance" },
      { key: "n", label: "Matches" },
      { key: "winRate", label: "Win rate" },
      { key: "winLo", label: "Win CI low" },
      { key: "winHi", label: "Win CI high" },
      { key: "rp", label: "Mean RP" },
      ...bonusKeys.map((b) => ({ key: `bonus_${b}`, label: `${b} rate` })),
    ],
    rows: [...groups.entries()].map(([lineup, g]) => {
      const w = proportionCI(g.wins, g.n);
      return {
        lineup,
        n: g.n,
        winRate: w.mean,
        winLo: w.lo,
        winHi: w.hi,
        rp: mean(g.rp),
        ...Object.fromEntries(bonusKeys.map((b) => [`bonus_${b}`, (g.bonus[b] ?? 0) / g.n])),
      };
    }),
  };
}

/** Win probability of `alliance` (ties count half), with a Wilson CI on outright wins. */
export function winProbability(results: MatchResult[], alliance: "blue" | "red" = "blue") {
  const n = results.length;
  const wins = results.filter((r) => r.winner === alliance).length;
  const ties = results.filter((r) => r.winner === "tie").length;
  return { probability: n ? (wins + ties / 2) / n : NaN, wins, ties, n, ci: proportionCI(wins, n) };
}

/** Rule coverage for a set of results (same for every match of one module version). */
export function coverageTable(result: Pick<MatchResult, "coverage">): Table {
  return {
    title: "Rule coverage",
    columns: [
      { key: "id", label: "Rule" },
      { key: "topic", label: "Topic" },
      { key: "status", label: "Status" },
      { key: "reason", label: "Notes" },
    ],
    rows: result.coverage.map((c) => ({ id: c.id, topic: c.topic, status: c.status, reason: c.reason ?? "" })),
  };
}

export function coverageCounts(result: Pick<MatchResult, "coverage">): Record<string, number> {
  const out: Record<string, number> = { implemented: 0, approximated: 0, not_implemented: 0 };
  for (const c of result.coverage) out[c.status] = (out[c.status] ?? 0) + 1;
  return out;
}
