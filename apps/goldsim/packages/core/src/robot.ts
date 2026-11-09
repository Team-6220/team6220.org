import type { MechanismsDef, RobotDesign } from "@goldsim/schema";
import { rectPoints, type Vec2 } from "./math.js";
import { resolveMechanism, type ResolvedMechanism } from "./mechanisms/specs.js";

/** Convex hull (monotone chain), counter-clockwise. */
export function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Frame outline in the chassis frame. */
export function framePolygon(design: RobotDesign): Vec2[] {
  const f = design.chassis.frame;
  return f.type === "rect" ? rectPoints(0, 0, f.length, f.width) : convexHull(f.points);
}

/** Bumper outline (frame grown by bumper thickness) in the chassis frame. This is the robot's collision shape. */
export function bumperPolygon(design: RobotDesign): Vec2[] {
  const t = design.chassis.bumpers.thickness;
  const f = design.chassis.frame;
  if (f.type === "rect") return rectPoints(0, 0, f.length + 2 * t, f.width + 2 * t);
  return convexHull(framePolygon(design).flatMap((p) => [
    { x: p.x + t, y: p.y + t },
    { x: p.x - t, y: p.y + t },
    { x: p.x + t, y: p.y - t },
    { x: p.x - t, y: p.y - t },
  ]));
}

/** Rectangle extending `depth` from a mount along its heading, `width` across it, in the chassis frame. */
export function mountRect(m: ResolvedMechanism, depth: number, width: number): Vec2[] {
  const c = Math.cos(m.mount.theta);
  const s = Math.sin(m.mount.theta);
  return rectPoints(m.mount.x + (c * depth) / 2, m.mount.y + (s * depth) / 2, depth, width, m.mount.theta);
}

/** Footprint drawn for a mechanism in the chassis frame, at deploy fraction 0..1. */
export function mechanismFootprint(m: ResolvedMechanism, deploy = 1): Vec2[] {
  switch (m.base) {
    case "intake":
      return mountRect(m, Math.max(0.02, m.p.rollerDepth! * (m.p.deployTime! > 0 ? Math.max(deploy, 0.15) : 1)), m.p.width!);
    case "blocker":
      return mountRect(m, Math.max(0.02, m.p.depth! * (m.p.deployTime! > 0 ? Math.max(deploy, 0.15) : 1)), m.p.width!);
    case "shooter":
      return mountRect(m, 0.18, 0.18);
    case "climber":
      return mountRect(m, 0.1, 0.25);
    case "placer":
      return mountRect(m, 0.12, 0.2);
    case "storage":
    case "transfer":
      return rectPoints(m.mount.x, m.mount.y, 0.12, 0.12, m.mount.theta);
  }
}

export interface DesignIssue {
  path: string;
  message: string;
}

/**
 * Checks only what the sim needs to run (PRD §9.1): finite positive sizes and mass, known mechanism types,
 * mechanisms on the chassis, unique ids. Never checks robot-construction rules.
 */
export function checkDesignRunnable(design: RobotDesign, custom: MechanismsDef): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const ch = design.chassis;
  const pos = (v: number, path: string, what: string) => {
    if (!Number.isFinite(v) || v <= 0) issues.push({ path, message: `${what} must be a positive number.` });
  };
  if (ch.frame.type === "rect") {
    pos(ch.frame.length, "chassis.frame.length", "Frame length");
    pos(ch.frame.width, "chassis.frame.width", "Frame width");
  } else if (convexHull(ch.frame.points).length < 3) {
    issues.push({ path: "chassis.frame.points", message: "Frame polygon needs at least 3 distinct corners." });
  }
  pos(ch.mass, "chassis.mass", "Mass");
  pos(ch.height, "chassis.height", "Height");
  pos(ch.drivetrain.maxSpeed, "chassis.drivetrain.maxSpeed", "Top speed");
  pos(ch.drivetrain.maxAccel, "chassis.drivetrain.maxAccel", "Acceleration");
  pos(ch.drivetrain.maxAngularSpeed, "chassis.drivetrain.maxAngularSpeed", "Turn speed");
  pos(ch.drivetrain.traction, "chassis.drivetrain.traction", "Traction");
  if (!Number.isFinite(ch.bumpers.thickness) || ch.bumpers.thickness < 0)
    issues.push({ path: "chassis.bumpers.thickness", message: "Bumper thickness must be 0 or more." });

  const bumper = bumperPolygon(design);
  const reach = Math.max(...bumper.map((p) => Math.hypot(p.x, p.y)));
  const ids = new Set<string>();
  design.mechanisms.forEach((mech, i) => {
    const path = `mechanisms[${i}]`;
    if (ids.has(mech.id)) issues.push({ path: `${path}.id`, message: `Two mechanisms are named "${mech.id}".` });
    ids.add(mech.id);
    try {
      resolveMechanism(mech, custom);
    } catch (e) {
      issues.push({ path: `${path}.type`, message: (e as Error).message });
      return;
    }
    const { x, y, theta } = mech.mount;
    if (![x, y, theta].every(Number.isFinite)) issues.push({ path: `${path}.mount`, message: "Mount values must be numbers." });
    else if (Math.hypot(x, y) > reach + 0.05)
      issues.push({ path: `${path}.mount`, message: `"${mech.id}" is mounted outside the robot. Move it onto the chassis.` });
  });
  return issues;
}

export function resolveMechanisms(design: RobotDesign, custom: MechanismsDef): ResolvedMechanism[] {
  return design.mechanisms.map((m) => resolveMechanism(m, custom));
}
