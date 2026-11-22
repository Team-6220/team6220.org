// Demo data for Attendance: a made-up roster and a season of sign-ins on the Calendar's demo meetings, plus the demo
// versions of the server's attendance actions (ops/server/attendance.ts), which use the same stats.ts.
import "../calendar/mock"; // the demo meetings come first
import { mockActions, seedMock, type MockDb } from "../ops/mock";
import { OpsError, type Item } from "../ops/types";
import type { Person } from "../ops/types";
import { addDays, today } from "../calendar/dates";
import type { CalEvent } from "../calendar/types";
import { teamIso } from "./import";
import { countedMinutes, dayView, meetingsFrom, membersFrom, myView, pastMeetings, seasonOf, teamStats } from "./stats";
import { DEFAULT_SETTINGS, type AttSettings, type KioskRow, type SignIn, type SignInResult } from "./types";

const ROSTER = [
  ["4829173650", "Ada", "Lovelace", "p-ada", "Programming"],
  ["1057382946", "Nikola", "Tesla", "p-nikola", "Electrical"],
  ["7731905284", "Hedy", "Lamarr", "p-hedy", "Design"],
  ["2946018357", "Katherine", "Johnson", "p-katherine", "Operations"],
  ["6182430795", "Grace", "Hopper", "p-grace", "Programming"],
  ["3340981265", "Alan", "Turing", "", "Electrical"],
  ["9120473856", "Margaret", "Hamilton", "", "Manufacturing"],
  ["5503817294", "Demo", "Member", "demo-member", "Programming"],
  ["8801203947", "Demo", "Lead", "demo-lead", "Design"],
  ["1234567890", "Demo", "Attendance", "demo-attendance", "Operations"],
] as const;

/** A time on a day as an ISO string (the demo ignores daylight saving). */
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-08:00`).toISOString();

seedMock((db) => {
  for (const [studentId, firstName, lastName, memberId, subteam] of ROSTER) {
    db.save("ops_roster", { studentId, firstName, lastName, grade: "11th", subteam, memberId, active: true });
  }
  db.save("att_settings", { ...DEFAULT_SETTINGS });
  const now = today();
  const meetings = db.rows<CalEvent>("cal_events").filter((e) => e.type === "meeting" && !e.cancelled && e.startDate <= now);
  meetings.forEach((m, n) => {
    ROSTER.forEach(([studentId], i) => {
      // A steady pattern: most people come, each misses a few different days.
      if ((n * 7 + i * 3) % 9 === 0 && m.startDate !== now) return;
      const start = m.startTime || "15:20";
      const minute = (i * 4 + n) % 20;
      const early = Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + minute;
      const hhmm = `${String(Math.floor(early / 60)).padStart(2, "0")}:${String(early % 60).padStart(2, "0")}`;
      db.save<SignIn>("att_signins", { season: seasonOf(m.startDate), date: m.startDate, studentId, signedInAt: at(m.startDate, hhmm), signedOutAt: "", source: "kiosk" });
    });
  });
});

// ----- the demo backend's actions -----

const sorted = <T extends { startDate: string }>(rows: T[]) => rows;

function load(db: MockDb, memberId: string) {
  const now = today();
  const season = seasonOf(now);
  const roster = db.rows<Item>("ops_roster");
  const people = db.rows<Person>("ops_people") as unknown as Record<string, unknown>[];
  const members = membersFrom(roster, people);
  const events = sorted(db.rows<CalEvent>("cal_events"));
  const settings: AttSettings = { ...DEFAULT_SETTINGS, ...(db.rows<Item & Partial<AttSettings>>("att_settings")[0] ?? {}) };
  const data = { meetings: meetingsFrom(events, season), members, signIns: db.rows<SignIn>("att_signins").filter((s) => s.season === season), settings };
  return { now, data, mine: members.find((m) => m.memberId && m.memberId === memberId) ?? null, events };
}

const kioskRows = (db: MockDb) => db.rows<Item & { token: string; expiresAt: string; closed: boolean }>("att_kiosks");
const fmt = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });

function kiosk(db: MockDb, token: unknown) {
  const row = kioskRows(db).find((k) => k.token === token);
  if (!row || row.closed || row.expiresAt <= new Date().toISOString()) throw new OpsError("kiosk-closed", "The kiosk is closed. An Attendance Admin has to open it.");
}

const checkedId = (value: unknown) => {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^\d{6,12}$/.test(id)) throw new OpsError("bad-request", "A student ID is 6 to 12 digits.");
  return id;
};

function signIn(db: MockDb, person: Item, mode: "in" | "out"): SignInResult {
  const nowIso = new Date().toISOString();
  const date = today();
  const studentId = String(person.studentId);
  const first = String(person.firstName);
  const mine = db.rows<SignIn>("att_signins").find((s) => s.studentId === studentId && s.date === date);
  if (mode === "in") {
    if (mine) return { status: "duplicate", name: first, at: mine.signedInAt, message: `You already signed in today at ${fmt(mine.signedInAt)}.` };
    db.save("att_signins", { season: seasonOf(date), date, studentId, signedInAt: nowIso, signedOutAt: "", source: "kiosk" });
    return { status: "signed-in", name: first, at: nowIso, message: `You're signed in at ${fmt(nowIso)}. No need to sign out unless you leave before the meeting ends.` };
  }
  if (!mine) return { status: "not-signed-in", name: first, message: "You haven't signed in today, so there is nothing to sign out of." };
  if (mine.signedOutAt) return { status: "duplicate", name: first, at: mine.signedOutAt, message: `You already signed out at ${fmt(mine.signedOutAt)}.` };
  db.save("att_signins", { ...mine, signedOutAt: nowIso });
  const meeting = db.rows<CalEvent>("cal_events").find((e) => e.type === "meeting" && !e.cancelled && e.startDate === date);
  const minutes = countedMinutes({ signedInAt: mine.signedInAt, signedOutAt: nowIso }, meeting ? { endTime: meeting.endTime } : undefined);
  const counted = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
  return { status: "signed-out", name: first, at: nowIso, minutes, message: `You're signed out at ${fmt(nowIso)}. Counted: ${counted} today.` };
}

mockActions({
  attDay: {
    who: "attendance",
    run: (request, actor, db) => {
      const { now, data, mine } = load(db, actor.id);
      const date = typeof request.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(request.date) ? request.date : now;
      const open = kioskRows(db).some((k) => !k.closed && k.expiresAt > new Date().toISOString());
      return { day: dayView(data, date, now, mine?.studentId ?? null), kioskOpen: open };
    },
  },
  attMine: { who: "attendance", run: (_request, actor, db) => { const { now, data, mine } = load(db, actor.id); return { mine: myView(data, mine, now) }; } },
  attPast: { who: "attendance", run: (_request, actor, db) => { const { now, data } = load(db, actor.id); return { meetings: pastMeetings(data, now) }; } },
  attStats: { who: "attendance", run: (_request, actor, db) => { const { now, data, events } = load(db, actor.id); return { stats: teamStats(data, now, events.filter((e) => e.type === "competition").map((e) => e.startDate)) }; } },
  attCopyMonth: {
    who: "attendanceAdmin",
    run: (request, actor, db) => {
      const month = typeof request.month === "string" && /^\d{4}-\d{2}$/.test(request.month) ? request.month : today().slice(0, 7);
      const roster = new Map(db.rows<Item>("ops_roster").map((r) => [String(r.studentId), r]));
      const rows = db.rows<SignIn>("att_signins").filter((s) => s.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date))
        .map((s) => ({ date: s.date, firstName: String(roster.get(s.studentId)?.firstName ?? ""), lastName: String(roster.get(s.studentId)?.lastName ?? ""), studentId: s.studentId }));
      db.writeHistory(actor, { kind: "attendance", id: month }, "copied", `${rows.length} sign-ins`);
      return { rows };
    },
  },
  attImport: {
    who: "attendanceAdmin",
    run: (request, _actor, db) => {
      const rows = Array.isArray(request.rows) ? (request.rows as { studentId: string; date: string; time: string }[]) : [];
      const known = new Set(db.rows<Item>("ops_roster").map((r) => String(r.studentId)));
      const have = new Set(db.rows<SignIn>("att_signins").map((s) => `${s.studentId}|${s.date}`));
      let added = 0, skipped = 0, unknown = 0;
      for (const r of rows) {
        if (!known.has(r.studentId)) unknown++;
        else if (have.has(`${r.studentId}|${r.date}`)) skipped++;
        else {
          have.add(`${r.studentId}|${r.date}`);
          db.save("att_signins", { season: seasonOf(r.date), date: r.date, studentId: r.studentId, signedInAt: teamIso(r.date, r.time || "15:00"), signedOutAt: "", source: "import" });
          added++;
        }
      }
      return { added, skipped, unknown };
    },
  },
  attOpenKiosk: {
    who: "attendanceAdmin",
    run: (_request, _actor, db) => {
      const token = `kiosk-${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`.padEnd(40, "0");
      const expiresAt = new Date(Date.now() + DEFAULT_SETTINGS.kioskHours * 3_600_000).toISOString();
      db.save("att_kiosks", { token, expiresAt, closed: false });
      return { kioskToken: token, expiresAt };
    },
  },
  attCloseKiosk: {
    who: "anyone",
    run: (request, _actor, db) => {
      const row = kioskRows(db).find((k) => k.token === request.kioskToken);
      if (row) db.save("att_kiosks", { ...row, closed: true });
      return {};
    },
  },
  attKioskSignIn: {
    who: "anyone",
    run: (request, _actor, db) => {
      kiosk(db, request.kioskToken);
      const studentId = checkedId(request.studentId);
      const person = db.rows<Item>("ops_roster").find((r) => r.studentId === studentId);
      if (!person) return { result: { status: "needs-registration", message: "We don't have that ID yet. Add your name to sign in." } satisfies SignInResult };
      return { result: signIn(db, person, request.mode === "out" ? "out" : "in") };
    },
  },
  attKioskRegister: {
    who: "anyone",
    run: (request, _actor, db) => {
      kiosk(db, request.kioskToken);
      const studentId = checkedId(request.studentId);
      if (db.rows<Item>("ops_roster").some((r) => r.studentId === studentId)) throw new OpsError("bad-request", "That ID is already on the roster. Sign in with it.");
      const text = (v: unknown, what: string) => {
        const t = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
        if (!t || t.length > 60) throw new OpsError("bad-request", `Type your ${what}.`);
        return t;
      };
      const person = db.save("ops_roster", { studentId, firstName: text(request.firstName, "first name"), lastName: text(request.lastName, "last name"), grade: "", subteam: "", memberId: "", active: true });
      return { result: signIn(db, person, "in") };
    },
  },
  attKioskQuick: {
    who: "anyone",
    run: (request, _actor, db) => {
      kiosk(db, request.kioskToken);
      const signed = new Set(db.rows<SignIn>("att_signins").filter((s) => s.date === today()).map((s) => s.studentId));
      const all = db.rows<Item>("ops_roster").map((r) => String(r.studentId));
      const waiting = all.filter((id) => !signed.has(id));
      const pool = [...(waiting.length >= 5 ? waiting : all)];
      const ids: string[] = [];
      while (ids.length < 5 && pool.length) ids.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      return { ids };
    },
  },
  attKioskToday: {
    who: "anyone",
    run: (request, _actor, db) => {
      kiosk(db, request.kioskToken);
      const names = new Map(db.rows<Item>("ops_roster").map((r) => [String(r.studentId), `${r.firstName} ${r.lastName}`]));
      const rows: KioskRow[] = db.rows<SignIn>("att_signins").filter((s) => s.date === today()).sort((a, b) => b.signedInAt.localeCompare(a.signedInAt))
        .map((s) => ({ name: names.get(s.studentId) ?? "Someone", signedInAt: s.signedInAt, signedOutAt: s.signedOutAt }));
      return { rows };
    },
  },
});

export { addDays };
