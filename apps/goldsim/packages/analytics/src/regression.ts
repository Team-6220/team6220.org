/** Inverts a square matrix (Gauss-Jordan with partial pivoting). Returns null if singular. */
export function invert(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    if (Math.abs(a[p]![c]!) < 1e-12) return null;
    [a[c], a[p]] = [a[p]!, a[c]!];
    const div = a[c]![c]!;
    for (let j = 0; j < 2 * n; j++) a[c]![j]! /= div;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r]![c]!;
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[r]![j]! -= f * a[c]![j]!;
    }
  }
  return a.map((row) => row.slice(n));
}

export interface OLSResult {
  coefficients: number[];
  standardErrors: number[];
  r2: number;
  residualStd: number;
  n: number;
  p: number;
}

/**
 * Ordinary least squares y ≈ X·β. A tiny ridge term keeps nearly collinear designs solvable;
 * standard errors use the residual variance with n - p degrees of freedom.
 */
export function ols(X: number[][], y: number[], ridge = 1e-9): OLSResult {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  const xtx = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => X.reduce((s, row) => s + row[i]! * row[j]!, 0) + (i === j ? ridge : 0)));
  const xty = Array.from({ length: p }, (_, i) => X.reduce((s, row, k) => s + row[i]! * y[k]!, 0));
  const inv = invert(xtx);
  if (!inv) return { coefficients: Array(p).fill(NaN), standardErrors: Array(p).fill(NaN), r2: NaN, residualStd: NaN, n, p };
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * xty[j]!, 0));
  const pred = X.map((row) => row.reduce((s, v, j) => s + v * beta[j]!, 0));
  const rss = y.reduce((s, v, k) => s + (v - pred[k]!) ** 2, 0);
  const ym = y.reduce((s, v) => s + v, 0) / Math.max(1, n);
  const tss = y.reduce((s, v) => s + (v - ym) ** 2, 0);
  const dof = Math.max(1, n - p);
  const sigma2 = rss / dof;
  return {
    coefficients: beta,
    standardErrors: inv.map((row, i) => Math.sqrt(Math.max(0, sigma2 * row[i]!))),
    r2: tss > 0 ? 1 - rss / tss : NaN,
    residualStd: Math.sqrt(sigma2),
    n,
    p,
  };
}
