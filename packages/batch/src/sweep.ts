import { Rng } from "@goldsim/core";
import type { DriverProfile } from "@goldsim/agents";
import type { MatchSpec } from "./run-match.js";

/**
 * Where a swept value goes. Design paths are JSON-pointer-like into the robot design; a non-numeric segment
 * inside an array matches an element by id, e.g. "/mechanisms/shooter1/params/ballsPerSecond".
 */
export type SweepTarget =
  | { kind: "design"; robot: number; path: string }
  | { kind: "profile"; robot: number; knob: keyof DriverProfile };

export interface SweepParam {
  id: string;
  target: SweepTarget;
  /** Grid values. */
  values?: number[];
  /** Latin hypercube range. */
  min?: number;
  max?: number;
}

export interface SweepConfig {
  id: string;
  values: Record<string, number>;
}

export interface Job {
  id: string;
  configId: string;
  values: Record<string, number>;
  seed: number;
  spec: MatchSpec;
}

/** Writes value at a JSON-pointer-like path in a deep copy of obj. */
export function setAtPath<T>(obj: T, path: string, value: unknown): T {
  const copy = structuredClone(obj) as unknown;
  const parts = path.split("/").filter(Boolean).map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (!parts.length) throw new Error("Empty sweep path.");
  let cur = copy as Record<string, unknown> | unknown[];
  for (let i = 0; i < parts.length - 1; i++) {
    const next = step(cur, parts[i]!, path);
    if (next === null || typeof next !== "object") throw new Error(`Sweep path "${path}" does not exist at "${parts[i]}".`);
    cur = next as Record<string, unknown> | unknown[];
  }
  const last = parts[parts.length - 1]!;
  if (Array.isArray(cur)) {
    const idx = arrayIndex(cur, last, path);
    cur[idx] = value;
  } else cur[last] = value;
  return copy as T;
}

export function getAtPath(obj: unknown, path: string): unknown {
  let cur = obj;
  for (const p of path.split("/").filter(Boolean)) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = step(cur as Record<string, unknown>, p, path);
  }
  return cur;
}

function step(cur: Record<string, unknown> | unknown[], part: string, path: string): unknown {
  if (Array.isArray(cur)) return cur[arrayIndex(cur, part, path)];
  return cur[part];
}

function arrayIndex(arr: unknown[], part: string, path: string): number {
  if (/^\d+$/.test(part)) {
    const i = Number(part);
    if (i >= arr.length) throw new Error(`Sweep path "${path}": index ${i} is out of range.`);
    return i;
  }
  const i = arr.findIndex((x) => (x as { id?: unknown })?.id === part);
  if (i < 0) throw new Error(`Sweep path "${path}": no element with id "${part}".`);
  return i;
}

/** Cartesian product of every parameter's grid values, in a deterministic order. */
export function grid(params: SweepParam[]): SweepConfig[] {
  let configs: Record<string, number>[] = [{}];
  for (const p of params) {
    if (!p.values?.length) throw new Error(`Grid parameter "${p.id}" needs values.`);
    configs = configs.flatMap((c) => p.values!.map((v) => ({ ...c, [p.id]: v })));
  }
  return configs.map((values, i) => ({ id: `c${i}`, values }));
}

/** Latin hypercube sample of n configurations over each parameter's [min, max]. Deterministic for a seed. */
export function latinHypercube(params: SweepParam[], n: number, seed = 1): SweepConfig[] {
  const rng = new Rng(seed);
  const columns = params.map((p) => {
    if (p.min === undefined || p.max === undefined) throw new Error(`Latin hypercube parameter "${p.id}" needs min and max.`);
    const strata = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [strata[i], strata[j]] = [strata[j]!, strata[i]!];
    }
    return strata.map((s) => p.min! + ((s + rng.next()) / n) * (p.max! - p.min!));
  });
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    values: Object.fromEntries(params.map((p, k) => [p.id, columns[k]![i]!])),
  }));
}

/** Derives `count` match seeds from a base seed. */
export function seedsFrom(count: number, base = 6220): number[] {
  const rng = new Rng(base);
  return Array.from({ length: count }, () => rng.nextU32() & 0x7fffffff);
}

/** Applies one configuration's values to a base spec. */
export function applyConfig(base: Omit<MatchSpec, "seed">, params: SweepParam[], config: SweepConfig): Omit<MatchSpec, "seed"> {
  let robots = base.robots;
  let drivers = base.drivers;
  for (const p of params) {
    const v = config.values[p.id];
    if (v === undefined) continue;
    const t = p.target;
    if (t.kind === "design") {
      if (!robots[t.robot]) throw new Error(`Sweep "${p.id}" targets robot ${t.robot}, which is not in the match.`);
      robots = robots.map((r, i) => (i === t.robot ? { ...r, design: setAtPath(r.design, t.path, v) } : r));
    } else {
      const d = drivers[t.robot];
      if (d?.kind !== "agent") throw new Error(`Sweep "${p.id}" targets the profile of robot ${t.robot}, which is not an agent.`);
      drivers = drivers.map((x, i) => (i === t.robot && x.kind === "agent" ? { ...x, profile: { ...x.profile, [t.knob]: v } } : x));
    }
  }
  return { ...base, robots, drivers };
}

/** One job per (configuration, seed); configs outer, seeds inner. Every configuration sees the same seeds. */
export function buildJobs(base: Omit<MatchSpec, "seed">, params: SweepParam[], configs: SweepConfig[], seeds: number[]): Job[] {
  return configs.flatMap((c) => {
    const spec = applyConfig(base, params, c);
    return seeds.map((seed, k) => ({ id: `${c.id}-s${k}`, configId: c.id, values: c.values, seed, spec: { ...spec, seed } }));
  });
}
