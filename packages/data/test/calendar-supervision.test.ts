// Calendar supervision on the server (ops/server/supervision.ts): supervisors' paperwork on their account rows,
// signing up for shifts, withdrawing, old-sheet shifts moving onto an account by name, and the notifications.
import { beforeEach, describe, expect, it } from "vitest";
import type { Shift } from "../src/calendar/types";
import { makeOps } from "./helpers/ops-server";

const lead = "tok-lead-0123456789abcdef";
const booster = "tok-booster-0123456789abcdef";
const member = "tok-member-0123456789abcdef";
const parent = "tok-parent-0123456789abcdef";
const newParent = "tok-newparent-0123456789abcdef";

function team() {
  const s = makeOps({
    [lead]: { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] },
    [booster]: { id: "m-booster", status: "APPROVED", badges: ["b-booster"] },
    [member]: { id: "m-member", status: "APPROVED", badges: ["b-team"] },
    [parent]: { id: "m-parent", status: "APPROVED", badges: ["b-supervisor"] },
    [newParent]: { id: "m-new", status: "PENDING", badges: [] },
  });
  for (const [memberId, name] of [["m-lead", "Lee Lead"], ["m-booster", "Bo Booster"], ["m-member", "Mo Member"], ["m-parent", "Pat Parent"], ["m-new", "Nia New"]]) {
    s.rows("ops_people").push({ _id: `person-${memberId}`, memberId, name, active: true });
  }
  s.setNow(new Date("2026-11-22T20:00:00Z"));
  return s;
}

const inboxOf = (s: ReturnType<typeof team>, memberId: string) => s.rows("ops_notifications").filter((n) => n.recipientId === memberId);

describe("supervision", () => {
  let s: ReturnType<typeof team>;
  let shiftId: string;
  beforeEach(async () => {
    s = team();
    const saved = await s.post({ action: "saveCalEvent", token: lead, event: { type: "meeting", startDate: "2026-11-24", startTime: "15:20", endTime: "17:00" }, shifts: [{ start: "15:20", end: "17:00" }] });
    shiftId = (s.rows("cal_shifts") as Shift[]).find((x) => x.eventId === saved.event._id)!._id;
    await s.post({ action: "saveSupervisor", token: booster, memberId: "m-parent", supervisor: { status: "approved" } });
  });

  it("lets an approved supervisor sign up, but not a member who isn't one", async () => {
    expect((await s.post({ action: "signUpShift", token: member, shiftId })).error).toBe("forbidden");
    const answer = await s.post({ action: "signUpShift", token: parent, shiftId });
    expect(answer.shift).toMatchObject({ memberId: "m-parent", name: "Pat Parent" });
    expect((await s.post({ action: "signUpShift", token: lead, shiftId, memberId: "nobody" })).error).toBe("bad-request");
  });

  it("refuses a shift someone else has", async () => {
    await s.post({ action: "signUpShift", token: parent, shiftId });
    const other = await s.post({ action: "saveSupervisor", token: lead, memberId: "m-lead", supervisor: { status: "approved" } });
    expect(other.supervisor).toMatchObject({ memberId: "m-lead", name: "Lee Lead", status: "approved" });
    expect(await s.post({ action: "signUpShift", token: lead, shiftId })).toMatchObject({ ok: false, error: "bad-request" });
  });

  it("lets a lead put a supervisor in a shift, and tells them", async () => {
    expect((await s.post({ action: "signUpShift", token: member, shiftId, memberId: "m-parent" })).error).toBe("forbidden");
    expect((await s.post({ action: "signUpShift", token: lead, shiftId, memberId: "m-parent" })).shift.memberId).toBe("m-parent");
    expect(inboxOf(s, "m-parent")).toMatchObject([{ kind: "shift.changed" }]);
  });

  it("withdraws, reopens the shift and tells the leads and other supervisors, not the one who withdrew", async () => {
    await s.post({ action: "signUpShift", token: parent, shiftId });
    expect((await s.post({ action: "withdrawShift", token: member, shiftId })).error).toBe("forbidden");
    expect((await s.post({ action: "withdrawShift", token: parent, shiftId })).shift).toMatchObject({ memberId: "", name: "" });
    expect(inboxOf(s, "m-lead")).toMatchObject([{ kind: "shift.opened" }]);
    expect(inboxOf(s, "m-parent")).toHaveLength(0);
  });

  it("tells a supervisor when their meeting changes and their shift goes", async () => {
    await s.post({ action: "signUpShift", token: parent, shiftId });
    const event = s.rows("cal_events")[0];
    await s.post({ action: "saveCalEvent", token: lead, event: { ...event, endTime: "18:00" }, shifts: [{ start: "15:20", end: "18:00" }] });
    expect(inboxOf(s, "m-parent")).toMatchObject([{ kind: "shift.changed" }]);
  });

  it("reminds a supervisor the day before, once", async () => {
    await s.post({ action: "signUpShift", token: parent, shiftId });
    s.setNow(new Date("2026-11-23T20:00:00Z"));
    expect((await s.job("runReminders")).body).toMatchObject({ ok: true, reminders: 1 });
    expect((await s.job("runReminders")).body).toMatchObject({ ok: true, reminders: 0 });
    expect(inboxOf(s, "m-parent")).toMatchObject([{ kind: "shift.reminder" }]);
  });

  it("approving gives the badge, approves the account and moves the old sheet's shifts with their name", async () => {
    (s.rows("cal_shifts") as Shift[]).push({ _id: "old", eventId: "gone", start: "15:20", end: "17:00", memberId: "", name: "nia new", signedUpAt: "" });
    await s.post({ action: "saveSupervisor", token: booster, memberId: "m-new", supervisor: { status: "approved" } });
    expect((s.rows("cal_shifts") as Shift[]).find((x) => x._id === "old")?.memberId).toBe("m-new");
    expect(s.members[newParent]).toMatchObject({ status: "APPROVED", badges: ["b-supervisor"] });
    expect(s.rows("ops_people").find((p) => p.memberId === "m-new")?.supervisor).toMatchObject({ status: "approved" });
    expect((await s.post({ action: "saveSupervisor", token: booster, memberId: "m-nobody", supervisor: { status: "approved" } })).error).toBe("bad-request");
  });

  it("shows paperwork steps only to leads, mentors and boosters", async () => {
    await s.post({ action: "saveSupervisor", token: booster, memberId: "m-new", supervisor: { status: "started", steps: ["done", "waiting"] } });
    const seen = (await s.post({ action: "listRecords", token: member, collection: "ops_people" })).items.find((p: { memberId: string }) => p.memberId === "m-new");
    expect(seen.supervisor).toEqual({ status: "started", steps: [], approvedMonth: "" });
    const lead_ = (await s.post({ action: "listRecords", token: lead, collection: "ops_people" })).items.find((p: { memberId: string }) => p.memberId === "m-new");
    expect(lead_.supervisor.steps).toEqual(["done", "waiting", "", "", ""]);
  });

  it("lets anyone signed in ask to supervise, before their account is approved, and tells the managers", async () => {
    expect((await s.post({ action: "mySupervisorRow", token: newParent })).supervisor).toBeNull();
    const asked = await s.post({ action: "askToSupervise", token: newParent });
    expect(asked.supervisor).toMatchObject({ memberId: "m-new", name: "Nia New", status: "started", steps: ["waiting", "", "", "", ""] });
    expect((await s.post({ action: "mySupervisorRow", token: newParent })).supervisor.status).toBe("started");
    await s.post({ action: "askToSupervise", token: newParent });
    expect(inboxOf(s, "m-booster")).toMatchObject([{ kind: "supervisor.request" }]);
    expect((await s.post({ action: "saveSupervisor", token: member, memberId: "m-new", supervisor: { status: "approved" } })).error).toBe("forbidden");
  });
});
