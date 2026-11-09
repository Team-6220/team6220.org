// Wix adapter: stores inventory records in Wix CMS collections through the @wix/data items API,
// using the signed-in member's Wix client (Phase 1: straight from the browser).
//
// Wix has no transactions or locks (Apps Script had LockService), so:
//   - record edits use a conditional update (only if `version` is unchanged) -> CONFLICT instead of overwriting;
//   - +/- quantity uses Wix's atomic incrementField, so two people taking parts at once are both counted;
//   - multi-record operations (finalizing an audit, removing a setting that is in use) are NOT atomic:
//     a failure halfway leaves the earlier writes in place. See apps/inventory/docs/DATA-MODEL.md.

import { META_COLLECTION, TABLES, type MetaKey, type TableKey } from "./schema.ts";
import type { InventoryStore, Row } from "./types.ts";
import { fromWixItem, toWixItem } from "./wix-mapping.ts";

type Item = Record<string, unknown>;

interface WixResult {
  items: Item[];
  hasNext(): boolean;
  next(): Promise<WixResult>;
}
interface WixQuery {
  eq(field: string, value: unknown): WixQuery;
  limit(n: number): WixQuery;
  ascending(...fields: string[]): WixQuery;
  find(options?: { consistentRead?: boolean }): Promise<WixResult>;
}
interface WixPatch {
  incrementField(field: string, by: number): WixPatch;
  setField(field: string, value: unknown): WixPatch;
  run(options?: { condition?: unknown }): Promise<Item | null>;
}
interface WixFilter {
  eq(field: string, value: unknown): WixFilter;
}
interface WixBulkResult {
  errors?: { code?: string; message?: string }[];
}

/** The subset of the @wix/data `items` module this adapter uses (bound to a member's client). */
export interface WixItemsApi {
  query(collectionId: string): WixQuery;
  get(collectionId: string, itemId: string, options?: { consistentRead?: boolean }): Promise<Item | null>;
  save(collectionId: string, item: Item): Promise<Item>;
  bulkInsert(collectionId: string, items: Item[]): Promise<WixBulkResult>;
  update(collectionId: string, item: Item, options?: { condition?: unknown }): Promise<Item | null>;
  bulkRemove(collectionId: string, itemIds: string[]): Promise<WixBulkResult>;
  patch(collectionId: string, itemId: string): WixPatch;
  filter(): WixFilter;
}

/** Max items per query page and per bulk request (Wix limit: 1000). */
const PAGE = 1000;

export class WixStore implements InventoryStore {
  readonly kind = "wix" as const;
  private items: WixItemsApi;
  constructor(items: WixItemsApi) {
    this.items = items;
  }

  private coll(table: TableKey): string {
    return TABLES[table].wix;
  }

  async list(table: TableKey): Promise<Row[]> {
    const out: Row[] = [];
    let res = await this.items.query(this.coll(table)).limit(PAGE).find({ consistentRead: true });
    for (;;) {
      for (const it of res.items) out.push(fromWixItem(table, it));
      if (!res.hasNext()) break;
      res = await res.next();
    }
    return out;
  }

  async get(table: TableKey, id: string): Promise<Row | null> {
    const it = await this.items.get(this.coll(table), id, { consistentRead: true });
    return it ? fromWixItem(table, it) : null;
  }

  async insert(table: TableKey, rows: Row[]): Promise<void> {
    for (let i = 0; i < rows.length; i += PAGE) {
      const chunk = rows.slice(i, i + PAGE).map((r) => toWixItem(table, r, "sdk"));
      const res = await this.items.bulkInsert(this.coll(table), chunk);
      throwBulkErrors(res, `saving to ${TABLES[table].label}`);
    }
  }

  async replace(table: TableKey, row: Row, ifVersion?: number): Promise<boolean> {
    const item = toWixItem(table, row, "sdk");
    const options = typeof ifVersion === "number" ? { condition: this.items.filter().eq("version", ifVersion) } : undefined;
    try {
      const res = await this.items.update(this.coll(table), item, options);
      if (res) return true;
    } catch (e) {
      if (!options) throw e;
    }
    // The update was refused or returned nothing: tell a version conflict apart from a real error.
    const cur = await this.get(table, row.id);
    if (!cur) return false;
    if (typeof ifVersion === "number" && cur.version !== ifVersion) return false;
    if (cur.version === row.version) return true; // it did save; Wix just didn't echo the item
    throw new Error(`Could not save ${row.id}.`);
  }

  async increment(table: TableKey, id: string, field: string, delta: number, set: Record<string, unknown>): Promise<Row | null> {
    let p = this.items.patch(this.coll(table), id).incrementField(field, delta).incrementField("version", 1);
    const asItem = toWixItem(table, { id, ...set } as Row, "sdk");
    for (const k of Object.keys(set)) p = p.setField(k, asItem[k] ?? null);
    const res = await p.run();
    return res ? fromWixItem(table, res) : this.get(table, id);
  }

  async remove(table: TableKey, ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += PAGE) {
      const res = await this.items.bulkRemove(this.coll(table), ids.slice(i, i + PAGE));
      throwBulkErrors(res, `removing from ${TABLES[table].label}`);
    }
  }

  async getMeta(key: MetaKey): Promise<unknown> {
    // Query instead of get(): a missing item (e.g. packingMeta before the first save) is a normal,
    // empty answer here, while get() makes Wix reply 404 and the browser logs a console error.
    const res = await this.items.query(META_COLLECTION).eq("_id", key).limit(1).find({ consistentRead: true });
    const it = res.items[0];
    return it ? (it.value ?? null) : null;
  }

  async setMeta(key: MetaKey, value: unknown): Promise<void> {
    await this.items.save(META_COLLECTION, { _id: key, key, value });
  }
}

function throwBulkErrors(res: WixBulkResult | undefined, what: string): void {
  const errs = res?.errors ?? [];
  if (errs.length) throw new Error(`Wix reported ${errs.length} error(s) ${what}: ${errs[0].message ?? errs[0].code ?? "unknown"}`);
}

/**
 * Builds the adapter from a member's Wix client (`createClient` from @wix/sdk, made by the login code).
 * @wix/data is loaded only here, so the mock build doesn't download it.
 */
export async function createWixStore(wixClient: unknown): Promise<WixStore> {
  const client = wixClient as { use?: (m: unknown) => unknown };
  if (!client || typeof client.use !== "function") {
    throw new Error("Inventory needs a Wix client from the login code (session.wixClient).");
  }
  const { items } = await import("@wix/data");
  return new WixStore(client.use(items) as WixItemsApi);
}
