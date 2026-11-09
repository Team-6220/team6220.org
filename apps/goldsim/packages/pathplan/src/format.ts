/**
 * PathPlanner file formats (.path and .auto), parsed tolerantly.
 *
 * Coordinates: PathPlanner uses field meters with the origin at the blue alliance wall corner, +x toward red,
 * +y to the left from the blue driver station, rotations in degrees counter-clockwise. GoldSim uses the same
 * frame (PRD §7.1), so values are used as-is (degrees are converted to radians).
 *
 * Unknown fields and unsupported command types are reported as warnings, never silently dropped (PRD §16.2).
 */

export interface PPPoint {
  x: number;
  y: number;
}

export interface PPWaypoint {
  anchor: PPPoint;
  prevControl: PPPoint | null;
  nextControl: PPPoint | null;
  linkedName: string | null;
}

export interface PPConstraints {
  maxVelocity?: number;
  maxAcceleration?: number;
  maxAngularVelocity?: number;
  maxAngularAcceleration?: number;
  unlimited?: boolean;
}

export interface PPRotationTarget {
  waypointRelativePos: number;
  rotationDegrees: number;
}

export interface PPConstraintZone {
  name: string;
  minWaypointRelativePos: number;
  maxWaypointRelativePos: number;
  constraints: PPConstraints;
}

export type PPCommand =
  | { type: "sequential" | "parallel" | "race" | "deadline"; commands: PPCommand[] }
  | { type: "wait"; waitTime: number }
  | { type: "named"; name: string | null }
  | { type: "path"; pathName: string | null }
  | { type: "unsupported"; originalType: string };

export interface PPEventMarker {
  name: string;
  waypointRelativePos: number;
  /** Zoned markers run their command from start to end and cancel it at the end. */
  endWaypointRelativePos: number | null;
  command: PPCommand | null;
}

export interface PPPath {
  name: string;
  version: string;
  waypoints: PPWaypoint[];
  rotationTargets: PPRotationTarget[];
  constraintZones: PPConstraintZone[];
  eventMarkers: PPEventMarker[];
  globalConstraints: PPConstraints;
  goalEndState: { velocity: number; rotation: number };
  idealStartingState: { velocity: number; rotation: number } | null;
  reversed: boolean;
  folder: string | null;
  useDefaultConstraints: boolean;
}

export interface PPAuto {
  name: string;
  version: string;
  command: PPCommand;
  resetOdom: boolean;
  /** Present in older (2024) files; 2025 files take the start from the first path. */
  startingPose: { x: number; y: number; rotationDegrees: number } | null;
  choreoAuto: boolean;
  folder: string | null;
}

export type ParseResult<T> = { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

const PATH_KEYS = new Set([
  "version",
  "waypoints",
  "rotationTargets",
  "constraintZones",
  "pointTowardsZones",
  "eventMarkers",
  "globalConstraints",
  "goalEndState",
  "reversed",
  "folder",
  "idealStartingState",
  "previewStartingState",
  "useDefaultConstraints",
]);

const AUTO_KEYS = new Set(["version", "command", "resetOdom", "startingPose", "folder", "choreoAuto"]);

function point(v: unknown, where: string, errors: string[]): PPPoint | null {
  if (v === null || v === undefined) return null;
  if (!isObj(v) || num(v.x) === undefined || num(v.y) === undefined) {
    errors.push(`${where} must be {x, y} in meters.`);
    return null;
  }
  return { x: v.x as number, y: v.y as number };
}

function constraints(v: unknown): PPConstraints {
  if (!isObj(v)) return {};
  return {
    maxVelocity: num(v.maxVelocity),
    maxAcceleration: num(v.maxAcceleration),
    maxAngularVelocity: num(v.maxAngularVelocity),
    maxAngularAcceleration: num(v.maxAngularAcceleration),
    unlimited: v.unlimited === true,
  };
}

function endState(v: unknown): { velocity: number; rotation: number } | null {
  if (!isObj(v)) return null;
  return { velocity: num(v.velocity) ?? 0, rotation: num(v.rotation) ?? num(v.rotationDegrees) ?? 0 };
}

/** Parses a command node. Accepts `{type, data: {...}}` (2023+) and flattened `{type, ...}` variants. */
export function parseCommand(v: unknown, where: string, warnings: string[]): PPCommand {
  if (!isObj(v) || typeof v.type !== "string") {
    warnings.push(`${where}: not a command; treated as unsupported.`);
    return { type: "unsupported", originalType: String(isObj(v) ? v.type : v) };
  }
  const data = isObj(v.data) ? v.data : v;
  switch (v.type) {
    case "sequential":
    case "parallel":
    case "race":
    case "deadline": {
      const list = Array.isArray(data.commands) ? data.commands : [];
      if (!Array.isArray(data.commands)) warnings.push(`${where}: ${v.type} group has no commands list.`);
      return { type: v.type, commands: list.map((c, i) => parseCommand(c, `${where}.${v.type}[${i}]`, warnings)) };
    }
    case "wait": {
      const t = num(data.waitTime);
      if (t === undefined) warnings.push(`${where}: wait has no waitTime; using 0.`);
      return { type: "wait", waitTime: Math.max(0, t ?? 0) };
    }
    case "named":
      return { type: "named", name: typeof data.name === "string" ? data.name : null };
    case "path":
      return { type: "path", pathName: typeof data.pathName === "string" ? data.pathName : null };
    default:
      warnings.push(`${where}: command type "${v.type}" is not supported by GoldSim and will be skipped.`);
      return { type: "unsupported", originalType: v.type };
  }
}

function warnUnknownKeys(o: Obj, known: Set<string>, file: string, warnings: string[]): void {
  for (const k of Object.keys(o)) if (!known.has(k)) warnings.push(`${file}: field "${k}" is not used by GoldSim.`);
}

/** Parses a PathPlanner .path file (already JSON-decoded or as text). */
export function parsePath(input: unknown, name = "path"): ParseResult<PPPath> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      return { ok: false, errors: [`${name}.path is not valid JSON: ${(e as Error).message}`], warnings };
    }
  }
  if (!isObj(raw)) return { ok: false, errors: [`${name}.path must be a JSON object.`], warnings };
  warnUnknownKeys(raw, PATH_KEYS, `${name}.path`, warnings);
  if (Array.isArray(raw.pointTowardsZones) && raw.pointTowardsZones.length)
    warnings.push(`${name}.path: point-towards zones are not supported; rotation targets are used instead.`);

  const wps: PPWaypoint[] = [];
  if (!Array.isArray(raw.waypoints) || raw.waypoints.length < 2) errors.push(`${name}.path needs at least 2 waypoints.`);
  else
    raw.waypoints.forEach((w, i) => {
      if (!isObj(w)) {
        errors.push(`${name}.path waypoint ${i} is not an object.`);
        return;
      }
      const anchor = point(w.anchor, `${name}.path waypoints[${i}].anchor`, errors);
      if (!anchor) {
        if (!w.anchor) errors.push(`${name}.path waypoints[${i}] has no anchor.`);
        return;
      }
      wps.push({
        anchor,
        prevControl: point(w.prevControl, `${name}.path waypoints[${i}].prevControl`, errors),
        nextControl: point(w.nextControl, `${name}.path waypoints[${i}].nextControl`, errors),
        linkedName: typeof w.linkedName === "string" ? w.linkedName : null,
      });
    });
  const maxPos = Math.max(0, wps.length - 1);
  const pos = (v: unknown, where: string): number => {
    const p = num(v);
    if (p === undefined) {
      warnings.push(`${where} has no waypointRelativePos; using 0.`);
      return 0;
    }
    if (p < 0 || p > maxPos) warnings.push(`${where} position ${p} is outside 0..${maxPos}; clamped.`);
    return Math.max(0, Math.min(maxPos, p));
  };

  const rotationTargets: PPRotationTarget[] = (Array.isArray(raw.rotationTargets) ? raw.rotationTargets : [])
    .filter(isObj)
    .map((r, i) => ({
      waypointRelativePos: pos(r.waypointRelativePos, `${name}.path rotationTargets[${i}]`),
      rotationDegrees: num(r.rotationDegrees) ?? num(r.rotation) ?? 0,
    }))
    .sort((a, b) => a.waypointRelativePos - b.waypointRelativePos);

  const constraintZones: PPConstraintZone[] = (Array.isArray(raw.constraintZones) ? raw.constraintZones : []).filter(isObj).map((z, i) => ({
    name: typeof z.name === "string" ? z.name : `zone ${i}`,
    minWaypointRelativePos: pos(z.minWaypointRelativePos, `${name}.path constraintZones[${i}].min`),
    maxWaypointRelativePos: pos(z.maxWaypointRelativePos, `${name}.path constraintZones[${i}].max`),
    constraints: constraints(z.constraints),
  }));

  const eventMarkers: PPEventMarker[] = (Array.isArray(raw.eventMarkers) ? raw.eventMarkers : []).filter(isObj).map((m, i) => {
    const where = `${name}.path eventMarkers[${i}]`;
    const end = m.endWaypointRelativePos;
    return {
      name: typeof m.name === "string" ? m.name : `marker ${i}`,
      waypointRelativePos: pos(m.waypointRelativePos, where),
      endWaypointRelativePos: typeof end === "number" ? pos(end, `${where}.end`) : null,
      command: m.command === null || m.command === undefined ? null : parseCommand(m.command, where, warnings),
    };
  });

  if (errors.length) return { ok: false, errors, warnings };
  return {
    ok: true,
    warnings,
    value: {
      name,
      version: String(raw.version ?? "unknown"),
      waypoints: wps,
      rotationTargets,
      constraintZones,
      eventMarkers,
      globalConstraints: constraints(raw.globalConstraints),
      goalEndState: endState(raw.goalEndState) ?? { velocity: 0, rotation: 0 },
      idealStartingState: endState(raw.idealStartingState) ?? endState(raw.previewStartingState),
      reversed: raw.reversed === true,
      folder: typeof raw.folder === "string" ? raw.folder : null,
      useDefaultConstraints: raw.useDefaultConstraints === true,
    },
  };
}

/** Parses a PathPlanner .auto file. */
export function parseAuto(input: unknown, name = "auto"): ParseResult<PPAuto> {
  const warnings: string[] = [];
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      return { ok: false, errors: [`${name}.auto is not valid JSON: ${(e as Error).message}`], warnings };
    }
  }
  if (!isObj(raw)) return { ok: false, errors: [`${name}.auto must be a JSON object.`], warnings };
  warnUnknownKeys(raw, AUTO_KEYS, `${name}.auto`, warnings);
  if (!isObj(raw.command)) return { ok: false, errors: [`${name}.auto has no command.`], warnings };
  if (raw.choreoAuto === true)
    warnings.push(`${name}.auto is a Choreo auto; Choreo .traj files are not imported, so its path commands will be reported as missing.`);
  let startingPose: PPAuto["startingPose"] = null;
  const sp = raw.startingPose;
  if (isObj(sp) && isObj(sp.position) && num(sp.position.x) !== undefined && num(sp.position.y) !== undefined)
    startingPose = { x: sp.position.x as number, y: sp.position.y as number, rotationDegrees: num(sp.rotation) ?? 0 };
  return {
    ok: true,
    warnings,
    value: {
      name,
      version: String(raw.version ?? "unknown"),
      command: parseCommand(raw.command, `${name}.auto`, warnings),
      resetOdom: raw.resetOdom !== false,
      startingPose,
      choreoAuto: raw.choreoAuto === true,
      folder: typeof raw.folder === "string" ? raw.folder : null,
    },
  };
}

/** Every named command referenced by an auto and the paths it uses (including event markers). */
export function collectNamedCommands(auto: PPAuto, lookupPath: (name: string) => PPPath | undefined): string[] {
  const names = new Set<string>();
  const seenPaths = new Set<string>();
  const walk = (c: PPCommand | null): void => {
    if (!c) return;
    switch (c.type) {
      case "named":
        if (c.name) names.add(c.name);
        break;
      case "path": {
        if (!c.pathName || seenPaths.has(c.pathName)) break;
        seenPaths.add(c.pathName);
        const p = lookupPath(c.pathName);
        for (const m of p?.eventMarkers ?? []) walk(m.command);
        break;
      }
      case "sequential":
      case "parallel":
      case "race":
      case "deadline":
        c.commands.forEach(walk);
        break;
      default:
        break;
    }
  };
  walk(auto.command);
  return [...names].sort();
}

/** Path names an auto references, in order of first use. */
export function collectPathNames(command: PPCommand): string[] {
  const out: string[] = [];
  const walk = (c: PPCommand): void => {
    if (c.type === "path" && c.pathName && !out.includes(c.pathName)) out.push(c.pathName);
    if (c.type === "sequential" || c.type === "parallel" || c.type === "race" || c.type === "deadline") c.commands.forEach(walk);
  };
  walk(command);
  return out;
}
