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
