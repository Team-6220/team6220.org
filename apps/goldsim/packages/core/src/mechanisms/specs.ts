import type { Mechanism, MechanismsDef } from "@goldsim/schema";

export type CoreMechanismType = "intake" | "storage" | "transfer" | "shooter" | "placer" | "climber" | "blocker";

export interface ParamSpec {
  default: number;
  min: number;
  max: number;
  step: number;
  unit: "m" | "s" | "rad" | "rad/s" | "m/s" | "pieces" | "pieces/s" | "level" | "";
  label: string;
  help: string;
}

/**
 * Parameters for each core mechanism type. Used by the sim (defaults) and the editor (sliders, units, help).
 * Validation covers only what the sim needs to run (PRD §9.1); nothing here encodes robot rules.
 */
export const MECHANISM_SPECS: Record<CoreMechanismType, { label: string; params: Record<string, ParamSpec> }> = {
  intake: {
    label: "Intake",
    params: {
      width: { default: 0.6, min: 0.05, max: 1.5, step: 0.01, unit: "m", label: "Roller width", help: "Width of the roller contact region." },
      rollerDepth: { default: 0.08, min: 0.02, max: 0.6, step: 0.01, unit: "m", label: "Reach", help: "How far the roller region extends from its mount." },
      deployTime: { default: 0, min: 0, max: 2, step: 0.05, unit: "s", label: "Deploy time", help: "0 = fixed intake (always ready, never extends)." },
      rate: { default: 10, min: 0.5, max: 40, step: 0.5, unit: "pieces/s", label: "Intake rate", help: "Maximum pieces acquired per second." },
      deployedHeight: { default: 0, min: 0, max: 2, step: 0.01, unit: "m", label: "Deployed height", help: "Robot height while deployed (0 = no change)." },
    },
  },
  storage: {
    label: "Storage",
    params: {
      capacity: { default: 5, min: 1, max: 200, step: 1, unit: "pieces", label: "Capacity", help: "Pieces the robot can hold." },
    },
  },
  transfer: {
    label: "Transfer",
    params: {
      delay: { default: 0.2, min: 0, max: 3, step: 0.05, unit: "s", label: "Transfer delay", help: "Time from pickup until a piece is ready to shoot or place." },
    },
  },
  shooter: {
    label: "Shooter",
    params: {
      exitSpeed: { default: 9, min: 1, max: 30, step: 0.1, unit: "m/s", label: "Exit speed (how hard each ball is thrown)", help: "How fast each ball leaves the shooter. This decides how far it can reach and how flat it flies. It has nothing to do with how many balls per second you shoot (that is Fire rate). The shooter automatically slows down for close shots, so a higher exit speed adds reach but does not make shots less accurate." },
      launchAngle: { default: 1.0, min: 0.1, max: 1.5, step: 0.01, unit: "rad", label: "Launch angle", help: "How steeply pieces leave the shooter (0 = flat, 1.57 = straight up). Steeper arcs drop into top openings but need more speed for distance." },
      launchHeight: { default: 0.5, min: 0, max: 2, step: 0.01, unit: "m", label: "Launch height", help: "How high above the carpet pieces leave the robot. Higher makes tall goals easier to reach." },
      ballsPerSecond: { default: 6, min: 0.2, max: 30, step: 0.1, unit: "pieces/s", label: "Fire rate (balls per second)", help: "How many balls the shooter launches each second once it is spun up. This decides how quickly the hopper empties. It does not change how far a ball goes (that is Exit speed). The two are independent: a faster exit speed does not raise fire rate, and a faster fire rate does not add range." },
      spread: { default: 0.04, min: 0, max: 0.5, step: 0.005, unit: "rad", label: "Aim spread", help: "Random left/right error per shot (typical size, in radians; 0.04 is about 2 degrees). Bigger means more misses, especially from far away." },
      speedError: { default: 0.025, min: 0, max: 0.3, step: 0.005, unit: "", label: "Speed consistency (error)", help: "Random shot-to-shot variation in launch speed, as a fraction (0.025 = about 2.5%). Small speed changes move where the ball lands a lot, so this causes shots to land long or short. Lower is more consistent." },
      spinUpTime: { default: 0.6, min: 0, max: 5, step: 0.05, unit: "s", label: "Spin-up time", help: "Time from pressing shoot until the first piece can launch." },
      rangeMin: { default: 1.2, min: 0, max: 20, step: 0.05, unit: "m", label: "Closest aim distance", help: "Closest target distance (to the goal's center) the shooter is set up to hit. Physics may limit this further." },
      rangeMax: { default: 5.5, min: 0.1, max: 25, step: 0.05, unit: "m", label: "Farthest aim distance", help: "Farthest target distance the shooter is set up to hit. Max exit speed may limit this further. Shots with no goal ahead are lobbed this far." },
      turretRange: { default: 0, min: 0, max: Math.PI, step: 0.01, unit: "rad", label: "Turret range", help: "0 = fixed shooter. Otherwise the shooter auto-aims within ± this angle." },
      turretSpeed: { default: 6, min: 0.1, max: 30, step: 0.1, unit: "rad/s", label: "Turret speed", help: "How fast the turret slews." },
    },
  },
  placer: {
    label: "Placer",
    params: {
      rate: { default: 2, min: 0.1, max: 20, step: 0.1, unit: "pieces/s", label: "Place rate", help: "Pieces dropped per second." },
      ejectSpeed: { default: 1, min: 0, max: 10, step: 0.1, unit: "m/s", label: "Eject speed", help: "Speed of a dropped piece." },
    },
  },
  climber: {
    label: "Climber",
    params: {
      maxLevel: { default: 1, min: 1, max: 3, step: 1, unit: "level", label: "Max level", help: "Highest level this climber can reach." },
      level1Time: { default: 3, min: 0.1, max: 30, step: 0.1, unit: "s", label: "Time to level 1", help: "From starting the climb." },
      level2Time: { default: 6, min: 0.1, max: 30, step: 0.1, unit: "s", label: "Time to level 2", help: "From starting the climb." },
      level3Time: { default: 9, min: 0.1, max: 30, step: 0.1, unit: "s", label: "Time to level 3", help: "From starting the climb." },
      descendTime: { default: 2, min: 0.1, max: 30, step: 0.1, unit: "s", label: "Descend time", help: "Time to get back on the carpet." },
      extendedHeight: { default: 0, min: 0, max: 3, step: 0.01, unit: "m", label: "Extended height", help: "Robot height while climbing (0 = no change)." },
    },
  },
  blocker: {
    label: "Blocker / plow",
    params: {
      width: { default: 0.5, min: 0.05, max: 1.5, step: 0.01, unit: "m", label: "Width", help: "Size across the mount direction." },
      depth: { default: 0.1, min: 0.02, max: 1, step: 0.01, unit: "m", label: "Depth", help: "How far it extends from its mount." },
      deployTime: { default: 0, min: 0, max: 2, step: 0.05, unit: "s", label: "Deploy time", help: "0 = always out." },
    },
  },
};

export const CORE_TYPES = Object.keys(MECHANISM_SPECS) as CoreMechanismType[];

export interface ResolvedMechanism {
  id: string;
  type: string;
  base: CoreMechanismType;
  mount: Mechanism["mount"];
  p: Record<string, number>;
}

/** Fills defaults (core type defaults, then game-module custom type defaults, then the design's params). */
export function resolveMechanism(mech: Mechanism, custom: MechanismsDef): ResolvedMechanism {
  const customType = custom.types.find((t) => t.id === mech.type);
  const base = (customType?.base ?? mech.type) as CoreMechanismType;
  const spec = MECHANISM_SPECS[base];
  if (!spec) throw new Error(`Mechanism "${mech.id}" has unknown type "${mech.type}".`);
  const p: Record<string, number> = {};
  for (const [k, s] of Object.entries(spec.params)) p[k] = s.default;
  for (const source of [customType?.defaults ?? {}, mech.params])
    for (const [k, v] of Object.entries(source)) if (typeof v === "number" && Number.isFinite(v)) p[k] = v;
  return { id: mech.id, type: mech.type, base, mount: mech.mount, p };
}
