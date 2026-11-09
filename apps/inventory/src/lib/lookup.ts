// Name lookups over the loaded tables (items store IDs, so renaming a setting updates every item).
import type { Row, Tables, TableKey, ListKey } from "@team6220/data/inventory";

export const natural = (a: unknown, b: unknown) => String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });

export interface Lookup {
  tables: Tables;
  get(key: TableKey, id: string): Row | undefined;
  /** Active (not archived) rows. */
  rows(key: TableKey): Row[];
  /** Rows in their saved order (settings, packing). */
  sorted(key: TableKey, filter?: (r: Row) => boolean): Row[];
  name(key: TableKey, id: string): string;
  listVal(id: string): string;
  listOrder(id: string): number;
  listOptions(listKey: ListKey): Row[];
  locationLabel(id: string): string;
  /** Areas with their containers, in order. */
  locationTree(): { area: Row; children: Row[] }[];
  /** A location plus, for an area, all containers in it. */
  locationAndChildren(ids: string[]): Set<string>;
  withUnit(v: unknown, unitId: string): string;
}

export function makeLookup(tables: Tables): Lookup {
  const idx = new Map<TableKey, Map<string, Row>>();
  const index = (key: TableKey) => {
    let m = idx.get(key);
    if (!m) {
      m = new Map((tables[key] ?? []).map((r) => [r.id, r]));
      idx.set(key, m);
    }
    return m;
  };
  const sorted = (key: TableKey, filter?: (r: Row) => boolean) =>
    (tables[key] ?? []).filter((r) => !filter || filter(r)).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || natural(a.name, b.name));
  const L: Lookup = {
    tables,
    get: (key, id) => (id ? index(key).get(id) : undefined),
    rows: (key) => (tables[key] ?? []).filter((r) => !r.archivedAt),
    sorted,
    name: (key, id) => (id ? (index(key).get(id)?.name ?? "") : ""),
    listVal: (id) => (id ? (index("lists").get(id)?.value ?? "") : ""),
    listOrder: (id) => index("lists").get(id)?.sortOrder ?? 1e9,
    listOptions: (listKey) => sorted("lists", (r) => r.listKey === listKey),
    locationLabel(id) {
      const loc = L.get("locations", id);
      if (!loc) return "";
      const parent = loc.parentId ? L.get("locations", loc.parentId) : undefined;
      return parent ? `${parent.name} → ${loc.name}` : loc.name;
    },
    locationTree() {
      return sorted("locations", (r) => !r.parentId).map((area) => ({ area, children: sorted("locations", (r) => r.parentId === area.id) }));
    },
    locationAndChildren(ids) {
      const set = new Set(ids);
      for (const id of ids) for (const l of tables.locations ?? []) if (l.parentId === id) set.add(l.id);
      return set;
    },
    withUnit(v, unitId) {
      if (v === "" || v === null || v === undefined) return "";
      const u = L.listVal(unitId);
      return u ? `${v} ${u}` : String(v);
    },
  };
  return L;
}

export function fmtQty(n: unknown): string {
  if (n === null || n === undefined || n === "") return "—";
  return (Math.round(Number(n) * 1000) / 1000).toLocaleString();
}

export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? one + "s")}`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
