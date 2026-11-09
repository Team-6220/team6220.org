// Small helpers ported from backend/apps-script/inventory/Util.gs and Validate.gs.

/** An error the UI can react to by `code` (same codes as the Apps Script version). */
export class InventoryError extends Error {
  code: string;
  details: Record<string, unknown> | null;
  constructor(code: string, message: string, details?: Record<string, unknown> | null) {
    super(message);
    this.name = "InventoryError";
    this.code = code;
    this.details = details ?? null;
  }
}

/** One field failed validation (collected into one VALIDATION InventoryError). */
export class FieldError extends Error {}

export const ID_PATTERN = /^[A-Z]{2}-[a-z0-9]{8}$/;

export function isId(v: unknown): v is string {
  return typeof v === "string" && ID_PATTERN.test(v);
}

export function assertId(id: unknown): asserts id is string {
  if (!isId(id)) throw new InventoryError("BAD_REQUEST", "Invalid item ID.");
}

/** e.g. newId("PT") -> "PT-3f9a0c1e". Same format as the Sheet, so imported IDs and new IDs look alike. */
export function newId(prefix: string): string {
  let hex = "";
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === "function") {
    const b = new Uint8Array(4);
    c.getRandomValues(b);
    hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  } else {
    for (let i = 0; i < 8; i++) hex += Math.floor(Math.random() * 16).toString(16);
  }
  return `${prefix}-${hex}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function round(n: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

/** Removes invisible control characters (keeps tabs and newlines). */
export function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‍﻿]/g, "");
}

/**
 * Parses sizes people type: "1/8", "1 1/2", "1-1/2", "0.125", ".5", "24", optionally followed by a unit
 * ("1/8in", '1/4"', "3mm"). Returns a number or null.
 */
export function parseMeasure(text: string | number): number | null {
  const s = String(text)
    .trim()
    .toLowerCase()
    .replace(/(″|"|''|inches|inch|in|mm|cm|ft|m)$/, "")
    .trim();
  let m = s.match(/^(\d+)(?:\s+|-)(\d+)\s*\/\s*(\d+)$/);
  if (m) return Number(m[3]) ? round(Number(m[1]) + Number(m[2]) / Number(m[3]), 4) : null;
  m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return Number(m[2]) ? round(Number(m[1]) / Number(m[2]), 4) : null;
  m = s.match(/^(\d+(?:\.\d*)?|\.\d+)$/);
  if (m) return round(parseFloat(m[1]), 4);
  return null;
}

/** 12.5 -> "12 1/2", 0.0625 -> "1/16" (nearest 1/16). */
export function fmtFraction(x: number): string {
  const sixteenths = Math.round(x * 16);
  const whole = Math.floor(sixteenths / 16);
  let num = sixteenths % 16;
  let den = 16;
  while (num && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return num ? (whole ? whole + " " : "") + num + "/" + den : String(whole);
}

export function deepClone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** True if a JSON value (any depth) contains any ID from the set. */
export function jsonHasId(value: unknown, ids: Set<string>): boolean {
  if (Array.isArray(value)) return value.some((v) => jsonHasId(v, ids));
  if (value && typeof value === "object") return Object.values(value).some((v) => jsonHasId(v, ids));
  return typeof value === "string" && ids.has(value);
}

/** Copy of a JSON value with any IDs from the set removed from arrays. */
export function jsonStripIds(value: unknown, ids: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.filter((v) => !(typeof v === "string" && ids.has(v))).map((v) => jsonStripIds(v, ids));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = jsonStripIds(v, ids);
    return out;
  }
  return value;
}
