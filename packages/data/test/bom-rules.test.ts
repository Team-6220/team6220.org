// The BOM rules, checked against BOTH backends with the same steps:
//   - the real one: backend/apps-script/ops-api/Bom.gs, run in Node against a fake Wix;
//   - the demo one: packages/data/src/bom/mock.ts.
// If a rule is changed in one and not the other, the matching test fails for one of them.
import { beforeEach, describe, expect, it } from "vitest";
import "../src/bom"; // registers the demo actions
import { mockDb, mockTransport, resetMock } from "../src/ops/mock";
import { makeScript } from "./helpers/ops-api-script";

type Answer = Record<string, any>;
interface Backend {
  /** Sends one action as a role: "lead", "member", "mentor", "booster" or "supervisor". */
  send(role: string, action: string, args?: Record<string, unknown>): Promise<Answer>;
}

function realBackend(): Backend {
  const tokens: Record<string, string> = {
    lead: "tok-lead-0123456789abcdef",
    member: "tok-member-0123456789abcdef",
    mentor: "tok-mentor-0123456789abcdef",
    booster: "tok-booster-0123456789abcdef",
    supervisor: "tok-supervisor-0123456789abcdef",
  };
  const script = makeScript({
    [tokens.lead]: { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] },
    [tokens.member]: { id: "m-member", status: "APPROVED", badges: ["b-team"] },
    [tokens.mentor]: { id: "m-mentor", status: "APPROVED", badges: ["b-mentor"] },
    [tokens.booster]: { id: "m-booster", status: "APPROVED", badges: ["b-booster"] },
    [tokens.supervisor]: { id: "m-supervisor", status: "APPROVED", badges: ["b-supervisor"] },
  });
  return { send: async (role, action, args = {}) => script.post({ action, token: tokens[role], ...args }) };
}

function demoBackend(): Backend {
  resetMock();
  // Start from empty BOM collections so both backends see the same thing.
  for (const collection of ["bom_boms", "bom_orders", "bom_sections", "bom_lines"]) mockDb().rows(collection).length = 0;
  return { send: (role, action, args = {}) => mockTransport({ action, token: `mock:${role}`, ...args }) };
}

describe.each([
  ["ops-api (Bom.gs)", realBackend],
  ["demo (bom/mock.ts)", demoBackend],
])("BOM rules: %s", (_name, makeBackend) => {
  let b: Backend;
  let sectionId: string;

  /** Adds a line as a team member and returns it. */
  async function addLine(name = "NEO Vortex", unitCost = 90, quantity = 4): Promise<Answer> {
    const answer = await b.send("member", "saveLine", { line: { sectionId, name, unitCost, quantity, link: "https://example.com/item" } });
    expect(answer).toMatchObject({ ok: true });
    return answer.line;
  }

  beforeEach(async () => {
    b = makeBackend();
    const { bom } = await b.send("lead", "saveBom", { bom: { name: "2027 Competition BOM", season: "2027" } });
    const created = await b.send("lead", "createOrder", { order: { bomId: bom._id } });
    expect(created.order).toMatchObject({ sequence: 1, projectId: "" });
    expect(created.sections.map((s: Answer) => s.vendor)).toContain("REV Robotics");
    sectionId = created.sections.find((s: Answer) => s.vendor === "REV Robotics")._id;
  });

  it("only lets leads create BOMs and orders, and numbers orders per project", async () => {
    expect(await b.send("member", "saveBom", { bom: { name: "x" } })).toMatchObject({ ok: false, error: "forbidden" });
    const { bom } = await b.send("lead", "saveBom", { bom: { name: "Offseason" } });
    const order = (args: object) => b.send("lead", "createOrder", { order: { bomId: bom._id, ...args } });
    expect((await order({})).order.sequence).toBe(1);
    expect((await order({})).order.sequence).toBe(2);
    expect((await order({ projectId: "p-summer-bot" })).order.sequence).toBe(1);
    expect((await order({ projectId: "p-summer-bot" })).order.sequence).toBe(2);
  });

  it("lets a supervisor change nothing", async () => {
    const line = await addLine();
    for (const [action, args] of [
      ["saveLine", { line: { sectionId, name: "x", unitCost: 1, quantity: 1 } }],
      ["removeLine", { lineId: line._id }],
      ["signLines", { lineIds: [line._id] }],
      ["approveSection", { sectionId }],
      ["markOrdered", { sectionId, orderDate: "2027-01-12", finalTotal: 1 }],
      ["receiveLines", { items: [{ lineId: line._id, quantity: 1 }] }],
    ] as const) {
      expect(await b.send("supervisor", action, args), action).toMatchObject({ ok: false, error: "forbidden" });
    }
  });

  it("needs two signatures from two different people, each a mentor or a booster", async () => {
    const line = await addLine();
    expect(await b.send("member", "signLines", { lineIds: [line._id] })).toMatchObject({ ok: false, error: "forbidden" });
    expect(await b.send("lead", "signLines", { lineIds: [line._id] })).toMatchObject({ ok: false, error: "forbidden" });

    const first = await b.send("mentor", "signLines", { lineIds: [line._id] });
    expect(first).toMatchObject({ ok: true, total: 360, skipped: [] });
    expect(first.signed[0].signatures).toMatchObject([{ memberId: expect.stringContaining("mentor") }]);

    const again = await b.send("mentor", "signLines", { lineIds: [line._id] });
    expect(again).toMatchObject({ ok: true, signed: [], total: 0, skipped: [{ lineId: line._id, reason: "You already signed this line." }] });

    const second = await b.send("booster", "signLines", { lineIds: [line._id] });
    expect(second.signed[0].signatures).toHaveLength(2);
    const third = await b.send("booster", "signLines", { lineIds: [line._id] });
    expect(third.skipped[0].reason).toBe("Already has two signatures.");
  });

  it("signs many lines at once and skips only the ones it can't", async () => {
    const a = await addLine("Motor", 10.1, 3);
    const c = await addLine("Controller", 0.2, 1);
    await b.send("mentor", "signLines", { lineIds: [a._id] });
    const answer = await b.send("mentor", "signLines", { lineIds: [a._id, c._id, "no-such-line"] });
    expect(answer.signed.map((l: Answer) => l.name)).toEqual(["Controller"]);
    expect(answer.skipped.map((s: Answer) => s.lineId)).toEqual([a._id, "no-such-line"]);
    expect(answer.total).toBe(0.2);
  });

  it("removes the signatures when what is being bought changes, but not for a comment", async () => {
    const line = await addLine();
    await b.send("mentor", "signLines", { lineIds: [line._id] });
    const edit = (changes: object) => b.send("member", "saveLine", { line: { ...line, ...changes } });
    expect(await edit({ comments: "for the shooter" })).toMatchObject({ signaturesCleared: false, line: { signatures: [{}] } });
    expect(await edit({ unitCost: 95 })).toMatchObject({ signaturesCleared: true, line: { signatures: [], unitCost: 95 } });
  });

  it("only removes a line nobody has signed; a lead can reopen one", async () => {
    const line = await addLine();
    await b.send("mentor", "signLines", { lineIds: [line._id] });
    expect(await b.send("member", "removeLine", { lineId: line._id })).toMatchObject({ ok: false, error: "conflict" });
    expect(await b.send("member", "reopenLine", { lineId: line._id })).toMatchObject({ ok: false, error: "forbidden" });
    expect(await b.send("lead", "reopenLine", { lineId: line._id })).toMatchObject({ ok: true, line: { signatures: [] } });
    expect(await b.send("member", "removeLine", { lineId: line._id })).toMatchObject({ ok: true });
  });

  it("orders only fully signed lines, after Approval to Order, and only for mentors and boosters", async () => {
    const ready = await addLine("Ready", 10, 1);
    const half = await addLine("Signed once", 10, 1);
    await b.send("mentor", "signLines", { lineIds: [ready._id, half._id] });
    await b.send("booster", "signLines", { lineIds: [ready._id] });
    const order = { sectionId, orderDate: "2027-01-12", finalTotal: 11.37 };

    expect(await b.send("mentor", "markOrdered", order)).toMatchObject({ ok: false, error: "conflict" }); // no approval yet
    expect(await b.send("member", "approveSection", { sectionId })).toMatchObject({ ok: false, error: "forbidden" });
    expect(await b.send("booster", "approveSection", { sectionId })).toMatchObject({ ok: true, section: { approval: { name: expect.any(String) } } });
    expect(await b.send("member", "markOrdered", order)).toMatchObject({ ok: false, error: "forbidden" });

    const answer = await b.send("mentor", "markOrdered", order);
    expect(answer).toMatchObject({ ok: true, notReady: 1, section: { finalTotal: 11.37, orderDate: "2027-01-12" } });
    expect(answer.ordered.map((l: Answer) => l.name)).toEqual(["Ready"]);
    // An ordered line is frozen.
    expect(await b.send("member", "saveLine", { line: { ...ready, unitCost: 1 } })).toMatchObject({ ok: false, error: "conflict" });
  });

  it("refuses to order a section where no line has two signatures", async () => {
    const line = await addLine();
    await b.send("mentor", "signLines", { lineIds: [line._id] });
    await b.send("mentor", "approveSection", { sectionId });
    expect(await b.send("mentor", "markOrdered", { sectionId, orderDate: "2027-01-12", finalTotal: 5 })).toMatchObject({ ok: false, error: "conflict" });
  });

  it("receives ordered lines, in parts, and never more than was ordered", async () => {
    const line = await addLine("Zip ties", 12.99, 3);
    const receive = (quantity: number) => b.send("member", "receiveLines", { items: [{ lineId: line._id, quantity }] });
    expect(await receive(1)).toMatchObject({ ok: false, error: "conflict" }); // not ordered yet
    await b.send("mentor", "signLines", { lineIds: [line._id] });
    await b.send("booster", "signLines", { lineIds: [line._id] });
    await b.send("mentor", "approveSection", { sectionId });
    await b.send("mentor", "markOrdered", { sectionId, orderDate: "2027-01-12", finalTotal: 42 });

    expect((await receive(2)).lines[0]).toMatchObject({ receivedQty: 2, receivedBy: { name: expect.any(String) } });
    expect(await receive(2)).toMatchObject({ ok: false, error: "bad-request" });
    expect((await receive(1)).lines[0]).toMatchObject({ receivedQty: 3 });
  });

  it("imports a sheet tab with typed names kept as 'imported', not as real signatures", async () => {
    const { bom } = await b.send("lead", "saveBom", { bom: { name: "2026 Offseason BOM" } });
    const sections = [{
      vendor: "Amazon", orderDate: "6/1/2026", approvalName: "Tamas V", finalTotal: 335.09,
      lines: [{ name: "V-Block pair", link: "", vendorPartNumber: "", unitCost: 29.99, quantity: 1, comments: "", signatureNames: ["Tamas V", "Laura H"], ordered: true, received: true }],
    }];
    expect(await b.send("member", "importOrder", { bomId: bom._id, customName: "Order 1", sections })).toMatchObject({ ok: false, error: "forbidden" });
    expect(await b.send("lead", "importOrder", { bomId: bom._id, customName: "Order 1", sections })).toMatchObject({ ok: true, order: { customName: "Order 1", sequence: 1 } });
  });
});
