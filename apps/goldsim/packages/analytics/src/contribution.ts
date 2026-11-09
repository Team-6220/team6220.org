import type { MatchResult } from "@goldsim/core";
import { ols } from "./regression.js";
import type { Table } from "./table.js";

/** One alliance in one match: which designs it fielded and what it scored. */
export interface AllianceObservation {
  designs: string[];
  score: number;
}

export interface Contribution {
  design: string;
  /** Estimated points per match one robot of this design adds to its alliance. */
  contribution: number;
  standardError: number;
  appearances: number;
}

/** Extracts one observation per alliance per match. `scoreOf` defaults to points excluding fouls drawn by opponents. */
export function allianceObservations(
  results: MatchResult[],
  scoreOf: (r: MatchResult, a: "blue" | "red") => number = (r, a) => r.score[a].total - r.score[a].foul,
): AllianceObservation[] {
  return results.flatMap((r) =>
    (["blue", "red"] as const).map((a) => ({
      designs: r.robots.filter((x) => x.alliance === a).map((x) => x.name),
      score: scoreOf(r, a),
    })),
  );
}

/**
 * EPA-style contribution (PRD §13.1): least-squares fit of alliance score on design counts across randomized
 * alliance combinations, without an intercept, so each coefficient is a per-robot contribution.
 * Standard errors come from the residual variance; vary alliance combinations so designs are separable.
 */
export function contributions(observations: AllianceObservation[]): Contribution[] {
  const designs = [...new Set(observations.flatMap((o) => o.designs))].sort();
  if (!designs.length) return [];
  const X = observations.map((o) => designs.map((d) => o.designs.filter((x) => x === d).length));
  const fit = ols(
    X,
    observations.map((o) => o.score),
    1e-6,
  );
  return designs
    .map((design, j) => ({
      design,
      contribution: fit.coefficients[j]!,
      standardError: fit.standardErrors[j]!,
      appearances: X.reduce((s, row) => s + row[j]!, 0),
    }))
    .sort((a, b) => b.contribution - a.contribution);
}

/** Numerical rank of a matrix (Gaussian elimination with partial pivoting, relative tolerance). */
export function matrixRank(X: number[][], tol = 1e-9): number {
  const a = X.map((r) => [...r]);
  const rows = a.length;
  const cols = a[0]?.length ?? 0;
  const scale = Math.max(1e-300, ...a.flat().map(Math.abs));
  let rank = 0;
  for (let c = 0; c < cols && rank < rows; c++) {
    let p = rank;
    for (let r = rank + 1; r < rows; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    if (Math.abs(a[p]![c]!) <= tol * scale) continue;
    [a[rank], a[p]] = [a[p]!, a[rank]!];
    for (let r = rank + 1; r < rows; r++) {
      const f = a[r]![c]! / a[rank]![c]!;
      if (f) for (let j = c; j < cols; j++) a[r]![j]! -= f * a[rank]![j]!;
    }
    rank++;
  }
  return rank;
}

export type ContributionStatus = "ok" | "unidentifiable" | "insufficient";

export interface ContributionAnalysis {
  status: ContributionStatus;
  /** Plain-language explanation of the status. */
  message: string;
  /** Estimates (empty unless status is "ok"). Rows with `reliable: false` have very wide uncertainty. */
  rows: (Contribution & { reliable: boolean })[];
  designs: number;
  /** Distinct alliance lineups seen (as sorted design lists). */
  distinctLineups: number;
  observations: number;
}

/**
 * Contribution estimates with a safety check. If alliances never varied enough to tell designs apart
 * (the regression is rank-deficient), returns status "unidentifiable" instead of meaningless numbers.
 */
export function analyzeContributions(observations: AllianceObservation[]): ContributionAnalysis {
  const designs = [...new Set(observations.flatMap((o) => o.designs))].sort();
  const lineups = new Set(observations.map((o) => [...o.designs].sort().join("\u0000"))).size;
  const base = { designs: designs.length, distinctLineups: lineups, observations: observations.length };
  if (!designs.length || observations.length < designs.length + 2)
    return { ...base, status: "insufficient", message: `Not enough matches: ${observations.length} alliance results for ${designs.length} designs. Run more matches.`, rows: [] };
  const X = observations.map((o) => designs.map((d) => o.designs.filter((x) => x === d).length));
  if (matrixRank(X) < designs.length)
    return {
      ...base,
      status: "unidentifiable",
      message:
        lineups < designs.length
          ? `Not enough variety: only ${lineups} different alliance lineup${lineups === 1 ? "" : "s"} for ${designs.length} designs, so the sim can't tell which robot earned the points. Re-run with random alliances.`
          : `Not enough variety: some designs always played together, so their points can't be separated. Re-run with random alliances.`,
      rows: [],
    };
  const scores = observations.map((o) => o.score);
  const spread = Math.max(1, Math.max(...scores) - Math.min(...scores));
  const rows = contributions(observations).map((r) => ({
    ...r,
    standardError: Math.min(r.standardError, spread * 10),
    reliable: Number.isFinite(r.standardError) && r.standardError <= spread,
  }));
  const unreliable = rows.filter((r) => !r.reliable).length;
  return {
    ...base,
    status: "ok",
    message: unreliable
      ? `${unreliable} design${unreliable === 1 ? " has" : "s have"} very wide uncertainty (few or overlapping appearances). Run more random-alliance matches to narrow it.`
      : "Estimated from varied alliance lineups.",
    rows,
  };
}

export function contributionTable(rows: Contribution[]): Table {
  return {
    title: "Estimated contribution per robot (EPA-style)",
    columns: [
      { key: "design", label: "Design" },
      { key: "contribution", label: "Contribution", unit: "pts" },
      { key: "standardError", label: "Std. error", unit: "pts" },
      { key: "lo", label: "95% low", unit: "pts" },
      { key: "hi", label: "95% high", unit: "pts" },
      { key: "appearances", label: "Robot-matches" },
    ],
    rows: rows.map((r) => ({
      design: r.design,
      contribution: r.contribution,
      standardError: r.standardError,
      lo: r.contribution - 1.96 * r.standardError,
      hi: r.contribution + 1.96 * r.standardError,
      appearances: r.appearances,
    })),
  };
}
