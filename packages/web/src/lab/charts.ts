import type { BinnedPoint, Histogram, ResponsePoint } from "@goldsim/analytics";
import { cssVar } from "../ui/dom.js";
import { fmt } from "./util.js";

// Inline SVG charts: square marks, gold primary series, colors read from theme tokens at draw time.

const NS = "http://www.w3.org/2000/svg";
const W = 520;
const H = 240;
const M = { l: 48, r: 12, t: 12, b: 36 };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

interface Palette {
  text: string;
  muted: string;
  grid: string;
  gold: string;
  blue: string;
  red: string;
}

function palette(): Palette {
  return { text: cssVar("--text"), muted: cssVar("--gray-5"), grid: cssVar("--gray-4"), gold: cssVar("--gold"), blue: cssVar("--blue"), red: cssVar("--red") };
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

function frame(xLabel: string, yLabel: string, xr: [number, number], yr: [number, number], p: Palette, xTicks?: number[]) {
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "lab-chart", role: "img" });
  const sx = (x: number) => M.l + ((x - xr[0]) / (xr[1] - xr[0] || 1)) * (W - M.l - M.r);
  const sy = (y: number) => H - M.b - ((y - yr[0]) / (yr[1] - yr[0] || 1)) * (H - M.t - M.b);
  for (const t of niceTicks(yr[0], yr[1])) {
    svg.appendChild(el("line", { x1: M.l, x2: W - M.r, y1: sy(t), y2: sy(t), stroke: p.grid, "stroke-width": 1 }));
    svg.appendChild(el("text", { x: M.l - 6, y: sy(t) + 4, "text-anchor": "end", "font-size": 11, fill: p.muted }, fmt(t)));
  }
  for (const t of xTicks ?? niceTicks(xr[0], xr[1])) {
    svg.appendChild(el("text", { x: sx(t), y: H - M.b + 16, "text-anchor": "middle", "font-size": 11, fill: p.muted }, fmt(t)));
  }
  svg.appendChild(el("line", { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b, stroke: p.muted, "stroke-width": 1 }));
  svg.appendChild(el("text", { x: (M.l + W - M.r) / 2, y: H - 4, "text-anchor": "middle", "font-size": 12, fill: p.text }, xLabel));
  svg.appendChild(el("text", { x: 12, y: (M.t + H - M.b) / 2, "text-anchor": "middle", "font-size": 12, fill: p.text, transform: `rotate(-90 12 ${(M.t + H - M.b) / 2})` }, yLabel));
  return { svg, sx, sy };
}

/** Histogram with square bars. */
export function histogramChart(hist: Histogram, xLabel: string, color: "gold" | "blue" | "red" = "gold"): SVGSVGElement {
  const p = palette();
  if (!hist.counts.length) return el("svg", { viewBox: `0 0 ${W} 40`, class: "lab-chart" });
  const xr: [number, number] = [hist.edges[0]!, hist.edges[hist.edges.length - 1]!];
  const yr: [number, number] = [0, Math.max(...hist.counts) * 1.1];
  const { svg, sx, sy } = frame(xLabel, "Matches", xr, yr, p);
  hist.counts.forEach((c, i) => {
    const x0 = sx(hist.edges[i]!);
    const x1 = sx(hist.edges[i + 1]!);
    const r = el("rect", { x: x0 + 1, y: sy(c), width: Math.max(1, x1 - x0 - 2), height: Math.max(0, sy(0) - sy(c)), fill: p[color] });
    r.appendChild(el("title", {}, `${fmt(hist.edges[i]!)}–${fmt(hist.edges[i + 1]!)}: ${c}`));
    svg.appendChild(r);
  });
  return svg;
}

/** Response curve: mean line with a 95% CI band. */
export function responseChart(points: ResponsePoint[], xLabel: string, yLabel: string): SVGSVGElement {
  const p = palette();
  if (!points.length) return el("svg", { viewBox: `0 0 ${W} 40`, class: "lab-chart" });
  const xs = points.map((q) => q.value);
  const lo = Math.min(...points.map((q) => q.lo));
  const hi = Math.max(...points.map((q) => q.hi));
  const pad = (hi - lo) * 0.1 || 1;
  const xr: [number, number] = [Math.min(...xs), Math.max(...xs)];
  if (xr[0] === xr[1]) {
    xr[0] -= 1;
    xr[1] += 1;
  }
  const { svg, sx, sy } = frame(xLabel, yLabel, xr, [Math.max(0, lo - pad), hi + pad], p);
  const band = [...points.map((q) => `${sx(q.value)},${sy(q.hi)}`), ...[...points].reverse().map((q) => `${sx(q.value)},${sy(q.lo)}`)].join(" ");
  svg.appendChild(el("polygon", { points: band, fill: p.gold, "fill-opacity": 0.2, stroke: "none" }));
  svg.appendChild(el("polyline", { points: points.map((q) => `${sx(q.value)},${sy(q.mean)}`).join(" "), fill: "none", stroke: p.gold, "stroke-width": 2 }));
  for (const q of points) {
    const m = el("rect", { x: sx(q.value) - 3, y: sy(q.mean) - 3, width: 6, height: 6, fill: p.gold });
    m.appendChild(el("title", {}, `${xLabel} ${fmt(q.value)}: ${fmt(q.mean)} [${fmt(q.lo)}, ${fmt(q.hi)}], n=${q.n}`));
    svg.appendChild(m);
  }
  return svg;
}

/** Horizontal bars with optional ± error whiskers (sensitivity, contributions). */
export function barChart(items: { label: string; value: number; err?: number }[], xLabel: string): SVGSVGElement {
  const p = palette();
  const rowH = 22;
  const height = M.t + items.length * rowH + 30;
  const labelW = 170;
  const svg = el("svg", { viewBox: `0 0 ${W} ${height}`, class: "lab-chart", role: "img" });
  items = items.filter((i) => Number.isFinite(i.value));
  if (!items.length) return svg;
  // Axis limits come from the estimates and their error whiskers, padded a little.
  const rawLo = Math.min(0, ...items.map((i) => i.value - (Number.isFinite(i.err) ? i.err! : 0)));
  const rawHi = Math.max(0, ...items.map((i) => i.value + (Number.isFinite(i.err) ? i.err! : 0)));
  const padAxis = (rawHi - rawLo) * 0.05;
  const lo = rawLo < 0 ? rawLo - padAxis : 0;
  const hi = rawHi > 0 ? rawHi + padAxis : 0;
  const sx = (x: number) => labelW + ((x - lo) / (hi - lo || 1)) * (W - labelW - M.r);
  for (const t of niceTicks(lo, hi)) {
    svg.appendChild(el("line", { x1: sx(t), x2: sx(t), y1: M.t, y2: height - 26, stroke: p.grid, "stroke-width": 1 }));
    svg.appendChild(el("text", { x: sx(t), y: height - 12, "text-anchor": "middle", "font-size": 11, fill: p.muted }, fmt(t)));
  }
  items.forEach((it, i) => {
    const y = M.t + i * rowH;
    svg.appendChild(el("text", { x: labelW - 8, y: y + 15, "text-anchor": "end", "font-size": 12, fill: p.text }, it.label.length > 24 ? `${it.label.slice(0, 23)}…` : it.label));
    const x0 = sx(Math.min(0, it.value));
    const x1 = sx(Math.max(0, it.value));
    const bar = el("rect", { x: x0, y: y + 4, width: Math.max(1, x1 - x0), height: rowH - 8, fill: it.value >= 0 ? p.gold : p.red });
    bar.appendChild(el("title", {}, `${it.label}: ${fmt(it.value)}${it.err ? ` ± ${fmt(it.err)}` : ""}`));
    svg.appendChild(bar);
    if (it.err) {
      const cy = y + rowH / 2;
      svg.appendChild(el("line", { x1: sx(it.value - it.err), x2: sx(it.value + it.err), y1: cy, y2: cy, stroke: p.text, "stroke-width": 1.5 }));
    }
  });
  svg.appendChild(el("text", { x: (labelW + W) / 2, y: height - 0, "text-anchor": "middle", "font-size": 12, fill: p.text }, xLabel));
  return svg;
}

export interface EffectChartInput {
  /** Average and 95% range per tested value (or per range of values). */
  points: BinnedPoint[];
  /** One dot per match. */
  dots: { x: number; y: number; tip?: string }[];
  xLabel: string;
  yLabel: string;
  yFormat?: (v: number) => string;
  /** Overall average, drawn as a dashed reference line. */
  overallMean?: number;
}

const BW = 900;
const BH = 400;
const BM = { l: 64, r: 16, t: 14, b: 48 };

/**
 * Large "setting vs result" chart: faint squares for every match, a gold line for the average at each tested
 * value with its 95% range as a band, and a dashed line at the overall average.
 */
export function effectChart(input: EffectChartInput): SVGSVGElement {
  const p = palette();
  const yFmt = input.yFormat ?? ((v: number) => fmt(v));
  const svg = el("svg", { viewBox: `0 0 ${BW} ${BH}`, class: "lab-chart big", role: "img" });
  const dots = input.dots.filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y));
  if (!dots.length) {
    svg.appendChild(el("text", { x: BW / 2, y: BH / 2, "text-anchor": "middle", "font-size": 14, fill: p.muted }, "No data for this result."));
    return svg;
  }
  const xs = dots.map((d) => d.x);
  let xr: [number, number] = [Math.min(...xs), Math.max(...xs)];
  if (xr[0] === xr[1]) xr = [xr[0] - 1, xr[1] + 1];
  const xPad = (xr[1] - xr[0]) * 0.04;
  xr = [xr[0] - xPad, xr[1] + xPad];
  const sorted = dots.map((d) => d.y).sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(f * (sorted.length - 1))))]!;
  const lo0 = Math.min(q(0.02), ...input.points.map((pt) => pt.lo).filter(Number.isFinite));
  const hi0 = Math.max(q(0.98), ...input.points.map((pt) => pt.hi).filter(Number.isFinite));
  const pad = (hi0 - lo0) * 0.08 || 1;
  const yr: [number, number] = [lo0 >= 0 ? Math.max(0, lo0 - pad) : lo0 - pad, hi0 + pad];
  const sx = (x: number) => BM.l + ((x - xr[0]) / (xr[1] - xr[0] || 1)) * (BW - BM.l - BM.r);
  const sy = (y: number) => BH - BM.b - ((y - yr[0]) / (yr[1] - yr[0] || 1)) * (BH - BM.t - BM.b);

  for (const t of niceTicks(yr[0], yr[1], 6)) {
    svg.appendChild(el("line", { x1: BM.l, x2: BW - BM.r, y1: sy(t), y2: sy(t), stroke: p.grid, "stroke-width": 1 }));
    svg.appendChild(el("text", { x: BM.l - 8, y: sy(t) + 4, "text-anchor": "end", "font-size": 12, fill: p.muted }, yFmt(t)));
  }
  const distinct = [...new Set(xs)];
  const xTicks = distinct.length <= 10 ? distinct : niceTicks(xr[0], xr[1], 8);
  for (const t of xTicks) svg.appendChild(el("text", { x: sx(t), y: BH - BM.b + 18, "text-anchor": "middle", "font-size": 12, fill: p.muted }, fmt(t)));
  svg.appendChild(el("line", { x1: BM.l, x2: BW - BM.r, y1: BH - BM.b, y2: BH - BM.b, stroke: p.muted, "stroke-width": 1 }));
  svg.appendChild(el("text", { x: (BM.l + BW - BM.r) / 2, y: BH - 6, "text-anchor": "middle", "font-size": 13, fill: p.text }, input.xLabel));
  svg.appendChild(el("text", { x: 14, y: (BM.t + BH - BM.b) / 2, "text-anchor": "middle", "font-size": 13, fill: p.text, transform: `rotate(-90 14 ${(BM.t + BH - BM.b) / 2})` }, input.yLabel));

  // Individual matches
  for (const d of dots) {
    if (d.y < yr[0] || d.y > yr[1]) continue;
    const r = el("rect", { x: sx(d.x) - 2.5, y: sy(d.y) - 2.5, width: 5, height: 5, fill: p.gold, "fill-opacity": 0.22 });
    if (d.tip) r.appendChild(el("title", {}, d.tip));
    svg.appendChild(r);
  }
  // Overall average reference
  if (input.overallMean !== undefined && Number.isFinite(input.overallMean)) {
    svg.appendChild(el("line", { x1: BM.l, x2: BW - BM.r, y1: sy(input.overallMean), y2: sy(input.overallMean), stroke: p.muted, "stroke-width": 1.5, "stroke-dasharray": "6 5" }));
    svg.appendChild(el("text", { x: BW - BM.r - 4, y: sy(input.overallMean) - 5, "text-anchor": "end", "font-size": 11, fill: p.muted }, `overall average ${yFmt(input.overallMean)}`));
  }
  // Average with 95% range
  const pts = input.points.filter((pt) => Number.isFinite(pt.mean));
  if (pts.length > 1) {
    const band = [...pts.map((pt) => `${sx(pt.value)},${sy(Math.min(yr[1], pt.hi))}`), ...[...pts].reverse().map((pt) => `${sx(pt.value)},${sy(Math.max(yr[0], pt.lo))}`)].join(" ");
    svg.appendChild(el("polygon", { points: band, fill: p.gold, "fill-opacity": 0.25, stroke: "none" }));
  }
  svg.appendChild(el("polyline", { points: pts.map((pt) => `${sx(pt.value)},${sy(pt.mean)}`).join(" "), fill: "none", stroke: p.gold, "stroke-width": 3 }));
  for (const pt of pts) {
    const m = el("rect", { x: sx(pt.value) - 4, y: sy(pt.mean) - 4, width: 8, height: 8, fill: p.gold, stroke: p.text, "stroke-width": 1 });
    const range = pt.from === pt.to ? fmt(pt.value) : `${fmt(pt.from)} to ${fmt(pt.to)}`;
    m.appendChild(el("title", {}, `${input.xLabel}: ${range}
average ${yFmt(pt.mean)} (95% range ${yFmt(pt.lo)} to ${yFmt(pt.hi)}), ${pt.n} matches`));
    svg.appendChild(m);
  }
  return svg;
}
