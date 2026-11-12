// Real store: Wix CMS collections, read and written as the signed-in member (Phase 1: from the browser).
// Members can only write the collections whose Wix permissions allow it; everything protected goes through
// the ops API instead (see index.ts, callOps).
import { wix } from "../wix";
import type { Draft, Item, Store } from "./types";

interface WixResult {
  items: Item[];
  hasNext(): boolean;
  next(): Promise<WixResult>;
}
/** The part of the @wix/data `items` module this store uses. */
interface WixItems {
  query(collection: string): { limit(n: number): { find(options?: { consistentRead?: boolean }): Promise<WixResult> } };
  save(collection: string, item: Record<string, unknown>): Promise<Item>;
  remove(collection: string, id: string): Promise<unknown>;
}

const PAGE = 1000; // the most Wix returns per page

let items: Promise<WixItems> | undefined;
function wixItems(): Promise<WixItems> {
  // @wix/data is loaded only here, so demo builds don't download it.
  items ??= import("@wix/data").then((m) => (wix() as unknown as { use(x: unknown): WixItems }).use(m.items));
  return items;
}

export const wixStore: Store = {
  async list<T extends Item>(collection: string): Promise<T[]> {
    const api = await wixItems();
    const out: Item[] = [];
    let page = await api.query(collection).limit(PAGE).find({ consistentRead: true });
    for (;;) {
      out.push(...page.items);
      if (!page.hasNext()) break;
      page = await page.next();
    }
    return out as T[];
  },
  async save<T extends Item>(collection: string, item: Draft<T>): Promise<T> {
    return (await (await wixItems()).save(collection, item as Record<string, unknown>)) as T;
  },
  async remove(collection: string, id: string): Promise<void> {
    await (await wixItems()).remove(collection, id);
  },
};
