// 2D planning: where on which stock piece each part's stock rectangle goes.
// Ported from Geo.findSpot and Geo.plan in Inventory's JsGeometry.html (see README.md).
import { area, bbox, containsRect, overlap, placementPoly, rect, rotate, type Placement, type Polygon } from "./geometry";

/** One usable copy of a stock piece. */
export interface Stock {
  /** The Inventory piece's id (or any name, in the optimizer). */
  id: string;
  /** Which of several identical copies (0 for a piece with quantity 1). */
  copy: number;
  /** The outline, in inches. */
  points: Polygon;
  /** Spots already reserved on this copy by earlier plans. */
  taken?: Polygon[];
}

/** One physical part to place. w and h are the stock rectangle (part size plus the extra, see rules.ts). */
export interface SheetPart {
  key: string;
  name: string;
  w: number;
  h: number;
}

export interface SheetPlan<S extends Stock = Stock, P extends SheetPart = SheetPart> {
  placed: { part: P; stock: S; placement: Placement }[];
  /** Parts that fit on no piece. */
  unplaced: P[];
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** Positions to try along one axis: a regular step, plus every edge position that could make a snug fit. */
function candidates(lo: number, hi: number, step: number, extra: number[], extra2: number[] = []): number[] {
  if (hi < lo - 1e-6) return [];
  const set: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) set.push(v);
  for (const v of [...extra, ...extra2]) if (v >= lo - 1e-9 && v <= hi + 1e-9) set.push(v);
  set.push(hi);
  set.sort((a, b) => a - b);
  return set.filter((v, i) => i === 0 || v - set[i - 1] > 1e-6);
}

/**
 * Finds a spot for a w×h rectangle on a piece, avoiding `taken` outlines.
 * Tries square to the piece and square to each of its edges, scanning from one corner so leftovers stay in one
 * usable block. Returns null when it doesn't fit.
 */
export function findSpot(poly: Polygon, taken: Polygon[], w: number, h: number): Placement | null {
  const angles: number[] = [];
  const addAngle = (a: number) => {
    a = ((a % 180) + 180) % 180;
    if (!angles.some((b) => Math.abs(b - a) < 0.5 || Math.abs(b - a) > 179.5)) angles.push(a);
  };
  addAngle(0);
  addAngle(90);
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const a = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
    addAngle(a);
    addAngle(a + 90);
  });
  const pieceArea = area(poly);
  for (const angle of angles) {
    const rp = rotate(poly, -angle);
    const rt = taken.map((t) => rotate(t, -angle));
    const bb = bbox(rp);
    if (bb.w + 1e-6 < w || bb.h + 1e-6 < h) continue;
    const step = Math.max(0.125, Math.min(0.5, Math.min(w, h) / 12, pieceArea > 600 ? 0.5 : 0.25));
    const xs = candidates(bb.x0, bb.x1 - w, step, [...rp.map((p) => p[0]), ...rp.map((p) => p[0] - w)], rt.flatMap((t) => t.map((p) => p[0])));
    const ys = candidates(bb.y0, bb.y1 - h, step, [...rp.map((p) => p[1]), ...rp.map((p) => p[1] - h)], rt.flatMap((t) => [...t.map((p) => p[1]), ...t.map((p) => p[1] - h)]));
    for (const y of ys) {
      for (const x of xs) {
        const r = rect(x, y, w, h);
        if (rt.some((t) => overlap(r, t))) continue;
        if (!containsRect(rp, r)) continue;
        return { x: round4(x), y: round4(y), w, h, angle: round4(angle) };
      }
    }
  }
  return null;
}

/**
 * Plans where each part comes from. Biggest parts first. Each goes on the piece where it wastes the least:
 * pieces already used by this plan first (keeps cuts together), then the smallest piece it fits on, so big sheets
 * stay whole for big parts.
 */
export function planSheets<S extends Stock, P extends SheetPart>(stocks: S[], parts: P[]): SheetPlan<S, P> {
  const state = stocks.map((s) => ({
    s,
    taken: [...(s.taken ?? [])],
    used: false,
    area: area(s.points),
    free: area(s.points) - (s.taken ?? []).reduce((a, t) => a + area(t), 0),
  }));
  const order = [...parts].sort((a, b) => b.w * b.h - a.w * a.h);
  const placed: SheetPlan<S, P>["placed"] = [];
  const unplaced: P[] = [];
  for (const part of order) {
    const need = part.w * part.h;
    const choices = state
      .filter((st) => st.free + 1e-6 >= need)
      .sort((a, b) => (a.used === b.used ? 0 : a.used ? -1 : 1) || a.area - b.area);
    let done = false;
    for (const st of choices) {
      const spot = findSpot(st.s.points, st.taken, part.w, part.h);
      if (!spot) continue;
      st.taken.push(placementPoly(spot));
      st.used = true;
      st.free -= need;
      placed.push({ part, stock: st.s, placement: spot });
      done = true;
      break;
    }
    if (!done) unplaced.push(part);
  }
  return { placed, unplaced };
}
