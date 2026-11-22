// The Calendar's data helpers (packages/data/src/calendar) and who may read its collections.
import { describe, expect, it } from "vitest";
import * as calendar from "../src/calendar";
import type { CalEvent } from "../src/calendar";
import type { Me } from "../src/ops/types";
import { rolesFor } from "../src/ops/roles";
import { makeOps } from "./helpers/ops-server";

const meeting = (over: Partial<CalEvent> = {}): CalEvent => ({
  _id: "e1", type: "meeting", title: "", startDate: "2026-11-21", endDate: "2026-11-21", startTime: "10:00", endTime: "14:00",
  location: "", notes: "", mandatory: false, subteams: [], public: true, cancelled: false, ...over,
});
const person = (badges: string[], subteams: string[]): Me => ({ id: "m1", name: "Pat", badges, subteams, roles: rolesFor(badges) });

describe("calendar dates", () => {
  it("writes times the way the team does", () => {
    expect(calendar.timeRange("15:20", "17:00")).toBe("3:20–5:00");
    expect(calendar.compactRange("10:00", "12:00")).toBe("10–12");
    expect(calendar.compactRange("15:20", "17:00")).toBe("3:20–5:00");
    expect(calendar.longTime("10:00")).toBe("10:00 AM");
    expect(calendar.dayRange("2026-10-31", "2026-11-01")).toBe("Oct 31 – Nov 1");
    expect(calendar.dayRange("2026-11-26", "2026-11-27")).toBe("Nov 26–27");
  });

  it("builds a month grid of whole weeks, Sunday first", () => {
    const weeks = calendar.monthWeeks("2026-11");
    expect(weeks[0][0]).toBe("2026-11-01");
    expect(weeks.at(-1)!.at(-1)).toBe("2026-12-05");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("knows the school year (August to July)", () => {
    expect(calendar.schoolYear("2026-11-21")[0]).toBe("2026-08");
    expect(calendar.schoolYear("2027-03-01")[11]).toBe("2027-07");
  });
});

describe("who a meeting is for (#291)", () => {
  const programming = person(["Team Member", "Subteam: Programming"], ["Programming"]);
  it("shows everyone's meetings and your subteam's, not other subteams'", () => {
    expect(calendar.isForMe(meeting(), programming)).toBe(true);
    expect(calendar.isForMe(meeting({ subteams: ["Programming", "Electrical"] }), programming)).toBe(true);
    expect(calendar.isForMe(meeting({ subteams: ["Manufacturing"] }), programming)).toBe(false);
  });
  it("shows leads, and people with no subteam (supervisors, mentors), every meeting", () => {
    expect(calendar.isForMe(meeting({ subteams: ["Manufacturing"] }), person(["Team Member", "Lead"], ["Design"]))).toBe(true);
    expect(calendar.isForMe(meeting({ subteams: ["Manufacturing"] }), person(["Supervisor"], []))).toBe(true);
  });
  it("names the audience", () => {
    expect(calendar.audience(meeting({ subteams: ["Programming", "Electrical"] }))).toBe("Programming and Electrical");
    expect(calendar.audience(meeting())).toBe("Everyone");
  });
});

describe("reading the calendar's collections", () => {
  const member = "tok-member-0123456789abcdef";
  const guest = "tok-guest-0123456789abcdef";
  const s = makeOps({
    [member]: { id: "m-member", status: "APPROVED", badges: ["b-team"] },
    [guest]: { id: "m-guest", status: "APPROVED", badges: ["b-guest"] },
  });
  it("lets the team read events and shifts, not guests", async () => {
    s.rows("cal_events").push(meeting());
    expect(await s.post({ action: "listRecords", token: member, collection: "cal_events" })).toMatchObject({ ok: true, items: [{ _id: "e1" }] });
    expect(await s.post({ action: "listRecords", token: guest, collection: "cal_shifts" })).toMatchObject({ ok: false, error: "forbidden" });
  });
});
