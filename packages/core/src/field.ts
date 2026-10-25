import type { Alliance, FieldDef, FieldElement, GameModuleData, Objective, Pose, Shape } from "@goldsim/schema";
import type { Rng } from "./rng.js";

/** Context passed to a game's groupsHook (PRD §8.3 results-dependent logic). */
export interface GroupsHookContext {
  counters: Record<Alliance, Record<string, number>>;
  rng: Rng;
}
export type GroupsHook = (ctx: GroupsHookContext) => { groupA: Alliance };

/** A game module plus its reviewed TypeScript hooks. Hooks ship only from the repo, never from user data. */
export interface GameModule extends GameModuleData {
  hooks?: { groups?: Record<string, GroupsHook> };
}

export type ResolvedElement = FieldElement & { baseId: string };

export const other = (a: Alliance): Alliance => (a === "blue" ? "red" : "blue");

export class Mirror {
  constructor(private field: Pick<FieldDef, "length" | "width" | "mirror">) {}

  point(x: number, y: number): { x: number; y: number } {
    return this.field.mirror === "rotational"
      ? { x: this.field.length - x, y: this.field.width - y }
      : { x: this.field.length - x, y };
  }

  angle(theta: number): number {
    return this.field.mirror === "rotational" ? theta + Math.PI : Math.PI - theta;
  }

  pose(p: Pose): Pose {
    return { ...this.point(p.x, p.y), theta: this.angle(p.theta) };
  }

  shape<S extends Shape>(s: S): S {
    switch (s.type) {
      case "rect": {
        const c = this.point(s.x, s.y);
        return { ...s, ...c, theta: this.angle(s.theta ?? 0) - (this.field.mirror === "rotational" ? Math.PI : 0) };
      }
      case "circle":
        return { ...s, ...this.point(s.x, s.y) };
      case "polygon":
        return { ...s, points: s.points.map((p) => this.point(p.x, p.y)) };
    }
  }

  /** x of a blue-relative vertical line for the given alliance. */
  lineX(x: number, alliance: Alliance): number {
    return alliance === "blue" ? x : this.field.length - x;
  }
}

function mirrorElement(el: FieldElement, m: Mirror): FieldElement {
  const base = { ...el, shape: m.shape(el.shape) } as FieldElement;
  switch (base.kind) {
    case "sink":
      return {
        ...base,
        target: { ...base.target, shape: m.shape(base.target.shape) },
        scoresFor: base.scoresFor ? other(base.scoresFor) : undefined,
        emit: base.emit && {
          ...base.emit,
          exits: base.emit.exits.map((e) => ({ ...e, ...m.pose(e) })),
        },
      };
    case "feeder":
      return {
        ...base,
        exit: m.pose(base.exit),
        triggerZone: base.triggerZone && m.shape(base.triggerZone),
        absorbZone: base.absorbZone && { shape: m.shape(base.absorbZone.shape) },
      };
    case "climbStructure":
      return { ...base, engageZone: m.shape(base.engageZone) };
    default:
      return base;
  }
}

/** Expands mirrored elements into blue and red copies with ids '<id>.blue' and '<id>.red'. */
export function resolveElements(field: FieldDef): ResolvedElement[] {
  const m = new Mirror(field);
  const out: ResolvedElement[] = [];
  for (const el of field.elements) {
    if (!el.mirror) {
      out.push({ ...el, baseId: el.id });
      continue;
    }
    out.push({ ...el, id: `${el.id}.blue`, alliance: "blue", baseId: el.id });
    out.push({ ...mirrorElement(el, m), id: `${el.id}.red`, alliance: "red", baseId: el.id });
  }
  return out;
}

export interface ResolvedObjective {
  id: string;
  baseId: string;
  alliance?: Alliance;
  pose: Pose;
}

export function resolveObjectives(field: FieldDef): ResolvedObjective[] {
  const m = new Mirror(field);
  return field.objectives.flatMap((o: Objective) =>
    o.mirror
      ? [
          { id: `${o.id}.blue`, baseId: o.id, alliance: "blue" as const, pose: o.pose },
          { id: `${o.id}.red`, baseId: o.id, alliance: "red" as const, pose: m.pose(o.pose) },
        ]
      : [{ id: o.id, baseId: o.id, alliance: o.alliance, pose: o.pose }],
  );
}

export function startPose(field: FieldDef, alliance: Alliance, station: number): Pose {
  const p = field.startPositions[station % field.startPositions.length]!;
  return alliance === "blue" ? p : new Mirror(field).pose(p);
}
