// Input validation, ported from backend/apps-script/inventory/Validate.gs.
// Nothing typed by a user is trusted: unknown and system fields are dropped, every value is type-checked,
// length/range-checked and cleaned, and references must point at rows that exist.
//
// In Phase 1 this runs in the browser, so it protects data quality, not security (anyone signed in can call
// Wix directly). In Phase 2 the same code runs inside /api/inventory.

import { AUDIT_SECTIONS, TABLES, columnLabel, type Column, type TableKey } from "./schema.ts";
import type { Row } from "./types.ts";
import { FieldError, InventoryError, cleanText, fmtFraction, isId, parseMeasure, round } from "./util.ts";

/** Lookup of existing rows, used to check references. */
export interface RefContext {
  byId(table: TableKey): Promise<Map<string, Row>>;
}

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/**
 * Validates input for a table.
 *   mode 'create': every non-system column is validated (missing = empty)
 *   mode 'update': only the fields present in `input` are validated
 * Returns a clean object containing only allowed fields.
 * Throws InventoryError('VALIDATION', ..., { fields: { name: message } }).
 */
export async function validateInput(
  key: TableKey,
  input: unknown,
  mode: "create" | "update",
  existing: Row | null,
  ctx: RefContext,
): Promise<Record<string, unknown>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new InventoryError("BAD_REQUEST", "Invalid data was sent.");
  }
  const data = input as Record<string, unknown>;
  const def = TABLES[key];
  const out: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const col of def.columns) {
    if (col.system) continue;
    const has = Object.prototype.hasOwnProperty.call(data, col.name);
    if (mode === "update" && !has) continue;
    if (mode === "update" && col.immutable) {
      if (existing && data[col.name] !== existing[col.name]) errors[col.name] = "This cannot be changed after it is created.";
      continue;
    }
    try {
      const v = await coerce(col, has ? data[col.name] : undefined, ctx);
      if (col.required && isEmptyValue(v)) throw new FieldError("This field is required.");
      out[col.name] = v;
      if (col.type === "measure" && col.valueColumn) out[col.valueColumn] = v === "" ? null : parseMeasure(v as string);
    } catch (e) {
      if (e instanceof FieldError) errors[col.name] = e.message;
      else throw e;
    }
  }

  const bad = Object.keys(errors);
  if (bad.length) {
    const labels = bad.map((n) => {
      const c = def.columns.find((x) => x.name === n);
      return c ? columnLabel(c) : n;
    });
    throw new InventoryError("VALIDATION", "Please check: " + labels.join(", ") + ".", { fields: errors });
  }
  return out;
}

async function coerce(col: Column, v: unknown, ctx: RefContext): Promise<unknown> {
  switch (col.type) {
    case "string":
    case "text": {
      if (v === null || v === undefined) return "";
      if (typeof v !== "string" && typeof v !== "number") throw new FieldError("Must be text.");
      let s = cleanText(String(v));
      s = col.type === "string" ? s.replace(/\s+/g, " ").trim() : s.replace(/\r\n?/g, "\n").trim();
      if (col.max && s.length > col.max) throw new FieldError(`Must be ${col.max} characters or fewer.`);
      return s;
    }
    case "int":
    case "number": {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "string" ? Number(v.trim()) : v;
      if (typeof n !== "number" || !isFinite(n)) throw new FieldError("Must be a number.");
      if (col.type === "int" && !Number.isInteger(n)) throw new FieldError("Must be a whole number.");
      if (col.min !== undefined && n < col.min) throw new FieldError(`Must be at least ${col.min}.`);
      if (col.max !== undefined && n > col.max) throw new FieldError(`Must be at most ${col.max}.`);
      return col.type === "number" ? round(n, 3) : n;
    }
    case "bool":
      if (v === null || v === undefined) return false;
      if (v !== true && v !== false) throw new FieldError("Must be true or false.");
      return v;
    case "enum":
      if (v === null || v === undefined || v === "") return "";
      if (typeof v !== "string" || !(col.values ?? []).includes(v)) throw new FieldError("Not a valid choice.");
      return v;
    case "ref":
      if (v === null || v === undefined || v === "") return "";
      await checkRef(col, v, ctx);
      return v;
    case "refList": {
      if (v === null || v === undefined || v === "") return [];
      if (!Array.isArray(v)) throw new FieldError("Invalid selection.");
      const out: string[] = [];
      for (const id of v) {
        await checkRef(col, id, ctx);
        if (!out.includes(id)) out.push(id);
      }
      if (col.maxItems && out.length > col.maxItems) throw new FieldError(`Choose at most ${col.maxItems}.`);
      return out;
    }
    case "measure": {
      if (v === null || v === undefined || v === "") return "";
      if (typeof v !== "string" && typeof v !== "number") throw new FieldError("Must be a number or fraction.");
      const s = cleanText(String(v)).replace(/\s+/g, " ").trim();
      if (s === "") return "";
      if (s.length > (col.max || 30)) throw new FieldError("Too long.");
      if (parseMeasure(s) === null) throw new FieldError("Enter a number or fraction, like 1/8 or 1 1/2.");
      return s;
    }
    case "json":
      if (col.check === "filter") return checkFilter(v);
      if (col.check === "sections") return checkSections(v);
      if (col.check === "shape") return checkShape(v);
      if (col.check === "placement") return checkPlacement(v);
      throw new FieldError("Unsupported field.");
    default:
      throw new FieldError("Unsupported field.");
  }
}

async function checkRef(col: Column, id: unknown, ctx: RefContext): Promise<void> {
  if (!isId(id)) throw new FieldError("Invalid selection.");
  const row = (await ctx.byId(col.ref as TableKey)).get(id);
  if (!row || (col.listKey && row.listKey !== col.listKey)) {
    throw new FieldError("That option no longer exists. Refresh the page and try again.");
  }
}

/** Saved filters: an object of simple keys -> short strings, numbers, booleans or arrays of short strings. */
export function checkFilter(v: unknown): Record<string, unknown> {
  if (v === null || v === undefined || v === "") return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new FieldError("Invalid filter.");
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[A-Za-z]{1,30}$/.test(k)) throw new FieldError("Invalid filter.");
    if (typeof x === "boolean" || (typeof x === "number" && isFinite(x))) out[k] = x;
    else if (typeof x === "string") {
      if (x.length > 200) throw new FieldError("Filter text is too long.");
      out[k] = cleanText(x);
    } else if (Array.isArray(x)) {
      if (x.length > 100 || x.some((s) => typeof s !== "string" || s.length > 200)) throw new FieldError("Invalid filter.");
      out[k] = x.map((s: string) => cleanText(s));
    } else if (x !== null && x !== undefined) {
      throw new FieldError("Invalid filter.");
    }
  }
  if (JSON.stringify(out).length > 4000) throw new FieldError("Filter is too large.");
  return out;
}

export function checkSections(v: unknown): string[] {
  if (!Array.isArray(v) || !v.length) throw new FieldError("Choose at least one section.");
  const out: string[] = [];
  for (const s of v) {
    if (!(AUDIT_SECTIONS as readonly string[]).includes(s)) throw new FieldError("Invalid section.");
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

export function shapeArea(pts: number[][]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/** A stock outline. Empty object = no shape recorded. (Shapes are kept on import; editing them isn't ported yet.) */
export function checkShape(v: unknown): Record<string, unknown> {
  if (v === null || v === undefined || v === "") return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new FieldError("Invalid shape.");
  const o = v as Record<string, unknown>;
  if (!Object.keys(o).length) return {};
  const kind = o.kind === "rect" || o.kind === "traced" ? o.kind : null;
  if (!kind) throw new FieldError("Invalid shape.");
  const points = o.points;
  if (!Array.isArray(points) || points.length < 3 || points.length > 60) throw new FieldError("A shape needs 3 to 60 corners.");
  const pts = points.map((p: unknown) => {
    if (!Array.isArray(p) || p.length !== 2) throw new FieldError("Invalid shape.");
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 1000 || Math.abs(y) > 1000) throw new FieldError("Invalid shape.");
    return [round(x, 4), round(y, 4)];
  });
  if (shapeArea(pts) < 0.01) throw new FieldError("That shape has no area.");
  const edges = Array.isArray(o.edges) && o.edges.length === pts.length ? o.edges.map((e: unknown) => round(Number(e) || 0, 4)) : [];
  return { kind, points: pts, edges };
}

/** Fills length/width (bounding box) and area from a shape, as Validate.gs did. */
export function deriveShapeFields(out: Row | Record<string, unknown>): void {
  const shape = out.shape as { points?: number[][] } | undefined;
  const pts = shape && shape.points;
  if (!pts) {
    out.area = null;
    return;
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const L = Math.max(w, h);
  const W = Math.min(w, h);
  out.length = fmtFraction(L);
  out.lengthValue = round(L, 4);
  out.width = fmtFraction(W);
  out.widthValue = round(W, 4);
  out.area = round(shapeArea(pts), 3);
}

export function checkPlacement(v: unknown): Record<string, number> {
  if (v === null || v === undefined || v === "") return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new FieldError("Invalid placement.");
  const o = v as Record<string, unknown>;
  if (!Object.keys(o).length) return {};
  const out: Record<string, number> = {};
  for (const k of ["x", "y", "w", "h", "angle"]) {
    const n = Number(o[k]);
    if (!isFinite(n) || Math.abs(n) > 1000) throw new FieldError("Invalid placement.");
    out[k] = round(n, 4);
  }
  return out;
}

/** A record with every column at its empty value (Db.gs blankRecord_). */
export function blankRecord(key: TableKey): Row {
  const rec: Row = { id: "" };
  for (const c of TABLES[key].columns) {
    switch (c.type) {
      case "int":
      case "number":
        rec[c.name] = null;
        break;
      case "bool":
        rec[c.name] = false;
        break;
      case "refList":
        rec[c.name] = [];
        break;
      case "json":
        rec[c.name] = c.empty === "array" ? [] : {};
        break;
      default:
        rec[c.name] = "";
    }
  }
  return rec;
}

/** Fills missing columns of a stored record with their empty values (e.g. columns added after import). */
export function normalizeRecord(key: TableKey, rec: Record<string, unknown>): Row {
  const out = blankRecord(key);
  for (const c of TABLES[key].columns) {
    if (rec[c.name] !== undefined && rec[c.name] !== null) out[c.name] = rec[c.name];
    else if (c.type === "int" || c.type === "number") out[c.name] = null;
  }
  out.id = String(rec.id ?? "");
  return out;
}
