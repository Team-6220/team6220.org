// What Apollo (the team's Hermes agent) can do through the ops API, with its own key, and that everything it does is
// recorded under the Apollo user. These are the actions documented in backend/apps-script/ops-api/README.md.
import { beforeEach, describe, expect, it } from "vitest";
import { icarus, ops } from "../src/index";
import { APOLLO_KEY, makeScript } from "./helpers/ops-api-script";

const lead = "tok-lead-0123456789abcdef";

describe("Apollo through the ops API", () => {
  let s: ReturnType<typeof makeScript>;
  const apollo = (action: string, args: object = {}) => s.post({ action, apiKey: APOLLO_KEY, ...args });

  beforeEach(() => {
    s = makeScript({ [lead]: { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] } });
  });

  it("creates tasks and subtasks with the website's numbering, under the Apollo user", () => {
    const parent = apollo("saveTask", { task: { title: "Wire the elevator", subteams: ["Programming"], dueDate: "2027-02-01" } });
    expect(parent).toMatchObject({ ok: true, task: { number: "1", createdBy: "apollo", status: "not-started", subteams: ["Programming"] } });
    const child = apollo("saveTask", { task: { title: "Crimp connectors", parentId: parent.task._id } });
    expect(child.task.number).toBe("1.1");
    expect(apollo("saveTask", { task: { title: "Bad", subteams: ["Lead"] } })).toMatchObject({ ok: false, error: "bad-request" });
    expect(apollo("saveTask", { task: { title: "Backwards", startDate: "2027-02-02", dueDate: "2027-02-01" } })).toMatchObject({ ok: false, error: "bad-request" });

    // Changing one field leaves the rest alone.
    const done = apollo("saveTask", { task: { _id: parent.task._id, status: "done" } });
    expect(done.task).toMatchObject({ title: "Wire the elevator", status: "done", dueDate: "2027-02-01" });
    expect(s.rows("ops_history").map((h) => [h.actorName, h.action])).toEqual([["Apollo", "created"], ["Apollo", "created"], ["Apollo", "edited"]]);
  });

  it("lists tasks with filters, comments on them, and summarises what needs attention", () => {
    const a = apollo("saveTask", { task: { title: "Overdue thing", dueDate: "2020-01-01", ownerIds: ["m-lead"] } }).task;
    apollo("saveTask", { task: { title: "Waiting", blockedBy: [a._id] } });
    apollo("saveTask", { task: { title: "Finished", status: "done" } });
    expect(apollo("listTasks", { status: "open" }).tasks.map((t: { title: string }) => t.title)).toEqual(["Overdue thing", "Waiting"]);
    expect(apollo("listTasks", { assigneeId: "m-lead" }).tasks).toHaveLength(1);
    expect(apollo("listTasks", { search: "finish" }).tasks).toHaveLength(1);
    expect(apollo("addTaskComment", { taskId: a._id, body: "Reminder posted" })).toMatchObject({ ok: true, comment: { authorName: "Apollo", body: "Reminder posted" } });

    const attention = apollo("needsAttention");
    expect(attention.overdueTasks.map((t: { title: string }) => t.title)).toEqual(["Overdue thing"]);
    expect(attention.blockedTasks.map((t: { title: string }) => t.title)).toEqual(["Waiting"]);
  });

  it("receives a BOM line into a linked Inventory part, but won't guess an unlinked one", () => {
    // A line that is ordered, set up with the real actions as a lead and two approvers would.
    const { bom } = s.post({ action: "saveBom", token: lead, bom: { name: "2027" } });
    const { sections } = s.post({ action: "createOrder", token: lead, order: { bomId: bom._id } });
    const sectionId = sections[0]._id;
    const line = s.post({ action: "saveLine", token: lead, line: { sectionId, name: "NEO Vortex", unitCost: 90, quantity: 4 } }).line;
    const ordered = { ...line, signatures: [{ memberId: "a", name: "A", at: "" }, { memberId: "b", name: "B", at: "" }], orderedAt: "2027-01-12T00:00:00Z" };
    s.rows("bom_lines").splice(0, 1, ordered);
    s.rows("inventory_parts").push({ _id: "PT-1", name: "NEO Vortex", quantity: 2, version: 5 });

    expect(apollo("receiveLines", { items: [{ lineId: line._id, quantity: 1, addToInventory: true }] })).toMatchObject({ ok: false, error: "bad-request" });
    expect(s.rows("bom_lines")[0].receivedQty).toBe(0); // nothing half-done

    const answer = apollo("receiveLines", { items: [{ lineId: line._id, quantity: 3, inventoryItemId: "PT-1", addToInventory: true }] });
    expect(answer).toMatchObject({ ok: true, lines: [{ receivedQty: 3, inventoryItemId: "PT-1", receivedBy: { name: "Apollo" } }] });
    expect(s.rows("inventory_parts")[0]).toMatchObject({ quantity: 5, version: 6 });
    expect(s.rows("ops_history").at(-1)).toMatchObject({ actorName: "Apollo", action: "added stock", recordId: "PT-1" });
  });

  it("is refused everything not opened to it", () => {
    for (const action of ["signLines", "approveSection", "markOrdered", "saveProject", "setSubteams", "removeLine", "saveIcarusRecord"]) {
      expect(apollo(action), action).toMatchObject({ ok: false, error: "forbidden" });
    }
  });
});

describe("needs attention in demo mode", () => {
  beforeEach(() => ops.resetMock());

  it("gives the same summary shape from the demo data", async () => {
    const attention = await icarus.needsAttention();
    expect(Object.keys(attention).sort()).toEqual(["blockedTasks", "linesWaitingForSignatures", "orderedNotReceived", "overdueTasks", "partsPendingSetup"]);
    expect(attention.linesWaitingForSignatures.length).toBeGreaterThan(0);
  });
});
