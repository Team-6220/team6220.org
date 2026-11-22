// RSVP on the server (ops/server/rsvp.ts): forms from Calendar events, answers, who sees what, and reminders.
import { beforeEach, describe, expect, it } from "vitest";
import { makeOps } from "./helpers/ops-server";

const lead = "tok-lead-0123456789abcdef";
const mentor = "tok-mentor-0123456789abcdef";
const ada = "tok-ada-0123456789abcdef";
const nik = "tok-nik-0123456789abcdef";
const guest = "tok-guest-0123456789abcdef";

function team() {
  const s = makeOps({
    [lead]: { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] },
    [mentor]: { id: "m-mentor", status: "APPROVED", badges: ["b-mentor"] },
    [ada]: { id: "m-ada", status: "APPROVED", badges: ["b-team", "b-programming"] },
    [nik]: { id: "m-nik", status: "APPROVED", badges: ["b-team", "b-design"] },
    [guest]: { id: "m-guest", status: "APPROVED", badges: ["b-guest"] },
  });
  for (const [memberId, name, subteams] of [["m-lead", "Lee Lead", ["Design"]], ["m-mentor", "Mo Mentor", []], ["m-ada", "Ada Lovelace", ["Programming"]], ["m-nik", "Nik Tesla", ["Design"]]] as [string, string, string[]][]) {
    s.rows("ops_people").push({ _id: `p-${memberId}`, memberId, name, subteams, active: true });
  }
  s.rows("cal_events").push(
    { _id: "comp", type: "competition", title: "Regional", startDate: "2026-12-04", endDate: "2026-12-06", setupDate: "2026-12-03", startTime: "", endTime: "", location: "Del Mar", notes: "", mandatory: false, subteams: [], public: true, cancelled: false },
    { _id: "dinner", type: "event", title: "Team dinner", startDate: "2026-11-24", endDate: "2026-11-24", startTime: "17:30", endTime: "20:00", location: "", notes: "", mandatory: false, subteams: [], public: true, cancelled: false },
    { _id: "meeting", type: "meeting", title: "", startDate: "2026-11-25", endDate: "2026-11-25", startTime: "15:20", endTime: "17:00", location: "", notes: "", mandatory: false, subteams: [], public: true, cancelled: false },
  );
  s.setNow(new Date("2026-11-22T20:00:00Z"));
  return s;
}

const COMP_DAYS = ["2026-12-04", "2026-12-05", "2026-12-06"];
const allYes = Object.fromEntries(COMP_DAYS.map((d) => [d, "yes"]));

describe("rsvp forms", () => {
  let s: ReturnType<typeof team>;
  let formId: string;
  beforeEach(async () => {
    s = team();
    const saved = await s.post({
      action: "rsvpSaveForm", token: lead,
      form: { eventId: "comp", status: "published", answerBy: "2026-11-28", questions: [{ label: "Will you bring a laptop?", type: "yesno" }, { label: "Dinner", type: "choice", options: ["Pizza", "Sandwich"] }] },
    });
    formId = saved.form._id;
  });

  it("lets only leads make forms, one per event, only for competitions and events that haven't ended", async () => {
    expect((await s.post({ action: "rsvpSaveForm", token: mentor, form: { eventId: "dinner", answerBy: "2026-11-23", status: "draft" } })).error).toBe("forbidden");
    expect((await s.post({ action: "rsvpSaveForm", token: lead, form: { eventId: "comp", answerBy: "2026-11-28", status: "draft" } })).message).toContain("already has a form");
    expect((await s.post({ action: "rsvpSaveForm", token: lead, form: { eventId: "meeting", answerBy: "2026-11-28", status: "draft" } })).message).toContain("Pick a Calendar event");
    expect((await s.post({ action: "rsvpSaveForm", token: lead, form: { eventId: "dinner", answerBy: "tomorrow", status: "draft" } })).message).toContain("answer by");
    expect((await s.post({ action: "rsvpSaveForm", token: lead, form: { eventId: "dinner", answerBy: "2026-11-23", status: "draft", questions: [{ label: "Pick", type: "choice", options: ["one"] }] } })).message).toContain("2 to 8 choices");
  });

  it("shows members a published form, with each day asked, and not a draft or someone else's", async () => {
    await s.post({ action: "rsvpSaveForm", token: lead, form: { eventId: "dinner", status: "draft", answerBy: "2026-11-23" } });
    const open = (await s.post({ action: "rsvpOpen", token: ada })).forms;
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ mine: "none", event: { title: "Regional", setupDate: "2026-12-03" } });
    expect((await s.post({ action: "rsvpOpen", token: guest })).error).toBe("forbidden");
  });

  it("saves a Maybe without finishing the form, and finishes it with a Yes or No for every part", async () => {
    const days = { ...allYes, "2026-12-05": "maybe" };
    const maybe = await s.post({ action: "rsvpAnswer", token: ada, formId, answer: { days, pit: "available", misses: "N/A", extra: { [form(s, formId).questions[0].id]: "Yes", [form(s, formId).questions[1].id]: "Pizza" } } });
    expect(maybe.form.mine).toBe("maybe");
    const missing = await s.post({ action: "rsvpAnswer", token: ada, formId, answer: { days: allYes, pit: "available", misses: "", extra: {} } });
    expect(missing.form.mine).toBe("maybe");
    const [laptop, dinner] = form(s, formId).questions.map((q) => q.id);
    const done = await s.post({ action: "rsvpAnswer", token: ada, formId, answer: { days: allYes, pit: "available", misses: "N/A", extra: { [laptop]: "Yes", [dinner]: "Pizza" } } });
    expect(done.form).toMatchObject({ mine: "done", summary: "coming" });
    expect(s.rows("rsvp_answers")).toHaveLength(1);
    expect(form(s, formId)).toMatchObject({ finished: 1, asked: 3 });
  });

  it("refuses an answer that can't be right, and a form that isn't open", async () => {
    const q = form(s, formId).questions;
    expect((await s.post({ action: "rsvpAnswer", token: ada, formId, answer: { days: { "2026-12-04": "sure" } } })).error).toBe("bad-request");
    expect((await s.post({ action: "rsvpAnswer", token: ada, formId, answer: { days: allYes, pit: "available", misses: "N/A", extra: { [q[1].id]: "Burrito" } } })).message).toContain("Pick one of the choices");
    s.setNow(new Date("2026-12-07T20:00:00Z"));
    expect((await s.post({ action: "rsvpAnswer", token: ada, formId, answer: { days: allYes } })).message).toContain("isn't open");
    expect((await s.post({ action: "rsvpOpen", token: ada })).forms).toEqual([]);
  });

  it("shows everyone who's coming, and the private details only to leads, mentors and boosters", async () => {
    const [laptop] = form(s, formId).questions.map((q) => q.id);
    await s.post({ action: "rsvpAnswer", token: ada, formId, answer: { days: allYes, pit: "available", misses: "N/A", extra: { [laptop]: "Yes", [form(s, formId).questions[1].id]: "Pizza" } } });
    await s.post({ action: "rsvpAnswer", token: nik, formId, answer: { days: { ...allYes, "2026-12-06": "no" }, pit: "not", misses: "Sunday: family", extra: { [laptop]: "No", [form(s, formId).questions[1].id]: "Sandwich" } } });
    const member = (await s.post({ action: "rsvpResults", token: ada, formId })).results;
    expect(member.details).toBeNull();
    expect(member).toMatchObject({ pitAvailable: 1, noAnswer: 1, coming: { "2026-12-04": 2, "2026-12-05": 2, "2026-12-06": 1 } });
    expect(JSON.stringify(member)).not.toContain("family");
    const mentorView = (await s.post({ action: "rsvpResults", token: mentor, formId })).results;
    expect(mentorView.details).toHaveLength(2);
    expect(mentorView.details.find((d: { name: string }) => d.name === "Nik Tesla").misses).toBe("Sunday: family");
  });

  it("keeps a draft's results from members, and won't take a question away once people have answered", async () => {
    const draft = (await s.post({ action: "rsvpSaveForm", token: lead, form: { eventId: "dinner", status: "draft", answerBy: "2026-11-23" } })).form._id;
    expect((await s.post({ action: "rsvpResults", token: ada, formId: draft })).error).toBe("forbidden");
    expect((await s.post({ action: "rsvpResults", token: lead, formId: draft })).results.form._id).toBe(draft);
    await s.post({ action: "rsvpAnswer", token: ada, formId, answer: { days: allYes } });
    const f = form(s, formId);
    const drop = await s.post({ action: "rsvpSaveForm", token: lead, form: { ...f, questions: f.questions.slice(1) } });
    expect(drop.message).toContain("can't be taken away");
    const reword = await s.post({ action: "rsvpSaveForm", token: lead, form: { ...f, questions: f.questions.map((q) => ({ ...q, label: `${q.label}?` })) } });
    expect(reword.form.questions[0].label).toBe("Will you bring a laptop??");
  });

  it("lists every form for leads with how many have finished", async () => {
    const rows = (await s.post({ action: "rsvpManage", token: lead })).rows;
    expect(rows[0]).toMatchObject({ state: "open", season: "2026–27", finished: 0, asked: 3 });
    expect((await s.post({ action: "rsvpManage", token: mentor })).error).toBe("forbidden");
  });
});

describe("rsvp reminders", () => {
  let s: ReturnType<typeof team>;
  let formId: string;
  beforeEach(async () => {
    s = team();
    s.rows("rsvp_forms").length = 0;
    formId = (await s.post({ action: "rsvpSaveForm", token: lead, form: { eventId: "comp", status: "published", answerBy: "2026-11-25", questions: [] } })).form._id;
  });
  const inbox = (id: string, kind: string) => s.rows("ops_notifications").filter((n) => n.recipientId === id && n.kind === kind);

  it("reminds the people who haven't finished on the days the schedule names, once a day", async () => {
    await s.post({ action: "rsvpAnswer", token: ada, formId, answer: { days: allYes, pit: "available", misses: "N/A", extra: {} } });
    // Three days before the 25th: in the default schedule.
    s.setNow(new Date("2026-11-22T20:00:00Z"));
    expect((await s.job("runRsvpReminders")).body.ok).toBe(true);
    expect(inbox("m-ada", "rsvp.reminder")).toHaveLength(0);
    expect(inbox("m-nik", "rsvp.reminder")).toHaveLength(1);
    expect(inbox("m-lead", "rsvp.reminder")).toHaveLength(1);
    expect(inbox("m-mentor", "rsvp.reminder")).toHaveLength(0);
    await s.job("runRsvpReminders");
    expect(inbox("m-nik", "rsvp.reminder")).toHaveLength(1);
    // Two days before is not on the schedule.
    s.setNow(new Date("2026-11-23T20:00:00Z"));
    await s.job("runRsvpReminders");
    expect(inbox("m-nik", "rsvp.reminder")).toHaveLength(1);
  });

  it("tells the leads how many have answered the morning it is due, and keeps going every two days after", async () => {
    s.setNow(new Date("2026-11-25T20:00:00Z"));
    await s.job("runRsvpReminders");
    expect(inbox("m-lead", "rsvp.summary")).toHaveLength(1);
    expect(inbox("m-nik", "rsvp.reminder")).toHaveLength(1);
    s.setNow(new Date("2026-11-27T20:00:00Z"));
    await s.job("runRsvpReminders");
    expect(inbox("m-nik", "rsvp.reminder")).toHaveLength(2);
    s.setNow(new Date("2026-11-28T20:00:00Z"));
    await s.job("runRsvpReminders");
    expect(inbox("m-nik", "rsvp.reminder")).toHaveLength(2);
  });

  it("lets a lead send the reminder now, and change the schedule", async () => {
    expect((await s.post({ action: "rsvpRemind", token: mentor, formId })).error).toBe("forbidden");
    expect((await s.post({ action: "rsvpRemind", token: lead, formId })).sent).toBe(3);
    expect(inbox("m-nik", "rsvp.reminder")).toHaveLength(1);
    const saved = await s.post({ action: "rsvpSaveSettings", token: lead, settings: { before: [1, 5, 5], afterEvery: 0, leadSummary: false, includeLink: true } });
    expect(saved.settings).toMatchObject({ before: [5, 1], afterEvery: 0, leadSummary: false });
    expect((await s.post({ action: "rsvpGetSettings", token: lead })).settings.before).toEqual([5, 1]);
    expect((await s.post({ action: "rsvpSaveSettings", token: lead, settings: { before: [1], afterEvery: 99 } })).error).toBe("bad-request");
  });
});

function form(s: ReturnType<typeof team>, id: string) {
  return s.rows("rsvp_forms").find((f) => f._id === id) as unknown as { _id: string; questions: { id: string; label: string; type: string; options: string[] }[]; eventId: string; status: string; answerBy: string };
}
