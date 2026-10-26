import { PROFILE_KNOBS, type DriverProfile } from "@goldsim/agents";
import { MECHANISM_SPECS, resolveMechanism, type GameModule } from "@goldsim/core";
import type { Alliance, RobotDesign } from "@goldsim/schema";

/** "Blue 1", "Red 3". Stations are 0-based internally. */
export function slotName(alliance: Alliance, station: number): string {
  return `${alliance === "blue" ? "Blue" : "Red"} ${station + 1}`;
}

/** A value on a robot that a sweep can change, described for people (not code). */
export interface ParamOption {
  /** Design path (e.g. /mechanisms/shooter2/params/exitSpeed). */
  path: string;
  /** Part of the robot, e.g. "Shooter 2" or "Drivetrain". */
  part: string;
  /** Short name, e.g. "Exit speed". */
  short: string;
  /** "Shooter 2 · Exit speed". */
  label: string;
  unit: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step: number;
}

/** Drops a trailing parenthetical: "Exit speed (how hard...)" -> "Exit speed". */
export function shortName(label: string): string {
  return label.replace(/\s*\(.*\)\s*$/, "").trim();
}

/** Full name used in tables and charts: "Blue 1 · Shooter 2 · Exit speed (m/s)". */
export function fullParamLabel(slot: string, opt: Pick<ParamOption, "label" | "unit">): string {
  return `${slot} · ${opt.label}${opt.unit ? ` (${opt.unit})` : ""}`;
}

/** Name of one mechanism on a design, numbered when there are several of the same kind ("Shooter 2"). */
export function mechanismName(design: RobotDesign, mechId: string, game: GameModule): string {
  const mech = design.mechanisms.find((m) => m.id === mechId);
  if (!mech) return mechId;
  const custom = game.mechanisms.types.find((t) => t.id === mech.type);
  const base = custom?.label ?? (MECHANISM_SPECS[mech.type as keyof typeof MECHANISM_SPECS]?.label ?? mech.type);
  const same = design.mechanisms.filter((m) => m.type === mech.type);
  return same.length > 1 ? `${base} ${same.indexOf(mech) + 1}` : base;
}

const CHASSIS: { path: string; short: string; unit: string; help: string; get: (d: RobotDesign) => number; min: number; max: number; step: number }[] = [
  { path: "/chassis/drivetrain/maxSpeed", short: "Top speed", unit: "m/s", help: "How fast the robot can drive flat out.", get: (d) => d.chassis.drivetrain.maxSpeed, min: 1, max: 7, step: 0.1 },
  { path: "/chassis/drivetrain/maxAccel", short: "Acceleration", unit: "m/s²", help: "How quickly the robot gets up to speed (and how hard it can push).", get: (d) => d.chassis.drivetrain.maxAccel, min: 1, max: 20, step: 0.5 },
  { path: "/chassis/drivetrain/maxAngularSpeed", short: "Turn speed", unit: "rad/s", help: "How fast the robot can spin. 6.28 rad/s is one full turn per second.", get: (d) => d.chassis.drivetrain.maxAngularSpeed, min: 1, max: 20, step: 0.5 },
  { path: "/chassis/drivetrain/traction", short: "Traction", unit: "", help: "Wheel grip. More grip means better pushing and pulling against other robots.", get: (d) => d.chassis.drivetrain.traction, min: 0.3, max: 2, step: 0.05 },
  { path: "/chassis/mass", short: "Mass", unit: "kg", help: "Robot weight without bumpers. Heavier robots are harder to push but accelerate slower.", get: (d) => d.chassis.mass, min: 20, max: 80, step: 1 },
  { path: "/chassis/height", short: "Height", unit: "m", help: "How tall the robot drives. Taller robots can't fit under low passages (like the Trench).", get: (d) => d.chassis.height, min: 0.2, max: 1.5, step: 0.01 },
];

/** Everything about a design a sweep can change, with plain-language names, units and help. */
export function designOptions(design: RobotDesign, game: GameModule): ParamOption[] {
  const out: ParamOption[] = CHASSIS.map((c) => ({
    path: c.path,
    part: c.path.includes("drivetrain") ? "Drivetrain" : "Chassis",
    short: c.short,
    label: `${c.path.includes("drivetrain") ? "Drivetrain" : "Chassis"} · ${c.short}`,
    unit: c.unit,
    help: c.help,
    value: c.get(design),
    min: c.min,
    max: c.max,
    step: c.step,
  }));
  for (const mech of design.mechanisms) {
    let resolved;
    try {
      resolved = resolveMechanism(mech, game.mechanisms);
    } catch {
      continue;
    }
    const part = mechanismName(design, mech.id, game);
    for (const [key, ps] of Object.entries(MECHANISM_SPECS[resolved.base].params)) {
      const short = shortName(ps.label);
      out.push({
        path: `/mechanisms/${mech.id}/params/${key}`,
        part,
        short,
        label: `${part} · ${short}`,
        unit: ps.unit,
        help: ps.help,
        value: resolved.p[key] ?? ps.default,
        min: ps.min,
        max: ps.max,
        step: ps.step,
      });
    }
  }
  return out;
}

/** Driver-profile knob as a sweepable option. */
export function knobOption(knob: (typeof PROFILE_KNOBS)[number], current: number): ParamOption {
  const m = /\(([^)]*)\)\s*$/.exec(knob.label);
  return {
    path: String(knob.key),
    part: "Driver",
    short: shortName(knob.label),
    label: `Driver · ${shortName(knob.label)}`,
    unit: m?.[1] ?? "",
    help: knob.help,
    value: current,
    min: knob.min,
    max: knob.max,
    step: knob.step,
  };
}

export function knobFor(key: keyof DriverProfile) {
  return PROFILE_KNOBS.find((k) => k.key === key);
}

/** Looks up the readable option behind a stored sweep target, for results files saved without labels. */
export function describeTarget(design: RobotDesign | undefined, target: { kind: "design"; path: string } | { kind: "profile"; knob: keyof DriverProfile }, game: GameModule): ParamOption | null {
  if (target.kind === "profile") {
    const k = knobFor(target.knob);
    return k ? knobOption(k, NaN) : null;
  }
  if (!design) return null;
  return designOptions(design, game).find((o) => o.path === target.path) ?? null;
}

/** Turns a camelCase key into words: "districtChampionship" -> "District championship". */
export function humanize(key: string): string {
  const s = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
