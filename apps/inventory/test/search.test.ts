import { describe, expect, it } from "vitest";
import { TABLES, demoData } from "@team6220/data/inventory";
import { buildIndex, normalize, stem, within } from "../src/lib/search.ts";
import { makeLookup, timeAgo } from "../src/lib/lookup.ts";
import { SECTIONS, isLowStock } from "../src/sections.ts";

describe("search", () => {
  const recs = [
    { name: "Flanged bearing 1/2\" hex", alias: "FR8" },
    { name: "Hex shaft 1/2\"", alias: "" },
    { name: "Spacer 0.25\"", alias: "" },
    { name: "Gear 20T", alias: "" },
  ];
  const idx = buildIndex(recs, (r) => [
    [r.name, 5],
    [r.alias, 5],
  ]);
  const names = (q: string) => idx.query(q).map((x) => x.rec.name);

  it("normalizes punctuation and keeps fractions", () => {
    expect(normalize("Hex-Shaft 1 / 2\"")).toBe("hex shaft 1/2");
    expect(stem("bearings")).toBe("bearing");
    expect(stem("pulleys")).toBe("pulley");
    expect(stem("boxes")).toBe("box");
  });

  it("matches partial words, plurals and small typos", () => {
    expect(names("spac")).toEqual(["Spacer 0.25\""]);
    expect(names("bearings")).toEqual(["Flanged bearing 1/2\" hex"]);
    expect(names("bearng")).toEqual(["Flanged bearing 1/2\" hex"]);
    expect(names("fr8")).toEqual(["Flanged bearing 1/2\" hex"]);
    expect(within("kitten", "sitting", 2)).toBe(false);
    expect(within("bearng", "bearing", 1)).toBe(true);
  });

  it("needs every word to match, and short words must match exactly", () => {
    expect(names("hex 1/2")).toHaveLength(2);
    expect(names("hex gear")).toEqual([]);
    expect(names("bear")).toEqual(["Flanged bearing 1/2\" hex"]); // not "Gear"
  });

  it("returns everything for an empty query", () => {
    expect(names("")).toHaveLength(4);
  });
});

describe("lookups and section configs", () => {
  const { tables } = demoData();
  const L = makeLookup(tables);

  it("labels locations as Area → Container", () => {
    const drawer = tables.locations.find((l) => l.name === "Drawer A")!;
    expect(L.locationLabel(drawer.id)).toBe("Shop → Drawer A");
    const shop = tables.locations.find((l) => l.name === "Shop")!;
    expect(L.locationAndChildren([shop.id]).size).toBe(4);
  });

  it("builds fastener titles like #10-32 × 1/2 in", () => {
    const f = tables.fasteners[0];
    expect(SECTIONS.fasteners.primary(f, L)).toBe("#10-32 × 1/2 in");
  });

  it("finds fasteners by 10-32", () => {
    const idx = buildIndex(L.rows("fasteners"), (r) => SECTIONS.fasteners.search(r, L));
    expect(idx.query("10-32 1/2").length).toBeGreaterThan(0);
  });

  it("flags low stock at or below the threshold", () => {
    expect(isLowStock({ id: "x", quantity: 2, lowStockThreshold: 2 })).toBe(true);
    expect(isLowStock({ id: "x", quantity: 3, lowStockThreshold: 2 })).toBe(false);
    expect(isLowStock({ id: "x", quantity: 0, lowStockThreshold: null })).toBe(false);
  });

  it("every form field is a real, editable column", () => {
    for (const cfg of Object.values(SECTIONS)) {
      for (const f of cfg.form) {
        const col = TABLES[cfg.key].columns.find((c) => c.name === f.name);
        expect(col, `${cfg.key}.${f.name}`).toBeDefined();
        expect(col!.system ?? false).toBe(false);
      }
    }
  });

  it("formats relative times", () => {
    const now = Date.parse("2026-11-09T12:00:00Z");
    expect(timeAgo("2026-11-09T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-11-08T11:00:00Z", now)).toBe("yesterday");
  });
});
