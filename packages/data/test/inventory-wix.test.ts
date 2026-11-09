import { describe, expect, it } from "vitest";
import { TABLES, TABLE_KEYS, wixCollectionDefinitions, wixTypeFor } from "../src/inventory/schema.ts";
import { fromWixItem, toWixItem } from "../src/inventory/wix-mapping.ts";
import { WixStore, type WixItemsApi } from "../src/inventory/wix-store.ts";
import { createInventoryService } from "../src/inventory/service.ts";
import { demoData } from "../src/inventory/mock-data.ts";
import type { Row } from "../src/inventory/types.ts";

describe("wix mapping", () => {
  const part: Row = {
    id: "PT-0000abcd",
    name: "Bearing",
    quantity: 4,
    categoryId: "",
    tagIds: ["TG-00000001"],
    locationId: "LO-00000001",
    supplierId: "",
    description: "",
    aliases: "",
    lowStockThreshold: null,
    imageId: "",
    needsCheck: false,
    version: 3,
    createdAt: "2026-01-02T03:04:05.000Z",
    updatedAt: "2026-02-02T03:04:05.000Z",
    archivedAt: "",
  };

  it("uses the record ID as _id and leaves out empty refs, numbers and dates", () => {
    const item = toWixItem("parts", part, "rest");
    expect(item._id).toBe("PT-0000abcd");
    expect(item).not.toHaveProperty("id");
    expect(item).not.toHaveProperty("categoryId");
    expect(item).not.toHaveProperty("lowStockThreshold");
    expect(item).not.toHaveProperty("archivedAt");
    expect(item.locationId).toBe("LO-00000001");
    expect(item.createdAt).toEqual({ $date: "2026-01-02T03:04:05.000Z" });
  });

  it("uses Date objects for the SDK", () => {
    const item = toWixItem("parts", part, "sdk");
    expect(item.createdAt).toBeInstanceOf(Date);
  });

  it("round-trips through Wix (SDK and REST shapes)", () => {
    for (const mode of ["sdk", "rest"] as const) {
      const back = fromWixItem("parts", { ...toWixItem("parts", part, mode), _owner: "x", _createdDate: new Date() });
      expect(back).toEqual(part);
    }
  });

  it("reads expanded references and missing fields", () => {
    const r = fromWixItem("tags", { _id: "TG-00000001", name: "Swerve", categoryId: { _id: "CA-00000001", name: "Mech" } });
    expect(r).toEqual({ id: "TG-00000001", name: "Swerve", categoryId: "CA-00000001", sortOrder: null });
  });

  it("keeps json fields", () => {
    const s = fromWixItem("auditSessions", { _id: "AS-00000001", name: "x", sections: ["parts"], summary: { total: 2 } });
    expect(s.sections).toEqual(["parts"]);
    expect(s.summary).toEqual({ total: 2 });
    expect(fromWixItem("collections", { _id: "CO-00000001", name: "x" }).filter).toEqual({});
  });
});

describe("collection design", () => {
  it("has one prefixed collection per table plus inventory_meta, with valid field keys", () => {
    const defs = wixCollectionDefinitions();
    expect(defs).toHaveLength(TABLE_KEYS.length + 1);
    for (const d of defs) {
      expect(d.id).toMatch(/^inventory_[a-z_]+$/);
      expect(d.permissions).toEqual({ read: "SITE_MEMBER", insert: "SITE_MEMBER", update: "SITE_MEMBER", remove: "SITE_MEMBER" });
      for (const f of d.fields) expect(String(f.key)).toMatch(/^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/);
    }
  });

  it("references point at collections that exist", () => {
    const ids = new Set(wixCollectionDefinitions().map((d) => d.id));
    for (const d of wixCollectionDefinitions()) {
      for (const f of d.fields) {
        const ref = (f.typeMetadata as { reference?: { referencedCollectionId: string } } | undefined)?.reference;
        if (ref) expect(ids.has(ref.referencedCollectionId)).toBe(true);
      }
    }
  });

  it("maps types sensibly", () => {
    const col = (t: keyof typeof TABLES, n: string) => TABLES[t].columns.find((c) => c.name === n)!;
    expect(wixTypeFor(col("parts", "tagIds"))).toBe("ARRAY_STRING");
    expect(wixTypeFor(col("parts", "locationId"))).toBe("REFERENCE");
    expect(wixTypeFor(col("parts", "createdAt"))).toBe("DATETIME");
    expect(wixTypeFor(col("auditSessions", "sections"))).toBe("ARRAY_STRING");
    expect(wixTypeFor(col("collections", "filter"))).toBe("OBJECT");
  });
});

/** A fake of the @wix/data items module, enough to exercise WixStore. */
function fakeWix() {
  const colls = new Map<string, Map<string, Record<string, unknown>>>();
  const coll = (c: string) => colls.get(c) ?? colls.set(c, new Map()).get(c)!;
  const clone = <T>(v: T): T => structuredClone(v);
  type Cond = { field: string; value: unknown } | undefined;
  const api: WixItemsApi = {
    query(c) {
      let lim = 50;
      const q = {
        limit(n: number) {
          lim = n;
          return q;
        },
        ascending() {
          return q;
        },
        async find() {
          const all = [...coll(c).values()].map(clone);
          const page = (start: number): ReturnType<typeof q.find> =>
            Promise.resolve({
              items: all.slice(start, start + lim),
              hasNext: () => start + lim < all.length,
              next: () => page(start + lim),
            });
          return page(0);
        },
      };
      return q;
    },
    async get(c, id) {
      const v = coll(c).get(id);
      return v ? clone(v) : null;
    },
    async save(c, item) {
      coll(c).set(String(item._id), clone(item));
      return item;
    },
    async bulkInsert(c, items) {
      for (const it of items) coll(c).set(String(it._id), clone(it));
      return {};
    },
    async update(c, item, opts) {
      const cond = opts?.condition as Cond;
      const cur = coll(c).get(String(item._id));
      if (!cur) throw new Error("WDE0073 not found");
      if (cond && cur[cond.field] !== cond.value) throw new Error("condition not met");
      coll(c).set(String(item._id), clone(item));
      return item;
    },
    async bulkRemove(c, ids) {
      ids.forEach((id) => coll(c).delete(id));
      return {};
    },
    patch(c, id) {
      const ops: ((x: Record<string, unknown>) => void)[] = [];
      const p = {
        incrementField(f: string, by: number) {
          ops.push((x) => (x[f] = (Number(x[f]) || 0) + by));
          return p;
        },
        setField(f: string, v: unknown) {
          ops.push((x) => (x[f] = v));
          return p;
        },
        async run() {
          const cur = coll(c).get(id);
          if (!cur) return null;
          ops.forEach((op) => op(cur));
          return clone(cur);
        },
      };
      return p;
    },
    filter() {
      const f = { eq: (field: string, value: unknown) => ({ field, value, eq: f.eq }) };
      return f as never;
    },
  };
  return { api, colls };
}

describe("WixStore", () => {
  async function seeded() {
    const { api, colls } = fakeWix();
    const store = new WixStore(api);
    const demo = demoData();
    for (const k of TABLE_KEYS) await store.insert(k, demo.tables[k]);
    await store.setMeta("packingMeta", demo.packingMeta);
    return { store, colls, svc: createInventoryService(store) };
  }

  it("stores items in the prefixed collections and reads them back unchanged", async () => {
    const { store, colls } = await seeded();
    expect(colls.get("inventory_parts")!.size).toBe(demoData().tables.parts.length);
    expect(await store.list("parts")).toEqual(demoData().tables.parts);
    expect(((await store.getMeta("packingMeta")) as { event: string }).event).toBe("Demo event");
  });

  it("pages through more than 1000 items", async () => {
    const { api } = fakeWix();
    const store = new WixStore(api);
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: `PN-${String(i).padStart(8, "0")}`, text: `n${i}`, done: false, createdAt: "" }));
    await store.insert("packingNotes", rows);
    expect(await store.list("packingNotes")).toHaveLength(2500);
  });

  it("turns a failed conditional update into a CONFLICT", async () => {
    const { svc, store } = await seeded();
    const p = (await store.list("parts"))[0];
    await svc.update("parts", p.id, { description: "a" }, p.version);
    await expect(svc.update("parts", p.id, { description: "b" }, p.version)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await store.replace("parts", { ...p, description: "c" }, p.version)).toBe(false);
  });

  it("adjusts quantities with an atomic increment and clamps at zero", async () => {
    const { svc, store } = await seeded();
    const p = (await store.list("parts")).find((x) => x.name === "SPARK MAX")!;
    const r = await svc.adjustQuantity("parts", p.id, -3);
    expect(r.value.clamped).toBe(true);
    expect((await store.get("parts", p.id))!.quantity).toBe(0);
    expect((await store.get("parts", p.id))!.version).toBe(p.version + 2);
  });
});
