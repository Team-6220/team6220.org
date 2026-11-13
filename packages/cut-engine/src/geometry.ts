// Points and outlines. Ported from Inventory's JsGeometry.html (see README.md). x is to the right, y is down.

/** [x, y] */
export type Point = [number, number];
/** A closed outline: the last point joins back to the first. */
export type Polygon = Point[];

/** Where a part's stock rectangle sits on a piece: a w×h rectangle at (x, y), turned by `angle` degrees. */
export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
}

export function signedArea(p: Polygon): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2;
}

export function area(p: Polygon): number {
  return Math.abs(signedArea(p));
}

export function bbox(p: Polygon): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of p) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function rotate(p: Polygon, degrees: number): Polygon {
  const r = (degrees * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return p.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

export function round(p: Polygon, step: number): Polygon {
  return p.map(([x, y]) => [Math.round(x / step) * step, Math.round(y / step) * step]);
}

export function rect(x: number, y: number, w: number, h: number): Polygon {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/** A placement as an outline in the piece's frame. */
export function placementPoly(pl: Placement): Polygon {
  return rotate(rect(pl.x, pl.y, pl.w, pl.h), pl.angle || 0);
}

export function distToSeg(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Inside the outline, or within `eps` of its edge. */
export function pointIn(pt: Point, poly: Polygon, eps = 1e-6): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (distToSeg(pt, a, b) <= eps) return true;
    if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function cross(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** Segments ab and cd cross at a single interior point (touching doesn't count). */
export function segCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const e = 1e-9;
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e));
}

export function selfIntersects(p: Polygon): boolean {
  const n = p.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segCross(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Is the rectangle outline `r` (4 points, any angle) completely inside `poly`? */
export function containsRect(poly: Polygon, r: Polygon): boolean {
  for (const corner of r) if (!pointIn(corner, poly, 1e-6)) return false;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    for (let j = 0; j < poly.length; j++) if (segCross(a, b, poly[j], poly[(j + 1) % poly.length])) return false;
  }
  // A notch corner of the stock poking into the rectangle.
  for (const corner of poly) if (convexStrictlyIn(corner, r)) return false;
  const centre: Point = [(r[0][0] + r[2][0]) / 2, (r[0][1] + r[2][1]) / 2];
  return pointIn(centre, poly, 1e-6);
}

function convexStrictlyIn(pt: Point, r: Polygon): boolean {
  let sign = 0;
  for (let i = 0; i < r.length; i++) {
    const c = cross(r[i], r[(i + 1) % r.length], pt);
    if (Math.abs(c) < 1e-7) return false;
    const s = c > 0 ? 1 : -1;
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** Do two convex outlines overlap (more than touching)? Separating-axis test. */
export function overlap(a: Polygon, b: Polygon): boolean {
  for (const p of [a, b]) {
    for (let i = 0; i < p.length; i++) {
      const q = p[(i + 1) % p.length];
      const nx = q[1] - p[i][1], ny = p[i][0] - q[0];
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const v of a) {
        const t = v[0] * nx + v[1] * ny;
        amin = Math.min(amin, t);
        amax = Math.max(amax, t);
      }
      for (const v of b) {
        const t = v[0] * nx + v[1] * ny;
        bmin = Math.min(bmin, t);
        bmax = Math.max(bmax, t);
      }
      const tol = 1e-7 * Math.hypot(nx, ny);
      if (amax <= bmin + tol || bmax <= amin + tol) return false;
    }
  }
  return true;
}

/** Inches as the shop says them: 12.5 -> 12 1/2" (to the nearest 1/16). */
export function formatInches(x: number): string {
  const sixteenths = Math.round(x * 16), whole = Math.floor(sixteenths / 16);
  let num = sixteenths % 16, den = 16;
  while (num && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return (num ? (whole ? `${whole} ` : "") + `${num}/${den}` : String(whole)) + '"';
}

/** How many inches one of a unit is ("mm" -> 0.03937). Unknown units are taken as inches. */
export function toInches(unit: string): number {
  return ({ mm: 1 / 25.4, cm: 1 / 2.54, m: 39.3701, ft: 12 } as Record<string, number>)[String(unit || "").toLowerCase()] ?? 1;
}
