// In-memory adapter: used by `pnpm dev`, the GitHub Pages preview until the Wix collections exist, and tests.
// Nothing is saved; a page reload starts again from the seed data.

import { TABLE_KEYS, type MetaKey, type TableKey } from "./schema.ts";
import type { InventoryStore, Row, Tables } from "./types.ts";
import { deepClone } from "./util.ts";

export interface MemoryStoreOptions {
  /** Starting data (deep-copied). */
  seed?: Partial<Tables>;
  meta?: Partial<Record<MetaKey, unknown>>;
  /** Artificial delay per call in ms, to make loading states visible in dev. */
  latencyMs?: number;
}

export class MemoryStore implements InventoryStore {
  readonly kind = "memory" as const;
  private data = new Map<TableKey, Map<string, Row>>();
  private meta = new Map<MetaKey, unknown>();
  private latencyMs: number;

  constructor(opts: MemoryStoreOptions = {}) {
    this.latencyMs = opts.latencyMs ?? 0;
    for (const k of TABLE_KEYS) {
      const m = new Map<string, Row>();
      for (const r of opts.seed?.[k] ?? []) m.set(r.id, deepClone(r));
      this.data.set(k, m);
    }
    for (const [k, v] of Object.entries(opts.meta ?? {})) this.meta.set(k as MetaKey, deepClone(v));
  }

  private async tick(): Promise<void> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  private table(k: TableKey): Map<string, Row> {
    const t = this.data.get(k);
    if (!t) throw new Error(`Unknown table ${k}`);
    return t;
  }

  async list(table: TableKey): Promise<Row[]> {
    await this.tick();
    return [...this.table(table).values()].map((r) => deepClone(r));
  }

  async get(table: TableKey, id: string): Promise<Row | null> {
    await this.tick();
    const r = this.table(table).get(id);
    return r ? deepClone(r) : null;
  }

  async insert(table: TableKey, rows: Row[]): Promise<void> {
    await this.tick();
    const t = this.table(table);
    for (const r of rows) {
      if (t.has(r.id)) throw new Error(`Duplicate ID ${r.id} in ${table}`);
    }
    for (const r of rows) t.set(r.id, deepClone(r));
  }

  async replace(table: TableKey, row: Row, ifVersion?: number): Promise<boolean> {
    await this.tick();
    const t = this.table(table);
    const cur = t.get(row.id);
    if (!cur) return false;
    if (typeof ifVersion === "number" && cur.version !== ifVersion) return false;
    t.set(row.id, deepClone(row));
    return true;
  }

  async increment(table: TableKey, id: string, field: string, delta: number, set: Record<string, unknown>): Promise<Row | null> {
    await this.tick();
    const t = this.table(table);
    const cur = t.get(id);
    if (!cur) return null;
    cur[field] = (Number(cur[field]) || 0) + delta;
    cur.version = (Number(cur.version) || 0) + 1;
    Object.assign(cur, deepClone(set));
    return deepClone(cur);
  }

  async remove(table: TableKey, ids: string[]): Promise<void> {
    await this.tick();
    const t = this.table(table);
    for (const id of ids) t.delete(id);
  }

  async getMeta(key: MetaKey): Promise<unknown> {
    await this.tick();
    return deepClone(this.meta.get(key) ?? null);
  }

  async setMeta(key: MetaKey, value: unknown): Promise<void> {
    await this.tick();
    this.meta.set(key, deepClone(value));
  }
}
