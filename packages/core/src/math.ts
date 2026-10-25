import type { Shape, Vec2, Pose } from "@goldsim/schema";

export type { Vec2, Pose };

export const TAU = Math.PI * 2;
export const G = 9.81;

export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function rotate(x: number, y: number, theta: number): Vec2 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Transforms a point from a local frame (pose) into the parent frame. */
export function toWorld(pose: Pose, x: number, y: number): Vec2 {
  const r = rotate(x, y, pose.theta);
  return { x: pose.x + r.x, y: pose.y + r.y };
}

/** Transforms a parent-frame point into a local frame. */
export function toLocal(pose: Pose, x: number, y: number): Vec2 {
  return rotate(x - pose.x, y - pose.y, -pose.theta);
}

export function rectPoints(cx: number, cy: number, length: number, width: number, theta = 0): Vec2[] {
  const hx = length / 2;
  const hy = width / 2;
  return [
    [hx, hy],
    [-hx, hy],
    [-hx, -hy],
    [hx, -hy],
  ].map(([x, y]) => {
    const r = rotate(x!, y!, theta);
    return { x: cx + r.x, y: cy + r.y };
  });
}

/** Polygon outline of a shape (circles are approximated with 24 points). */
export function shapePoints(shape: Shape): Vec2[] {
  switch (shape.type) {
    case "rect":
      return rectPoints(shape.x, shape.y, shape.length, shape.width, shape.theta ?? 0);
    case "polygon":
      return shape.points.map((p) => ({ x: p.x, y: p.y }));
    case "circle":
      return Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * TAU;
        return { x: shape.x + shape.radius * Math.cos(a), y: shape.y + shape.radius * Math.sin(a) };
      });
  }
}

export function shapeCenter(shape: Shape): Vec2 {
  if (shape.type === "polygon") {
    const n = shape.points.length;
    return {
      x: shape.points.reduce((s, p) => s + p.x, 0) / n,
      y: shape.points.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: shape.x, y: shape.y };
}

export function pointInPolygon(x: number, y: number, pts: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function pointInShape(x: number, y: number, shape: Shape): boolean {
  switch (shape.type) {
    case "circle":
      return (x - shape.x) ** 2 + (y - shape.y) ** 2 <= shape.radius ** 2;
    case "rect": {
      const l = toLocal({ x: shape.x, y: shape.y, theta: shape.theta ?? 0 }, x, y);
      return Math.abs(l.x) <= shape.length / 2 && Math.abs(l.y) <= shape.width / 2;
    }
    case "polygon":
      return pointInPolygon(x, y, shape.points);
  }
}

/** Separating-axis test for two convex polygons. */
export function polygonsOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i]!;
      const p2 = poly[(i + 1) % poly.length]!;
      const nx = p2.y - p1.y;
      const ny = p1.x - p2.x;
      let minA = Infinity,
        maxA = -Infinity,
        minB = Infinity,
        maxB = -Infinity;
      for (const p of a) {
        const d = p.x * nx + p.y * ny;
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      for (const p of b) {
        const d = p.x * nx + p.y * ny;
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

export function polygonOverlapsShape(poly: Vec2[], shape: Shape): boolean {
  return polygonsOverlap(poly, shapePoints(shape));
}

/** Distance along a ray (origin o, unit direction d) to its first intersection with a circle, or null. */
export function rayCircle(ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, r: number): number | null {
  const fx = ox - cx;
  const fy = oy - cy;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = -b - sq;
  const t2 = -b + sq;
  if (t1 >= 0) return t1;
  if (t2 >= 0) return 0; // origin inside the circle
  return null;
}

/** Closest approach of a ray to a point: returns along-ray distance and perpendicular miss distance. */
export function rayClosest(ox: number, oy: number, dx: number, dy: number, px: number, py: number) {
  const along = (px - ox) * dx + (py - oy) * dy;
  const perp = Math.abs((px - ox) * dy - (py - oy) * dx);
  return { along, perp };
}

export function shapeBounds(shape: Shape) {
  const pts = shapePoints(shape);
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}
