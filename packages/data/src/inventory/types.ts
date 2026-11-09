import type { MetaKey, TableKey } from "./schema.ts";

/**
 * One record, shaped exactly like a row of the old Sheet after Db.gs parsed it:
 * `id` is the record ID, dates are ISO strings ('' when empty), refs are IDs ('' when empty),
 * refLists are arrays, json is an object/array, numbers are number|null, bools are booleans.
 * Fields are typed loosely on purpose: the schema in schema.ts is what defines them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = { id: string } & Record<string, any>;

export type Tables = Record<TableKey, Row[]>;

export interface FinalCheckInfo {
  state: "none" | "active" | "paused" | "complete";
  by?: string;
  startedAt?: string;
  completedAt?: string;
  verified?: number;
  total?: number;
}

export interface PackingMeta {
  event: string;
  season: string;
  roundStartedAt: string;
  finalCheck: FinalCheckInfo;
}

export interface Snapshot {
  tables: Tables;
  packingMeta: PackingMeta;
  loadedAt: string;
}

/**
 * What a write changed, so the UI can update its copy without re-reading everything
 * (Wix reads right after a write may be stale; see "eventual consistency" in DATA-MODEL.md).
 */
export interface Changes {
  upserts: Partial<Record<TableKey, Row[]>>;
  removals: Partial<Record<TableKey, string[]>>;
  packingMeta?: PackingMeta;
}

export interface WriteResult<T> {
  value: T;
  changes: Changes;
}

/**
 * The low-level storage an adapter provides. All business rules live in service.ts, on top of this,
 * so the memory adapter (dev, tests) and the Wix adapter behave the same.
 */
export interface InventoryStore {
  readonly kind: "memory" | "wix";
  list(table: TableKey): Promise<Row[]>;
  get(table: TableKey, id: string): Promise<Row | null>;
  insert(table: TableKey, rows: Row[]): Promise<void>;
  /**
   * Replaces a whole record. When `ifVersion` is a number, only writes if the stored record's `version`
   * still equals it; returns false (and writes nothing) otherwise.
   */
  replace(table: TableKey, row: Row, ifVersion?: number): Promise<boolean>;
  /**
   * Atomically adds `delta` to a numeric field and `1` to `version`, and sets the `set` fields.
   * Returns the record after the change, or null if it doesn't exist.
   */
  increment(table: TableKey, id: string, field: string, delta: number, set: Record<string, unknown>): Promise<Row | null>;
  remove(table: TableKey, ids: string[]): Promise<void>;
  getMeta(key: MetaKey): Promise<unknown>;
  setMeta(key: MetaKey, value: unknown): Promise<void>;
}

/** Who is using the app. Provided by the login code (packages/data/src/auth, built separately). */
export interface MemberSession {
  loggedIn: boolean;
  /** Display name, if known. */
  name?: string;
  /** Badge names, e.g. "Team Member", "Inventory Manager". */
  badges: string[];
  /**
   * A Wix SDK client (`createClient(...)` from @wix/sdk) carrying the member's tokens.
   * Only needed for the Wix adapter. Typed loosely so this file doesn't depend on @wix/sdk.
   */
  wixClient?: unknown;
}
