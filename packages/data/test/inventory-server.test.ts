// The inventory lock (docs/PHASE-2.md, issue #100): who may change inventory through /api/inventory, what the server
// writes to Wix, and the browser store that sends changes there.
import { describe, expect, it } from "vitest";
import { InventoryWrites, type Modification, type WixItemFns } from "../src/inventory/server-writes";
import { handleInventoryRequest } from "../src/inventory/server-api";
import { RemoteWriteStore, postInventory } from "../src/inventory/remote-store";
import { createSessionVerifier, type SessionWix } from "../src/site/verify";

const BADGES = [
  { _id: "b-team", title: "Team Member" },
  { _id: "b-web", title: "Web Admin" },
  { _id: "b-mentor", title: "Mentor" },
];

function viewer(member: Awaited<ReturnType<SessionWix["getCurrentMember"]>>, badgeIds: string[] = []) {
  return createSessionVerifier({ getCurrentMember: async () => member, listBadges: async () => BADGES, listBadgeIds: async () => badgeIds });
}

const teamMember = viewer({ _id: "m1", status: "APPROVED" }, ["b-team"]);

/** Fake Wix: records every call, and holds items so version checks behave like Wix's. */
function fakeWix() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const store = new Map<string, Record<string, unknown>>();
  const key = (c: string, id: string) => `${c}/${id}`;
  const fns: WixItemFns = {
    async get(c, id) {
      calls.push({ fn: "get", args: [c, id] });
      return store.get(key(c, id)) ?? null;
    },
    async save(c, item) {
      calls.push({ fn: "save", args: [c, item] });
      store.set(key(c, String(item._id)), item);
      return item;
    },
    async bulkInsert(c, items) {
      calls.push({ fn: "bulkInsert", args: [c, items] });
      for (const it of items) store.set(key(c, String(it._id)), it);
      return {};
    },
    async update(c, item, options) {
      calls.push({ fn: "update", args: [c, item, options] });
      const cur = store.get(key(c, String(item._id)));
      const need = (options?.condition as { version?: number } | undefined)?.version;
      if (!cur || (need !== undefined && cur.version !== need)) return null;
      store.set(key(c, String(item._id)), item);
      return item;
    },
    async bulkRemove(c, ids) {
      calls.push({ fn: "bulkRemove", args: [c, ids] });
      ids.forEach((id) => store.delete(key(c, id)));
      return {};
    },
    async patch(c, id, mods: Modification[]) {
      calls.push({ fn: "patch", args: [c, id, mods] });
      const cur = store.get(key(c, id));
      if (!cur) return null;
      const next = { ...cur };
      for (const m of mods) next[m.fieldPath] = m.action === "INCREMENT_FIELD" ? Number(next[m.fieldPath] ?? 0) + Number(m.value) : m.value;
      store.set(key(c, id), next);
      return next;
    },
    versionIs: (version) => ({ version }),
  };
  return { calls, store, fns, writes: new InventoryWrites(fns) };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://www.team6220.org/api/inventory", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

describe("who may change inventory", () => {
  const part = { id: "PT-1", quantity: 5, version: 1 };

  it("lets an approved Team Member save", async () => {
    const w = fakeWix();
    const res = await handleInventoryRequest(post({ action: "insert", table: "parts", rows: [part] }), { verify: teamMember, writes: w.writes });
    expect(res.status).toBe(200);
    expect(w.calls.map((c) => c.fn)).toEqual(["bulkInsert"]);
    expect(w.calls[0].args[0]).toBe("inventory_parts");
  });

  it("lets a Web Admin save too", async () => {
    const w = fakeWix();
    const res = await handleInventoryRequest(post({ action: "remove", table: "parts", ids: ["PT-1"] }), { verify: viewer({ _id: "m2", status: "APPROVED" }, ["b-web"]), writes: w.writes });
    expect(res.status).toBe(200);
  });

  it("refuses a visitor, an unapproved member, and a member without the Team Member badge", async () => {
    for (const [v, status] of [
      [viewer(undefined), 401],
      [viewer({ _id: "m3", status: "PENDING" }, ["b-team"]), 403],
      [viewer({ _id: "m4", status: "APPROVED" }, []), 403],
      [viewer({ _id: "m5", status: "APPROVED" }, ["b-mentor"]), 403],
    ] as const) {
      const w = fakeWix();
      const res = await handleInventoryRequest(post({ action: "insert", table: "parts", rows: [part] }), { verify: v, writes: w.writes });
      expect(res.status).toBe(status);
      expect(w.calls).toHaveLength(0);
    }
  });

  it("refuses a request another website made in a member's browser", async () => {
    const w = fakeWix();
    const res = await handleInventoryRequest(post({ action: "remove", table: "parts", ids: ["PT-1"] }, { "Sec-Fetch-Site": "cross-site" }), { verify: teamMember, writes: w.writes });
    expect(res.status).toBe(403);
    expect(w.calls).toHaveLength(0);
  });

  it("only takes POST", async () => {
    const w = fakeWix();
    const res = await handleInventoryRequest(new Request("https://www.team6220.org/api/inventory"), { verify: teamMember, writes: w.writes });
    expect(res.status).toBe(405);
  });
});

describe("what it will and won't write", () => {
  const run = (body: unknown) => {
    const w = fakeWix();
    return handleInventoryRequest(post(body), { verify: teamMember, writes: w.writes }).then((res) => ({ res, w }));
  };

  it("rejects unknown tables, fields, actions and oversized lists, and writes nothing", async () => {
    for (const body of [
      { action: "insert", table: "constructor", rows: [] },
      { action: "insert", table: "parts", rows: "nope" },
      { action: "insert", table: "parts", rows: [{ nope: 1 }] },
      { action: "increment", table: "parts", id: "PT-1", field: "name", delta: 1 }, // text, not a number
      { action: "increment", table: "parts", id: "PT-1", field: "_owner", delta: 1 },
      { action: "increment", table: "parts", id: "PT-1", field: "quantity", delta: "1" },
      { action: "increment", table: "parts", id: "PT-1", field: "quantity", delta: 1, set: { evil: 1 } },
      { action: "remove", table: "parts", ids: Array.from({ length: 1001 }, (_, i) => `PT-${i}`) },
      { action: "setMeta", key: "somethingElse", value: 1 },
      { action: "delete-everything" },
    ]) {
      const { res, w } = await run(body);
      expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(400);
      expect(w.calls).toHaveLength(0);
    }
  });

  it("a version-checked replace says whether it saved", async () => {
    const w = fakeWix();
    await handleInventoryRequest(post({ action: "insert", table: "parts", rows: [{ id: "PT-1", quantity: 5, version: 1 }] }), { verify: teamMember, writes: w.writes });
    const first = await (await handleInventoryRequest(post({ action: "replace", table: "parts", row: { id: "PT-1", quantity: 4, version: 2 }, ifVersion: 1 }), { verify: teamMember, writes: w.writes })).json();
    const stale = await (await handleInventoryRequest(post({ action: "replace", table: "parts", row: { id: "PT-1", quantity: 3, version: 2 }, ifVersion: 1 }), { verify: teamMember, writes: w.writes })).json();
    expect(first).toEqual({ ok: true, saved: true });
    expect(stale).toEqual({ ok: true, saved: false });
    expect(w.store.get("inventory_parts/PT-1")?.quantity).toBe(4);
  });

  it("+/- quantity is one atomic patch that also bumps the version", async () => {
    const w = fakeWix();
    w.store.set("inventory_parts/PT-1", { _id: "PT-1", quantity: 5, version: 1 });
    const res = await handleInventoryRequest(post({ action: "increment", table: "parts", id: "PT-1", field: "quantity", delta: -2, set: { updatedAt: "2026-11-16T10:00:00Z" } }), { verify: teamMember, writes: w.writes });
    const body = await res.json();
    expect(w.calls.filter((c) => c.fn === "patch")).toHaveLength(1);
    expect(body.row).toMatchObject({ id: "PT-1", quantity: 3, version: 2 });
  });

  it("splits big inserts into requests of at most 1000", async () => {
    const w = fakeWix();
    await w.writes.insert("parts", Array.from({ length: 2500 }, (_, i) => ({ id: `PT-${i}`, quantity: 1, version: 1 })));
    expect(w.calls.filter((c) => c.fn === "bulkInsert").map((c) => (c.args[1] as unknown[]).length)).toEqual([1000, 1000, 500]);
  });

  it("reports Wix's errors from a bulk change", async () => {
    const w = fakeWix();
    w.fns.bulkInsert = async () => ({ errors: [{ message: "quota" }] });
    const res = await handleInventoryRequest(post({ action: "insert", table: "parts", rows: [{ id: "PT-9", quantity: 1, version: 1 }] }), { verify: teamMember, writes: w.writes });
    expect(res.status).toBe(500);
  });
});

describe("browser store", () => {
  it("reads directly and sends every change to /api/inventory with the session cookie", async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return new Response(JSON.stringify({ ok: true, saved: true, row: { id: "PT-1", quantity: 3 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const reads = { list: async () => [{ id: "PT-1" }], get: async () => ({ id: "PT-1" }), getMeta: async () => ({ x: 1 }) };
    const store = new RemoteWriteStore(reads, postInventory(fetchImpl));

    expect(await store.list("parts")).toEqual([{ id: "PT-1" }]);
    expect(await store.getMeta("packingMeta")).toEqual({ x: 1 });
    expect(sent).toHaveLength(0); // reads never touch /api

    expect(await store.replace("parts", { id: "PT-1", version: 2 }, 1)).toBe(true);
    expect(await store.increment("parts", "PT-1", "quantity", -2, {})).toEqual({ id: "PT-1", quantity: 3 });
    await store.insert("parts", [{ id: "PT-2" }]);
    await store.remove("parts", ["PT-2"]);
    await store.setMeta("packingMeta", { y: 2 });

    expect(sent.map((s) => JSON.parse(String(s.init.body)).action)).toEqual(["replace", "increment", "insert", "remove", "setMeta"]);
    expect(sent.every((s) => s.url === "/api/inventory" && s.init.credentials === "same-origin")).toBe(true);
    expect(sent.every((s) => !(s.init.headers as Record<string, string>).Authorization)).toBe(true);
  });

  it("shows the server's message when a change is refused", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: { code: "forbidden", message: "Only team members can change the inventory." } }), { status: 403 })) as unknown as typeof fetch;
    const store = new RemoteWriteStore({ list: async () => [], get: async () => null, getMeta: async () => null }, postInventory(fetchImpl));
    await expect(store.remove("parts", ["PT-1"])).rejects.toThrow("Only team members can change the inventory.");
  });
});
