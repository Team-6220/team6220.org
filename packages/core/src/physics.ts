import RAPIER from "@dimforge/rapier2d-deterministic-compat";

export { RAPIER };

let ready: Promise<void> | null = null;

/** Loads the physics engine once (WASM is inlined, so no extra files are fetched). */
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

/** Collision membership bits. */
export const Group = {
  WALL: 1,
  ROBOT: 2,
  PIECE: 4,
  GATE: 8,
  /** Robot mechanisms that touch robots and walls but let pieces through (e.g. deployed intakes). */
  MECH: 16,
} as const;

export function groups(member: number, filter: number): number {
  return ((member & 0xffff) << 16) | (filter & 0xffff);
}

export const COLLIDE = {
  wall: groups(Group.WALL, Group.ROBOT | Group.PIECE | Group.MECH),
  robot: groups(Group.ROBOT, Group.WALL | Group.ROBOT | Group.PIECE | Group.GATE | Group.MECH),
  mech: groups(Group.MECH, Group.WALL | Group.ROBOT | Group.GATE | Group.MECH),
  piece: groups(Group.PIECE, Group.WALL | Group.ROBOT | Group.PIECE),
  gate: groups(Group.GATE, Group.ROBOT | Group.MECH),
};
