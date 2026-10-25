import { correlation, mean, meanCI, std, type Interval } from "./stats.js";
import { ols } from "./regression.js";
import type { Table } from "./table.js";

/** One simulated sample: the parameter values it ran with and the outcome measured. */
export interface Sample {
  params: Record<string, number>;
  outcome: number;
}

export interface ResponsePoint extends Interval {
  value: number;
}

/** Mean outcome with a 95% CI for each value of one swept parameter ("how does score change as balls/sec changes"). */
export function responseCurve(samples: Sample[], param: string): ResponsePoint[] {
  const groups = new Map<number, number[]>();
  for (const s of samples) {
    const v = s.params[param];
    if (v === undefined) continue;
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v)!.push(s.outcome);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([value, ys]) => ({ value, ...meanCI(ys) }));
}

export function responseTable(points: ResponsePoint[], param: string, outcome = "Outcome"): Table {
  return {
    title: `${outcome} vs ${param}`,
    columns: [
      { key: "value", label: param },
      { key: "n", label: "Matches" },
      { key: "mean", label: `Mean ${outcome}` },
      { key: "lo", label: "95% CI low" },
      { key: "hi", label: "95% CI high" },
    ],
    rows: points.map((p) => ({ value: p.value, n: p.n, mean: p.mean, lo: p.lo, hi: p.hi })),
  };
}

export interface Sensitivity {
  param: string;
  /** Standardized coefficient from a multiple regression on z-scored parameters (outcome std per param std). */
  standardizedEffect: number;
  standardError: number;
  /** Share of outcome variance explained by this parameter alone (r^2). */
  varianceExplained: number;
  /** Raw slope: outcome units per parameter unit (from the same multiple regression). */
  slope: number;
}

/** Ranks swept parameters by influence on the outcome (largest |standardized effect| first). */
export function sensitivity(samples: Sample[], params?: string[]): Sensitivity[] {
  const keys = params ?? [...new Set(samples.flatMap((s) => Object.keys(s.params)))];
  const varying = keys.filter((k) => std(samples.map((s) => s.params[k] ?? 0)) > 0);
  if (!varying.length || samples.length < varying.length + 2) return [];
  const means = varying.map((k) => mean(samples.map((s) => s.params[k] ?? 0)));
  const sds = varying.map((k) => std(samples.map((s) => s.params[k] ?? 0)));
  const y = samples.map((s) => s.outcome);
  const ySd = std(y) || 1;
  const X = samples.map((s) => [1, ...varying.map((k, j) => ((s.params[k] ?? 0) - means[j]!) / sds[j]!)]);
  const fit = ols(X, y);
  return varying
    .map((k, j) => ({
      param: k,
      standardizedEffect: fit.coefficients[j + 1]! / ySd,
      standardError: fit.standardErrors[j + 1]! / ySd,
      varianceExplained: correlation(
        samples.map((s) => s.params[k] ?? 0),
        y,
      ) ** 2,
      slope: fit.coefficients[j + 1]! / sds[j]!,
    }))
    .sort((a, b) => Math.abs(b.standardizedEffect) - Math.abs(a.standardizedEffect));
}

export function sensitivityTable(rows: Sensitivity[]): Table {
  return {
    title: "Parameter sensitivity",
    columns: [
      { key: "param", label: "Parameter" },
      { key: "standardizedEffect", label: "Standardized effect" },
      { key: "standardError", label: "Std. error" },
      { key: "varianceExplained", label: "Variance explained" },
      { key: "slope", label: "Slope (outcome per unit)" },
    ],
    rows: rows.map((r) => ({ ...r })),
  };
}
