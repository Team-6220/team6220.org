// What is left of a piece after cutting parts out of it. Ported from Geo.leftovers in Inventory's
// JsGeometry.html (see README.md).
//
// How: the piece is drawn onto a fine grid (1/16"), the cut rectangles are rubbed out, each remaining island is
// traced back into an outline and simplified. Islands too small or too thin to use are dropped as slivers.
// An island with a hole is opened up with a thin slit to the outside, because an outline can't have a hole.
import { area, bbox, cross, distToSeg, round, selfIntersects, type Point, type Polygon } from "./geometry";

export interface LeftoverOptions {
  /** Grid size in inches. Default 1/16". */
  res?: number;
  /** Islands smaller than this many square inches are dropped. Default 4. */
  minArea?: number;
  /** Islands narrower than this many inches are dropped. Default 3/4". */
  minWidth?: number;
}

/** The usable pieces left of `poly` after removing the `cuts` outlines, largest first. */
export function leftovers(poly: Polygon, cuts: Polygon[], opts: LeftoverOptions = {}): Polygon[] {
  const res = opts.res ?? 0.0625;
  const minArea = opts.minArea ?? 4;
  const minWidth = opts.minWidth ?? 0.75;
  const bb = bbox(poly);
  const nx = Math.ceil(bb.w / res - 1e-9) + 2, ny = Math.ceil(bb.h / res - 1e-9) + 2; // a 1-cell empty border
  const x0 = bb.x0 - res, y0 = bb.y0 - res;
  const grid = new Uint8Array(nx * ny);

  /** Sets every grid cell whose centre is inside `pg` to `value`. */
  const fill = (pg: Polygon, value: number) => {
    for (let j = 0; j < ny; j++) {
      const y = y0 + (j + 0.5) * res;
      const xs: number[] = [];
      for (let i = 0, k = pg.length - 1; i < pg.length; k = i++) {
        const a = pg[i], b = pg[k];
        if (a[1] > y !== b[1] > y) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let t = 0; t + 1 < xs.length; t += 2) {
        const i0 = Math.max(0, Math.ceil((xs[t] - x0) / res - 0.5 - 1e-9));
        const i1 = Math.min(nx - 1, Math.floor((xs[t + 1] - x0) / res - 0.5 + 1e-9));
        for (let i = i0; i <= i1; i++) grid[j * nx + i] = value;
      }
    }
  };
  fill(poly, 1);
  for (const c of cuts) fill(c, 0);

  // Open up holes: empty cells not connected to the outside get a slit downwards.
  const outside = new Uint8Array(nx * ny);
  const steps: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const flood = () => {
    outside.fill(0);
    const stack = [0];
    outside[0] = 1;
    while (stack.length) {
      const c = stack.pop()!, i = c % nx, j = (c - i) / nx;
      for (const [di, dj] of steps) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const q = b * nx + a;
        if (!grid[q] && !outside[q]) {
          outside[q] = 1;
          stack.push(q);
        }
      }
    }
  };
  for (let guard = 0; guard < 50; guard++) {
    flood();
    let hole = -1;
    for (let c = 0; c < grid.length; c++) {
      if (!grid[c] && !outside[c]) {
        hole = c;
        break;
      }
    }
    if (hole < 0) break;
    const i = hole % nx;
    for (let j = (hole - i) / nx; j < ny && !outside[j * nx + i]; j++) grid[j * nx + i] = 0;
  }

  // Connected islands (4-neighbour).
  const label = new Int32Array(nx * ny);
  let count = 0;
  for (let c = 0; c < grid.length; c++) {
    if (!grid[c] || label[c]) continue;
    count++;
    const stack = [c];
    label[c] = count;
    while (stack.length) {
      const q = stack.pop()!, i = q % nx, j = (q - i) / nx;
      for (const [di, dj] of steps) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const r = b * nx + a;
        if (grid[r] && !label[r]) {
          label[r] = count;
          stack.push(r);
        }
      }
    }
  }

  const out: Polygon[] = [];
  for (let id = 1; id <= count; id++) {
    const loop = traceLoop(label, nx, ny, id);
    if (!loop) continue;
    let pts: Polygon = loop.map((v) => [x0 + v[0] * res, y0 + v[1] * res]);
    pts = simplifyClosed(pts, res * 0.75);
    let eps = res * 0.75;
    while (pts.length > 60) {
      eps *= 1.6;
      pts = simplifyClosed(pts, eps);
    }
    pts = round(pts, 1 / 64);
    if (pts.length < 3 || selfIntersects(pts)) continue;
    const a = area(pts), b = bbox(pts);
    if (a < minArea || Math.min(b.w, b.h) < minWidth || a / Math.max(b.w, b.h) < minWidth * 0.5) continue;
    out.push(pts);
  }
  return out.sort((p, q) => area(q) - area(p));
}

/** Outer boundary of one labelled island, as grid-corner points (cells are [i, i+1] × [j, j+1]). */
function traceLoop(label: Int32Array, nx: number, ny: number, id: number): Point[] | null {
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && label[j * nx + i] === id;
  // Directed boundary edges with the island on the left.
  const next: Record<string, Point[]> = {};
  let first: Point | null = null;
  const add = (a: Point, b: Point) => {
    const k = `${a[0]},${a[1]}`;
    (next[k] ??= []).push(b);
    if (!first) first = a;
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!at(i, j)) continue;
      if (!at(i, j - 1)) add([i + 1, j], [i, j]);
      if (!at(i, j + 1)) add([i, j + 1], [i + 1, j + 1]);
      if (!at(i - 1, j)) add([i, j], [i, j + 1]);
      if (!at(i + 1, j)) add([i + 1, j + 1], [i + 1, j]);
    }
  }
  if (!first) return null;
  const start: Point = first;
  const loop: Point[] = [start];
  let prev: Point | null = null, cur: Point = start;
  for (let guard = 0; guard < nx * ny * 4; guard++) {
    const options = next[`${cur[0]},${cur[1]}`];
    if (!options || !options.length) break;
    let pick = 0;
    if (options.length > 1 && prev) {
      // At a pinch point, turn consistently.
      const din = [cur[0] - prev[0], cur[1] - prev[1]];
      let best = -Infinity;
      options.forEach((o, idx) => {
        const score = din[0] * (o[1] - cur[1]) - din[1] * (o[0] - cur[0]);
        if (score > best) {
          best = score;
          pick = idx;
        }
      });
    }
    const nxt = options.splice(pick, 1)[0];
    if (nxt[0] === start[0] && nxt[1] === start[1]) break;
    loop.push(nxt);
    prev = cur;
    cur = nxt;
  }
  // Drop points in the middle of straight runs.
  return loop.filter((p, i) => cross(loop[(i - 1 + loop.length) % loop.length], p, loop[(i + 1) % loop.length]) !== 0);
}

/** Douglas–Peucker for a closed outline. */
function simplifyClosed(pts: Polygon, eps: number): Polygon {
  if (pts.length <= 4) return pts;
  // Split at the point farthest from the first one.
  let b = 0, best = -1;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > best) {
      best = d;
      b = i;
    }
  }
  const half1 = simplifyOpen(pts.slice(0, b + 1), eps), half2 = simplifyOpen([...pts.slice(b), pts[0]], eps);
  return [...half1.slice(0, -1), ...half2.slice(0, -1)];
}

function simplifyOpen(pts: Polygon, eps: number): Polygon {
  if (pts.length < 3) return pts;
  let idx = -1, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSeg(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]];
  const l = simplifyOpen(pts.slice(0, idx + 1), eps), r = simplifyOpen(pts.slice(idx), eps);
  return [...l.slice(0, -1), ...r];
}
