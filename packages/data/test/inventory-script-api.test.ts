// The Apps Script API port (script-api.ts) and the server functions ported for it (final check, production,
// "Mark as cut"). Replies must look exactly like the old Apps Script ones, because the original UI reads them.
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../src/inventory/memory-store.ts";
import { demoData } from "../src/inventory/mock-data.ts";
import { createInventoryService, type InventoryService } from "../src/inventory/service.ts";
import { createScriptApi, isNetworkError, PHOTOS_UNAVAILABLE, type ScriptApi, type ScriptReply } from "../src/inventory/script-api.ts";
import type { Row } from "../src/inventory/types.ts";

let store: MemoryStore;
let svc: InventoryService;
let api: ScriptApi;
let clock: number;

beforeEach(() => {
  const demo = demoData();
  store = new MemoryStore({ seed: demo.tables, meta: { packingMeta: demo.packingMeta } });
  clock = Date.parse("2026-11-09T18:00:00.000Z");
  svc = createInventoryService(store, { now: () => clock });
  api = createScriptApi(svc, { onUnexpectedError: () => {} });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ok(name: string, ...args: unknown[]): Promise<any> {
  const r = await api.call(name, args);
  if (!r.ok) throw new Error(`${name} failed: ${r.error.code} ${r.error.message}`);
  return r.data;
}

async function fail(name: string, ...args: unknown[]): Promise<Extract<ScriptReply, { ok: false }>["error"]> {
  const r = await api.call(name, args);
  if (r.ok) throw new Error(`${name} should have failed`);
  return r.error;
}

const first = async (table: Parameters<MemoryStore["list"]>[0], pred: (r: Row) => boolean = () => true) => (await store.list(table)).find(pred)!;

describe("loading and change polling", () => {
  it("apiGetAll returns every table, versions, the packing info (no token) and serverTime", async () => {
    const d = await ok("apiGetAll");
    expect(Object.keys(d.tables)).toEqual(expect.arrayContaining(["parts", "rawMaterials", "tools", "fasteners", "wire", "categories", "tags", "locations", "suppliers", "lists", "collections", "auditSessions", "auditItems", "packingItems", "packingNotes", "production"]));
    expect(d.tables.parts.length).toBeGreaterThan(0);
    expect(typeof d.versions.parts).toBe("number");
    expect(typeof d.versions.packingMeta).toBe("number");
    expect(d.packingMeta.event).toBe("Demo event");
    expect(d.packingMeta.finalCheck).toEqual({ state: "none" });
    expect(typeof d.serverTime).toBe("string");
  });

  it("a write bumps only its own tables by one, and the next poll doesn't re-send them", async () => {
    const all = await ok("apiGetAll");
    const p = all.tables.parts[0];
    const d = await ok("apiAdjustQuantity", "parts", p.id, 2);
    expect(d.record.quantity).toBe(p.quantity + 2);
    expect(d.clamped).toBe(false);
    expect(d.versions.parts).toBe(all.versions.parts + 1);
    expect(d.versions.tools).toBe(all.versions.tools);
    const known = { ...all.versions, parts: d.versions.parts };
    const ch = await ok("apiGetChanges", known);
    expect(ch.tables).toEqual({});
    expect(ch.versions).toEqual(d.versions);
    expect(ch.packingMeta).toBeUndefined();
  });

  it("apiGetChanges sends tables someone else changed", async () => {
    const all = await ok("apiGetAll");
    const other = createScriptApi(createInventoryService(store));
    const tool = all.tables.tools[0];
    await other.call("apiUpdate", ["tools", tool.id, { name: "Renamed elsewhere" }, tool.version]);
    await other.call("apiPackingSetInfo", [{ event: "Other event" }]);
    const ch = await ok("apiGetChanges", all.versions);
    expect(Object.keys(ch.tables)).toEqual(["tools"]);
    expect(ch.tables.tools.find((r: Row) => r.id === tool.id).name).toBe("Renamed elsewhere");
    expect(ch.versions.tools).toBe(all.versions.tools + 1);
    expect(ch.packingMeta.event).toBe("Other event");
    // Nothing new: nothing sent.
    expect((await ok("apiGetChanges", ch.versions)).tables).toEqual({});
  });

  it("apiGetChanges sends a table when the browser's counter doesn't match", async () => {
    const all = await ok("apiGetAll");
    const ch = await ok("apiGetChanges", { ...all.versions, wire: -1 });
    expect(Object.keys(ch.tables)).toEqual(["wire"]);
  });
});

describe("replies and errors", () => {
  it("returns the Apps Script error shapes and codes", async () => {
    const all = await ok("apiGetAll");
    const v = await fail("apiCreate", "parts", { name: "", quantity: 1 });
    expect(v.code).toBe("VALIDATION");
    expect(v.details).toEqual({ fields: { name: "This field is required." } });

    const p = all.tables.parts[0];
    await ok("apiUpdate", "parts", p.id, { name: "First edit" }, p.version);
    const c = await fail("apiUpdate", "parts", p.id, { name: "Second edit" }, p.version);
    expect(c.code).toBe("CONFLICT");
    expect((c.details as { current: Row }).current.name).toBe("First edit");
    // null = overwrite on purpose
    expect((await ok("apiUpdate", "parts", p.id, { name: "Forced" }, null)).record.name).toBe("Forced");

    expect((await fail("apiArchive", "parts", "PT-zzzzzzzz")).code).toBe("NOT_FOUND");
    expect((await fail("apiArchive", "nope", p.id)).code).toBe("BAD_REQUEST");
    expect((await fail("apiDoesNotExist")).code).toBe("BAD_REQUEST");
    const loc = all.tables.locations.find((l: Row) => !l.parentId);
    const inUse = await fail("apiRemoveSetting", "locations", loc.id, false);
    expect(inUse.code).toBe("IN_USE");
    expect((inUse.details as { childCount: number }).childCount).toBeGreaterThan(0);
  });

  it("returns record copies, not live objects", async () => {
    const all = await ok("apiGetAll");
    const p = all.tables.parts[0];
    const d = await ok("apiUpdate", "parts", p.id, { name: "Copy test" }, p.version);
    d.record.name = "mutated by the page";
    expect((await store.get("parts", p.id))!.name).toBe("Copy test");
  });

  it("photos fail with a clear message", async () => {
    const p = await first("parts");
    for (const [fn, args] of [["apiUploadImage", ["parts", p.id, "data:image/jpeg;base64,AAAA"]], ["apiRemoveImage", ["parts", p.id]], ["apiGetImage", ["1AbCdEfGhIjKlMnOp"]]] as const) {
      const e = await fail(fn, ...args);
      expect(e.code).toBe("NOT_SETUP");
      expect(e.message).toBe(PHOTOS_UNAVAILABLE);
    }
  });

  it("network failures reject (the UI's failure handler); other surprises become SERVER", async () => {
    const broken = createInventoryService({
      ...store,
      kind: "memory",
      list: async () => {
        throw new TypeError("Failed to fetch");
      },
    } as unknown as MemoryStore);
    await expect(createScriptApi(broken).call("apiGetAll", [])).rejects.toThrow("Failed to fetch");
    const failing = (message: string) =>
      createInventoryService({
        kind: "memory",
        list: async () => {
          throw new Error(message);
        },
      } as unknown as MemoryStore);
    const seen: unknown[] = [];
    const r = await createScriptApi(failing("Unexpected token"), { onUnexpectedError: (_f, e) => seen.push(e) }).call("apiGetAll", []);
    expect(r).toMatchObject({ ok: false, error: { code: "SERVER", details: { cause: "Unexpected token" } } });
    expect(seen).toHaveLength(1);
    const denied = await createScriptApi(failing("WDE0027: permission denied"), { onUnexpectedError: () => {} }).call("apiGetAll", []);
    expect(denied).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(isNetworkError(new Error("ok"))).toBe(false);
  });

  it("runs writes one at a time, in order", async () => {
    const p = await first("parts");
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => ok("apiAdjustQuantity", "parts", p.id, 1)));
    expect(results.map((r) => r.record.quantity)).toEqual([1, 2, 3, 4, 5].map((n) => p.quantity + n));
  });
});

describe("raw materials shapes (Validate.gs)", () => {
  it("fills length, width and area from the outline, and rejects crossed outlines", async () => {
    const all = await ok("apiGetAll");
    const mat = all.tables.lists.find((l: Row) => l.listKey === "materialType").id;
    const d = await ok("apiCreate", "rawMaterials", { materialTypeId: mat, quantity: 1, shape: { kind: "rect", points: [[0, 0], [12.5, 0], [12.5, 6], [0, 6]], edges: [12.5, 6, 12.5, 6] } });
    expect(d.record).toMatchObject({ length: "12 1/2", lengthValue: 12.5, width: "6", widthValue: 6, area: 75 });
    const e = await fail("apiCreate", "rawMaterials", { materialTypeId: mat, quantity: 1, shape: { kind: "traced", points: [[0, 0], [6, 4], [6, 0], [0, 8]], edges: [] } });
    expect(e.code).toBe("VALIDATION");
    expect((e.details as { fields: Record<string, string> }).fields.shape).toMatch(/crosses itself/);
    // Editing the outline keeps it (and updates the sizes)
    const u = await ok("apiUpdate", "rawMaterials", d.record.id, { shape: { kind: "rect", points: [[0, 0], [8, 0], [8, 4], [0, 4]], edges: [8, 4, 8, 4] } }, d.record.version);
    expect(u.record.shape.points).toHaveLength(4);
    expect(u.record).toMatchObject({ length: "8", width: "4", area: 32 });
  });
});

describe("final check (ApiPacking.gs)", () => {
  const leaves = async () => {
    const rows = await store.list("packingItems");
    const parents = new Set(rows.map((r) => r.parentId).filter(Boolean));
    return rows.filter((r) => !parents.has(r.id));
  };

  it("one person at a time, with a private token; pauses after 90 s without a ping", async () => {
    await ok("apiGetAll");
    const claim = await ok("apiFinalCheckClaim", "Alex", false);
    expect(typeof claim.token).toBe("string");
    expect(claim.packingMeta.finalCheck).toMatchObject({ state: "active", by: "Alex" });
    expect(claim.packingMeta.finalCheck.token).toBeUndefined();
    expect(JSON.stringify(await ok("apiGetAll"))).not.toContain(claim.token);

    const taken = await fail("apiFinalCheckClaim", "Sam", false);
    expect(taken).toMatchObject({ code: "FINAL_CHECK_TAKEN", details: { by: "Alex" } });
    expect((await fail("apiFinalCheckClaim", "", false)).code).toBe("VALIDATION");

    const leaf = (await leaves())[0];
    const v = await ok("apiFinalCheckVerify", claim.token, [leaf.id], true);
    expect(v.records.map((r: Row) => r.id)).toEqual([leaf.id]);
    expect((await store.get("packingItems", leaf.id))!.verified).toBe(true);
    expect((await fail("apiFinalCheckVerify", "wrong-token", [leaf.id], false)).code).toBe("FINAL_CHECK_LOST");

    clock += 30_000;
    expect((await ok("apiFinalCheckPing", claim.token)).packingMeta.finalCheck.state).toBe("active");

    clock += 91_000; // Alex's page stopped pinging
    expect((await ok("apiGetAll")).packingMeta.finalCheck).toMatchObject({ state: "paused", pausedReason: "left" });
    const sam = await ok("apiFinalCheckClaim", "Sam", false);
    expect(sam.packingMeta.finalCheck).toMatchObject({ state: "active", by: "Sam", resumedFrom: "Alex" });
    const lost = await fail("apiFinalCheckPing", claim.token);
    expect(lost).toMatchObject({ code: "FINAL_CHECK_LOST", message: "Sam has taken over the final check." });

    const done = await ok("apiFinalCheckComplete", sam.token);
    expect(done.packingMeta.finalCheck).toMatchObject({ state: "complete", by: "Sam", verified: 1, total: (await leaves()).length });
    expect((await fail("apiFinalCheckClaim", "Alex", false)).code).toBe("FINAL_CHECK_DONE");

    const again = await ok("apiFinalCheckClaim", "Alex", true);
    expect(again.packingMeta.finalCheck.state).toBe("active");
    expect((await store.list("packingItems")).some((r) => r.verified)).toBe(false);
  });

  it("pausing releases the claim; a stale token can't pause someone else", async () => {
    const claim = await ok("apiFinalCheckClaim", "Alex", false);
    const p = await ok("apiFinalCheckPause", claim.token);
    expect(p.packingMeta.finalCheck).toMatchObject({ state: "paused", by: "Alex" });
    const sam = await ok("apiFinalCheckClaim", "Sam", false);
    await ok("apiFinalCheckPause", claim.token); // old token: nothing happens
    expect((await ok("apiGetAll")).packingMeta.finalCheck).toMatchObject({ state: "active", by: "Sam" });
    expect(sam.token).not.toBe(claim.token);
  });

  it("apiPackingSetPacked ticks leaves and a new round clears everything", async () => {
    const leaf = (await leaves())[0];
    const d = await ok("apiPackingSetPacked", [leaf.id], true);
    expect(d.records[0].packed).toBe(true);
    const r = await ok("apiPackingReset", "Beach Blitz");
    expect(r.cleared).toBe(1);
    expect(r.packingMeta.event).toBe("Beach Blitz");
  });
});

describe("production and Mark as cut (ApiRaw.gs)", () => {
  async function setup() {
    const all = await ok("apiGetAll");
    const mat = all.tables.lists.find((l: Row) => l.listKey === "materialType" && l.value === "6061 Aluminum").id;
    const single = all.tables.rawMaterials.find((r: Row) => r.quantity === 1 && r.shape.kind === "traced");
    const double = all.tables.rawMaterials.find((r: Row) => r.quantity === 2);
    const job = (over: Record<string, unknown>) => ({ partName: "Plate", materialTypeId: mat, thickness: "1/8", partLength: 2, partWidth: 2, method: "handmade", stockLength: 2.25, stockWidth: 2.25, copyIndex: 0, placement: { x: 0, y: 0, w: 2.25, h: 2.25, angle: 0 }, ...over });
    return { all, mat, single, double, job };
  }

  it("creates, edits and deletes jobs, checking the stock piece", async () => {
    const { single, job } = await setup();
    const c = await ok("apiProductionCreate", [job({ rawMaterialId: single.id }), job({ partName: "Unassigned" })]);
    expect(c.records).toHaveLength(2);
    expect(c.records[0]).toMatchObject({ status: "planned", thicknessValue: 0.125, rawMaterialId: single.id });
    expect((await fail("apiProductionCreate", [job({ rawMaterialId: "RM-zzzzzzzz" })])).code).toBe("CONFLICT");
    expect((await fail("apiProductionCreate", [job({ rawMaterialId: single.id, copyIndex: 1 })])).code).toBe("CONFLICT");
    expect((await fail("apiProductionCreate", [])).code).toBe("BAD_REQUEST");
    expect((await fail("apiProductionCreate", [job({ partLength: 0 })])).code).toBe("VALIDATION");

    const u = await ok("apiProductionUpdate", c.records[0].id, { rawMaterialId: "" });
    expect(u.record).toMatchObject({ rawMaterialId: "", copyIndex: null, placement: {} });
    expect((await ok("apiProductionUpdate", c.records[1].id, { status: "done" })).record.status).toBe("done");
    expect((await fail("apiProductionUpdate", "PR-zzzzzzzz", { status: "done" })).code).toBe("NOT_FOUND");
    const del = await ok("apiProductionDelete", [c.records[0].id, "PR-zzzzzzzz"]);
    expect(del.removedIds).toEqual([c.records[0].id]);
  });

  it("cutting a single piece: the biggest leftover becomes its shape, others become new pieces, other jobs move", async () => {
    const { single, job } = await setup();
    const c = await ok("apiProductionCreate", [job({ rawMaterialId: single.id }), job({ partName: "Moves", rawMaterialId: single.id, placement: { x: 6, y: 0, w: 2, h: 2, angle: 0 } }), job({ partName: "Lost", rawMaterialId: single.id, placement: { x: 3, y: 3, w: 1, h: 1, angle: 0 } })]);
    const [cut, moves, lost] = c.records;
    const leftovers = [{ points: [[3, 0], [10, 0], [10, 4], [3, 4]] }, { points: [[0, 3], [2.5, 3], [2.5, 8], [0, 8]] }];
    const d = await ok("apiRawCut", single.id, single.version, 0, [cut.id], leftovers, { [moves.id]: 0, [lost.id]: -1 });
    expect(d.piece).toMatchObject({ id: single.id, version: single.version + 1, length: "7", width: "4", area: 28 });
    expect(d.newPieces).toHaveLength(1);
    expect(d.newPieces[0]).toMatchObject({ quantity: 1, length: "5", width: "2 1/2", materialTypeId: single.materialTypeId, version: 1 });
    expect(d.newPieces[0].description).toMatch(/^Leftover from cutting Plate/);
    const byId = new Map(d.jobs.map((j: Row) => [j.id, j]));
    expect(byId.get(cut.id)).toMatchObject({ status: "cut" });
    expect(byId.get(moves.id)).toMatchObject({ rawMaterialId: single.id, copyIndex: 0 });
    expect(byId.get(lost.id)).toMatchObject({ rawMaterialId: "", copyIndex: null, placement: {} });
    expect(d.versions.rawMaterials).toBeGreaterThan(0);
    // The piece changed: an old version is a conflict.
    const again = await fail("apiRawCut", single.id, single.version, 0, [moves.id], [], {});
    expect(again.code).toBe("CONFLICT");
  });

  it("cutting one of several identical sheets lowers the quantity; nothing left archives a single piece", async () => {
    const { double, single, job } = await setup();
    const c = await ok("apiProductionCreate", [job({ rawMaterialId: double.id, copyIndex: 1 }), job({ rawMaterialId: single.id })]);
    const d = await ok("apiRawCut", double.id, double.version, 1, [c.records[0].id], [{ points: [[0, 3], [24, 3], [24, 12], [0, 12]] }], {});
    expect(d.piece.quantity).toBe(1);
    expect(d.newPieces).toHaveLength(1);
    const e = await ok("apiRawCut", single.id, null, 0, [c.records[1].id], [], {});
    expect(e.piece.archivedAt).not.toBe("");
    expect(e.newPieces).toEqual([]);
    expect((await fail("apiRawCut", double.id, null, 5, [c.records[0].id], [], {})).code).toBe("BAD_REQUEST");
    expect((await fail("apiRawCut", double.id, null, 0, [c.records[0].id], [{ points: [[0, 0], [1, 1]] }], {})).code).toBe("VALIDATION");
  });
});
