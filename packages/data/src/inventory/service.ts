// The inventory's business rules, ported from the Apps Script server files
// (ApiInventory.gs, ApiSettings.gs, ApiAudit.gs, ApiPacking.gs, ApiRaw.gs). They run on top of any InventoryStore,
// so the in-memory adapter (dev, tests) and the Wix adapter behave the same.
//
// Every write returns { value, changes } so the UI can update its copy at once.
// Errors are InventoryError with the same codes the old app used (VALIDATION, CONFLICT, NOT_FOUND, IN_USE, ...).

import {
  APP_LIMITS,
  AUDIT_STATUSES,
  INVENTORY_SECTIONS,
  PACKING_SECTIONS,
  TABLES,
  TABLE_KEYS,
  getColumn,
  type AuditSection,
  type AuditStatus,
  type InventorySection,
  type TableKey,
} from "./schema.ts";
import type { Changes, FinalCheckInfo, InventoryStore, PackingMeta, Row, Snapshot, Tables, WriteResult } from "./types.ts";
import { FieldError, InventoryError, assertId, cleanText, isId, jsonHasId, jsonStripIds, newId, nowIso, round } from "./util.ts";
import { blankRecord, checkSections, checkShape, deriveShapeFields, validateInput, type RefContext } from "./validate.ts";

export interface ServiceOptions {
  /** Clock for the final check's 90-second rule (tests pass a fake one). Default Date.now. */
  now?: () => number;
}

export interface AuditSummary {
  total: number;
  confirmed?: number;
  updated?: number;
  missing?: number;
  unchecked?: number;
  keptCurrent?: number;
  skipped?: number;
  checked?: number;
}

export interface AuditConflict {
  auditItemId: string;
  itemTable: string;
  itemId: string;
  name: string;
  baseline: number;
  counted: number;
  current: number;
}

/** Per-operation cache of whole tables (Db.gs newCtx_). */
class Ctx implements RefContext {
  private cache = new Map<TableKey, Promise<Row[]>>();
  private store: InventoryStore;
  constructor(store: InventoryStore) {
    this.store = store;
  }
  rows(key: TableKey): Promise<Row[]> {
    let p = this.cache.get(key);
    if (!p) {
      p = this.store.list(key);
      this.cache.set(key, p);
    }
    return p;
  }
  async byId(key: TableKey): Promise<Map<string, Row>> {
    return new Map((await this.rows(key)).map((r) => [r.id, r]));
  }
}

class ChangeSet {
  changes: Changes = { upserts: {}, removals: {} };
  up(key: TableKey, ...rows: Row[]): this {
    (this.changes.upserts[key] ??= []).push(...rows.map((r) => ({ ...r })));
    return this;
  }
  rm(key: TableKey, ids: string[]): this {
    (this.changes.removals[key] ??= []).push(...ids);
    return this;
  }
  meta(m: PackingMeta): this {
    this.changes.packingMeta = m;
    return this;
  }
  result<T>(value: T): WriteResult<T> {
    return { value, changes: this.changes };
  }
}

const EMPTY_META: PackingMeta = { event: "", season: "", roundStartedAt: "", finalCheck: { state: "none" } };

function assertTable(key: unknown, kinds: string[]): asserts key is TableKey {
  if (typeof key !== "string" || !(TABLE_KEYS as string[]).includes(key) || !kinds.includes(TABLES[key as TableKey].kind)) {
    throw new InventoryError("BAD_REQUEST", "Unknown inventory section.");
  }
}

function lower(s: unknown): string {
  return String(s ?? "").toLowerCase();
}

function cleanLabel(v: unknown, max: number, field: string): string {
  if (v === null || v === undefined) return "";
  if (typeof v !== "string") throw new InventoryError("BAD_REQUEST", "Invalid text.");
  const s = cleanText(v).replace(/\s+/g, " ").trim();
  if (s.length > max) {
    throw new InventoryError("VALIDATION", `Must be ${max} characters or fewer.`, { fields: { [field]: `Must be ${max} characters or fewer.` } });
  }
  return s;
}

/** A readable name stored with each audit row (used if the item is later deleted). */
export function auditItemName(key: TableKey, r: Row, lists: Map<string, Row>): string {
  const v = (id: string) => lists.get(id)?.value ?? "";
  switch (key) {
    case "rawMaterials":
      return [
        v(r.materialTypeId),
        r.thickness ? `${r.thickness} ${v(r.thicknessUnitId)}`.trim() : "",
        [r.length, r.width].filter(Boolean).join(" × "),
      ]
        .filter(Boolean)
        .join(" · ");
    case "wire":
      return [v(r.gaugeId), r.typeColor].filter(Boolean).join(" · ");
    default:
      return r.name || r.id;
  }
}

export function createInventoryService(store: InventoryStore, opts: ServiceOptions = {}) {
  const ctx = () => new Ctx(store);
  const clock = opts.now ?? (() => Date.now());

  async function mustGet(key: TableKey, id: string, what = "This item"): Promise<Row> {
    const rec = await store.get(key, id);
    if (!rec) throw new InventoryError("NOT_FOUND", `${what} no longer exists. It may have been deleted.`);
    return rec;
  }

  async function readPackingMeta(): Promise<PackingMeta> {
    const m = ((await store.getMeta("packingMeta")) ?? {}) as Partial<PackingMeta>;
    return {
      event: m.event || "",
      season: m.season || "",
      roundStartedAt: m.roundStartedAt || "",
      finalCheck: m.finalCheck && typeof m.finalCheck === "object" ? m.finalCheck : { state: "none" },
    };
  }

  // ─────────────── loading ───────────────

  async function loadAll(): Promise<Snapshot> {
    const entries = await Promise.all(TABLE_KEYS.map(async (k) => [k, await store.list(k)] as const));
    const tables = Object.fromEntries(entries) as Tables;
    return { tables, packingMeta: await readPackingMeta().catch(() => ({ ...EMPTY_META })), loadedAt: nowIso() };
  }

  /** Active (not archived) records of one inventory section. */
  async function listItems(section: InventorySection = "parts"): Promise<Row[]> {
    assertTable(section, ["inventory"]);
    return (await store.list(section)).filter((r) => !r.archivedAt);
  }

  // ─────────────── settings rules (ApiSettings.gs) ───────────────

  async function checkSettingRules(key: TableKey, next: Row, prev: Row | null, c: Ctx): Promise<void> {
    const rows = await c.rows(key);
    const others = rows.filter((r) => r.id !== next.id);
    const err = (field: string, msg: string): never => {
      throw new InventoryError("VALIDATION", msg, { fields: { [field]: msg } });
    };
    switch (key) {
      case "categories":
      case "tags":
      case "suppliers":
      case "collections":
        if (others.some((r) => lower(r.name) === lower(next.name))) err("name", `There is already one named "${next.name}".`);
        break;
      case "lists":
        if (others.some((r) => r.listKey === next.listKey && lower(r.value) === lower(next.value))) {
          err("value", `"${next.value}" is already in this list.`);
        }
        break;
      case "locations": {
        if (next.parentId) {
          if (next.parentId === next.id) err("parentId", "A location cannot be inside itself.");
          const parent = rows.find((r) => r.id === next.parentId);
          if (parent && parent.parentId) err("parentId", "Locations have two levels (Area → Container). Pick a top-level area.");
          if (prev && others.some((r) => r.parentId === next.id)) {
            err("parentId", "This area has containers inside it, so it cannot be moved into another area.");
          }
        }
        if (others.some((r) => (r.parentId || "") === (next.parentId || "") && lower(r.name) === lower(next.name))) {
          err("name", `There is already a location named "${next.name}" here.`);
        }
        break;
      }
      default:
        break;
    }
  }

  function nextSortOrder(rows: Row[]): number {
    return rows.reduce((m, r) => Math.max(m, Number(r.sortOrder) || 0), 0) + 1;
  }

  // ─────────────── create / update (ApiInventory.gs) ───────────────

  async function create(key: TableKey, input: unknown): Promise<WriteResult<Row>> {
    assertTable(key, ["inventory", "setting"]);
    const def = TABLES[key];
    const c = ctx();
    const clean = await validateInput(key, input, "create", null, c);
    const rec: Row = Object.assign(blankRecord(key), clean);
    rec.id = newId(def.prefix);
    if (def.kind === "inventory") {
      rec.version = 1;
      rec.createdAt = rec.updatedAt = nowIso();
      rec.archivedAt = "";
      if (def.auditable) rec.needsCheck = false;
    } else {
      await checkSettingRules(key, rec, null, c);
      rec.sortOrder = nextSortOrder(await c.rows(key));
    }
    await store.insert(key, [rec]);
    return new ChangeSet().up(key, rec).result(rec);
  }

  /**
   * Updates fields of a record.
   * expectedVersion (inventory only): the `version` the user last saw. If someone else saved in between,
   * throws CONFLICT with details.current = the latest record. Pass null to overwrite on purpose.
   */
  async function update(key: TableKey, id: string, changes: unknown, expectedVersion?: number | null): Promise<WriteResult<Row>> {
    assertTable(key, ["inventory", "setting"]);
    assertId(id);
    const def = TABLES[key];
    if (def.kind === "inventory" && expectedVersion === undefined) throw new InventoryError("BAD_REQUEST", "Missing version.");
    const rec = await mustGet(key, id, "This entry");
    if (def.kind === "inventory") {
      if (rec.archivedAt) throw new InventoryError("ARCHIVED", "This item is archived. Restore it before editing.");
      checkVersion(rec, expectedVersion);
    }
    const c = ctx();
    const clean = await validateInput(key, changes, "update", rec, c);
    const next: Row = { ...rec, ...clean };
    if (
      key === "rawMaterials" &&
      !("shape" in clean) &&
      (("length" in clean && clean.length !== rec.length) || ("width" in clean && clean.width !== rec.width))
    ) {
      // Sizes typed without a new outline: the old outline no longer matches them. (The inventory UI always sends
      // the outline, and length / width are then filled in from it by validateInput.)
      next.shape = {};
      next.area = null;
    }
    if (def.kind === "inventory") {
      next.version = (Number(rec.version) || 0) + 1;
      next.updatedAt = nowIso();
      const ok = await store.replace(key, next, Number(rec.version) || 0);
      if (!ok) throw await conflictError(key, id);
    } else {
      await checkSettingRules(key, next, rec, c);
      await store.replace(key, next);
    }
    return new ChangeSet().up(key, next).result(next);
  }

  function checkVersion(rec: Row, expectedVersion: number | null | undefined): void {
    if (expectedVersion === null) return; // deliberate overwrite
    if (typeof expectedVersion !== "number" || expectedVersion !== rec.version) {
      throw new InventoryError("CONFLICT", "Someone else changed this item since you opened it.", { current: rec });
    }
  }

  async function conflictError(key: TableKey, id: string): Promise<InventoryError> {
    const current = await store.get(key, id);
    if (!current) return new InventoryError("NOT_FOUND", "This item no longer exists. It may have been deleted.");
    return new InventoryError("CONFLICT", "Someone else changed this item since you opened it.", { current });
  }

  /**
   * Adds or subtracts from an item's quantity (the +/- buttons). Sends a CHANGE, not a total, so two people taking
   * parts at the same moment are both counted. Never goes below 0 (clamped: true if it would have).
   */
  async function adjustQuantity(key: TableKey, id: string, delta: number): Promise<WriteResult<{ record: Row; clamped: boolean }>> {
    assertTable(key, ["inventory"]);
    assertId(id);
    const def = TABLES[key];
    if (!def.qtyField) throw new InventoryError("BAD_REQUEST", "This section does not track quantities.");
    const col = getColumn(key, def.qtyField)!;
    if (typeof delta !== "number" || !isFinite(delta) || delta === 0) throw new InventoryError("BAD_REQUEST", "Invalid quantity change.");
    if (col.type === "int" && !Number.isInteger(delta)) throw new InventoryError("BAD_REQUEST", "Quantity changes must be whole numbers.");
    if (Math.abs(delta) > APP_LIMITS.MAX_QUANTITY) throw new InventoryError("BAD_REQUEST", "That change is too large.");
    const rec = await mustGet(key, id);
    if (rec.archivedAt) throw new InventoryError("ARCHIVED", "This item is archived. Restore it before editing.");
    const now = nowIso();
    if ((Number(rec[def.qtyField]) || 0) + delta > APP_LIMITS.MAX_QUANTITY) {
      throw new InventoryError("VALIDATION", `Quantity cannot exceed ${APP_LIMITS.MAX_QUANTITY}.`);
    }
    let after = await store.increment(key, id, def.qtyField, col.type === "number" ? round(delta, 3) : delta, { updatedAt: now });
    if (!after) throw new InventoryError("NOT_FOUND", "This item no longer exists. It may have been deleted.");
    let clamped = false;
    const q = Number(after[def.qtyField]) || 0;
    if (q < 0) {
      // Went below zero (someone else took the last ones first): add back what's missing.
      clamped = true;
      after = (await store.increment(key, id, def.qtyField, -q, { updatedAt: now })) ?? after;
    } else if (col.type === "number" && q !== round(q, 3)) {
      after[def.qtyField] = round(q, 3);
    }
    return new ChangeSet().up(key, after).result({ record: after, clamped });
  }

  /** Bumps version + updatedAt and writes a record whose fields were changed by the app (not the user). */
  async function systemWrite(key: TableKey, rec: Row): Promise<Row> {
    const next: Row = { ...rec };
    if (TABLES[key].kind === "inventory") {
      next.version = (Number(rec.version) || 0) + 1;
      next.updatedAt = nowIso();
      const ok = await store.replace(key, next, Number(rec.version) || 0);
      if (!ok) throw await conflictError(key, rec.id);
    } else {
      if ("updatedAt" in next) next.updatedAt = nowIso();
      await store.replace(key, next);
    }
    return next;
  }

  /** Sets or clears the "Needs check" flag (set automatically by audits for missing items). */
  async function setNeedsCheck(key: TableKey, id: string, value: boolean): Promise<WriteResult<Row>> {
    assertTable(key, ["inventory"]);
    assertId(id);
    if (!TABLES[key].auditable) throw new InventoryError("BAD_REQUEST", "This section is not audited.");
    if (value !== true && value !== false) throw new InventoryError("BAD_REQUEST", "Invalid value.");
    const rec = await mustGet(key, id);
    const next = await systemWrite(key, { ...rec, needsCheck: value });
    return new ChangeSet().up(key, next).result(next);
  }

  // ─────────────── archive / restore / delete ───────────────

  async function setArchived(key: TableKey, id: string, archive: boolean): Promise<WriteResult<Row>> {
    assertTable(key, ["inventory"]);
    assertId(id);
    const rec = await mustGet(key, id);
    if (archive === Boolean(rec.archivedAt)) return new ChangeSet().up(key, rec).result(rec);
    const next = await systemWrite(key, { ...rec, archivedAt: archive ? nowIso() : "" });
    return new ChangeSet().up(key, next).result(next);
  }

  /** "Delete" in the app: moves an item to the archive (restorable). */
  const archive = (key: TableKey, id: string) => setArchived(key, id, true);
  const restore = (key: TableKey, id: string) => setArchived(key, id, false);

  /** Permanently deletes an ARCHIVED item. Cannot be undone. */
  async function deletePermanently(key: TableKey, id: string): Promise<WriteResult<string>> {
    assertTable(key, ["inventory"]);
    assertId(id);
    const rec = await mustGet(key, id);
    if (!rec.archivedAt) throw new InventoryError("BAD_REQUEST", "Only archived items can be permanently deleted. Archive it first.");
    await store.remove(key, [id]);
    return new ChangeSet().rm(key, [id]).result(id);
  }

  /** Permanently deletes items archived more than `days` ago (the old nightly job did this after 30 days). */
  async function purgeArchived(days: number = APP_LIMITS.ARCHIVE_PURGE_DAYS, now = Date.now()): Promise<WriteResult<number>> {
    const cs = new ChangeSet();
    let n = 0;
    for (const key of INVENTORY_SECTIONS) {
      const old = (await store.list(key)).filter((r) => r.archivedAt && now - Date.parse(r.archivedAt) > days * 86400000);
      if (old.length) {
        await store.remove(key, old.map((r) => r.id));
        cs.rm(key, old.map((r) => r.id));
        n += old.length;
      }
    }
    return cs.result(n);
  }

  // ─────────────── settings: remove / reorder ───────────────

  /** Finds every row (in any table) that refers to one of the IDs. */
  async function findUsage(key: TableKey, ids: Set<string>, c: Ctx): Promise<Map<TableKey, Row[]>> {
    const usage = new Map<TableKey, Row[]>();
    for (const tk of TABLE_KEYS) {
      const def = TABLES[tk];
      if (def.kind === "audit") continue;
      const refCols = def.columns.filter((col) => (col.type === "ref" || col.type === "refList") && col.ref === key);
      const jsonCols = tk === "collections" ? def.columns.filter((col) => col.type === "json") : [];
      if (!refCols.length && !jsonCols.length) continue;
      const hits = (await c.rows(tk)).filter((r) => {
        if (ids.has(r.id)) return false; // rows being deleted themselves
        return (
          refCols.some((col) => (col.type === "ref" ? ids.has(r[col.name]) : (r[col.name] || []).some((x: string) => ids.has(x)))) ||
          jsonCols.some((col) => jsonHasId(r[col.name], ids))
        );
      });
      if (hits.length) usage.set(tk, hits);
    }
    return usage;
  }

  /**
   * Removes a settings entry.
   *   force = false: if anything uses it, nothing changes and the error IN_USE has details
   *                  { counts: { parts: 3, ... }, total, childCount } so the UI can ask first.
   *   force = true:  clears it from everything that uses it, then deletes it.
   * Removing a location area also removes the containers inside it.
   */
  async function removeSetting(key: TableKey, id: string, force = false): Promise<WriteResult<{ removedIds: string[]; cleared: Record<string, number> }>> {
    assertTable(key, ["setting"]);
    assertId(id);
    const c = ctx();
    const rows = await c.rows(key);
    const rec = rows.find((r) => r.id === id);
    if (!rec) throw new InventoryError("NOT_FOUND", "This entry no longer exists.");
    const ids = [id];
    if (key === "locations") rows.forEach((r) => r.parentId === id && ids.push(r.id));
    const idSet = new Set(ids);
    const usage = await findUsage(key, idSet, c);
    const counts: Record<string, number> = {};
    let total = 0;
    usage.forEach((hits, tk) => {
      counts[tk] = hits.length;
      total += hits.length;
    });
    const childCount = ids.length - 1;
    if ((total > 0 || childCount > 0) && force !== true) {
      throw new InventoryError("IN_USE", "This is still in use.", { counts, total, childCount });
    }
    const cs = new ChangeSet();
    for (const [tk, hits] of usage) {
      const def = TABLES[tk];
      for (const r of hits) {
        const next: Row = { ...r };
        for (const col of def.columns) {
          if (col.type === "ref" && idSet.has(next[col.name])) next[col.name] = "";
          else if (col.type === "refList") next[col.name] = (next[col.name] || []).filter((x: string) => !idSet.has(x));
          else if (col.type === "json") next[col.name] = jsonStripIds(next[col.name], idSet);
        }
        if (def.kind === "inventory") next.version = (Number(r.version) || 0) + 1;
        await store.replace(tk, next);
        cs.up(tk, next);
      }
    }
    await store.remove(key, ids);
    cs.rm(key, ids);
    return cs.result({ removedIds: ids, cleared: counts });
  }

  /**
   * Reorders entries. `orderedIds` can be the whole table or just a group (e.g. the containers in one area);
   * only those swap positions.
   */
  async function reorder(key: TableKey, orderedIds: string[]): Promise<WriteResult<number>> {
    assertTable(key, ["setting", "packing"]);
    if (!getColumn(key, "sortOrder")) throw new InventoryError("BAD_REQUEST", "This list can’t be reordered.");
    if (!Array.isArray(orderedIds) || !orderedIds.length || orderedIds.length > 2000) throw new InventoryError("BAD_REQUEST", "Invalid order.");
    orderedIds.forEach(assertId);
    if (new Set(orderedIds).size !== orderedIds.length) throw new InventoryError("BAD_REQUEST", "Invalid order.");
    const rows = await store.list(key);
    const byId = new Map(rows.map((r) => [r.id, r]));
    if (orderedIds.some((x) => !byId.has(x))) {
      throw new InventoryError("CONFLICT", "The list changed while you were reordering. Refresh and try again.");
    }
    const current = rows.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.id.localeCompare(b.id));
    const moving = new Set(orderedIds);
    let n = 0;
    const final = current.map((r) => (moving.has(r.id) ? byId.get(orderedIds[n++])! : r));
    const cs = new ChangeSet();
    let changed = 0;
    for (let i = 0; i < final.length; i++) {
      const r = final[i];
      if (r.sortOrder !== i + 1) {
        const next = { ...r, sortOrder: i + 1 };
        await store.replace(key, next);
        cs.up(key, next);
        changed++;
      }
    }
    return cs.result(changed);
  }

  // ─────────────── audits (ApiAudit.gs) ───────────────

  async function activeAudit(): Promise<Row | null> {
    return (await store.list("auditSessions")).find((s) => s.status === "active") ?? null;
  }

  /** Starts an audit of the chosen sections, remembering each item's quantity now ("baseline"). */
  async function startAudit(name: string, sections: AuditSection[]): Promise<WriteResult<{ session: Row; count: number }>> {
    const n = typeof name === "string" ? cleanText(name).replace(/\s+/g, " ").trim() : "";
    if (!n || n.length > 80) {
      throw new InventoryError("VALIDATION", "Give the audit a name (80 characters or fewer).", { fields: { name: "Required." } });
    }
    let secs: string[];
    try {
      secs = checkSections(sections);
    } catch (e) {
      if (e instanceof FieldError) throw new InventoryError("VALIDATION", e.message, { fields: { sections: e.message } });
      throw e;
    }
    if (await activeAudit()) throw new InventoryError("AUDIT_ACTIVE", "An audit is already in progress. Finish or cancel it first.");
    const c = ctx();
    const lists = await c.byId("lists");
    const now = nowIso();
    const session: Row = Object.assign(blankRecord("auditSessions"), {
      id: newId(TABLES.auditSessions.prefix),
      name: n,
      status: "active",
      sections: secs,
      createdAt: now,
      finalizedAt: "",
      summary: {},
    });
    const items: Row[] = [];
    for (const key of secs as AuditSection[]) {
      const q = TABLES[key].qtyField!;
      for (const r of await c.rows(key)) {
        if (r.archivedAt) continue;
        items.push(
          Object.assign(blankRecord("auditItems"), {
            id: newId(TABLES.auditItems.prefix),
            auditId: session.id,
            itemTable: key,
            itemId: r.id,
            nameSnapshot: auditItemName(key, r, lists).slice(0, 200),
            baselineQty: Number(r[q]) || 0,
            countedQty: null,
            status: "unchecked",
            updatedAt: "",
          }),
        );
      }
    }
    await store.insert("auditSessions", [session]);
    await store.insert("auditItems", items);
    return new ChangeSet().up("auditSessions", session).up("auditItems", ...items).result({ session, count: items.length });
  }

  async function requireActiveSession(auditId: string): Promise<Row> {
    const s = await store.get("auditSessions", auditId);
    if (!s || s.status !== "active") throw new InventoryError("AUDIT_CLOSED", "This audit has already been finalized or cancelled.");
    return s;
  }

  /**
   * Records one count. status 'different' needs countedQty; if it equals the expected amount it is saved as
   * 'confirmed'. 'unchecked' undoes a count.
   */
  async function setAuditCount(auditItemId: string, status: AuditStatus, countedQty?: number | string | null): Promise<WriteResult<Row>> {
    assertId(auditItemId);
    if (!(AUDIT_STATUSES as readonly string[]).includes(status)) throw new InventoryError("BAD_REQUEST", "Invalid status.");
    const rec = await store.get("auditItems", auditItemId);
    if (!rec) throw new InventoryError("AUDIT_CLOSED", "This audit has already been finalized or cancelled.");
    await requireActiveSession(rec.auditId);
    let st: AuditStatus = status;
    let qty: number | null = null;
    if (st === "different") {
      const def = TABLES[rec.itemTable as TableKey];
      const col = getColumn(rec.itemTable as TableKey, def.qtyField!)!;
      const n = typeof countedQty === "string" ? Number(countedQty.trim()) : countedQty;
      if (typeof n !== "number" || !isFinite(n) || n < 0 || n > APP_LIMITS.MAX_QUANTITY || (col.type === "int" && !Number.isInteger(n))) {
        throw new InventoryError("VALIDATION", col.type === "int" ? "Enter a whole number, 0 or more." : "Enter a number, 0 or more.", {
          fields: { countedQty: "Invalid" },
        });
      }
      qty = col.type === "number" ? round(n, 3) : n;
      if (qty === rec.baselineQty) {
        st = "confirmed";
        qty = null;
      }
    }
    const next: Row = { ...rec, status: st, countedQty: qty, updatedAt: st === "unchecked" ? "" : nowIso() };
    await store.replace("auditItems", next);
    return new ChangeSet().up("auditItems", next).result(next);
  }

  /**
   * Applies the audit to the inventory:
   *   Confirmed / Not checked -> no change; Different -> quantity set to the count;
   *   Missing -> quantity kept, item flagged "Needs check".
   * If an item's live quantity changed after the audit started, its count is NOT applied automatically:
   * the error AUDIT_CONFLICTS lists them (details.conflicts) and nothing is written. Call again with
   * resolutions { auditItemId: 'counted' | 'current' } for each.
   */
  async function finalizeAudit(auditId: string, resolutions: Record<string, "counted" | "current"> = {}): Promise<WriteResult<{ session: Row; summary: AuditSummary }>> {
    assertId(auditId);
    const res = resolutions && typeof resolutions === "object" ? resolutions : {};
    const session = await requireActiveSession(auditId);
    const c = ctx();
    const items = (await c.rows("auditItems")).filter((r) => r.auditId === auditId);
    const summary: Required<Omit<AuditSummary, "checked">> = { total: items.length, confirmed: 0, updated: 0, missing: 0, unchecked: 0, keptCurrent: 0, skipped: 0 };
    const conflicts: AuditConflict[] = [];
    const plan: { key: TableKey; rec: Row; missing?: boolean; field?: string; value?: number }[] = [];

    for (const ai of items) {
      if (ai.status === "unchecked") {
        summary.unchecked++;
        continue;
      }
      if (ai.status === "confirmed") {
        summary.confirmed++;
        continue;
      }
      const key = ai.itemTable as TableKey;
      const rec = (await c.byId(key)).get(ai.itemId);
      if (!rec || rec.archivedAt) {
        summary.skipped++;
        continue;
      }
      const q = TABLES[key].qtyField!;
      const live = Number(rec[q]) || 0;
      if (ai.status === "missing") {
        plan.push({ key, rec, missing: true });
        summary.missing++;
        continue;
      }
      if (live === ai.baselineQty || res[ai.id] === "counted") {
        plan.push({ key, rec, field: q, value: ai.countedQty });
        summary.updated++;
      } else if (res[ai.id] === "current") {
        summary.keptCurrent++;
      } else {
        conflicts.push({
          auditItemId: ai.id,
          itemTable: key,
          itemId: ai.itemId,
          name: ai.nameSnapshot,
          baseline: ai.baselineQty,
          counted: ai.countedQty,
          current: live,
        });
      }
    }
    if (conflicts.length) {
      throw new InventoryError("AUDIT_CONFLICTS", `${conflicts.length} item(s) changed while the audit was running.`, { conflicts });
    }

    const cs = new ChangeSet();
    const now = nowIso();
    for (const p of plan) {
      const next: Row = { ...p.rec };
      if (p.missing) next.needsCheck = true;
      else next[p.field!] = p.value;
      next.version = (Number(p.rec.version) || 0) + 1;
      next.updatedAt = now;
      // Not conditional: the conflict check above already compared quantities, and a stale write here
      // would only repeat what the person finalizing just chose.
      await store.replace(p.key, next);
      cs.up(p.key, next);
    }
    await store.remove("auditItems", items.map((r) => r.id));
    cs.rm("auditItems", items.map((r) => r.id));
    const done: Row = { ...session, status: "finalized", finalizedAt: now, summary };
    await store.replace("auditSessions", done);
    cs.up("auditSessions", done);
    return cs.result({ session: done, summary });
  }

  /** Stops an audit without changing any inventory. */
  async function cancelAudit(auditId: string): Promise<WriteResult<Row>> {
    assertId(auditId);
    const session = await requireActiveSession(auditId);
    const items = (await store.list("auditItems")).filter((r) => r.auditId === auditId);
    const checked = items.filter((r) => r.status !== "unchecked").length;
    await store.remove("auditItems", items.map((r) => r.id));
    const done: Row = { ...session, status: "cancelled", finalizedAt: nowIso(), summary: { total: items.length, checked } };
    await store.replace("auditSessions", done);
    return new ChangeSet().rm("auditItems", items.map((r) => r.id)).up("auditSessions", done).result(done);
  }

  // ─────────────── packing list (ApiPacking.gs) ───────────────

  async function packingSetInfo(info: { event?: string; season?: string }): Promise<WriteResult<PackingMeta>> {
    if (!info || typeof info !== "object") throw new InventoryError("BAD_REQUEST", "Invalid data.");
    const m = await readPackingMeta();
    if ("event" in info) m.event = cleanLabel(info.event, 80, "event");
    if ("season" in info) m.season = cleanLabel(info.season, 40, "season");
    await store.setMeta("packingMeta", m);
    return new ChangeSet().meta(m).result(m);
  }

  /** "Start new packing round": clears every packed/verified mark and the final check. */
  async function packingReset(eventName?: string): Promise<WriteResult<number>> {
    const ev = cleanLabel(eventName ?? "", 80, "event");
    const cs = new ChangeSet();
    const rows = (await store.list("packingItems")).filter((r) => r.packed || r.verified);
    for (const r of rows) {
      const next = { ...r, packed: false, verified: false };
      await store.replace("packingItems", next);
      cs.up("packingItems", next);
    }
    const m = await readPackingMeta();
    if (ev) m.event = ev;
    m.roundStartedAt = nowIso();
    m.finalCheck = { state: "none" };
    await store.setMeta("packingMeta", m);
    return cs.meta(m).result(rows.length);
  }

  function packingDepth(byId: Map<string, Row>, rec: Row): number {
    let d = 1;
    let p = rec.parentId;
    let guard = 0;
    while (p && byId.get(p) && guard++ < 20) {
      d++;
      p = byId.get(p)!.parentId;
    }
    return d;
  }

  function packingHeight(rows: Row[], id: string): number {
    const kids = rows.filter((r) => r.parentId === id);
    return 1 + kids.reduce((m, k) => Math.max(m, packingHeight(rows, k.id)), 0);
  }

  function packingDescendants(rows: Row[], id: string): Row[] {
    const out: Row[] = [];
    const walk = (pid: string) => {
      for (const r of rows) {
        if (r.parentId === pid) {
          out.push(r);
          walk(r.id);
        }
      }
    };
    walk(id);
    return out;
  }

  async function checkPackingLink(rec: Row, c: Ctx): Promise<void> {
    if (!rec.linkTable) {
      rec.linkId = "";
      return;
    }
    if (!isId(rec.linkId) || !(await c.byId(rec.linkTable as TableKey)).get(rec.linkId)) {
      throw new InventoryError("VALIDATION", "That inventory item no longer exists.", { fields: { linkId: "Pick an item from the list." } });
    }
  }

  /** Adds an entry. input: { name, section, parentId?, note?, linkTable?, linkId? } */
  async function packingCreate(input: Record<string, unknown>): Promise<WriteResult<Row>> {
    const c = ctx();
    const rows = await c.rows("packingItems");
    const byId = new Map(rows.map((r) => [r.id, r]));
    let data = input;
    if (data && typeof data.parentId === "string" && byId.get(data.parentId)) data = { ...data, section: byId.get(data.parentId)!.section };
    const clean = await validateInput("packingItems", data, "create", null, c);
    const rec: Row = Object.assign(blankRecord("packingItems"), clean, {
      id: newId(TABLES.packingItems.prefix),
      packed: false,
      verified: false,
      updatedAt: nowIso(),
    });
    await checkPackingLink(rec, c);
    if (rec.parentId && packingDepth(byId, rec) > APP_LIMITS.PACKING_MAX_DEPTH) {
      throw new InventoryError("VALIDATION", `The list can only go ${APP_LIMITS.PACKING_MAX_DEPTH} levels deep.`, { fields: { parentId: "Too deep." } });
    }
    const siblings = rows.filter((r) => (r.parentId || "") === (rec.parentId || "") && r.section === rec.section);
    rec.sortOrder = siblings.reduce((m, r) => Math.max(m, r.sortOrder || 0), 0) + 1;
    await store.insert("packingItems", [rec]);
    return new ChangeSet().up("packingItems", rec).result(rec);
  }

  /** Edits an entry: name, note, link, or where it lives (parentId / section). */
  async function packingUpdate(id: string, changes: Record<string, unknown>): Promise<WriteResult<Row>> {
    assertId(id);
    const c = ctx();
    const rows = await c.rows("packingItems");
    const byId = new Map(rows.map((r) => [r.id, r]));
    const rec = byId.get(id);
    if (!rec) throw new InventoryError("NOT_FOUND", "This entry no longer exists.");
    const clean = await validateInput("packingItems", changes, "update", rec, c);
    const next: Row = { ...rec, ...clean };
    const moved = "parentId" in clean && clean.parentId !== rec.parentId;
    if (next.parentId) {
      if (next.parentId === id || packingDescendants(rows, id).some((d) => d.id === next.parentId)) {
        throw new InventoryError("VALIDATION", "An entry can’t be put inside itself.", { fields: { parentId: "Invalid" } });
      }
      next.section = byId.get(next.parentId)!.section;
      if (packingDepth(byId, next) + packingHeight(rows, id) - 1 > APP_LIMITS.PACKING_MAX_DEPTH) {
        throw new InventoryError("VALIDATION", `That would make the list more than ${APP_LIMITS.PACKING_MAX_DEPTH} levels deep.`, { fields: { parentId: "Too deep." } });
      }
    }
    if ("linkTable" in clean || "linkId" in clean) await checkPackingLink(next, c);
    if (moved) {
      const sib = rows.filter((r) => (r.parentId || "") === (next.parentId || "") && r.section === next.section && r.id !== id);
      next.sortOrder = sib.reduce((m, r) => Math.max(m, r.sortOrder || 0), 0) + 1;
    }
    next.updatedAt = nowIso();
    const cs = new ChangeSet();
    await store.replace("packingItems", next);
    cs.up("packingItems", next);
    if (next.section !== rec.section) {
      for (const d of packingDescendants(rows, id)) {
        const dn = { ...d, section: next.section };
        await store.replace("packingItems", dn);
        cs.up("packingItems", dn);
      }
    }
    return cs.result(next);
  }

  /** Deletes an entry and everything inside it. */
  async function packingDelete(id: string): Promise<WriteResult<string[]>> {
    assertId(id);
    const rows = await store.list("packingItems");
    const rec = rows.find((r) => r.id === id);
    if (!rec) throw new InventoryError("NOT_FOUND", "This entry no longer exists.");
    const ids = [rec, ...packingDescendants(rows, id)].map((r) => r.id);
    await store.remove("packingItems", ids);
    return new ChangeSet().rm("packingItems", ids).result(ids);
  }

  /** Deletes every season-specific entry (when a new season starts). */
  async function packingClearSeason(): Promise<WriteResult<number>> {
    const ids = (await store.list("packingItems")).filter((r) => r.section === "season").map((r) => r.id);
    await store.remove("packingItems", ids);
    return new ChangeSet().rm("packingItems", ids).result(ids.length);
  }

  /** Ticks or unticks "packed" on entries (the UI sends a group's leaves together). */
  async function packingSetPacked(ids: string[], value: boolean): Promise<WriteResult<Row[]>> {
    if (!Array.isArray(ids) || !ids.length || ids.length > 3000) throw new InventoryError("BAD_REQUEST", "Invalid selection.");
    ids.forEach(assertId);
    if (value !== true && value !== false) throw new InventoryError("BAD_REQUEST", "Invalid value.");
    const byId = new Map((await store.list("packingItems")).map((r) => [r.id, r]));
    const changed: Row[] = [];
    for (const id of ids) {
      const r = byId.get(id);
      if (r && r.packed !== value) {
        const next = { ...r, packed: value, updatedAt: nowIso() };
        await store.replace("packingItems", next);
        changed.push(next);
      }
    }
    return new ChangeSet().up("packingItems", ...changed).result(changed);
  }

  async function packingNoteAdd(text: string): Promise<WriteResult<Row>> {
    const clean = await validateInput("packingNotes", { text }, "create", null, ctx());
    const rec: Row = Object.assign(blankRecord("packingNotes"), clean, { id: newId(TABLES.packingNotes.prefix), done: false, createdAt: nowIso() });
    await store.insert("packingNotes", [rec]);
    return new ChangeSet().up("packingNotes", rec).result(rec);
  }

  async function packingNoteSet(id: string, done: boolean): Promise<WriteResult<Row>> {
    assertId(id);
    if (done !== true && done !== false) throw new InventoryError("BAD_REQUEST", "Invalid value.");
    const rec = await mustGet("packingNotes", id, "This note");
    const next = { ...rec, done };
    await store.replace("packingNotes", next);
    return new ChangeSet().up("packingNotes", next).result(next);
  }

  async function packingNoteDelete(id: string): Promise<WriteResult<string>> {
    assertId(id);
    await mustGet("packingNotes", id, "This note");
    await store.remove("packingNotes", [id]);
    return new ChangeSet().rm("packingNotes", [id]).result(id);
  }

  // ─────────────── final check (ApiPacking.gs) ───────────────
  // ONE person claims it by typing their name and gets a private token; only that browser can tick "verified".
  // It pings every 30 s; a check nobody has pinged for 90 s shows as paused (publicPackingMeta).
  // Without Apps Script's lock, two people claiming in the same instant can both succeed; the later one wins and
  // the earlier one gets FINAL_CHECK_LOST on their next tick or ping.

  function requireFinalCheckToken(m: PackingMeta, token: unknown): void {
    const fc = m.finalCheck;
    if (typeof token !== "string" || !fc.token || fc.token !== token) {
      throw new InventoryError(
        "FINAL_CHECK_LOST",
        fc.state === "active" && fc.by ? `${fc.by} has taken over the final check.` : "Your final check was paused. Resume it to keep going.",
      );
    }
    if (fc.state === "complete") throw new InventoryError("FINAL_CHECK_LOST", "The final check is already complete.");
  }

  /**
   * Starts or resumes the final check under a name. Returns a private token.
   * restart: true clears all "verified" marks first (used after a completed check).
   */
  async function finalCheckClaim(name: string, restart?: boolean): Promise<WriteResult<{ token: string; packingMeta: PackingMeta }>> {
    const who = cleanLabel(name, 40, "name");
    if (!who) throw new InventoryError("VALIDATION", "Type your name so others know who is checking.", { fields: { name: "Required." } });
    const m = await readPackingMeta();
    const fc = m.finalCheck;
    const t = clock();
    if (finalCheckLive(fc, t) && restart !== true) {
      throw new InventoryError("FINAL_CHECK_TAKEN", `${fc.by} is doing the final check right now.`, { by: fc.by });
    }
    if (fc.state === "complete" && restart !== true) throw new InventoryError("FINAL_CHECK_DONE", "The final check is already complete.");
    const cs = new ChangeSet();
    if (restart === true) {
      if (finalCheckLive(fc, t)) throw new InventoryError("FINAL_CHECK_TAKEN", `${fc.by} is doing the final check right now.`, { by: fc.by });
      for (const r of (await store.list("packingItems")).filter((x) => x.verified)) {
        const next = { ...r, verified: false };
        await store.replace("packingItems", next);
        cs.up("packingItems", next);
      }
    }
    const token = newToken();
    const now = new Date(t).toISOString();
    m.finalCheck = {
      state: "active",
      by: who,
      token,
      startedAt: fc.state === "none" || fc.state === "complete" || restart === true ? now : fc.startedAt || now,
      lastSeen: now,
      resumedFrom: fc.state === "paused" || fc.state === "active" ? fc.by || "" : "",
    };
    await store.setMeta("packingMeta", m);
    return cs.meta(m).result({ token, packingMeta: m });
  }

  /** "Still here" signal, sent every ~30 s while the checker has the page open. */
  async function finalCheckPing(token: string): Promise<WriteResult<PackingMeta>> {
    const m = await readPackingMeta();
    requireFinalCheckToken(m, token);
    m.finalCheck.state = "active";
    m.finalCheck.lastSeen = new Date(clock()).toISOString();
    await store.setMeta("packingMeta", m);
    return new ChangeSet().meta(m).result(m);
  }

  /** The checker left the page: keep progress, release the claim. */
  async function finalCheckPause(token: string): Promise<WriteResult<PackingMeta>> {
    const m = await readPackingMeta();
    if (m.finalCheck.token !== token || m.finalCheck.state !== "active") return new ChangeSet().result(m);
    m.finalCheck.state = "paused";
    m.finalCheck.pausedReason = "left";
    delete m.finalCheck.token;
    await store.setMeta("packingMeta", m);
    return new ChangeSet().meta(m).result(m);
  }

  /** Ticks or unticks "verified" (final-check holder only). */
  async function finalCheckVerify(token: string, ids: string[], value: boolean): Promise<WriteResult<Row[]>> {
    checkIdList(ids, 3000);
    if (value !== true && value !== false) throw new InventoryError("BAD_REQUEST", "Invalid value.");
    const m = await readPackingMeta();
    requireFinalCheckToken(m, token);
    const byId = new Map((await store.list("packingItems")).map((r) => [r.id, r]));
    const changed: Row[] = [];
    for (const id of ids) {
      const r = byId.get(id);
      if (r && r.verified !== value) {
        const next = { ...r, verified: value, updatedAt: nowIso() };
        await store.replace("packingItems", next);
        changed.push(next);
      }
    }
    m.finalCheck.state = "active";
    m.finalCheck.lastSeen = new Date(clock()).toISOString();
    await store.setMeta("packingMeta", m);
    return new ChangeSet().up("packingItems", ...changed).meta(m).result(changed);
  }

  /** Marks the final check complete (records how many entries were verified). */
  async function finalCheckComplete(token: string): Promise<WriteResult<PackingMeta>> {
    const m = await readPackingMeta();
    requireFinalCheckToken(m, token);
    const rows = await store.list("packingItems");
    const parents = new Set(rows.map((r) => r.parentId).filter(Boolean));
    const leaves = rows.filter((r) => !parents.has(r.id));
    m.finalCheck = {
      state: "complete",
      by: m.finalCheck.by,
      startedAt: m.finalCheck.startedAt,
      completedAt: new Date(clock()).toISOString(),
      verified: leaves.filter((r) => r.verified).length,
      total: leaves.length,
    };
    await store.setMeta("packingMeta", m);
    return new ChangeSet().meta(m).result(m);
  }

  // ─────────────── production jobs and "Mark as cut" (ApiRaw.gs) ───────────────

  /** Saves planned parts from the cut planner. jobs: [{ partName, materialTypeId, thickness, partLength, ... }] */
  async function productionCreate(jobs: unknown[]): Promise<WriteResult<Row[]>> {
    if (!Array.isArray(jobs) || !jobs.length || jobs.length > 300) throw new InventoryError("BAD_REQUEST", "Invalid list of parts.");
    const c = ctx();
    const raw = await c.byId("rawMaterials");
    const now = nowIso();
    const recs: Row[] = [];
    for (const j of jobs) {
      const clean = await validateInput("production", Object.assign({ status: "planned" }, j), "create", null, c);
      if (clean.rawMaterialId) {
        const piece = raw.get(String(clean.rawMaterialId));
        if (!piece || piece.archivedAt) throw new InventoryError("CONFLICT", "A stock piece in this plan no longer exists. Run the planner again.");
        if ((Number(clean.copyIndex) || 0) >= (Number(piece.quantity) || 1)) {
          throw new InventoryError("CONFLICT", "The stock changed since this plan was made. Run the planner again.");
        }
      }
      recs.push(Object.assign(blankRecord("production"), clean, { id: newId(TABLES.production.prefix), createdAt: now, updatedAt: now }));
    }
    await store.insert("production", recs);
    return new ChangeSet().up("production", ...recs).result(recs);
  }

  /** Edits a job (status, notes, name...). Clearing rawMaterialId un-assigns it. */
  async function productionUpdate(id: string, changes: unknown): Promise<WriteResult<Row>> {
    assertId(id);
    const rec = await store.get("production", id);
    if (!rec) throw new InventoryError("NOT_FOUND", "This job no longer exists.");
    const clean = await validateInput("production", changes, "update", rec, ctx());
    const next: Row = { ...rec, ...clean, updatedAt: nowIso() };
    if ("rawMaterialId" in clean && !clean.rawMaterialId) {
      next.placement = {};
      next.copyIndex = null;
    }
    await store.replace("production", next);
    return new ChangeSet().up("production", next).result(next);
  }

  async function productionDelete(ids: string[]): Promise<WriteResult<string[]>> {
    checkIdList(ids, 500);
    const existing = new Set((await store.list("production")).map((r) => r.id));
    const removed = ids.filter((id) => existing.has(id));
    if (removed.length) await store.remove("production", removed);
    return new ChangeSet().rm("production", removed).result(removed);
  }

  /**
   * "Mark as cut".
   *   pieceId, pieceVersion: the stock piece (version must match what the browser saw; null skips the check)
   *   copyIndex:             which identical copy (0 for pieces with quantity 1)
   *   cutJobIds:             planned jobs on that copy being cut now
   *   leftovers:             [{ points }] what remains (worked out in the browser), largest first
   *   reassign:              { jobId: leftoverIndex | -1 } for the OTHER planned jobs on that copy
   *   flagLeftovers:         mark the leftover pieces "needs check", so the next audit measures them (the Production
   *                          app does this; Inventory's own screen leaves it off, as the old app did)
   * Quantity 1: the piece's shape becomes the biggest leftover, other leftovers become new pieces, nothing left
   * archives it. Quantity > 1 (identical sheets): quantity goes down by 1 and the leftovers become new pieces.
   */
  async function rawCut(
    pieceId: string,
    pieceVersion: number | null,
    copyIndex: number,
    cutJobIds: string[],
    leftovers: { points?: unknown }[],
    reassign: Record<string, number> | null,
    flagLeftovers = false,
  ): Promise<WriteResult<{ piece: Row; newPieces: Row[]; jobs: Row[] }>> {
    assertId(pieceId);
    checkIdList(cutJobIds, 500);
    if (!Array.isArray(leftovers) || leftovers.length > 20) throw new InventoryError("BAD_REQUEST", "Invalid leftovers.");
    const shapes = leftovers.map((l) => {
      try {
        return checkShape({ kind: "traced", points: l && l.points, edges: [] });
      } catch (e) {
        if (e instanceof FieldError) throw new InventoryError("VALIDATION", "A leftover shape was invalid: " + e.message);
        throw e;
      }
    });
    const map: Record<string, unknown> = reassign && typeof reassign === "object" ? reassign : {};
    const found = await store.get("rawMaterials", pieceId);
    if (!found || found.archivedAt) throw new InventoryError("NOT_FOUND", "This stock piece no longer exists.");
    const piece: Row = { ...found };
    const staleMsg = "This stock piece was changed by someone else. Refresh and try again.";
    if (pieceVersion !== null && pieceVersion !== piece.version) throw new InventoryError("CONFLICT", staleMsg, { current: found });
    const qty = Number(piece.quantity) || 1;
    const ci = Number(copyIndex) || 0;
    if (!Number.isInteger(ci) || ci < 0 || ci >= qty) throw new InventoryError("BAD_REQUEST", "Invalid stock copy.");

    const jobs = await store.list("production");
    const jobsById = new Map(jobs.map((j) => [j.id, j]));
    const cutting = cutJobIds.map((id) => {
      const j = jobsById.get(id);
      if (!j || j.rawMaterialId !== pieceId || (j.copyIndex || 0) !== ci || j.status !== "planned") {
        throw new InventoryError("CONFLICT", "That job isn’t planned on this piece any more. Refresh and try again.");
      }
      return j;
    });
    const cutSet = new Set(cutJobIds);
    const now = nowIso();

    // Leftovers -> this piece and/or new pieces.
    const leftoverIds: string[] = [];
    const newRows: Row[] = [];
    const makeRow = (shape: Record<string, unknown>): string => {
      const r: Row = Object.assign(blankRecord("rawMaterials"), {
        id: newId(TABLES.rawMaterials.prefix),
        materialTypeId: piece.materialTypeId,
        thickness: piece.thickness,
        thicknessValue: piece.thicknessValue,
        thicknessUnitId: piece.thicknessUnitId,
        dimUnitId: piece.dimUnitId,
        quantity: 1,
        locationId: piece.locationId,
        shape,
        description: "Leftover from cutting " + cutting.map((j) => j.partName).join(", ") + " (" + now.slice(0, 10) + ")",
        version: 1,
        createdAt: now,
        updatedAt: now,
        archivedAt: "",
        needsCheck: flagLeftovers,
      });
      deriveShapeFields(r);
      newRows.push(r);
      return r.id;
    };
    if (qty > 1) {
      piece.quantity = qty - 1;
      shapes.forEach((s) => leftoverIds.push(makeRow(s)));
    } else if (shapes.length) {
      piece.shape = shapes[0];
      if (flagLeftovers) piece.needsCheck = true;
      deriveShapeFields(piece);
      leftoverIds.push(pieceId);
      shapes.slice(1).forEach((s) => leftoverIds.push(makeRow(s)));
    } else {
      piece.archivedAt = now; // used up (restorable from Settings -> Archive)
    }
    const prevVersion = Number(found.version) || 0;
    piece.version = prevVersion + 1;
    piece.updatedAt = now;
    if (!(await store.replace("rawMaterials", piece, prevVersion))) {
      const current = await store.get("rawMaterials", pieceId);
      if (!current) throw new InventoryError("NOT_FOUND", "This stock piece no longer exists.");
      throw new InventoryError("CONFLICT", staleMsg, { current });
    }
    if (newRows.length) await store.insert("rawMaterials", newRows);

    // Jobs: mark the cut ones; move the others to their leftover.
    const changed: Row[] = [];
    for (const orig of jobs) {
      if (orig.rawMaterialId !== pieceId) continue;
      const j: Row = { ...orig };
      if (cutSet.has(j.id)) {
        j.status = "cut";
        j.updatedAt = now;
        changed.push(j);
        continue;
      }
      if (j.status !== "planned") continue;
      const jc = j.copyIndex || 0;
      if (qty > 1 && jc > ci) {
        j.copyIndex = jc - 1;
        changed.push(j);
        continue;
      }
      if (qty > 1 && jc < ci) continue;
      const idx = Object.prototype.hasOwnProperty.call(map, j.id) ? Number(map[j.id]) : -1;
      if (idx >= 0 && idx < leftoverIds.length) {
        j.rawMaterialId = leftoverIds[idx];
        j.copyIndex = 0;
      } else {
        j.rawMaterialId = "";
        j.copyIndex = null;
        j.placement = {};
      }
      j.updatedAt = now;
      changed.push(j);
    }
    for (const j of changed) await store.replace("production", j);

    return new ChangeSet()
      .up("rawMaterials", piece, ...newRows)
      .up("production", ...changed)
      .result({ piece, newPieces: newRows, jobs: changed });
  }

  return {
    store,
    loadAll,
    listItems,
    create,
    update,
    adjustQuantity,
    setNeedsCheck,
    archive,
    restore,
    deletePermanently,
    purgeArchived,
    removeSetting,
    reorder,
    activeAudit,
    startAudit,
    setAuditCount,
    finalizeAudit,
    cancelAudit,
    packingSetInfo,
    packingReset,
    packingCreate,
    packingUpdate,
    packingDelete,
    packingClearSeason,
    packingSetPacked,
    packingNoteAdd,
    packingNoteSet,
    packingNoteDelete,
    finalCheckClaim,
    finalCheckPing,
    finalCheckPause,
    finalCheckVerify,
    finalCheckComplete,
    productionCreate,
    productionUpdate,
    productionDelete,
    rawCut,
    /** The time used for the final check (Date.now() unless a test passed `now`). */
    now: clock,
  };
}

/** A final check nobody has pinged for this long shows as paused. */
export const FINAL_CHECK_STALE_MS = 90 * 1000;

/** True when the stored check is owned by someone who is still on the page. */
export function finalCheckLive(fc: FinalCheckInfo, now: number): boolean {
  const seen = Date.parse(fc.lastSeen || "");
  return fc.state === "active" && isFinite(seen) && now - seen <= FINAL_CHECK_STALE_MS;
}

/** What browsers see (ApiPacking.gs publicPackingMeta_): no token, and a stale active check shows as paused. */
export function publicPackingMeta(m: PackingMeta, now: number): PackingMeta {
  const fc: FinalCheckInfo = { ...(m.finalCheck || { state: "none" }) };
  delete fc.token;
  if (fc.state === "active" && !finalCheckLive(fc, now)) {
    fc.state = "paused";
    fc.pausedReason = "left";
  }
  return { ...m, finalCheck: fc };
}

function newToken(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return newId("FC") + newId("FC") + newId("FC");
}

function checkIdList(ids: unknown, max: number): asserts ids is string[] {
  if (!Array.isArray(ids) || !ids.length || ids.length > max) throw new InventoryError("BAD_REQUEST", "Invalid selection.");
  ids.forEach(assertId);
}

export type InventoryService = ReturnType<typeof createInventoryService>;
export { PACKING_SECTIONS };
