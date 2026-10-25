/**
 * The single driver interface shared by humans, agents, and path followers (PRD §7.7).
 * vx, vy, omega are normalized to [-1, 1] (fractions of the robot's limits).
 * For holonomic drivetrains vx/vy are field-relative; for tank, vx is forward and vy is ignored.
 */
export interface DriverInput {
  vx: number;
  vy: number;
  omega: number;
  actions: Record<string, boolean | number>;
}

/** Boolean actions encoded in replays, in bit order. */
export const ACTION_NAMES = ["intake", "shoot", "climb", "place", "deploy"] as const;
export type ActionName = (typeof ACTION_NAMES)[number];

export const IDLE_INPUT: DriverInput = Object.freeze({ vx: 0, vy: 0, omega: 0, actions: Object.freeze({}) }) as DriverInput;

/** Quantized input: what the sim actually applies, so live play and replays match exactly. */
export interface QuantizedInput {
  vx: number; // -127..127
  vy: number;
  omega: number;
  mask: number; // bits 0..7: ACTION_NAMES; bits 8..9: climbLevel (0 = max)
}

const q = (v: number) => Math.round(Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0)) * 127);

export function quantize(input: DriverInput): QuantizedInput {
  let mask = 0;
  ACTION_NAMES.forEach((name, i) => {
    if (input.actions[name]) mask |= 1 << i;
  });
  const level = Number(input.actions["climbLevel"] ?? 0);
  mask |= (Math.max(0, Math.min(3, Math.round(level) || 0)) & 3) << 8;
  return { vx: q(input.vx), vy: q(input.vy), omega: q(input.omega), mask };
}

export function sameQuantized(a: QuantizedInput, b: QuantizedInput): boolean {
  return a.vx === b.vx && a.vy === b.vy && a.omega === b.omega && a.mask === b.mask;
}

export function hasAction(qi: QuantizedInput, name: ActionName): boolean {
  return (qi.mask & (1 << ACTION_NAMES.indexOf(name))) !== 0;
}

export function climbLevelOf(qi: QuantizedInput): number {
  return (qi.mask >> 8) & 3;
}

export const ZERO_QUANTIZED: QuantizedInput = Object.freeze({ vx: 0, vy: 0, omega: 0, mask: 0 });
