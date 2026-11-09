// Converts between the app's records (Row, shaped like the old Sheet rows) and Wix CMS data items.
// Shared by the Wix adapter (SDK, in the browser) and the import script (REST, from a laptop).

import { TABLES, type TableKey } from "./schema.ts";
import type { Row } from "./types.ts";
import { normalizeRecord } from "./validate.ts";

/**
 * 'sdk'  - @wix/data in the browser: DATETIME values are Date objects.
 * 'rest' - Wix REST API (import script): DATETIME values are { "$date": "<ISO>" }.
 */
export type WixMode = "sdk" | "rest";

export type WixItem = Record<string, unknown> & { _id: string };

function isoOf(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString();
  if (typeof v === "object" && v && "$date" in v) return isoOf((v as { $date: unknown }).$date);
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }
  return "";
}

/** Row -> Wix item data. Empty refs, dates and numbers are left out (Wix stores "no value"). */
export function toWixItem(key: TableKey, row: Row, mode: WixMode): WixItem {
  const item: WixItem = { _id: row.id };
  for (const col of TABLES[key].columns) {
    if (col.type === "id") continue;
    const v = row[col.name];
    switch (col.type) {
      case "date": {
        const iso = isoOf(v);
        if (iso) item[col.name] = mode === "sdk" ? new Date(iso) : { $date: iso };
        break;
      }
      case "ref":
        if (typeof v === "string" && v) item[col.name] = v;
        break;
      case "int":
      case "number":
        if (typeof v === "number" && isFinite(v)) item[col.name] = v;
        break;
      case "bool":
        item[col.name] = v === true;
        break;
      case "refList":
        item[col.name] = Array.isArray(v) ? v.map(String) : [];
        break;
      case "json":
        if (v !== undefined && v !== null && v !== "") item[col.name] = v;
        break;
      default:
        if (col.wixType === "REFERENCE") {
          if (typeof v === "string" && v) item[col.name] = v;
        } else {
          item[col.name] = v === null || v === undefined ? "" : String(v);
        }
    }
  }
  return item;
}

/** Wix item -> Row. Unknown fields (and Wix system fields like _owner) are dropped. */
export function fromWixItem(key: TableKey, item: Record<string, unknown>): Row {
  const rec: Record<string, unknown> = { id: String(item._id ?? item.id ?? "") };
  for (const col of TABLES[key].columns) {
    if (col.type === "id") continue;
    const v = item[col.name];
    switch (col.type) {
      case "date":
        rec[col.name] = isoOf(v);
        break;
      case "ref":
        // A REFERENCE field comes back as the ID string, or as the whole item when expanded.
        rec[col.name] = typeof v === "string" ? v : v && typeof v === "object" && "_id" in v ? String((v as { _id: unknown })._id) : "";
        break;
      case "int":
      case "number":
        rec[col.name] = typeof v === "number" && isFinite(v) ? v : null;
        break;
      case "bool":
        rec[col.name] = v === true;
        break;
      case "refList":
        rec[col.name] = Array.isArray(v) ? v.map(String) : [];
        break;
      case "json":
        rec[col.name] = v === undefined || v === null ? (col.empty === "array" ? [] : {}) : v;
        break;
      default:
        if (col.wixType === "REFERENCE") {
          rec[col.name] = typeof v === "string" ? v : v && typeof v === "object" && "_id" in v ? String((v as { _id: unknown })._id) : "";
        } else {
          rec[col.name] = v === undefined || v === null ? "" : String(v);
        }
    }
  }
  return normalizeRecord(key, rec);
}
