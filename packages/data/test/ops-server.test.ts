// What is new in the Wix version of the operations server (https://github.com/Team-6220/team6220.org/wiki/History-Phase-2): the 20-calls-per-request limit, the timer,
// GitHub's webhook, and the actions that had a script lock before. The rules themselves are in ops-api.test.ts,
// bom-rules.test.ts, icarus.test.ts, events.test.ts and github-sync.test.ts.
import { beforeEach, describe, expect, it } from "vitest";
import { CALLS_PER_REQUEST, withCallBudget } from "../src/ops/server";
import { APOLLO_KEY, makeOps, TIMER_SECRET, type Member } from "./helpers/ops-server";

const lead = "tok-lead-0123456789abcdef";
const mentor = "tok-mentor-0123456789abcdef";
const booster = "tok-booster-0123456789abcdef";
const member = "tok-member-0123456789abcdef";
const REPO = "Team-6220/robot-2027";

function team(extra: Record<string, Member> = {}) {
  return makeOps({
    [lead]: { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] },
    [mentor]: { id: "m-mentor", status: "APPROVED", badges: ["b-mentor"] },
    [booster]: { id: "m-booster", status: "APPROVED", badges: ["b-booster"] },
    [member]: { id: "m-member", status: "APPROVED", badges: ["b-team"] },
    ...extra,
  });
}

describe("each request stays inside Wix's 20 calls", () => {
  let s: ReturnType<typeof team>;
  beforeEach(() => {
    s = team();
  });

  /** An order with one vendor section, ready for lines. */
  async function sectionWithLines(count: number) {
    const bom = (await s.post({ action: "saveBom", token: lead, bom: { name: "2027" } })).bom;
    const order = await s.post({ action: "createOrder", token: lead, order: { bomId: bom._id } });
    expect(s.calls.length).toBeLessThanOrEqual(CALLS_PER_REQUEST);
    const sectionId = order.sections[0]._id;
    const lines = Array.from({ length: count }, (_, i) => ({ name: `Part ${i}`, unitCost: 2.5, quantity: 2 }));
    const ids: string[] = [];
    for (let at = 0; at < count; at += 100) {
      const answer = await s.post({ action: "addLines", token: member, sectionId, lines: lines.slice(at, at + 100) });
      expect(answer.ok).toBe(true);
      ids.push(...answer.lines.map((l: { _id: string }) => l._id));
    }
    return { sectionId, ids };
  }

  it("signs 200 lines with a handful of calls", async () => {
    const { ids } = await sectionWithLines(200);
    const answer = await s.post({ action: "signLines", token: mentor, lineIds: ids });
    expect(answer).toMatchObject({ ok: true, total: 1000 });
    expect(answer.signed).toHaveLength(200);
    expect(s.calls.length).toBeLessThanOrEqual(4);
  });

  it("signs a line listed twice only once", async () => {
    const { ids } = await sectionWithLines(1);
    const answer = await s.post({ action: "signLines", token: mentor, lineIds: [ids[0], ids[0]] });
    expect(answer.signed).toHaveLength(1);
    expect(answer.skipped).toEqual([{ lineId: ids[0], reason: "You already signed this line." }]);
    expect(answer.signed[0].signatures).toHaveLength(1);
  });

  it("orders, receives and adds stock for 200 lines in one request each", async () => {
    const { sectionId, ids } = await sectionWithLines(200);
    await s.post({ action: "signLines", token: mentor, lineIds: ids });
    await s.post({ action: "signLines", token: booster, lineIds: ids });
    await s.post({ action: "approveSection", token: mentor, sectionId });
    const ordered = await s.post({ action: "markOrdered", token: mentor, sectionId, orderDate: "2027-01-12", finalTotal: 1100 });
    expect(ordered).toMatchObject({ ok: true, notReady: 0 });
    expect(ordered.ordered).toHaveLength(200);
    expect(s.calls.length).toBeLessThanOrEqual(6);
    const received = await s.post({ action: "receiveLines", token: member, items: ids.map((lineId) => ({ lineId, quantity: 2 })) });
    expect(received.lines).toHaveLength(200);
    expect(s.calls.length).toBeLessThanOrEqual(6);
  });

  it("lets Apollo add received stock to a linked part, once per line, even when lines share a part", async () => {
    const { sectionId, ids } = await sectionWithLines(2);
    await s.post({ action: "signLines", token: mentor, lineIds: ids });
    await s.post({ action: "signLines", token: booster, lineIds: ids });
    await s.post({ action: "approveSection", token: mentor, sectionId });
    await s.post({ action: "markOrdered", token: mentor, sectionId, orderDate: "2027-01-12", finalTotal: 12 });
    s.rows("inventory_parts").push({ _id: "PT-1", quantity: 10, version: 3 });
    const answer = await s.post({ action: "receiveLines", apiKey: APOLLO_KEY, items: ids.map((lineId) => ({ lineId, quantity: 2, inventoryItemId: "PT-1", addToInventory: true })) });
    expect(answer.ok).toBe(true);
    expect(s.rows("inventory_parts")[0]).toMatchObject({ quantity: 14, version: 5 });
    // A part that isn't linked is refused, and nothing is received.
    const refused = await s.post({ action: "receiveLines", apiKey: APOLLO_KEY, items: [{ lineId: ids[0], quantity: 1, inventoryItemId: "", addToInventory: true }] });
    expect(refused).toMatchObject({ ok: false, error: "bad-request" });
  });

  it("imports 500 lines in a handful of calls, and writes nothing when one line is bad", async () => {
    const bom = (await s.post({ action: "saveBom", token: lead, bom: { name: "Old" } })).bom;
    const lines = Array.from({ length: 250 }, (_, i) => ({ name: `Old part ${i}`, unitCost: 1, quantity: 1, ordered: true }));
    const sections = [{ vendor: "Amazon", lines }, { vendor: "McMaster-Carr", lines }];
    const answer = await s.post({ action: "importOrder", token: lead, bomId: bom._id, customName: "Old sheet", sections });
    expect(answer.ok).toBe(true);
    expect(s.calls.length).toBeLessThanOrEqual(8);
    expect(s.rows("bom_lines")).toHaveLength(500);

    const before = s.rows("bom_orders").length;
    const bad = await s.post({ action: "importOrder", token: lead, bomId: bom._id, sections: [{ vendor: "Amazon", lines: [{ name: "Fine", unitCost: 1, quantity: 1 }, { name: "Broken", unitCost: 1, quantity: 0 }] }] });
    expect(bad).toMatchObject({ ok: false, error: "bad-request" });
    expect(s.rows("bom_orders")).toHaveLength(before);
  });

  it("changes 50 people's subteams with two badge calls", async () => {
    const extra: Record<string, Member> = {};
    for (let i = 0; i < 50; i++) extra[`tok-person-${i}-0123456789abcdef`] = { id: `m-${i}`, status: "APPROVED", badges: ["b-team", i % 2 ? "b-design" : "b-programming"] };
    s = team(extra);
    for (let i = 0; i < 50; i++) s.rows("ops_people").push({ _id: `p-${i}`, memberId: `m-${i}`, name: `Person ${i}`, subteams: [], active: true });
    const answer = await s.post({ action: "setSubteams", token: lead, memberIds: Object.values(extra).map((m) => m.id), subteams: ["Design"] });
    expect(answer).toMatchObject({ ok: true, changed: 50 });
    expect(s.calls.length).toBeLessThanOrEqual(8);
    expect(Object.values(extra).every((m) => m.badges.includes("b-design") && !m.badges.includes("b-programming") && m.badges.includes("b-team"))).toBe(true);
  });

  it("refuses with 'busy' instead of going over the limit", async () => {
    const quiet = withCallBudget(
      {
        data: { query: async () => [], queryIds: async () => [], insert: async (_c, d) => d, insertMany: async (_c, d) => d, save: async (_c, d) => d, saveMany: async (_c, d) => d, remove: async () => {}, increment: async () => null },
        badges: { list: async () => [], assignmentsOf: async () => [], assign: async () => {}, removeAssignments: async () => {} },
        members: { list: async () => [] },
        secret: async () => undefined,
        fetch: (async () => new Response("{}")) as typeof fetch,
        cache: { get: () => undefined, put: () => {}, remove: () => {} },
        now: () => new Date(),
        callsLeft: () => Infinity,
      },
      2,
    );
    await quiet.data.query("x");
    expect(quiet.callsLeft()).toBe(1);
    await quiet.data.saveMany("x", []); // nothing to save costs nothing
    expect(quiet.callsLeft()).toBe(1);
    await quiet.data.query("x");
    await expect(quiet.data.query("x")).rejects.toMatchObject({ code: "busy" });
  });

  it("answers a cross-site request in a member's browser with 'forbidden', but not Apollo", async () => {
    const crossSite = await s.post({ action: "whoAmI", token: member }, { "Sec-Fetch-Site": "cross-site" });
    expect(crossSite).toMatchObject({ ok: false, error: "forbidden" });
    const sameSite = await s.post({ action: "whoAmI", token: member }, { "Sec-Fetch-Site": "same-origin" });
    expect(sameSite.ok).toBe(true);
  });
});

describe("numbers", () => {
  it("never repeat, even when asked for many at once, and the first request creates the counter", async () => {
    const s = team();
    expect((await s.post({ action: "nextNumber", token: member, kind: "task", count: 5 })).number).toBe(1);
    expect((await s.post({ action: "nextNumber", token: member, kind: "task" })).number).toBe(6);
    expect(s.rows("ops_counters")).toMatchObject([{ _id: "task", key: "task", next: 7 }]);
  });
});

describe("the timer", () => {
  it("runs a job only with the shared secret", async () => {
    const s = team();
    expect((await s.job("refreshEvents", null)).status).toBe(401);
    expect((await s.job("refreshEvents", "not-the-secret-0123456789")).status).toBe(401);
    s.secrets.delete("OPS_TIMER_SECRET");
    expect((await s.job("refreshEvents", TIMER_SECRET)).status).toBe(401); // no secret stored: nothing can call it
  });

  it("refuses unknown jobs, and wrong kinds of request", async () => {
    const s = team();
    expect((await s.job("deleteEverything")).body).toMatchObject({ ok: false, error: "bad-request" });
  });

  it("leaves events alone once they ended more than a week ago, and says how many are left", async () => {
    const s = team();
    s.setNow(new Date("2027-04-20T12:00:00Z"));
    await s.post({ action: "saveIcarusRecord", token: lead, kind: "event", record: { code: "2027casd", displayName: "San Diego", startDate: "2027-03-04", endDate: "2027-03-07", source: "tba" } });
    await s.post({ action: "saveIcarusRecord", token: lead, kind: "event", record: { code: "2027cala", displayName: "LA", startDate: "2027-04-18", endDate: "2027-04-21", source: "tba" } });
    const answer = await s.job("refreshEvents");
    expect(answer.body).toMatchObject({ ok: true, checked: 1, left: 0 });
    expect(s.tbaCalls).toHaveLength(1);
    expect(s.tbaCalls[0]).toContain("2027cala");
  });
});

describe("GitHub's webhook", () => {
  let s: ReturnType<typeof team>;
  const issue = (number: number, updated_at: string, extra = {}) => ({
    number, title: `Issue ${number}`, body: "", state: "open", state_reason: null, labels: [], assignees: [], html_url: `https://github.com/${REPO}/issues/${number}`, updated_at, ...extra,
  });
  beforeEach(async () => {
    s = team();
    await s.post({ action: "saveProject", token: lead, project: { name: "Robot code", githubRepo: REPO } });
    await s.post({ action: "saveProject", token: lead, project: { name: "Other", githubRepo: "Team-6220/other" } });
    s.github.repos[REPO] = [issue(1, "2027-01-09T00:00:00Z")];
    s.github.repos["Team-6220/other"] = [issue(5, "2027-01-09T00:00:00Z")];
  });

  it("refuses a request without GitHub's signature", async () => {
    expect((await s.webhook("issues", { repository: { full_name: REPO } }, "sha256=" + "0".repeat(64))).status).toBe(401);
    expect(s.github.gets).toEqual([]);
  });

  it("answers GitHub's ping, and ignores events it doesn't use", async () => {
    expect((await s.webhook("ping", { zen: "Keep it logically awesome." })).body).toMatchObject({ ok: true, pong: true });
    expect((await s.webhook("push", { repository: { full_name: REPO } })).body).toMatchObject({ ok: true, ignored: "push" });
    expect((await s.webhook("issues", { repository: { full_name: "someone-else/repo" } })).body).toMatchObject({ ok: true, ignored: "not a team repository" });
    expect(s.github.gets).toEqual([]);
  });

  it("brings in an issue at once, for that repository only", async () => {
    const answer = await s.webhook("issues", { action: "opened", repository: { full_name: REPO } });
    expect(answer.body).toMatchObject({ ok: true, repos: 1, pulled: 1 });
    expect(s.github.gets).toEqual([REPO]);
    expect(s.rows("icarus_tasks")).toMatchObject([{ title: "Issue 1", number: "1" }]);
  });

  it("does nothing when the change was our own (no bouncing back and forth)", async () => {
    await s.webhook("issues", { repository: { full_name: REPO } });
    const patches = s.github.patches.length;
    const again = await s.webhook("issues", { repository: { full_name: REPO } });
    expect(again.body).toMatchObject({ pulled: 0, pushed: 0 });
    expect(s.github.patches).toHaveLength(patches);
  });

  it("numbers many new issues in one step, reads three pages at most, and carries on next time", async () => {
    s.github.repos[REPO] = Array.from({ length: 350 }, (_, i) => issue(i + 1, new Date(Date.parse("2027-01-01T00:00:00Z") + i * 1000).toISOString()));
    const first = await s.webhook("issues", { repository: { full_name: REPO } });
    expect(first.body).toMatchObject({ ok: true, pulled: 300 });
    expect(s.calls.filter((c) => c === "increment").length).toBeLessThanOrEqual(2); // the first number of a kind also creates its counter
    expect(s.calls.length).toBeLessThanOrEqual(20); // a webhook has no session check, so it may use all 20
    const second = await s.webhook("issues", { repository: { full_name: REPO } });
    expect(second.body).toMatchObject({ ok: true });
    expect(s.rows("icarus_tasks")).toHaveLength(350);
    expect(new Set(s.rows("icarus_tasks").map((t) => t.number)).size).toBe(350);
  });
});
