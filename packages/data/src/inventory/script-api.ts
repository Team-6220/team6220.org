// The old Apps Script server functions (apiGetAll, apiCreate, apiAdjustQuantity, ...) with the SAME arguments and
// the SAME replies, running on top of the inventory service (and so on Wix or the mock store).
//
// The original inventory UI (apps/inventory/ui, copied unchanged from backend/apps-script/inventory) calls these
// through `google.script.run`, which apps/inventory/shim provides. Every reply is exactly what Util.gs api_() sent:
//   { ok: true, data }   or   { ok: false, error: { code, message, details } }
// with the same error codes (VALIDATION, CONFLICT, NOT_FOUND, IN_USE, ARCHIVED, BUSY, BAD_REQUEST, ...).
//
// Change counters ("versions"). Apps Script kept one counter per table in Script Properties and the UI polls
// apiGetChanges(knownVersions) to fetch only tables whose counter moved. Wix has no such counter, so this file keeps
// one per browser tab: a write bumps the tables it changed (so the UI sees "only my own change", as before), and
// apiGetChanges re-reads the tables and bumps any whose content differs from what this tab last saw.

import { TABLE_KEYS, type TableKey } from "./schema.ts";
import { publicPackingMeta, type InventoryService } from "./service.ts";
import type { Changes, PackingMeta, Row } from "./types.ts";
import { InventoryError } from "./util.ts";

export type ScriptReply =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details: unknown } };

/** Shown when the UI tries to add, remove or fetch a photo (photos lived in Google Drive). */
export const PHOTOS_UNAVAILABLE = "Photos aren’t available on the new site yet.";

/** Same text as Util.gs for anything unexpected. */
const SERVER_MESSAGE = "Something went wrong on the server. Please try again.";
/** Wix refused the request (usually an expired sign-in, or collection permissions). */
const FORBIDDEN_MESSAGE = "Wix didn’t allow that. Your sign-in may have expired: sign in again at /apps, then reload this page.";

type VersionKey = TableKey | "packingMeta";
const VERSION_KEYS: VersionKey[] = [...TABLE_KEYS, "packingMeta"];

/** Functions that only read: they don't wait for writes in progress. */
const READS = new Set(["apiGetAll", "apiGetChanges", "apiGetImage"]);

export interface ScriptApiOptions {
  /** Called with errors that become a SERVER reply (default: console.error). */
  onUnexpectedError?: (fn: string, error: unknown) => void;
}

/** JSON text with object keys sorted, so two equal records always give the same text. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return (
      "{" +
      Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stable(o[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(v) ?? "null";
}

function signRows(rows: Map<string, Row>): string {
  return stable([...rows.keys()].sort().map((id) => rows.get(id)));
}

/** True for errors that mean "couldn't reach Wix" (the UI then says "Check your connection" and retries reads). */
export function isNetworkError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; message?: string; code?: string };
  const msg = String(err.message ?? "");
  if (err.name === "TypeError" && /fetch|network|load failed/i.test(msg)) return true;
  if (err.name === "NetworkError" || err.name === "AbortError" || err.name === "TimeoutError") return true;
  return /failed to fetch|networkerror|network request failed|load failed|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(msg);
}

/** Per-tab change counters (see the comment at the top). */
class Versions {
  ver = {} as Record<VersionKey, number>;
  private sig = {} as Record<VersionKey, string | null>;
  private cache = {} as Record<TableKey, Map<string, Row> | null>;
  private wroteAt = {} as Record<VersionKey, number>;
  /** Counts finished writes. */
  gen = 0;

  constructor() {
    for (const k of VERSION_KEYS) {
      this.ver[k] = 0;
      this.sig[k] = null;
      this.wroteAt[k] = 0;
    }
  }

  snapshot(): Record<VersionKey, number> {
    return { ...this.ver };
  }

  /**
   * Records freshly read data. Bumps the counter of every table whose content changed since this tab last saw it
   * (always, when `all`). Tables written by this tab after `startGen` are skipped: the read may predate the write.
   * Returns the keys that were skipped.
   */
  observe(tables: Record<TableKey, Row[]>, meta: PackingMeta, startGen: number, all: boolean): Set<VersionKey> {
    const skipped = new Set<VersionKey>();
    for (const k of TABLE_KEYS) {
      if (this.wroteAt[k] > startGen) {
        skipped.add(k);
        continue;
      }
      const m = new Map(tables[k].map((r) => [r.id, r]));
      const s = signRows(m);
      if (all || this.sig[k] !== s) this.ver[k]++;
      this.sig[k] = s;
      this.cache[k] = m;
    }
    if (this.wroteAt.packingMeta > startGen) skipped.add("packingMeta");
    else {
      const s = stable(meta);
      if (all || this.sig.packingMeta !== s) this.ver.packingMeta++;
      this.sig.packingMeta = s;
    }
    return skipped;
  }

  /** A write by this tab: bump what it changed, and remember the result so the next poll doesn't re-send it. */
  wrote(changes: Changes, publicMeta: (m: PackingMeta) => PackingMeta, extra: VersionKey[] = []): void {
    this.gen++;
    const keys = new Set<VersionKey>(extra);
    for (const k of Object.keys(changes.upserts) as TableKey[]) if (changes.upserts[k]?.length) keys.add(k);
    for (const k of Object.keys(changes.removals) as TableKey[]) if (changes.removals[k]?.length) keys.add(k);
    if (changes.packingMeta) keys.add("packingMeta");
    for (const k of keys) {
      this.ver[k]++;
      this.wroteAt[k] = this.gen;
      if (k === "packingMeta") {
        this.sig.packingMeta = changes.packingMeta ? stable(publicMeta(changes.packingMeta)) : null;
        continue;
      }
      const m = this.cache[k];
      if (!m) {
        this.sig[k] = null;
        continue;
      }
      for (const r of changes.upserts[k] ?? []) m.set(r.id, r);
      for (const id of changes.removals[k] ?? []) m.delete(id);
      this.sig[k] = signRows(m);
    }
  }
}

/** Deep copy through JSON, like Apps Script's own argument / reply passing (undefined stays undefined). */
function viaJson<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...args: any[]) => Promise<unknown>;

/**
 * The Apps Script API for one browser tab. `call(name, args)` resolves with the reply envelope; it rejects only
 * when Wix couldn't be reached (google.script.run's failure handler, which the UI shows as a connection problem).
 */
export function createScriptApi(svc: InventoryService, opts: ScriptApiOptions = {}) {
  const versions = new Versions();
  const pub = (m: PackingMeta) => publicPackingMeta(m, svc.now());
  const onUnexpected = opts.onUnexpectedError ?? ((fn: string, e: unknown) => console.error(`[inventory] ${fn} failed`, e));

  /** Runs a write and returns its reply data plus the new versions. */
  async function write<T>(run: Promise<{ value: T; changes: Changes }>, reply: (value: T) => Record<string, unknown>, extra: VersionKey[] = []) {
    const r = await run;
    versions.wrote(r.changes, pub, extra);
    return { ...reply(r.value), versions: versions.snapshot() };
  }

  const fns: Record<string, Fn> = {
    // ── loading (ApiInventory.gs) ──
    async apiGetAll() {
      const startGen = versions.gen;
      const snap = await svc.loadAll();
      const packingMeta = pub(snap.packingMeta);
      versions.observe(snap.tables, packingMeta, startGen, true);
      return { versions: versions.snapshot(), tables: snap.tables, packingMeta, serverTime: new Date().toISOString() };
    },
    async apiGetChanges(known: Record<string, number> | null) {
      const k0 = known && typeof known === "object" ? known : {};
      const startGen = versions.gen;
      const snap = await svc.loadAll();
      const packingMeta = pub(snap.packingMeta);
      const skipped = versions.observe(snap.tables, packingMeta, startGen, false);
      const v = versions.snapshot();
      const tables: Record<string, Row[]> = {};
      for (const k of TABLE_KEYS) if (!skipped.has(k) && k0[k] !== v[k]) tables[k] = snap.tables[k];
      const out: Record<string, unknown> = { versions: v, tables };
      if (!skipped.has("packingMeta") && k0.packingMeta !== v.packingMeta) out.packingMeta = packingMeta;
      return out;
    },

    // ── inventory records and settings (ApiInventory.gs, ApiSettings.gs) ──
    apiCreate: (key, input) => write(svc.create(key, input), (record) => ({ record })),
    apiUpdate: (key, id, changes, expectedVersion) => write(svc.update(key, id, changes, expectedVersion), (record) => ({ record })),
    apiAdjustQuantity: (key, id, delta) => write(svc.adjustQuantity(key, id, delta), (v) => ({ record: v.record, clamped: v.clamped })),
    apiSetNeedsCheck: (key, id, value) => write(svc.setNeedsCheck(key, id, value), (record) => ({ record })),
    apiArchive: (key, id) => write(svc.archive(key, id), (record) => ({ record })),
    apiRestore: (key, id) => write(svc.restore(key, id), (record) => ({ record })),
    apiDeletePermanently: (key, id) => write(svc.deletePermanently(key, id), (id2) => ({ id: id2 })),
    apiRemoveSetting: (key, id, force) => write(svc.removeSetting(key, id, force), (v) => ({ removedIds: v.removedIds, cleared: v.cleared }), [key]),
    apiReorder: (key, orderedIds) => write(svc.reorder(key, orderedIds), () => ({})),

    // ── audits (ApiAudit.gs) ──
    apiStartAudit: (name, sections) =>
      write(svc.startAudit(name, sections), (v) => ({ session: v.session, count: v.count }), ["auditSessions", "auditItems"]),
    apiSetAuditCount: (auditItemId, status, countedQty) => write(svc.setAuditCount(auditItemId, status, countedQty), (record) => ({ record })),
    apiFinalizeAudit: (auditId, resolutions) =>
      write(svc.finalizeAudit(auditId, resolutions), (v) => ({ session: v.session, summary: v.summary }), ["auditItems", "auditSessions"]),
    apiCancelAudit: (auditId) => write(svc.cancelAudit(auditId), (session) => ({ session }), ["auditItems", "auditSessions"]),

    // ── packing list (ApiPacking.gs) ──
    apiPackingSetInfo: (info) => write(svc.packingSetInfo(info), (m) => ({ packingMeta: pub(m) })),
    apiPackingReset: async (eventName) => {
      const r = await svc.packingReset(eventName);
      versions.wrote(r.changes, pub, ["packingItems", "packingMeta"]);
      return { cleared: r.value, packingMeta: pub(r.changes.packingMeta!), versions: versions.snapshot() };
    },
    apiPackingCreate: (input) => write(svc.packingCreate(input), (record) => ({ record })),
    apiPackingUpdate: (id, changes) => write(svc.packingUpdate(id, changes), (record) => ({ record })),
    apiPackingDelete: (id) => write(svc.packingDelete(id), (removedIds) => ({ removedIds })),
    apiPackingClearSeason: () => write(svc.packingClearSeason(), (removed) => ({ removed }), ["packingItems"]),
    apiPackingSetPacked: (ids, value) => write(svc.packingSetPacked(ids, value), (records) => ({ records }), ["packingItems"]),
    apiPackingNoteAdd: (text) => write(svc.packingNoteAdd(text), (record) => ({ record })),
    apiPackingNoteSet: (id, done) => write(svc.packingNoteSet(id, done), (record) => ({ record })),
    apiPackingNoteDelete: (id) => write(svc.packingNoteDelete(id), (id2) => ({ id: id2 })),
    apiFinalCheckClaim: (name, restart) =>
      write(svc.finalCheckClaim(name, restart), (v) => ({ token: v.token, packingMeta: pub(v.packingMeta) })),
    apiFinalCheckPing: (token) => write(svc.finalCheckPing(token), (m) => ({ packingMeta: pub(m) })),
    apiFinalCheckPause: (token) => write(svc.finalCheckPause(token), (m) => ({ packingMeta: pub(m) })),
    apiFinalCheckVerify: async (token, ids, value) => {
      const r = await svc.finalCheckVerify(token, ids, value);
      versions.wrote(r.changes, pub, ["packingItems", "packingMeta"]);
      return { records: r.value, packingMeta: pub(r.changes.packingMeta!), versions: versions.snapshot() };
    },
    apiFinalCheckComplete: (token) => write(svc.finalCheckComplete(token), (m) => ({ packingMeta: pub(m) })),

    // ── production jobs and "Mark as cut" (ApiRaw.gs) ──
    apiProductionCreate: (jobs) => write(svc.productionCreate(jobs), (records) => ({ records }), ["production"]),
    apiProductionUpdate: (id, changes) => write(svc.productionUpdate(id, changes), (record) => ({ record })),
    apiProductionDelete: (ids) => write(svc.productionDelete(ids), (removedIds) => ({ removedIds }), ["production"]),
    apiRawCut: (pieceId, pieceVersion, copyIndex, cutJobIds, leftovers, reassign) =>
      write(
        svc.rawCut(pieceId, pieceVersion, copyIndex, cutJobIds, leftovers, reassign),
        (v) => ({ piece: v.piece, newPieces: v.newPieces, jobs: v.jobs }),
        ["rawMaterials", "production"],
      ),

    // ── photos (ApiImages.gs): they were Google Drive files; moving them is a later step ──
    async apiUploadImage() {
      throw new InventoryError("NOT_SETUP", PHOTOS_UNAVAILABLE);
    },
    async apiRemoveImage() {
      throw new InventoryError("NOT_SETUP", PHOTOS_UNAVAILABLE);
    },
    async apiGetImage() {
      throw new InventoryError("NOT_SETUP", PHOTOS_UNAVAILABLE);
    },
  };

  // Apps Script ran every write under one lock. Here writes from this tab run one at a time, in order.
  let writeChain: Promise<unknown> = Promise.resolve();

  async function call(name: string, args: unknown[] = []): Promise<ScriptReply> {
    const fn = Object.prototype.hasOwnProperty.call(fns, name) ? fns[name] : null;
    if (!fn) return { ok: false, error: { code: "BAD_REQUEST", message: `Unknown server function ${name}.`, details: null } };
    const copied = args.map((a) => viaJson(a));
    const run = async (): Promise<ScriptReply> => {
      try {
        return { ok: true, data: viaJson(await fn(...copied)) };
      } catch (e) {
        if (e instanceof InventoryError) {
          return { ok: false, error: { code: e.code, message: e.message, details: viaJson(e.details ?? null) } };
        }
        if (isNetworkError(e)) throw e;
        onUnexpected(name, e);
        const cause = e instanceof Error ? e.message : String(e);
        if (/WDE0027|permission|forbidden|unauthori[sz]ed/i.test(cause)) {
          return { ok: false, error: { code: "FORBIDDEN", message: FORBIDDEN_MESSAGE, details: { cause } } };
        }
        return { ok: false, error: { code: "SERVER", message: SERVER_MESSAGE, details: { cause } } };
      }
    };
    if (READS.has(name)) return run();
    const p = writeChain.then(run, run);
    writeChain = p.catch(() => undefined);
    return p;
  }

  return { call, functions: Object.keys(fns), versions: () => versions.snapshot() };
}

export type ScriptApi = ReturnType<typeof createScriptApi>;
