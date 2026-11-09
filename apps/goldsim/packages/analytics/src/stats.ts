import { Rng } from "@goldsim/core";

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
}

/** Sample standard deviation (n - 1). */
export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Linear-interpolated quantile, q in [0, 1]. */
export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

export function median(xs: number[]): number {
  return quantile(xs, 0.5);
}

const T95 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11,
  2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

/** Two-sided 95% critical value of Student's t with df degrees of freedom. */
export function t95(df: number): number {
  if (df < 1) return NaN;
  if (df <= 30) return T95[df - 1]!;
  if (df <= 60) return 2.042 - ((df - 30) / 30) * (2.042 - 2.0);
  if (df <= 120) return 2.0 - ((df - 60) / 60) * (2.0 - 1.98);
  return 1.96;
}

export interface Interval {
  mean: number;
  lo: number;
  hi: number;
  n: number;
}

/** Mean with a 95% t-interval. */
export function meanCI(xs: number[]): Interval {
  const n = xs.length;
  const m = mean(xs);
  if (n < 2) return { mean: m, lo: m, hi: m, n };
  const half = (t95(n - 1) * std(xs)) / Math.sqrt(n);
  return { mean: m, lo: m - half, hi: m + half, n };
}

/** Percentile bootstrap 95% interval of a statistic, deterministic for a given seed. */
export function bootstrapCI(xs: number[], stat: (s: number[]) => number = mean, resamples = 1000, seed = 1): Interval {
  const n = xs.length;
  const point = stat(xs);
  if (n < 2) return { mean: point, lo: point, hi: point, n };
  const rng = new Rng(seed);
  const out: number[] = [];
  const buf = new Array<number>(n);
  for (let b = 0; b < resamples; b++) {
    for (let i = 0; i < n; i++) buf[i] = xs[rng.int(n)]!;
    out.push(stat(buf));
  }
  return { mean: point, lo: quantile(out, 0.025), hi: quantile(out, 0.975), n };
}

/** Proportion with a Wilson 95% interval. */
export function proportionCI(successes: number, n: number): Interval {
  if (n === 0) return { mean: NaN, lo: NaN, hi: NaN, n };
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { mean: p, lo: Math.max(0, center - half), hi: Math.min(1, center + half), n };
}

export interface Histogram {
  edges: number[];
  counts: number[];
}

/** Histogram with Freedman–Diaconis bin width (falls back to Sturges), integer-aligned for integer data. */
export function histogram(xs: number[], bins?: number): Histogram {
  if (!xs.length) return { edges: [], counts: [] };
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  if (min === max) return { edges: [min - 0.5, max + 0.5], counts: [xs.length] };
  let k = bins;
  if (!k) {
    const iqr = quantile(xs, 0.75) - quantile(xs, 0.25);
    const w = (2 * iqr) / Math.cbrt(xs.length);
    k = w > 0 ? Math.ceil((max - min) / w) : Math.ceil(Math.log2(xs.length) + 1);
    k = Math.max(1, Math.min(50, k));
  }
  let width = (max - min) / k;
  let start = min;
  if (xs.every(Number.isInteger)) {
    width = Math.max(1, Math.ceil(width));
    start = Math.floor(min) - 0.5;
    k = Math.ceil((max + 0.5 - start) / width);
  }
  const edges = Array.from({ length: k + 1 }, (_, i) => start + i * width);
  const counts = new Array<number>(k).fill(0);
  for (const x of xs) counts[Math.min(k - 1, Math.max(0, Math.floor((x - start) / width)))]!++;
  return { edges, counts };
}

/** Pearson correlation. */
export function correlation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return NaN;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}
