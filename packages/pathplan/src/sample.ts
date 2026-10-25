import type { PPCommand, PPPath, PPPoint } from "./format.js";

const DEG = Math.PI / 180;

export interface PathSample {
  x: number;
  y: number;
  /** Arc length from the path start, meters. */
  s: number;
  /** Tangent heading, radians. */
  tangent: number;
  /** Curvature magnitude, 1/m. */
  curvature: number;
}

export interface SampledMarker {
  name: string;
  s: number;
  endS: number | null;
  command: PPCommand | null;
}

/** A path reduced to geometry: a polyline at fixed arc-length spacing plus progress-based targets (PRD §16.1). */
export interface SampledPath {
  name: string;
  points: PathSample[];
  length: number;
  spacing: number;
  reversed: boolean;
  /** Arc length of each waypoint. */
  waypointS: number[];
  markers: SampledMarker[];
  /** Rotation knots (arc length -> radians). Empty when the path has no rotation data. */
  rotationKnots: { s: number; rotation: number }[];
  /** Speed caps by arc range (m/s), from global constraints and constraint zones. */
  speedCaps: { from: number; to: number; maxVelocity: number }[];
  goalEndVelocity: number;
  start: PPPoint;
  end: PPPoint;
}

function bezier(p0: PPPoint, p1: PPPoint, p2: PPPoint, p3: PPPoint, t: number): PPPoint {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** Exact point on the Bezier chain at a waypoint-relative position (segment index + local t), as PathPlanner defines it. */
export function pointAtPosition(path: PPPath, pos: number): PPPoint {
  const n = path.waypoints.length - 1;
  const p = Math.max(0, Math.min(n, pos));
  const seg = Math.min(n - 1, Math.floor(p));
  const t = p - seg;
  return bezier(...segmentControls(path, seg), t);
}

function segmentControls(path: PPPath, seg: number): [PPPoint, PPPoint, PPPoint, PPPoint] {
  const a = path.waypoints[seg]!;
  const b = path.waypoints[seg + 1]!;
  return [a.anchor, a.nextControl ?? a.anchor, b.prevControl ?? b.anchor, b.anchor];
}

const wrap = (a: number) => {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
};

/**
 * Samples a path. Dense parameter sampling builds a (position -> arc length) table, which is then resampled at
 * `spacing` meters. Waypoint-relative positions map to arc length through the table.
 */
export function samplePath(path: PPPath, spacing = 0.02): SampledPath {
  const segs = path.waypoints.length - 1;
  const STEPS = 400;
  const dense: { pos: number; x: number; y: number; s: number }[] = [];
  let s = 0;
  let prev: PPPoint | null = null;
  for (let seg = 0; seg < segs; seg++) {
    const c = segmentControls(path, seg);
    for (let k = seg === 0 ? 0 : 1; k <= STEPS; k++) {
      const t = k / STEPS;
      const p = bezier(...c, t);
      if (prev) s += Math.hypot(p.x - prev.x, p.y - prev.y);
      dense.push({ pos: seg + t, x: p.x, y: p.y, s });
      prev = p;
    }
  }
  const length = s;

  const sAtPos = (pos: number): number => {
    // dense[i].pos === i / STEPS, so the table is indexed directly
    const f = Math.max(0, Math.min(segs, pos)) * STEPS;
    const i = Math.min(dense.length - 2, Math.floor(f));
    const a = dense[i]!;
    const b = dense[i + 1]!;
    return a.s + (b.s - a.s) * (f - i);
  };

  // Resample at fixed arc-length spacing.
  const count = Math.max(2, Math.ceil(length / spacing) + 1);
  const pts: PathSample[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = Math.min(length, i * spacing);
    while (j < dense.length - 2 && dense[j + 1]!.s < target) j++;
    const a = dense[j]!;
    const b = dense[j + 1] ?? a;
    const f = b.s === a.s ? 0 : (target - a.s) / (b.s - a.s);
    pts.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, s: target, tangent: 0, curvature: 0 });
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    pts[i]!.tangent = Math.atan2(b.y - a.y, b.x - a.x);
  }
  // Curvature from tangent change over a +-5 sample window (smooths resampling noise).
  const W = 5;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - W)]!;
    const b = pts[Math.min(pts.length - 1, i + W)]!;
    const ds = b.s - a.s;
    pts[i]!.curvature = ds > 1e-6 ? Math.abs(wrap(b.tangent - a.tangent)) / ds : 0;
  }

  // Rotation knots: ideal start state, rotation targets, goal end state.
  const rotationKnots: { s: number; rotation: number }[] = [];
  if (path.idealStartingState) rotationKnots.push({ s: 0, rotation: path.idealStartingState.rotation * DEG });
  for (const r of path.rotationTargets) rotationKnots.push({ s: sAtPos(r.waypointRelativePos), rotation: r.rotationDegrees * DEG });
  rotationKnots.push({ s: length, rotation: path.goalEndState.rotation * DEG });
  rotationKnots.sort((a, b) => a.s - b.s);

  const speedCaps: SampledPath["speedCaps"] = [];
  const g = path.globalConstraints;
  if (!g.unlimited && g.maxVelocity !== undefined && g.maxVelocity > 0) speedCaps.push({ from: 0, to: length, maxVelocity: g.maxVelocity });
  for (const z of path.constraintZones) {
    const v = z.constraints.maxVelocity;
    if (z.constraints.unlimited || v === undefined || v <= 0) continue;
    speedCaps.push({ from: sAtPos(z.minWaypointRelativePos), to: sAtPos(z.maxWaypointRelativePos), maxVelocity: v });
  }

  return {
    name: path.name,
    points: pts,
    length,
    spacing,
    reversed: path.reversed,
    waypointS: path.waypoints.map((_, i) => sAtPos(i)),
    markers: path.eventMarkers
      .map((m) => ({
        name: m.name,
        s: sAtPos(m.waypointRelativePos),
        endS: m.endWaypointRelativePos === null ? null : sAtPos(m.endWaypointRelativePos),
        command: m.command,
      }))
      .sort((a, b) => a.s - b.s),
    rotationKnots,
    speedCaps,
    goalEndVelocity: Math.max(0, path.goalEndState.velocity),
    start: path.waypoints[0]!.anchor,
    end: path.waypoints[path.waypoints.length - 1]!.anchor,
  };
}

/** Interpolated holonomic rotation at arc length s (shortest-angle linear interpolation between knots). */
export function rotationAt(path: SampledPath, s: number): number | null {
  const k = path.rotationKnots;
  if (!k.length) return null;
  if (s <= k[0]!.s) return k[0]!.rotation;
  for (let i = 1; i < k.length; i++) {
    const a = k[i - 1]!;
    const b = k[i]!;
    if (s <= b.s) {
      const f = b.s === a.s ? 1 : (s - a.s) / (b.s - a.s);
      return wrap(a.rotation + wrap(b.rotation - a.rotation) * f);
    }
  }
  return k[k.length - 1]!.rotation;
}

/** Tightest speed cap active at arc length s, or Infinity. */
export function speedCapAt(path: SampledPath, s: number): number {
  let cap = Infinity;
  for (const c of path.speedCaps) if (s >= c.from - 1e-9 && s <= c.to + 1e-9) cap = Math.min(cap, c.maxVelocity);
  return cap;
}

/** Sample at arc length s (clamped). */
export function sampleAt(path: SampledPath, s: number): PathSample {
  const i = Math.max(0, Math.min(path.points.length - 1, Math.round(s / path.spacing)));
  return path.points[i]!;
}
