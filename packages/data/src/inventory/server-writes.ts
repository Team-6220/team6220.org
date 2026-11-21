// The inventory's WRITES, run on the server (https://github.com/Team-6220/team6220.org/wiki/History-Phase-2, issue #100). The inventory collections only let the server
// change data (admin-only write), so a stranger who signs up can't edit or wipe the team's inventory from a browser.
// The browser still READS the collections directly (any signed-in member may read), and sends every change here.
//
// Same behaviour as WixStore (wix-store.ts): version-checked replace, atomic +/- quantity, bulk insert and remove.
// The Wix calls come in as plain functions (`fns`) so they can be elevated on Wix hosting and faked in tests.
import { META_COLLECTION, TABLES, type MetaKey, type TableKey } from "./schema.ts";
import type { Row } from "./types.ts";
import { fromWixItem, toWixItem } from "./wix-mapping.ts";

type Item = Record<string, unknown>;

/** The @wix/data `items` functions the writes use, in their plain (non-builder) form. */
export interface WixItemFns {
  get(collectionId: string, itemId: string, options?: { consistentRead?: boolean }): Promise<Item | null>;
  save(collectionId: string, item: Item): Promise<Item>;
  bulkInsert(collectionId: string, items: Item[]): Promise<{ errors?: { code?: string; message?: string }[] }>;
  update(collectionId: string, item: Item, options?: { condition?: unknown }): Promise<Item | null>;
  bulkRemove(collectionId: string, itemIds: string[]): Promise<{ errors?: { code?: string; message?: string }[] }>;
  patch(collectionId: string, itemId: string, modifications: Modification[]): Promise<Item | null>;
  /** A filter that matches items whose `version` equals `version` (items.filter().eq("version", n)). */
  versionIs(version: number): unknown;
}

export type Modification = { action: "INCREMENT_FIELD" | "SET_FIELD"; fieldPath: string; value: unknown };

/** Max items per bulk request (Wix limit: 1000). */
const PAGE = 1000;

export class InventoryWrites {
  constructor(private readonly fns: WixItemFns) {}

  private coll(table: TableKey): string {
    return TABLES[table].wix;
  }

  async insert(table: TableKey, rows: Row[]): Promise<void> {
    for (let i = 0; i < rows.length; i += PAGE) {
      const chunk = rows.slice(i, i + PAGE).map((r) => toWixItem(table, r, "sdk"));
      throwBulkErrors(await this.fns.bulkInsert(this.coll(table), chunk), `saving to ${TABLES[table].label}`);
    }
  }

  /** Replaces a record; with `ifVersion`, only if the stored version still matches. False means a version conflict or a missing record. */
  async replace(table: TableKey, row: Row, ifVersion?: number): Promise<boolean> {
    const item = toWixItem(table, row, "sdk");
    const options = typeof ifVersion === "number" ? { condition: this.fns.versionIs(ifVersion) } : undefined;
    try {
      const res = await this.fns.update(this.coll(table), item, options);
      if (res) return true;
    } catch (e) {
      if (!options) throw e;
    }
    // The update was refused or returned nothing: tell a version conflict apart from a real error.
    const cur = await this.fns.get(this.coll(table), row.id, { consistentRead: true });
    if (!cur) return false;
    if (typeof ifVersion === "number" && cur.version !== ifVersion) return false;
    if (cur.version === row.version) return true; // it did save; Wix just didn't echo the item
    throw new Error(`Could not save ${row.id}.`);
  }

  /** Atomically adds `delta` to a numeric field and 1 to `version`, and sets the `set` fields. */
  async increment(table: TableKey, id: string, field: string, delta: number, set: Record<string, unknown>): Promise<Row | null> {
    const asItem = toWixItem(table, { id, ...set } as Row, "sdk");
    const modifications: Modification[] = [
      { action: "INCREMENT_FIELD", fieldPath: field, value: delta },
      { action: "INCREMENT_FIELD", fieldPath: "version", value: 1 },
      ...Object.keys(set).map((k): Modification => ({ action: "SET_FIELD", fieldPath: k, value: asItem[k] ?? null })),
    ];
    const res = await this.fns.patch(this.coll(table), id, modifications);
    if (res) return fromWixItem(table, res);
    const cur = await this.fns.get(this.coll(table), id, { consistentRead: true });
    return cur ? fromWixItem(table, cur) : null;
  }

  async remove(table: TableKey, ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += PAGE) {
      throwBulkErrors(await this.fns.bulkRemove(this.coll(table), ids.slice(i, i + PAGE)), `removing from ${TABLES[table].label}`);
    }
  }

  async setMeta(key: MetaKey, value: unknown): Promise<void> {
    await this.fns.save(META_COLLECTION, { _id: key, key, value });
  }
}

function throwBulkErrors(res: { errors?: { code?: string; message?: string }[] } | undefined, what: string): void {
  const errs = res?.errors ?? [];
  if (errs.length) throw new Error(`Wix reported ${errs.length} error(s) ${what}: ${errs[0].message ?? errs[0].code ?? "unknown"}`);
}
