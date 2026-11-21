// POST /api/inventory: every inventory change (https://github.com/Team-6220/team6220.org/wiki/History-Phase-2, issue #100). A plain function from Request to Response,
// so it is tested directly; the Astro route (src/server/inventory-route.ts) is a thin wrapper. SERVER ONLY.
//
//   { "action": "insert",    "table": "parts", "rows": [{ "id": "PT-1", ... }] }
//   { "action": "replace",   "table": "parts", "row": {...}, "ifVersion": 3 }              -> { ok, saved: true|false }
//   { "action": "increment", "table": "parts", "id": "PT-1", "field": "qty", "delta": -2, "set": { "updatedAt": "..." } }
//   { "action": "remove",    "table": "parts", "ids": ["PT-1"] }
//   { "action": "setMeta",   "key": "packingMeta", "value": {...} }
//
// Who may change inventory: an approved member with the Team Member badge (every Team Member edits the inventory, team
// decision Nov 2026). The browser's own checks (validate.ts) are for helpful messages; this only keeps strangers out,
// so it does not repeat the field rules.
import { failure, guardSameSite, readJsonObject, reply } from "../server/http";
import { SiteError } from "../site/types";
import type { Viewer, VerifyViewer } from "../site/verify";
import { BADGES } from "../config";
import { META_KEYS, TABLES, type MetaKey, type TableKey } from "./schema.ts";
import type { InventoryWrites } from "./server-writes.ts";
import type { Row } from "./types.ts";

export interface InventoryApiDeps {
  verify: VerifyViewer;
  writes: InventoryWrites;
}

const MAX_BODY_BYTES = 4_000_000;
const MAX_ROWS = 1000;
const FIELD = /^[A-Za-z][A-Za-z0-9_]{0,60}$/;

export function mayEditInventory(viewer: Viewer): boolean {
  return viewer.approved && (viewer.badges.includes(BADGES.teamMember) || viewer.badges.includes(BADGES.webAdmin));
}

export async function handleInventoryRequest(request: Request, deps: InventoryApiDeps): Promise<Response> {
  try {
    if (request.method !== "POST") return reply(405, { error: { code: "bad-request", message: "Use POST." } });
    guardSameSite(request);

    const viewer = await deps.verify(request.headers.get("authorization"));
    if (!viewer.approved) throw new SiteError("pending", "A web admin hasn't approved your account yet.");
    if (!mayEditInventory(viewer)) throw new SiteError("forbidden", "Only team members can change the inventory.");

    const body = await readJsonObject(request, MAX_BODY_BYTES);
    const w = deps.writes;
    switch (body.action) {
      case "insert": {
        const table = requireTable(body.table);
        await w.insert(table, requireRows(body.rows));
        return reply(200, { ok: true });
      }
      case "replace": {
        const table = requireTable(body.table);
        const row = requireRow(body.row);
        const ifVersion = body.ifVersion === undefined ? undefined : requireInt(body.ifVersion, "ifVersion");
        return reply(200, { ok: true, saved: await w.replace(table, row, ifVersion) });
      }
      case "increment": {
        const table = requireTable(body.table);
        const id = requireId(body.id);
        const field = requireColumn(table, body.field, ["int", "number"]);
        const delta = requireNumber(body.delta, "delta");
        const set = requireSet(table, body.set);
        return reply(200, { ok: true, row: await w.increment(table, id, field, delta, set) });
      }
      case "remove": {
        const table = requireTable(body.table);
        if (!Array.isArray(body.ids) || body.ids.length > MAX_ROWS) throw bad("Send up to 1000 record IDs.");
        await w.remove(table, body.ids.map(requireId));
        return reply(200, { ok: true });
      }
      case "setMeta": {
        if (!(META_KEYS as readonly string[]).includes(body.key as string)) throw bad("That setting can't be saved.");
        await w.setMeta(body.key as MetaKey, body.value);
        return reply(200, { ok: true });
      }
      default:
        throw bad("Unknown action.");
    }
  } catch (err) {
    return failure(err, "inventory api");
  }
}

const bad = (message: string) => new SiteError("bad-request", message);

function requireTable(v: unknown): TableKey {
  if (typeof v !== "string" || !Object.hasOwn(TABLES, v)) throw bad("Unknown inventory table.");
  return v as TableKey;
}

function requireId(v: unknown): string {
  if (typeof v !== "string" || !v || v.length > 200) throw bad("Each record needs an ID.");
  return v;
}

function requireRow(v: unknown): Row {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw bad("A record must be an object.");
  requireId((v as Row).id);
  return v as Row;
}

function requireRows(v: unknown): Row[] {
  if (!Array.isArray(v) || v.length > MAX_ROWS) throw bad("Send up to 1000 records.");
  return v.map(requireRow);
}

function requireInt(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isInteger(v)) throw bad(`${what} must be a whole number.`);
  return v;
}

function requireNumber(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw bad(`${what} must be a number.`);
  return v;
}

/** A column of `table` with one of the given types: no other field name ever reaches Wix. */
function requireColumn(table: TableKey, v: unknown, types: readonly string[]): string {
  if (typeof v !== "string" || !FIELD.test(v)) throw bad("Unknown field.");
  const col = TABLES[table].columns.find((c) => c.name === v);
  if (!col || !types.includes(col.type)) throw bad("That field can't be changed this way.");
  return v;
}

function requireSet(table: TableKey, v: unknown): Record<string, unknown> {
  if (v === undefined) return {};
  if (!v || typeof v !== "object" || Array.isArray(v)) throw bad("\"set\" must be an object.");
  for (const k of Object.keys(v)) {
    if (!FIELD.test(k) || !TABLES[table].columns.some((c) => c.name === k)) throw bad("Unknown field.");
  }
  return v as Record<string, unknown>;
}
