// 1-2-3-100 on the server (ops/server/fundraising.ts): a student's pick, plans and results, Operations' approvals,
// what lands on the trackers, and who may do what.
import { beforeEach, describe, expect, it } from "vitest";
import { makeOps } from "./helpers/ops-server";

const ada = "tok-ada-0123456789abcdef";
const nik = "tok-nik-0123456789abcdef";
const ops = "tok-ops-0123456789abcdef";
const lead = "tok-lead-0123456789abcdef";
const mentor = "tok-mentor-0123456789abcdef";

const WORDS = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");

function team() {
  const s = makeOps({
    [ada]: { id: "m-ada", status: "APPROVED", badges: ["b-team", "b-programming"] },
    [nik]: { id: "m-nik", status: "APPROVED", badges: ["b-team", "b-design"] },
    [ops]: { id: "m-ops", status: "APPROVED", badges: ["b-team", "b-operations"] },
    [lead]: { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] },
    [mentor]: { id: "m-mentor", status: "APPROVED", badges: ["b-mentor"] },
  });
  for (const [memberId, name] of [["m-ada", "Ada Lovelace"], ["m-nik", "Nik Tesla"], ["m-ops", "Olive Ops"], ["m-lead", "Lee Lead"], ["m-mentor", "Mo Mentor"]]) s.rows("ops_people").push({ _id: `p-${memberId}`, memberId, name, subteams: [], active: true });
  s.setNow(new Date("2026-11-22T20:00:00Z"));
  return s;
}
type Team = ReturnType<typeof team>;
const inbox = (s: Team, id: string, kind: string) => s.rows("ops_notifications").filter((n) => n.recipientId === id && n.kind === kind);

async function pick(s: Team, token: string, option: string) {
  return s.post({ action: "bizPick", token, option });
}

describe("picking one", () => {
  it("lets a student pick one of the four and switch until Operations approves something", async () => {
    const s = team();
    expect((await pick(s, ada, "pizza")).message).toContain("Pick one of the four");
    expect((await pick(s, ada, "restaurant")).choice.option).toBe("restaurant");
    expect((await pick(s, ada, "grant")).choice.option).toBe("grant");
    const my = await s.post({ action: "bizMy", token: ada });
    expect(my.records.choice.option).toBe("grant");
    expect(my.settings).toMatchObject({ minWords: 75, restaurantLimit: 3, followUps: 2 });
    expect(my.rows[0]).toEqual({ step: "Pick one: Grants", status: "Done" });
  });
});

describe("restaurant day", () => {
  let s: Team;
  beforeEach(async () => {
    s = team();
    await pick(s, ada, "restaurant");
  });
  const make = (token = ada) => s.post({ action: "bizItemSave", token, kind: "restaurant", fields: { restaurant: "Chipotle", partner: "Nik Tesla", date: "2026-12-04", allDay: true, address: "near 1 Main St" } });

  it("needs a partner and a date, then waits for approval, and then the student sets it up", async () => {
    const bare = (await s.post({ action: "bizItemSave", token: ada, kind: "restaurant", fields: { restaurant: "Chipotle" } })).item;
    expect((await s.post({ action: "bizItemSend", token: ada, kind: "restaurant", id: bare._id, step: "plan" })).message).toContain("partner is required");
    const filled = (await s.post({ action: "bizItemSave", token: ada, kind: "restaurant", id: bare._id, fields: { partner: "Nik Tesla", date: "2026-12-04", address: "near 1 Main St" } })).item;
    const sent = (await s.post({ action: "bizItemSend", token: ada, kind: "restaurant", id: filled._id, step: "plan" })).item;
    expect(sent.plan.status).toBe("waiting");
    expect(inbox(s, "m-ops", "biz.waiting")).toHaveLength(1);
    expect(inbox(s, "m-lead", "biz.waiting")).toHaveLength(1);
    expect(inbox(s, "m-mentor", "biz.waiting")).toHaveLength(0);
    // Waiting: it can't be changed, and can't be set up yet.
    const again = (await s.post({ action: "bizItemSave", token: ada, kind: "restaurant", id: filled._id, fields: { restaurant: "Taco Bell" } })).item;
    expect(again.restaurant).toBe("Chipotle");
    expect((await s.post({ action: "bizItemSend", token: ada, kind: "restaurant", id: filled._id, step: "setup" })).message).toContain("approve step 1");
    // Operations approves; mentors can't.
    expect((await s.post({ action: "bizDecide", token: mentor, kind: "restaurant", id: filled._id, step: "plan", decision: "approve" })).error).toBe("forbidden");
    await s.post({ action: "bizDecide", token: ops, kind: "restaurant", id: filled._id, step: "plan", decision: "approve" });
    expect(inbox(s, "m-ada", "biz.decided")[0].title).toContain("Approved");
    s.rows("biz_restaurant")[0].flyer = { id: "f1", name: "flyer.pdf", size: 10 };
    s.rows("biz_restaurant")[0].proof = { id: "f2", name: "proof.pdf", size: 10 };
    await s.post({ action: "bizItemSend", token: ada, kind: "restaurant", id: filled._id, step: "setup" });
    expect((await s.post({ action: "bizStatus", token: ops })).rows.find((r: { name: string }) => r.name === "Ada Lovelace")).toMatchObject({ standing: "done" });
  });

  it("stops at the limit, and only the student can change their own", async () => {
    await s.post({ action: "bizSaveSettings", token: lead, settings: { restaurantLimit: 1 } });
    const first = (await make()).item;
    await s.post({ action: "bizItemSend", token: ada, kind: "restaurant", id: first._id, step: "plan" });
    await pick(s, nik, "restaurant");
    const second = (await make(nik)).item;
    expect((await s.post({ action: "bizItemSend", token: nik, kind: "restaurant", id: second._id, step: "plan" })).message).toContain("All 1 restaurant days");
    expect((await s.post({ action: "bizItemSave", token: nik, kind: "restaurant", id: first._id, fields: { restaurant: "Mine now" } })).error).toBe("forbidden");
    expect((await s.post({ action: "bizApprovals", token: ops })).restaurantUsed).toBe(1);
  });

  it("works out the distance from the school", async () => {
    expect((await s.post({ action: "bizDistance", token: ada, address: "near 1 Main St" })).far).toBe(false);
    const far = await s.post({ action: "bizDistance", token: ada, address: "far 9 Long Rd" });
    expect(far.far).toBe(true);
    expect(far.miles).toBeGreaterThan(5);
    expect((await s.post({ action: "bizDistance", token: ada, address: "nowhere" })).miles).toBeNull();
  });
});

describe("sponsor pitches", () => {
  let s: Team;
  let id: string;
  beforeEach(async () => {
    s = team();
    await pick(s, ada, "sponsor");
    id = (await s.post({ action: "bizItemSave", token: ada, kind: "pitch", slot: 1, fields: { company: "Discovery Cube", contactName: "Mr. Adams", contactEmail: "outreach@example.com", method: "email", why: "too short" } })).item._id;
  });

  it("needs enough words, then walks plan, sent, reply and result, and writes the Sponsor tracker", async () => {
    expect((await s.post({ action: "bizItemSend", token: ada, kind: "pitch", id, step: "plan" })).message).toContain("at least 75 words");
    await s.post({ action: "bizItemSave", token: ada, kind: "pitch", id, fields: { why: WORDS } });
    await s.post({ action: "bizItemSend", token: ada, kind: "pitch", id, step: "plan" });
    expect(s.rows("biz_sponsors")).toHaveLength(0);
    await s.post({ action: "bizDecide", token: lead, kind: "pitch", id, step: "plan", decision: "approve" });
    expect(s.rows("biz_sponsors")[0]).toMatchObject({ company: "Discovery Cube", status: "1. Request in progress", studentContact: "Ada Lovelace" });
    // "I sent it": follow-ups a week apart, tracker says Pending.
    const sent = (await s.post({ action: "bizPitchSent", token: ada, id, sentOn: "2026-11-03", sentBy: "email" })).item;
    expect(sent.followUps.map((f: { dueOn: string }) => f.dueOn)).toEqual(["2026-11-10", "2026-11-17"]);
    expect(s.rows("biz_sponsors")[0].status).toBe("2. Pending");
    const rows = (await s.post({ action: "bizMy", token: ada })).rows;
    expect(rows.find((r: { step: string }) => r.step.includes("follow-up 1"))).toMatchObject({ status: "Due now" });
    // A reply moves the company along and stops the follow-ups.
    await s.post({ action: "bizPitchReply", token: ada, id, reply: "replied" });
    expect(s.rows("biz_sponsors")[0].status).toBe("3. Discussing");
    // The result.
    await s.post({ action: "bizItemSave", token: ada, kind: "pitch", id, fields: { result: { status: "money", support: "Sponsorship (money)", amount: "$1,200", tier: "Eagle", notes: "Thrilled" } } });
    await s.post({ action: "bizItemSend", token: ada, kind: "pitch", id, step: "result" });
    expect((await s.post({ action: "bizDecide", token: lead, kind: "pitch", id, step: "result", decision: "back" })).message).toContain("Type the note");
    await s.post({ action: "bizDecide", token: lead, kind: "pitch", id, step: "result", decision: "approve" });
    expect(s.rows("biz_sponsors")).toHaveLength(1);
    expect(s.rows("biz_sponsors")[0]).toMatchObject({ status: "5. Received monetary", support: "Sponsorship (money)", amount: "1,200", tier: "Eagle", notes: "Thrilled" });
  });

  it("sends a plan back with a note, and lets the student fix and resend it", async () => {
    await s.post({ action: "bizItemSave", token: ada, kind: "pitch", id, fields: { why: WORDS } });
    await s.post({ action: "bizItemSend", token: ada, kind: "pitch", id, step: "plan" });
    await s.post({ action: "bizDecide", token: ops, kind: "pitch", id, step: "plan", decision: "back", note: "Pick a different company" });
    expect(inbox(s, "m-ada", "biz.decided")[0]).toMatchObject({ text: "Pick a different company" });
    const fixed = (await s.post({ action: "bizItemSave", token: ada, kind: "pitch", id, fields: { company: "Boeing" } })).item;
    expect(fixed.company).toBe("Boeing");
    expect((await s.post({ action: "bizItemSend", token: ada, kind: "pitch", id, step: "plan" })).item.plan.status).toBe("waiting");
  });
});

describe("grants", () => {
  it("puts a grant on the Grant tracker once its result is approved", async () => {
    const s = team();
    await pick(s, nik, "grant");
    const id = (await s.post({ action: "bizItemSave", token: nik, kind: "grant", slot: 1, fields: { title: "PTSA Grant", organization: "LAHS PTSA", deadline: "Rolling", asking: "A pit workbench", amount: "986.15" } })).item._id;
    expect((await s.post({ action: "bizItemSend", token: nik, kind: "grant", id, step: "plan" })).message).toContain("Upload your application first");
    s.rows("biz_student_grants")[0].application = { id: "a1", name: "app.pdf", size: 5 };
    await s.post({ action: "bizItemSend", token: nik, kind: "grant", id, step: "plan" });
    await s.post({ action: "bizDecide", token: ops, kind: "grant", id, step: "plan", decision: "approve" });
    expect((await s.post({ action: "bizItemSend", token: nik, kind: "grant", id, step: "result" })).message).toContain("date you submitted");
    await s.post({ action: "bizItemSave", token: nik, kind: "grant", id, fields: { submittedOn: "2026-11-20" } });
    s.rows("biz_student_grants")[0].finalFile = { id: "a2", name: "final.pdf", size: 5 };
    await s.post({ action: "bizItemSend", token: nik, kind: "grant", id, step: "result" });
    await s.post({ action: "bizDecide", token: ops, kind: "grant", id, step: "result", decision: "approve" });
    expect(s.rows("biz_grants")[0]).toMatchObject({ title: "PTSA Grant", organization: "LAHS PTSA", writer: "Nik Tesla", status: "2. Submitted" });
  });
});

describe("merch", () => {
  it("adds up sales, needs $100 and a reason for each, and is confirmed by Operations", async () => {
    const s = team();
    await pick(s, ada, "merch");
    const sale = (item: string, quantity: number, price: number, boughtBy = "friend") => s.post({ action: "bizMerchAdd", token: ada, sale: { item, quantity, price, boughtBy } });
    expect((await sale("Team shirt", 1, 20, "")).message).toContain("who bought it");
    expect((await sale("Team shirt", 1, 20)).sale.item).toBe("Team shirt");
    expect((await s.post({ action: "bizMerchDone", token: ada })).message).toContain("Sell $100 first (you have $20)");
    await sale("Hoodie", 2, 40);
    const sold = (await s.post({ action: "bizMy", token: ada })).rows.find((r: { step: string }) => r.step.startsWith("Sell"));
    expect(sold).toMatchObject({ step: "Sell $100: $100 so far", status: "Done" });
    const done = (await s.post({ action: "bizMerchDone", token: ada })).choice;
    expect(done.merchDone.status).toBe("waiting");
    const row = (await s.post({ action: "bizApprovals", token: ops })).rows[0];
    expect(row).toMatchObject({ kind: "merch", student: "Ada Lovelace", step: "done", status: "waiting" });
    await s.post({ action: "bizDecide", token: ops, kind: "merch", id: row.id, step: "done", decision: "approve" });
    expect((await s.post({ action: "bizStatus", token: ops })).rows.find((r: { name: string }) => r.name === "Ada Lovelace").standing).toBe("done");
  });
});

describe("everyone's status and settings", () => {
  it("counts who is done, waiting, in progress, not started and exempt, and lets only leads change the settings", async () => {
    const s = team();
    await pick(s, ada, "merch");
    const status = await s.post({ action: "bizStatus", token: ops });
    expect(status.rows.find((r: { name: string }) => r.name === "Ada Lovelace").standing).toBe("inProgress");
    expect(status.rows.find((r: { name: string }) => r.name === "Nik Tesla").standing).toBe("notStarted");
    expect((await s.post({ action: "bizSaveSettings", token: ops, settings: { minWords: 10 } })).error).toBe("forbidden");
    const saved = await s.post({ action: "bizSaveSettings", token: lead, settings: { deadline: "2027-02-21", minWords: 10, exempt: [{ memberId: "m-nik", reason: "Exempt this season" }] } });
    expect(saved.settings).toMatchObject({ deadline: "2027-02-21", minWords: 10 });
    expect((await s.post({ action: "bizSaveSettings", token: lead, settings: { minWords: -1 } })).message).toContain("number from 0 to 500");
    const after = await s.post({ action: "bizStatus", token: ops });
    expect(after.rows.find((r: { name: string }) => r.name === "Nik Tesla").standing).toBe("exempt");
    expect((await s.post({ action: "bizRemind", token: ops })).sent).toBe(3); // Ada, Olive Ops, Lee Lead: Nik is exempt
    expect(inbox(s, "m-ada", "biz.reminder")).toHaveLength(1);
    expect(inbox(s, "m-nik", "biz.reminder")).toHaveLength(0);
  });
});
