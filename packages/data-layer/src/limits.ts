import { Type } from "@sinclair/typebox";
import { Replay, RobotDesign, validate, formatIssues } from "@goldsim/schema";
import { DataLayerError, type DocDataByKind, type DocKind, type UserSettings } from "./types.js";

/** Size caps per payload (bytes of JSON). Mirrored by the database checks in supabase/migrations. */
export const SIZE_CAPS: Record<DocKind | "settings", number> = {
  design: 256 * 1024,
  driverProfile: 64 * 1024,
  recording: 5 * 1024 * 1024,
  testRun: 2 * 1024 * 1024,
  calibration: 512 * 1024,
  importedFile: 1024 * 1024,
  settings: 64 * 1024,
};

/** Per-team quotas (keep a free-tier backend within limits, PRD §14.7). Mirrored by database triggers. */
export const TEAM_QUOTAS = {
  docs: 2000,
  testRuns: 500,
  bytes: 200 * 1024 * 1024,
};

/** Client-side write rate limit per user. The database enforces its own limit too. */
export const WRITE_RATE = { max: 60, windowMs: 60_000 };

export const NAME_MAX = 120;

export function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

const Obj = Type.Record(Type.String(), Type.Unknown());
const Calibration = Type.Object({
  robot: Type.String({ minLength: 1 }),
  measurements: Type.Array(Obj),
  provenance: Type.Object({ date: Type.String(), source: Type.String() }),
});
const ImportedFile = Type.Object({
  fileName: Type.String({ minLength: 1 }),
  format: Type.Union([Type.Literal("path"), Type.Literal("auto"), Type.Literal("traj"), Type.Literal("other")]),
  content: Type.Unknown(),
});
const Settings = Type.Object({
  units: Type.Union([Type.Literal("metric"), Type.Literal("imperial")]),
  theme: Type.Union([Type.Literal("dark"), Type.Literal("light"), Type.Literal("system")]),
});

const SCHEMAS = {
  design: RobotDesign,
  recording: Replay,
  driverProfile: Obj,
  testRun: Obj,
  calibration: Calibration,
  importedFile: ImportedFile,
} as const;

/** Validates a document before it is written. Imported and downloaded data is untrusted (PRD §15.4). */
export function checkDoc<K extends DocKind>(kind: K, name: string, data: DocDataByKind[K]): void {
  if (typeof name !== "string" || !name.trim() || name.length > NAME_MAX)
    throw new DataLayerError("invalid", `Name must be 1-${NAME_MAX} characters.`);
  const schema = SCHEMAS[kind];
  if (!schema) throw new DataLayerError("invalid", `Unknown document kind "${kind}".`);
  const r = validate(schema, data);
  if (!r.ok) throw new DataLayerError("invalid", `This ${kind} is not valid:\n${formatIssues(r.issues)}`);
  const size = byteSize(data);
  if (size > SIZE_CAPS[kind])
    throw new DataLayerError("too_large", `This ${kind} is ${(size / 1024).toFixed(0)} KB; the limit is ${(SIZE_CAPS[kind] / 1024).toFixed(0)} KB.`);
}

export function checkSettings(s: UserSettings): void {
  const r = validate(Settings, s);
  if (!r.ok) throw new DataLayerError("invalid", `Settings are not valid:\n${formatIssues(r.issues)}`);
  if (byteSize(s) > SIZE_CAPS.settings) throw new DataLayerError("too_large", "Settings are too large.");
}

export function checkTeamInput(name: string, teamNumber?: number | null): void {
  if (typeof name !== "string" || !name.trim() || name.length > 80) throw new DataLayerError("invalid", "Team name must be 1-80 characters.");
  if (teamNumber !== undefined && teamNumber !== null && (!Number.isInteger(teamNumber) || teamNumber < 1 || teamNumber > 99999))
    throw new DataLayerError("invalid", "Team number must be a whole number from 1 to 99999.");
}

/** Sliding-window limiter, one per signed-in user. */
export class RateLimiter {
  private hits: number[] = [];
  constructor(
    private max = WRITE_RATE.max,
    private windowMs = WRITE_RATE.windowMs,
    private now: () => number = () => Date.now(),
  ) {}

  take(): void {
    const t = this.now();
    this.hits = this.hits.filter((h) => t - h < this.windowMs);
    if (this.hits.length >= this.max)
      throw new DataLayerError("rate_limited", "Too many saves in a short time. Wait a moment and try again.");
    this.hits.push(t);
  }
}
