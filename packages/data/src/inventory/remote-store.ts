// The browser's inventory store on the Wix build (https://github.com/Team-6220/team6220.org/wiki/History-Phase-2, issue #100): reads come straight from the Wix
// collections (any signed-in member may read), every change goes to POST /api/inventory, because the collections only
// let the server write. Same InventoryStore interface as WixStore, so the app and the service layer don't change.
import { META_COLLECTION, type MetaKey, type TableKey } from "./schema.ts";
import type { InventoryStore, Row } from "./types.ts";

export type InventoryCall = (body: Record<string, unknown>) => Promise<Record<string, any>>;

/** Sends a change to /api/inventory with the session cookie. Throws an Error with the server's readable message. */
export function postInventory(fetchImpl: typeof fetch = (...a) => fetch(...a)): InventoryCall {
  return async (body) => {
    let res: Response;
    try {
      res = await fetchImpl("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
      });
    } catch {
      throw new Error("Couldn't reach the team server. Check the internet connection.");
    }
    let data: Record<string, any> = {};
    try {
      data = await res.json();
    } catch {
      // not JSON: handled below
    }
    if (!res.ok) throw new Error(data?.error?.message ?? `The team server answered ${res.status}. Try again.`);
    return data;
  };
}

export class RemoteWriteStore implements InventoryStore {
  readonly kind = "wix" as const;
  constructor(
    /** Reads (list, get, getMeta): the member's own Wix client. */
    private readonly reads: Pick<InventoryStore, "list" | "get" | "getMeta">,
    private readonly call: InventoryCall,
  ) {}

  list(table: TableKey) {
    return this.reads.list(table);
  }
  get(table: TableKey, id: string) {
    return this.reads.get(table, id);
  }
  getMeta(key: MetaKey) {
    return this.reads.getMeta(key);
  }

  async insert(table: TableKey, rows: Row[]): Promise<void> {
    await this.call({ action: "insert", table, rows });
  }
  async replace(table: TableKey, row: Row, ifVersion?: number): Promise<boolean> {
    const res = await this.call({ action: "replace", table, row, ifVersion });
    return res.saved === true;
  }
  async increment(table: TableKey, id: string, field: string, delta: number, set: Record<string, unknown>): Promise<Row | null> {
    const res = await this.call({ action: "increment", table, id, field, delta, set });
    return (res.row as Row | null) ?? null;
  }
  async remove(table: TableKey, ids: string[]): Promise<void> {
    await this.call({ action: "remove", table, ids });
  }
  async setMeta(key: MetaKey, value: unknown): Promise<void> {
    await this.call({ action: "setMeta", key, value });
  }
}

export { META_COLLECTION };
