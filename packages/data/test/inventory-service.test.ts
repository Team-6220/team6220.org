import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../src/inventory/memory-store.ts";
import { demoData } from "../src/inventory/mock-data.ts";
import { createInventoryService, type InventoryService } from "../src/inventory/service.ts";
import { InventoryError, parseMeasure, fmtFraction } from "../src/inventory/util.ts";
import type { Row } from "../src/inventory/types.ts";

let svc: InventoryService;
let store: MemoryStore;

beforeEach(() => {
  const demo = demoData();
  store = new MemoryStore({ seed: demo.tables, meta: { packingMeta: demo.packingMeta } });
  svc = createInventoryService(store);
});

async function expectError(p: Promise<unknown>, code: string): Promise<InventoryError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(InventoryError);
    expect((e as InventoryError).code).toBe(code);
    return e as InventoryError;
  }
  throw new Error(`expected ${code}`);
}

const part = async (name: string): Promise<Row> => (await store.list("parts")).find((p) => p.name === name)!;

describe("loading", () => {
  it("loads every table and the packing info", async () => {
    const snap = await svc.loadAll();
    expect(snap.tables.parts.length).toBeGreaterThan(0);
    expect(snap.tables.lists.some((l) => l.listKey === "unit" && l.value === "in")).toBe(true);
    expect(snap.packingMeta.event).toBe("Demo event");
  });

  it("listItems hides archived items", async () => {
    const p = await part("CANcoder");
    await svc.archive("parts", p.id);
    expect((await svc.listItems("parts")).some((r) => r.id === p.id)).toBe(false);
  });
});

describe("create and update", () => {
  it("creates a part with an ID, version 1 and timestamps, dropping unknown and system fields", async () => {
    const loc = (await store.list("locations"))[0];
    const { value, changes } = await svc.create("parts", { name: "  Gear  20T ", quantity: "5", locationId: loc.id, version: 99, hacker: 1 });
    expect(value.id).toMatch(/^PT-[a-z0-9]{8}$/);
    expect(value.name).toBe("Gear 20T");
    expect(value.quantity).toBe(5);
    expect(value.version).toBe(1);
    expect(value.hacker).toBeUndefined();
    expect(value.createdAt).toBe(value.updatedAt);
    expect(changes.upserts.parts?.[0].id).toBe(value.id);
    expect(await store.get("parts", value.id)).toMatchObject({ name: "Gear 20T" });
  });

  it("rejects missing required fields and bad references with field messages", async () => {
    const e = await expectError(svc.create("parts", { name: "", quantity: -1, locationId: "LO-zzzzzzzz" }), "VALIDATION");
    const fields = (e.details as { fields: Record<string, string> }).fields;
    expect(Object.keys(fields).sort()).toEqual(["locationId", "name", "quantity"]);
  });

  it("checks that a dropdown value belongs to the right list", async () => {
    const lists = await store.list("lists");
    const inch = lists.find((l) => l.listKey === "unit")!;
    await expectError(svc.create("wire", { gaugeId: inch.id, approxLength: 3 }), "VALIDATION");
  });

  it("stores the numeric copy of typed measures", async () => {
    const lists = await store.list("lists");
    const al = lists.find((l) => l.value === "6061 Aluminum")!;
    const { value } = await svc.create("rawMaterials", { materialTypeId: al.id, thickness: "1/8", length: "1 1/2", width: "3", quantity: 1 });
    expect(value.thicknessValue).toBe(0.125);
    expect(value.lengthValue).toBe(1.5);
    await expectError(svc.create("rawMaterials", { materialTypeId: al.id, thickness: "abc", quantity: 1 }), "VALIDATION");
  });

  it("detects a conflicting edit and allows a deliberate overwrite", async () => {
    const p = await part("CANcoder");
    await svc.update("parts", p.id, { description: "first" }, p.version);
    const e = await expectError(svc.update("parts", p.id, { description: "second" }, p.version), "CONFLICT");
    expect((e.details as { current: Row }).current.description).toBe("first");
    const { value } = await svc.update("parts", p.id, { description: "second" }, null);
    expect(value.description).toBe("second");
    expect(value.version).toBe(p.version + 2);
  });

  it("refuses edits to archived items", async () => {
    const p = await part("CANcoder");
    const { value } = await svc.archive("parts", p.id);
    await expectError(svc.update("parts", p.id, { name: "x" }, value.version), "ARCHIVED");
  });
});

describe("quantities", () => {
  it("adds and subtracts, and never goes below zero", async () => {
    const p = await part("SPARK MAX");
    expect((await svc.adjustQuantity("parts", p.id, 2)).value.record.quantity).toBe(3);
    const r = await svc.adjustQuantity("parts", p.id, -10);
    expect(r.value.record.quantity).toBe(0);
    expect(r.value.clamped).toBe(true);
  });

  it("counts two simultaneous changes", async () => {
    const p = await part("CANcoder");
    await Promise.all([svc.adjustQuantity("parts", p.id, -1), svc.adjustQuantity("parts", p.id, -2)]);
    expect((await store.get("parts", p.id))!.quantity).toBe(p.quantity - 3);
  });

  it("rejects fractional changes to whole-number quantities and sections without quantities", async () => {
    const p = await part("CANcoder");
    await expectError(svc.adjustQuantity("parts", p.id, 0.5), "BAD_REQUEST");
    const f = (await store.list("fasteners"))[0];
    await expectError(svc.adjustQuantity("fasteners", f.id, 1), "BAD_REQUEST");
  });

  it("allows decimal wire lengths", async () => {
    const w = (await store.list("wire"))[0];
    const r = await svc.adjustQuantity("wire", w.id, -2.5);
    expect(r.value.record.approxLength).toBe(w.approxLength - 2.5);
  });
});

describe("archive and delete", () => {
  it("only deletes archived items, and purges old archived items", async () => {
    const p = await part("CANcoder");
    await expectError(svc.deletePermanently("parts", p.id), "BAD_REQUEST");
    await svc.archive("parts", p.id);
    const restored = await svc.restore("parts", p.id);
    expect(restored.value.archivedAt).toBe("");
    await svc.archive("parts", p.id);
    expect((await svc.purgeArchived(30, Date.now())).value).toBe(0);
    expect((await svc.purgeArchived(30, Date.now() + 31 * 86400000)).value).toBe(1);
    expect(await store.get("parts", p.id)).toBeNull();
  });
});

describe("settings", () => {
  it("rejects duplicate names (case-insensitive)", async () => {
    await expectError(svc.create("categories", { name: "mechanical" }), "VALIDATION");
    await expectError(svc.create("lists", { listKey: "unit", value: "IN" }), "VALIDATION");
  });

  it("keeps locations to two levels", async () => {
    const locs = await store.list("locations");
    const container = locs.find((l) => l.parentId)!;
    await expectError(svc.create("locations", { name: "Box", parentId: container.id }), "VALIDATION");
  });

  it("refuses to change a dropdown value's list", async () => {
    const l = (await store.list("lists"))[0];
    await expectError(svc.update("lists", l.id, { listKey: "unit" === l.listKey ? "wireGauge" : "unit" }), "VALIDATION");
  });

  it("asks before removing something in use, then clears it everywhere", async () => {
    const tags = await store.list("tags");
    const swerve = tags.find((t) => t.name === "Swerve")!;
    const e = await expectError(svc.removeSetting("tags", swerve.id), "IN_USE");
    expect((e.details as { counts: Record<string, number> }).counts.parts).toBe(3);
    const r = await svc.removeSetting("tags", swerve.id, true);
    expect(r.value.removedIds).toEqual([swerve.id]);
    const parts = await store.list("parts");
    expect(parts.some((p) => p.tagIds.includes(swerve.id))).toBe(false);
    const saved = await store.list("collections");
    expect(JSON.stringify(saved)).not.toContain(swerve.id);
  });

  it("removing an area removes its containers and clears items there", async () => {
    const locs = await store.list("locations");
    const shop = locs.find((l) => l.name === "Shop")!;
    const e = await expectError(svc.removeSetting("locations", shop.id), "IN_USE");
    expect((e.details as { childCount: number }).childCount).toBe(3);
    await svc.removeSetting("locations", shop.id, true);
    const left = await store.list("locations");
    expect(left.some((l) => l.parentId === shop.id || l.id === shop.id)).toBe(false);
    expect((await store.list("parts")).every((p) => !p.locationId || left.some((l) => l.id === p.locationId))).toBe(true);
  });

  it("reorders a subset in place", async () => {
    const cats = (await store.list("categories")).sort((a, b) => a.sortOrder - b.sortOrder);
    await svc.reorder("categories", [cats[2].id, cats[0].id]);
    const after = (await store.list("categories")).sort((a, b) => a.sortOrder - b.sortOrder).map((c) => c.name);
    expect(after).toEqual([cats[2].name, cats[1].name, cats[0].name]);
  });
});

describe("audits", () => {
  it("runs a whole audit: confirm, different, missing, finalize", async () => {
    const started = await svc.startAudit("Preseason", ["parts", "wire"]);
    const items = (await store.list("auditItems")).filter((a) => a.auditId === started.value.session.id);
    const activeParts = (await store.list("parts")).filter((p) => !p.archivedAt).length;
    expect(started.value.count).toBe(activeParts + (await store.list("wire")).length);
    await expectError(svc.startAudit("Another", ["tools"]), "AUDIT_ACTIVE");

    const enc = items.find((a) => a.nameSnapshot === "CANcoder")!;
    const belt = items.find((a) => a.nameSnapshot.startsWith("HTD"))!;
    const wheel = items.find((a) => a.nameSnapshot.startsWith("Compliant"))!;
    await svc.setAuditCount(enc.id, "confirmed");
    const diff = await svc.setAuditCount(belt.id, "different", "7");
    expect(diff.value.countedQty).toBe(7);
    // Counting the expected amount is saved as confirmed.
    const same = await svc.setAuditCount(wheel.id, "different", wheel.baselineQty);
    expect(same.value.status).toBe("confirmed");
    await svc.setAuditCount(wheel.id, "missing");
    await expectError(svc.setAuditCount(belt.id, "different", 1.5), "VALIDATION");

    const done = await svc.finalizeAudit(started.value.session.id);
    expect(done.value.summary).toMatchObject({ confirmed: 1, updated: 1, missing: 1 });
    expect((await store.get("parts", belt.itemId))!.quantity).toBe(7);
    const w = (await store.get("parts", wheel.itemId))!;
    expect(w.needsCheck).toBe(true);
    expect(w.quantity).toBe(wheel.baselineQty);
    expect((await store.list("auditItems")).length).toBe(0);
    expect((await store.get("auditSessions", started.value.session.id))!.status).toBe("finalized");
    await expectError(svc.setAuditCount(enc.id, "confirmed"), "AUDIT_CLOSED");
  });

  it("reports items whose quantity changed mid-audit and applies the chosen resolution", async () => {
    const s = (await svc.startAudit("Mid", ["parts"])).value.session;
    const ai = (await store.list("auditItems")).find((a) => a.nameSnapshot === "CANcoder")!;
    await svc.setAuditCount(ai.id, "different", 2);
    await svc.adjustQuantity("parts", ai.itemId, -1);
    const e = await expectError(svc.finalizeAudit(s.id), "AUDIT_CONFLICTS");
    const conflicts = (e.details as { conflicts: { auditItemId: string; current: number }[] }).conflicts;
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].current).toBe(ai.baselineQty - 1);
    // Nothing was written by the refused finalize.
    expect((await store.get("auditSessions", s.id))!.status).toBe("active");
    const r = await svc.finalizeAudit(s.id, { [ai.id]: "current" });
    expect(r.value.summary.keptCurrent).toBe(1);
    expect((await store.get("parts", ai.itemId))!.quantity).toBe(ai.baselineQty - 1);
  });

  it("cancel changes no inventory", async () => {
    const before = await store.list("parts");
    const s = (await svc.startAudit("Cancel me", ["parts"])).value.session;
    const ai = (await store.list("auditItems"))[0];
    await svc.setAuditCount(ai.id, "different", 999);
    const r = await svc.cancelAudit(s.id);
    expect(r.value.status).toBe("cancelled");
    expect(r.value.summary).toMatchObject({ checked: 1 });
    expect(await store.list("parts")).toEqual(before);
  });
});

describe("packing list", () => {
  it("nests entries, inherits the parent's section and limits depth", async () => {
    const tools = (await store.list("packingItems")).find((p) => p.name === "Tools")!;
    const a = (await svc.packingCreate({ name: "Level 2", parentId: tools.id, section: "loadout" })).value;
    expect(a.section).toBe("always");
    const b = (await svc.packingCreate({ name: "Level 3", parentId: a.id, section: "always" })).value;
    const c = (await svc.packingCreate({ name: "Level 4", parentId: b.id, section: "always" })).value;
    await expectError(svc.packingCreate({ name: "Level 5", parentId: c.id, section: "always" }), "VALIDATION");
    await expectError(svc.packingUpdate(tools.id, { parentId: c.id }), "VALIDATION");
  });

  it("moving a group to another section moves its contents", async () => {
    const rows = await store.list("packingItems");
    const tools = rows.find((p) => p.name === "Tools")!;
    const cart = rows.find((p) => p.name === "Robot cart")!;
    await svc.packingUpdate(tools.id, { parentId: cart.id });
    const after = await store.list("packingItems");
    expect(after.filter((p) => p.parentId === tools.id).every((p) => p.section === "loadout")).toBe(true);
  });

  it("ticks, resets and deletes with children", async () => {
    const rows = await store.list("packingItems");
    const leaves = rows.filter((p) => p.parentId && rows.find((x) => x.id === p.parentId)?.name === "Tools");
    const r = await svc.packingSetPacked(leaves.map((l) => l.id), true);
    expect(r.value).toHaveLength(leaves.length);
    const reset = await svc.packingReset("Beach Blitz");
    expect(reset.value).toBe(leaves.length);
    expect(reset.changes.packingMeta?.event).toBe("Beach Blitz");
    const tools = rows.find((p) => p.name === "Tools")!;
    const del = await svc.packingDelete(tools.id);
    expect(del.value).toHaveLength(leaves.length + 1);
    expect((await svc.packingClearSeason()).value).toBe(1);
  });

  it("validates links to inventory items", async () => {
    await expectError(svc.packingCreate({ name: "x", section: "always", linkTable: "parts", linkId: "PT-zzzzzzzz" }), "VALIDATION");
  });

  it("adds, completes and deletes notes", async () => {
    const n = (await svc.packingNoteAdd("Pack spare radio")).value;
    expect((await svc.packingNoteSet(n.id, true)).value.done).toBe(true);
    await svc.packingNoteDelete(n.id);
    await expectError(svc.packingNoteSet(n.id, false), "NOT_FOUND");
  });
});

describe("measure helpers", () => {
  it("parses fractions people type", () => {
    expect(parseMeasure("1/8")).toBe(0.125);
    expect(parseMeasure("1 1/2")).toBe(1.5);
    expect(parseMeasure("1-1/2in")).toBe(1.5);
    expect(parseMeasure('1/4"')).toBe(0.25);
    expect(parseMeasure(".5")).toBe(0.5);
    expect(parseMeasure("abc")).toBeNull();
    expect(fmtFraction(12.5)).toBe("12 1/2");
    expect(fmtFraction(0.0625)).toBe("1/16");
  });
});
