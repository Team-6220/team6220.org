// Changing the Calendar: shifts, season parts, Meeting schedule (calendar/plan.ts) and the server actions that use it
// (ops/server/calendar.ts).
import { beforeEach, describe, expect, it } from "vitest";
import { addShift, parsePattern, patternText, scheduleSave, splitShifts, uncovered } from "../src/calendar/plan";
import type { CalEvent, Shift } from "../src/calendar/types";
import { makeOps } from "./helpers/ops-server";

describe("supervision shifts", () => {
  it("splits a meeting at whole or half hours", () => {
    expect(splitShifts("10:00", "14:00", 2)).toEqual([{ start: "10:00", end: "12:00" }, { start: "12:00", end: "14:00" }]);
    expect(splitShifts("15:17", "18:30", 2)).toEqual([{ start: "15:17", end: "17:00" }, { start: "17:00", end: "18:30" }]);
    expect(splitShifts("15:20", "17:00", 0)).toEqual([]);
  });

  it("adds one shift for the whole event, then splits the longest", () => {
    const one = addShift([], "10:00", "14:00");
    expect(one).toEqual([{ start: "10:00", end: "14:00" }]);
    expect(addShift(one, "10:00", "14:00")).toEqual([{ start: "10:00", end: "12:00" }, { start: "12:00", end: "14:00" }]);
  });

  it("finds the time no shift covers", () => {
    expect(uncovered([{ start: "10:00", end: "12:00" }, { start: "12:00", end: "13:00" }], "10:00", "14:00")).toEqual({ start: "13:00", end: "14:00" });
    expect(uncovered([{ start: "10:00", end: "14:00" }], "10:00", "14:00")).toBeNull();
  });
});

describe("season part times", () => {
  it("reads '3:20–5:00 · Sat 10:00–2:00' and '1 · Sat 2'", () => {
    expect(parsePattern([2, 5, 6], "3:20–5:00 · Sat 10:00–2:00", "1 · Sat 2")).toEqual([
      { day: 2, start: "15:20", end: "17:00", shifts: 1 },
      { day: 5, start: "15:20", end: "17:00", shifts: 1 },
      { day: 6, start: "10:00", end: "14:00", shifts: 2 },
    ]);
  });

  it("writes them back the same way", () => {
    expect(patternText(parsePattern([2, 5, 6], "3:20–5:00 · Sat 10:00–2:00", "1 · Sat 2"))).toEqual({ days: [2, 5, 6], times: "3:20–5:00 · Sat 10:00–2:00", shifts: "1 · Sat 2" });
  });

  it("says what is wrong", () => {
    expect(() => parsePattern([], "3:20–5:00", "1")).toThrow("Choose at least one day");
    expect(() => parsePattern([2], "after school", "1")).toThrow("isn't a start and end time");
    expect(() => parsePattern([6], "Tue 3:20–5:00", "1")).toThrow("add a time for Sat");
  });
});

describe("Meeting schedule", () => {
  const today = "2026-11-22"; // a Sunday
  const fixed: CalEvent = { _id: "fixed", type: "meeting", title: "", startDate: "2026-11-24", endDate: "2026-11-24", startTime: "15:17", endTime: "17:00", location: "", notes: "", mandatory: false, subteams: [], public: true, cancelled: false };
  const fall = { _id: "fall", title: "Fall", startDate: "2026-11-01", endDate: "2026-12-05", pattern: parsePattern([2, 5, 6], "3:20–5:00 · Sat 10:00–2:00", "1 · Sat 2") };

  it("makes meetings from tomorrow on, and leaves days with a meeting already alone", () => {
    const r = scheduleSave([fixed], [], [fall], [], today);
    const made = r.events.filter((e) => e.type === "meeting");
    expect(made.map((e) => e.startDate)).not.toContain("2026-11-24");
    expect(made[0]).toMatchObject({ startDate: "2026-11-27", startTime: "15:20", partId: "fall" });
    expect(made.every((e) => e.startDate > today)).toBe(true);
    expect(r.added).toBe(made.length);
    expect(r.shifts.filter((s) => s.eventId === made.find((e) => e.startDate === "2026-11-28")!._id)).toHaveLength(2);
  });

  it("skips break days, moves meetings when times change and removes them when a part goes", () => {
    const first = scheduleSave([], [], [fall], [], today);
    const events = first.events, shifts = first.shifts;
    const later = scheduleSave(events, shifts, [{ ...fall, pattern: parsePattern([2, 5, 6], "3:20–6:00 · Sat 10:00–2:00", "1 · Sat 2") }], [{ title: "Thanksgiving", startDate: "2026-11-27", endDate: "2026-11-28" }], today);
    expect(later.removed).toBe(2); // Fri and Sat of the break
    expect(later.moved).toBeGreaterThan(0);
    const gone = scheduleSave(events, shifts, [], [], today);
    expect(gone.removed).toBe(first.added);
    expect(gone.events.find((e) => e._id === "fall")?.cancelled).toBe(true);
  });

  it("makes no meetings on competition days", () => {
    const comp: CalEvent = { ...fixed, _id: "comp", type: "competition", title: "Beach Blitz", startDate: "2026-11-28", endDate: "2026-11-29" };
    const r = scheduleSave([comp], [], [fall], [], today);
    expect(r.events.some((e) => e.type === "meeting" && e.startDate === "2026-11-28")).toBe(false);
  });

  it("leaves a meeting changed for one day alone", () => {
    const first = scheduleSave([], [], [fall], [], today);
    const tue = first.events.find((e) => e.startDate === "2026-11-24")!;
    const moved = { ...tue, startDate: "2026-11-25", endDate: "2026-11-25", edited: true, partDate: "2026-11-24" };
    const events = first.events.map((e) => (e._id === tue._id ? moved : e));
    const again = scheduleSave(events, first.shifts, [fall], [], today);
    expect(again.added).toBe(0);
    expect(again.removed).toBe(0);
  });
});

describe("calendar on the server", () => {
  const lead = "tok-lead-0123456789abcdef";
  const mentor = "tok-mentor-0123456789abcdef";
  const member = "tok-member-0123456789abcdef";
  let s: ReturnType<typeof makeOps>;
  beforeEach(() => {
    s = makeOps({
      [lead]: { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] },
      [mentor]: { id: "m-mentor", status: "APPROVED", badges: ["b-mentor"] },
      [member]: { id: "m-member", status: "APPROVED", badges: ["b-team"] },
    });
    s.setNow(new Date("2026-11-22T20:00:00Z"));
  });
  const meeting = { type: "meeting", startDate: "2026-12-01", startTime: "15:20", endTime: "17:00" };

  it("lets leads, mentors and boosters add a meeting with shifts, but not members", async () => {
    expect((await s.post({ action: "saveCalEvent", token: member, event: meeting })).error).toBe("forbidden");
    const saved = await s.post({ action: "saveCalEvent", token: mentor, event: meeting, shifts: [{ start: "15:20", end: "17:00" }] });
    expect(saved.ok).toBe(true);
    expect(s.rows("cal_events")).toHaveLength(1);
    expect(s.rows("cal_shifts")[0]).toMatchObject({ eventId: saved.event._id, start: "15:20", name: "" });
  });

  it("keeps a supervisor on a shift whose times didn't change", async () => {
    const saved = await s.post({ action: "saveCalEvent", token: lead, event: meeting, shifts: [{ start: "15:20", end: "16:00" }, { start: "16:00", end: "17:00" }] });
    const shifts = s.rows("cal_shifts") as Shift[];
    shifts[0].memberId = "m-parent";
    await s.post({ action: "saveCalEvent", token: lead, event: { ...saved.event, endTime: "18:00" }, shifts: [{ start: "15:20", end: "16:00" }, { start: "16:00", end: "18:00" }] });
    const now = (s.rows("cal_shifts") as Shift[]).filter((x) => !x.cancelled);
    expect(now.find((x) => x.start === "15:20")?.memberId).toBe("m-parent");
    expect((s.rows("cal_shifts") as Shift[]).find((x) => x.end === "17:00")?.cancelled).toBe(true);
  });

  it("keeps a meeting's shifts when they aren't sent (marking it mandatory)", async () => {
    const saved = await s.post({ action: "saveCalEvent", token: lead, event: meeting, shifts: [{ start: "15:20", end: "17:00" }] });
    await s.post({ action: "saveCalEvent", token: lead, event: { ...saved.event, mandatory: true } });
    expect((s.rows("cal_shifts") as Shift[]).filter((x) => !x.cancelled)).toHaveLength(1);
  });

  it("removes an event and its shifts", async () => {
    const saved = await s.post({ action: "saveCalEvent", token: lead, event: meeting, shifts: [{ start: "15:20", end: "17:00" }] });
    expect((await s.post({ action: "removeCalEvent", token: lead, id: saved.event._id })).ok).toBe(true);
    expect(s.rows("cal_events")[0].cancelled).toBe(true);
    expect(s.rows("cal_shifts")[0].cancelled).toBe(true);
  });

  it("saves Meeting schedule and makes its meetings in one request", async () => {
    const answer = await s.post({ action: "saveSchedule", token: lead, parts: [{ title: "Fall", startDate: "2026-11-23", endDate: "2026-12-05", pattern: parsePattern([2, 6], "3:20–5:00 · Sat 10:00–2:00", "1 · Sat 2") }], breaks: [] });
    expect(answer).toMatchObject({ ok: true, added: 4, moved: 0, removed: 0 });
    expect(s.rows("cal_events").filter((e) => e.type === "meeting")).toHaveLength(4);
  });

  it("lets only leads assign meetings to subteams", async () => {
    const saved = await s.post({ action: "saveCalEvent", token: lead, event: meeting });
    const change = { id: saved.event._id, subteams: ["Programming"], mandatory: true };
    expect((await s.post({ action: "assignMeetings", token: mentor, changes: [change] })).error).toBe("forbidden");
    expect((await s.post({ action: "assignMeetings", token: lead, changes: [change] })).saved).toBe(1);
    expect(s.rows("cal_events")[0]).toMatchObject({ subteams: ["Programming"], mandatory: true });
    expect((await s.post({ action: "assignMeetings", token: lead, changes: [{ ...change, subteams: ["Juggling"] }] })).error).toBe("bad-request");
  });
});
