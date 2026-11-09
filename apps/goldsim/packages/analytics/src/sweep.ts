import { correlation, mean, meanCI, std, t95, type Interval } from "./stats.js";
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

export interface BinnedPoint extends ResponsePoint {
  /** Range of parameter values in this group. */
  from: number;
  to: number;
}

/**
 * Response curve that also works for continuous sweeps (e.g. Latin hypercube, where every match has a different value):
 * up to `maxDistinct` distinct values are kept as-is; otherwise values are grouped into `bins` equal-width ranges.
 * Samples with a non-finite outcome are skipped.
 */
export function binnedResponse(samples: Sample[], param: string, bins = 8, maxDistinct = 12): BinnedPoint[] {
  const valid = samples.filter((s) => s.params[param] !== undefined && Number.isFinite(s.outcome));
  const values = [...new Set(valid.map((s) => s.params[param]!))].sort((a, b) => a - b);
  if (!values.length) return [];
  if (values.length <= maxDistinct) return responseCurve(valid, param).map((p) => ({ ...p, from: p.value, to: p.value }));
  const min = values[0]!;
  const max = values[values.length - 1]!;
  const w = (max - min) / bins || 1;
  const groups: number[][] = Array.from({ length: bins }, () => []);
  for (const s of valid) groups[Math.min(bins - 1, Math.floor((s.params[param]! - min) / w))]!.push(s.outcome);
  return groups.flatMap((ys, b) => (ys.length ? [{ value: min + (b + 0.5) * w, from: min + b * w, to: min + (b + 1) * w, ...meanCI(ys) }] : []));
}

export interface ParameterEffect {
  param: string;
  /** Lowest and highest tested values. */
  from: number;
  to: number;
  /** Estimated change in the outcome going from `from` to `to` (linear fit). */
  change: number;
  /** 95% interval for `change`. */
  lo: number;
  hi: number;
  /** Outcome units per parameter unit. */
  slope: number;
  n: number;
  /** True when the 95% interval excludes zero. */
  clear: boolean;
  /** Share of outcome variation explained by this parameter (0–1). */
  r2: number;
}

/** Linear effect of one parameter on the outcome, with a 95% interval: "raising X from a to b changed Y by c (lo to hi)". */
export function parameterEffect(samples: Sample[], param: string): ParameterEffect | null {
  const valid = samples.filter((s) => s.params[param] !== undefined && Number.isFinite(s.outcome));
  const xs = valid.map((s) => s.params[param]!);
  if (valid.length < 3 || std(xs) === 0) return null;
  const from = Math.min(...xs);
  const to = Math.max(...xs);
  const fit = ols(
    valid.map((s) => [1, s.params[param]!]),
    valid.map((s) => s.outcome),
  );
  const slope = fit.coefficients[1]!;
  const se = fit.standardErrors[1]!;
  const t = t95(Math.max(1, valid.length - 2));
  const span = to - from;
  const change = slope * span;
  const half = t * se * span;
  const lo = change - half;
  const hi = change + half;
  return { param, from, to, change, lo, hi, slope, n: valid.length, clear: lo > 0 || hi < 0, r2: Number.isFinite(fit.r2) ? fit.r2 : 0 };
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
