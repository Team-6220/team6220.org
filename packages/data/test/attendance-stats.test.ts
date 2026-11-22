// What attendance numbers mean (packages/data/src/attendance/stats.ts): who was expected, who came, hours, percentages.
import { describe, expect, it } from "vitest";
import { countedMinutes, dayView, myView, pastMeetings, seasonOf, teamStats, teamTime } from "../src/attendance/stats";
import type { AttData } from "../src/attendance/stats";
import { DEFAULT_SETTINGS, type AttMeeting, type AttMember, type SignIn } from "../src/attendance/types";

// Times are written in team time (Pacific, -08:00 in November).
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-08:00`).toISOString();
const member = (studentId: string, name: string, subteams: string[] = [], memberId = ""): AttMember => ({ studentId, memberId, name, subteams });
const meeting = (id: string, date: string, over: Partial<AttMeeting> = {}): AttMeeting => ({ id, date, title: "Team meeting", endTime: "17:00", mandatory: false, subteams: [], ...over });
const signIn = (studentId: string, date: string, hhmm: string, out = ""): SignIn => ({ _id: `${studentId}-${date}`, season: seasonOf(date), date, studentId, signedInAt: at(date, hhmm), signedOutAt: out ? at(date, out) : "", source: "kiosk" });

const ada = member("1001", "Ada Lovelace", ["Programming"], "m-ada");
const tess = member("1002", "Tess Tesla", ["Electrical"]);
const hedy = member("1003", "Hedy Lamarr", ["Design", "Manufacturing"]);

function season(): AttData {
  return {
    meetings: [meeting("a", "2026-11-03"), meeting("b", "2026-11-06", { mandatory: true }), meeting("c", "2026-11-10", { subteams: ["Programming"] }), meeting("d", "2026-11-13")],
    members: [ada, tess, hedy],
    signIns: [
      signIn("1001", "2026-11-03", "15:20"), signIn("1001", "2026-11-06", "15:30", "16:00"), signIn("1001", "2026-11-10", "15:25"),
      signIn("1002", "2026-11-03", "15:40"), signIn("1002", "2026-11-06", "15:20"),
      signIn("1003", "2026-11-03", "15:20"),
    ],
    settings: DEFAULT_SETTINGS,
  };
}

describe("time and season", () => {
  it("reads an ISO time as team time", () => {
    expect(teamTime(at("2026-11-03", "15:20"))).toEqual({ date: "2026-11-03", minutes: 15 * 60 + 20 });
    // Late evening Pacific is the next day in UTC: the team's date is still the Pacific one.
    expect(teamTime(at("2026-11-03", "23:30")).date).toBe("2026-11-03");
  });
  it("puts August to July in one season", () => {
    expect(seasonOf("2026-08-25")).toBe("2026");
    expect(seasonOf("2027-03-01")).toBe("2026");
    expect(seasonOf("2026-07-31")).toBe("2025");
  });
});

describe("hours", () => {
  it("counts from signing in until the meeting ends", () => {
    expect(countedMinutes({ signedInAt: at("2026-11-03", "15:20"), signedOutAt: "" }, { endTime: "17:00" })).toBe(100);
  });
  it("stops at signing out when that is earlier, and never at a later time than the meeting end", () => {
    expect(countedMinutes({ signedInAt: at("2026-11-03", "15:30"), signedOutAt: at("2026-11-03", "16:00") }, { endTime: "17:00" })).toBe(30);
    expect(countedMinutes({ signedInAt: at("2026-11-03", "15:30"), signedOutAt: at("2026-11-03", "18:00") }, { endTime: "17:00" })).toBe(90);
  });
  it("counts nothing for someone who comes after the meeting, or when there was no meeting", () => {
    expect(countedMinutes({ signedInAt: at("2026-11-03", "17:30"), signedOutAt: "" }, { endTime: "17:00" })).toBe(0);
    expect(countedMinutes({ signedInAt: at("2026-11-03", "15:30"), signedOutAt: "" }, undefined)).toBe(0);
  });
});

describe("a day", () => {
  it("lists who is here (newest first) and who is absent, with the meeting's subteams deciding who is expected", () => {
    const view = dayView(season(), "2026-11-10", "2026-11-10", "1001");
    expect(view.here.map((r) => r.name)).toEqual(["Ada Lovelace"]);
    // The meeting is for Programming: only Ada is expected, so nobody is absent.
    expect(view.absent).toEqual([]);
    expect(view.expected).toBe(1);
    const all = dayView(season(), "2026-11-03", "2026-11-13", null);
    // Newest sign-in first: Tess came last.
    expect(all.here[0].name).toBe("Tess Tesla");
    expect(all.here).toHaveLength(3);
    expect(all.absent).toEqual([]);
  });

  it("shows absences with each person's season absences", () => {
    const view = dayView(season(), "2026-11-13", "2026-11-13", "1001");
    expect(view.here).toEqual([]);
    expect(view.absent.map((r) => r.name).sort()).toEqual(["Ada Lovelace", "Hedy Lamarr", "Tess Tesla"]);
    // Hedy was expected at 3 meetings (the Programming-only one is not hers) and came to 1.
    expect(view.absent.find((r) => r.name === "Hedy Lamarr")?.absences).toBe(2);
    expect(view.myHours).toBeGreaterThan(0);
  });

  it("leaves the absent list empty on a day with no meeting", () => {
    expect(dayView(season(), "2026-11-04", "2026-11-13", null).absent).toEqual([]);
  });
});

describe("one member's season", () => {
  it("counts attendance, mandatory meetings and hours by month", () => {
    const mine = myView(season(), ada, "2026-11-13");
    expect(mine.onRoster).toBe(true);
    expect(mine.expected).toBe(4);
    expect(mine.attended).toBe(3);
    expect(mine.percent).toBe(75);
    expect(mine.mandatoryExpected).toBe(1);
    expect(mine.mandatoryAttended).toBe(1);
    // 100 + 30 (signed out early) + 95 minutes
    expect(mine.seasonHours).toBe(3.8);
    expect(mine.months).toEqual([{ month: "2026-11", percent: 75, meetings: 3, hours: 3.8 }]);
    expect(mine.rows[0].date).toBe("2026-11-13");
    expect(mine.rows[0].here).toBe(false);
  });

  it("only expects the meetings that are for their subteams", () => {
    expect(myView(season(), tess, "2026-11-13").expected).toBe(3);
  });

  it("says when the account isn't on the roster", () => {
    expect(myView(season(), null, "2026-11-13").onRoster).toBe(false);
  });
});

describe("past meetings and stats", () => {
  it("lists past meetings newest first with who missed each, not counting today", () => {
    const rows = pastMeetings(season(), "2026-11-13");
    expect(rows.map((r) => r.date)).toEqual(["2026-11-10", "2026-11-06", "2026-11-03"]);
    expect(rows[1]).toMatchObject({ signedIn: 2, mandatory: true, absent: ["Hedy Lamarr"] });
  });

  it("works out the season's numbers", () => {
    const stats = teamStats(season(), "2026-11-14");
    expect(stats.members).toBe(3);
    expect(stats.meetings).toBe(4);
    expect(stats.bestMeeting?.percent).toBe(100);
    // Expected: 3 + 3 + 1 + 3 = 10 member-meetings; came: 3 + 2 + 1 + 0 = 6.
    expect(stats.seasonPercent).toBe(60);
    expect(stats.subteams.find((s) => s.name === "Programming")).toMatchObject({ members: 1 });
    expect(stats.chart).toHaveLength(4);
    // Ada came to 3 of 4 (75%), Tess to 2 of 3, Hedy to 1 of 3: only Ada reaches the 75% minimum.
    expect(stats.aboveMinimum).toBe(1);
  });
});

describe("importing the old Sheet", () => {
  it("reads copied rows, keeping a person once a day with their earliest time", async () => {
    const { parseSheet } = await import("../src/attendance/import");
    const text = ["Timestamp\tStudent ID #", "1/10/2026 10:42:02\t1190116790", "1/10/2026 10:30:00\t1190116790", "1/12/2026 0:00:00\t1190117229", "1/12/2026 15:22:18\t1", "garbage"].join("\n");
    const parsed = parseSheet(text);
    expect(parsed.rows).toEqual([
      { studentId: "1190116790", date: "2026-01-10", time: "10:30" },
      { studentId: "1190117229", date: "2026-01-12", time: "" },
    ]);
    expect(parsed.skipped).toBe(3);
  });

  it("reads comma-separated rows too", async () => {
    const { parseSheet } = await import("../src/attendance/import");
    expect(parseSheet('"11/3/2026 15:20:00","4829173650"').rows).toEqual([{ studentId: "4829173650", date: "2026-11-03", time: "15:20" }]);
  });

  it("turns a team time into the right ISO time in winter and summer", async () => {
    const { teamIso } = await import("../src/attendance/import");
    expect(teamIso("2026-11-03", "15:20")).toBe("2026-11-03T23:20:00.000Z");
    expect(teamIso("2026-07-01", "15:20")).toBe("2026-07-01T22:20:00.000Z");
  });
});
