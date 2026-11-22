// Attendance maths: who was expected, who came, hours and percentages. Plain functions on lists, so the server
// (ops/server/attendance.ts) and the demo backend (./mock.ts) work out exactly the same things. Browser-safe.
//
// Rules (the ones the prototype shows):
//   - A meeting is expected from a member when it is for everyone, or for one of their subteams.
//   - Someone attended a meeting when they signed in on its day (even if it wasn't for their subteam).
//   - Hours count from signing in until the meeting ends, or until they signed out if that is earlier.
//   - A season is the school year, August to July. Only meetings up to today count.
import { addDays, schoolYear } from "../calendar/dates";
import type { CalEvent } from "../calendar/types";
import type { AbsentRow, AttMeeting, AttMember, AttSettings, DayView, HereRow, MyRow, MyView, PastMeeting, SignIn, TeamStats } from "./types";

export interface AttData {
  /** Meetings of this season, from the Calendar. */
  meetings: AttMeeting[];
  members: AttMember[];
  signIns: SignIn[];
  settings: AttSettings;
}

/** A stored row (roster, account). */
type Row = Record<string, unknown>;

const ZONE = "America/Los_Angeles";

/** The roster as people who are expected at meetings, with their subteams from their accounts. */
export function membersFrom(roster: Row[], people: Row[]): AttMember[] {
  const subteamsOf = new Map(people.map((p) => [String(p.memberId), (p.subteams as string[]) ?? []]));
  return roster
    .filter((r) => r.active !== false)
    .map((r) => ({
      studentId: String(r.studentId),
      memberId: String(r.memberId ?? ""),
      name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Unnamed",
      subteams: r.memberId && subteamsOf.has(String(r.memberId)) ? subteamsOf.get(String(r.memberId))! : r.subteam ? [String(r.subteam)] : [],
    }));
}

export function meetingsFrom(events: CalEvent[], season: string): AttMeeting[] {
  return events
    .filter((e) => e.type === "meeting" && !e.cancelled && seasonOf(e.startDate) === season)
    .map((e) => ({ id: e._id, date: e.startDate, title: e.title || "Team meeting", endTime: e.endTime, mandatory: !!e.mandatory, subteams: e.subteams ?? [] }));
}


/** An ISO time as the team's date and minutes since midnight. */
export function teamTime(iso: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** "2026-11-21" -> "2026" (the school year it is in). */
export function seasonOf(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return String(m >= 8 ? y : y - 1);
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Minutes counted for one sign-in on its meeting. */
export function countedMinutes(signIn: Pick<SignIn, "signedInAt" | "signedOutAt">, meeting: Pick<AttMeeting, "endTime"> | undefined): number {
  const start = teamTime(signIn.signedInAt).minutes;
  const meetingEnd = meeting?.endTime ? minutesOf(meeting.endTime) : null;
  const out = signIn.signedOutAt ? teamTime(signIn.signedOutAt).minutes : null;
  const end = out !== null && meetingEnd !== null ? Math.min(out, meetingEnd) : (out ?? meetingEnd);
  return end === null ? 0 : Math.max(0, end - start);
}

const hoursOf = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

/** Whether a meeting is for this member: everyone's, or one of their subteams'. */
export function isExpected(meeting: AttMeeting, member: AttMember): boolean {
  return !meeting.subteams.length || !member.subteams.length || meeting.subteams.some((s) => member.subteams.includes(s));
}

/** The first sign-in of each student on each day: student ID -> date -> sign-in. */
function indexSignIns(signIns: SignIn[]): Map<string, Map<string, SignIn>> {
  const index = new Map<string, Map<string, SignIn>>();
  for (const s of [...signIns].sort((a, b) => a.signedInAt.localeCompare(b.signedInAt))) {
    const days = index.get(s.studentId) ?? index.set(s.studentId, new Map()).get(s.studentId)!;
    if (!days.has(s.date)) days.set(s.date, s);
  }
  return index;
}

/** Meetings up to and including today, oldest first. */
const pastOnes = (data: AttData, today: string) => data.meetings.filter((m) => m.date <= today).sort((a, b) => a.date.localeCompare(b.date));

interface Person {
  expected: AttMeeting[];
  attended: AttMeeting[];
  minutes: number;
  /** Minutes by month (yyyy-mm). */
  byMonth: Map<string, number>;
}

/** One member's season: meetings expected, meetings attended, hours. */
function personFor(member: AttMember, index: Map<string, Map<string, SignIn>>, past: AttMeeting[]): Person {
  const days = index.get(member.studentId) ?? new Map<string, SignIn>();
  const expected = past.filter((m) => isExpected(m, member));
  const attended = expected.filter((m) => days.has(m.date));
  const byMonth = new Map<string, number>();
  let minutes = 0;
  const seen = new Set<string>();
  for (const m of past) {
    const s = days.get(m.date);
    if (!s || seen.has(m.date)) continue;
    seen.add(m.date);
    const counted = countedMinutes(s, m);
    minutes += counted;
    byMonth.set(m.date.slice(0, 7), (byMonth.get(m.date.slice(0, 7)) ?? 0) + counted);
  }
  return { expected, attended, minutes, byMonth };
}

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** One day: who is here and who is not, with each person's season hours and absences. */
export function dayView(data: AttData, date: string, today: string, myStudentId: string | null): DayView {
  const past = pastOnes(data, today);
  const index = indexSignIns(data.signIns);
  const meetings = data.meetings.filter((m) => m.date === date);
  const expectedHere = data.members.filter((m) => !meetings.length || meetings.some((x) => isExpected(x, m)));
  const people = new Map(data.members.map((m) => [m.studentId, personFor(m, index, past)]));
  const here: HereRow[] = [];
  const absent: AbsentRow[] = [];
  for (const m of data.members) {
    const s = index.get(m.studentId)?.get(date);
    const p = people.get(m.studentId)!;
    const absences = p.expected.length - p.attended.length;
    if (s) here.push({ name: m.name, subteams: m.subteams, signedInAt: s.signedInAt, signedOutAt: s.signedOutAt, hours: hoursOf(p.minutes), absences });
    else if (expectedHere.includes(m) && meetings.length) absent.push({ name: m.name, subteams: m.subteams, absences });
  }
  here.sort((a, b) => b.signedInAt.localeCompare(a.signedInAt));
  absent.sort((a, b) => a.name.localeCompare(b.name));
  const month = date.slice(0, 7);
  const monthMeetings = past.filter((m) => m.date.slice(0, 7) === month);
  const signedInMonth = monthMeetings.reduce((sum, m) => sum + data.members.filter((x) => index.get(x.studentId)?.has(m.date)).length, 0);
  return {
    date,
    meetings: meetings.map((m) => ({ id: m.id, title: m.title, mandatory: m.mandatory, subteams: m.subteams, startTime: "", endTime: m.endTime })),
    here,
    absent,
    expected: expectedHere.length,
    monthAverage: monthMeetings.length ? Math.round(signedInMonth / monthMeetings.length) : 0,
    myHours: myStudentId && people.has(myStudentId) ? hoursOf(people.get(myStudentId)!.minutes) : null,
  };
}

/** "Did I sign in?" and "My hours" for one member. */
export function myView(data: AttData, member: AttMember | null, today: string): MyView {
  const empty: MyView = { onRoster: false, signedInToday: "", rows: [], seasonHours: 0, monthHours: 0, expected: 0, attended: 0, mandatoryExpected: 0, mandatoryAttended: 0, percent: 0, minPercent: data.settings.minPercent, months: [] };
  if (!member) return empty;
  const past = pastOnes(data, today);
  const index = indexSignIns(data.signIns);
  const days = index.get(member.studentId) ?? new Map<string, SignIn>();
  const p = personFor(member, index, past);
  const rows: MyRow[] = p.expected
    .map((m) => ({ date: m.date, meeting: m.title, mandatory: m.mandatory, signedInAt: days.get(m.date)?.signedInAt ?? "", signedOutAt: days.get(m.date)?.signedOutAt ?? "", here: days.has(m.date) }))
    .reverse();
  const months = new Map<string, { expected: number; attended: number }>();
  for (const m of p.expected) {
    const row = months.get(m.date.slice(0, 7)) ?? months.set(m.date.slice(0, 7), { expected: 0, attended: 0 }).get(m.date.slice(0, 7))!;
    row.expected++;
    if (days.has(m.date)) row.attended++;
  }
  return {
    onRoster: true,
    signedInToday: days.get(today)?.signedInAt ?? "",
    rows,
    seasonHours: hoursOf(p.minutes),
    monthHours: hoursOf(p.byMonth.get(today.slice(0, 7)) ?? 0),
    expected: p.expected.length,
    attended: p.attended.length,
    mandatoryExpected: p.expected.filter((m) => m.mandatory).length,
    mandatoryAttended: p.attended.filter((m) => m.mandatory).length,
    percent: percent(p.attended.length, p.expected.length),
    minPercent: data.settings.minPercent,
    months: [...months].map(([month, v]) => ({ month, percent: percent(v.attended, v.expected), meetings: v.attended, hours: hoursOf(p.byMonth.get(month) ?? 0) })).sort((a, b) => a.month.localeCompare(b.month)),
  };
}

/** Every past meeting this season, newest first, with how many came and who didn't. */
export function pastMeetings(data: AttData, today: string): PastMeeting[] {
  const index = indexSignIns(data.signIns);
  return pastOnes(data, addDays(today, -1)).map((m) => {
    const absent = data.members.filter((x) => isExpected(m, x) && !index.get(x.studentId)?.has(m.date)).map((x) => x.name).sort();
    return { id: m.id, date: m.date, title: m.title, mandatory: m.mandatory, subteams: m.subteams, signedIn: data.members.filter((x) => index.get(x.studentId)?.has(m.date)).length, absent };
  }).reverse();
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The season's numbers for the Stats screen. `competitions` are dates to mark on the chart. */
export function teamStats(data: AttData, today: string, competitions: string[] = []): TeamStats {
  const past = pastOnes(data, addDays(today, -1));
  const index = indexSignIns(data.signIns);
  const per = past.map((m) => {
    const expected = data.members.filter((x) => isExpected(m, x));
    const all = data.members.filter((x) => index.get(x.studentId)?.has(m.date)).length;
    // Percentages count the people the meeting was for; someone from another subteam who came is in `all` only.
    const here = expected.filter((x) => index.get(x.studentId)?.has(m.date)).length;
    return { meeting: m, expected: expected.length, here, all };
  });
  const totalHere = per.reduce((s, r) => s + r.here, 0);
  const totalAll = per.reduce((s, r) => s + r.all, 0);
  const totalExpected = per.reduce((s, r) => s + r.expected, 0);
  const people = data.members.map((m) => ({ member: m, ...personFor(m, index, past) }));
  const individual = people.filter((p) => p.expected.length).map((p) => percent(p.attended.length, p.expected.length));
  const byWeekday = new Map<number, number[]>();
  for (const r of per) {
    const day = new Date(`${r.meeting.date}T12:00:00Z`).getUTCDay();
    byWeekday.set(day, [...(byWeekday.get(day) ?? []), r.all]);
  }
  const bestDay = [...byWeekday].map(([day, list]) => ({ weekday: WEEKDAYS[day], average: Math.round(list.reduce((a, b) => a + b, 0) / list.length) })).sort((a, b) => b.average - a.average)[0] ?? null;
  const best = [...per].filter((r) => r.expected).sort((a, b) => b.here / b.expected - a.here / a.expected)[0];
  const names = [...new Set(data.members.flatMap((m) => m.subteams))].sort();
  return {
    members: data.members.length,
    meetings: past.length,
    averagePerMeeting: past.length ? Math.round(totalAll / past.length) : 0,
    seasonPercent: percent(totalHere, totalExpected),
    bestDay,
    bestMeeting: best ? { date: best.meeting.date, here: best.here, expected: best.expected, percent: percent(best.here, best.expected) } : null,
    averageIndividual: individual.length ? Math.round(individual.reduce((a, b) => a + b, 0) / individual.length) : 0,
    aboveMinimum: individual.filter((p) => p >= data.settings.minPercent).length,
    minPercent: data.settings.minPercent,
    chart: per.map((r) => ({
      date: r.meeting.date,
      title: r.meeting.title,
      percent: percent(r.here, r.expected),
      subteams: Object.fromEntries(names.map((name) => {
        const inTeam = data.members.filter((m) => m.subteams.includes(name) && isExpected(r.meeting, m));
        return [name, percent(inTeam.filter((m) => index.get(m.studentId)?.has(r.meeting.date)).length, inTeam.length)];
      })),
      competition: competitions.includes(r.meeting.date),
    })),
    subteams: names.map((name) => {
      const inTeam = people.filter((p) => p.member.subteams.includes(name) && p.expected.length);
      return { name, members: data.members.filter((m) => m.subteams.includes(name)).length, average: inTeam.length ? Math.round(inTeam.reduce((s, p) => s + percent(p.attended.length, p.expected.length), 0) / inTeam.length) : 0 };
    }),
  };
}

export { schoolYear };
