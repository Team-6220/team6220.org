// Editable website content: one JSON file and one Zod schema per area.
// To add an area, see docs/SITE-MANAGER.md ("Add a new editable area").
import { z } from "zod";
import summerCampJson from "../../../sites/main/content/summer-camp.json" with { type: "json" };
import { summerCamp } from "./summer-camp.ts";

export { diffContent, describeChange, clip, type Change } from "./diff.ts";
export { renderInline, isSafeHref, isExternalHref, escapeText } from "./inline.ts";
export { summerCamp, renderBlock, renderBlocks, type SummerCamp, type Block } from "./summer-camp.ts";

export interface AreaDef {
  id: string;
  /** Shown in the Site Manager. */
  label: string;
  /** Path of the content file in the repository. */
  path: string;
  schema: z.ZodType;
  /** The file as it is in this checkout (bundled for the editor's mock mode). */
  initial: unknown;
}

function area(def: AreaDef): AreaDef {
  return def;
}

/** Every editable area. The key is the area id used in URLs, branch names and the API. */
export const AREAS = {
  "summer-camp": area({
    id: "summer-camp",
    label: "Summer camp",
    path: "sites/main/content/summer-camp.json",
    schema: summerCamp,
    initial: summerCampJson,
  }),
} as const satisfies Record<string, AreaDef>;

export type AreaId = keyof typeof AREAS;

export function isAreaId(value: unknown): value is AreaId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(AREAS, value);
}

export interface ContentIssue {
  /** e.g. `blocks.3.text` */
  path: string;
  message: string;
}

export type ParseResult<T = unknown> = { ok: true; value: T } | { ok: false; issues: ContentIssue[] };

/** Validates a value against an area's schema. `value` is the cleaned copy (unknown keys dropped, text trimmed). */
export function parseContent(id: AreaId, raw: unknown): ParseResult {
  const result = AREAS[id].schema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}

/** The exact text of a content file: two-space JSON and a final newline, so edits make small diffs. */
export function toFileText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** The JSON Schema of an area (the Site Manager builds its form from this). */
export function jsonSchemaOf(id: AreaId): Record<string, unknown> {
  return z.toJSONSchema(AREAS[id].schema, { io: "input" }) as Record<string, unknown>;
}
