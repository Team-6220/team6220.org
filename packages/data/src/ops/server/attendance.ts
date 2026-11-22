// Attendance on the server. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Attendance. SERVER ONLY.
//
// Sign-ins are rows in Wix (att_signins), one per person per day, kept by the student ID on the roster (ops_roster).
// Meetings, who they are for and which are mandatory come from the Calendar. What the numbers mean is worked out in
// ../../attendance/stats.ts, which the demo backend uses too. Student IDs never go to the browser, except when an
// Attendance Admin copies a month.
//   attDay          who is here and who isn't (today, or a day)        attendance
//   attMine         your sign-ins and hours                            attendance
//   attPast         past meetings with who missed them                 attendance
//   attStats        the season's numbers                               attendance
//   attCopyMonth    a month's sign-ins with names and IDs, for a Sheet Attendance Admin
//   attImport       brings in sign-ins from the old Google Sheet        Attendance Admin
//   attOpenKiosk    opens the sign-in kiosk                            Attendance Admin
//   attKiosk*       sign in / out, add a name, close, list (with the kiosk's own token; no login needed)
import { countedMinutes, dayView, meetingsFrom, membersFrom, myView, pastMeetings, seasonOf, teamStats, teamTime } from "../../attendance/stats";
import type { AttData } from "../../attendance/stats";
import { teamIso } from "../../attendance/import";
import { DEFAULT_SETTINGS, type AttSettings, type KioskRow, type SignIn, type SignInResult } from "../../attendance/types";
import { schoolYear } from "../../calendar/dates";
import type { CalEvent } from "../../calendar/types";
import { COLLECTION_PEOPLE, COLLECTION_ROSTER, sha256Hex, type Ctx } from "./context";
import { apiError, type Doc } from "./env";

export const ATTENDANCE_COLLECTIONS = ["att_signins", "att_kiosks", "att_settings"] as const;
const SIGNINS = "att_signins";
const KIOSKS = "att_kiosks";
const SETTINGS = "att_settings";
const PAGE = 1000;
const MAX_PAGES = 8;

// ---------------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------------

/** Every sign-in of a season, a page at a time (a season is a few thousand rows). */
async function seasonSignIns(ctx: Ctx, season: string): Promise<SignIn[]> {
  const rows: SignIn[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const part = (await ctx.data.query(SIGNINS, { season }, PAGE, undefined, page * PAGE)) as unknown as SignIn[];
    rows.push(...part);
    if (part.length < PAGE) return rows;
  }
  throw apiError("server-error", "This season has more sign-ins than one request can read. Ask a web admin.");
}

async function settingsOf(ctx: Ctx): Promise<AttSettings> {
  const row = (await ctx.data.query(SETTINGS, {}, 1))[0] as Partial<AttSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(row ?? {}) };
}

async function load(ctx: Ctx) {
  const today = ctx.today();
  const season = seasonOf(today);
  const [roster, people, events, signIns, settings] = await Promise.all([
    ctx.data.query(COLLECTION_ROSTER, {}, 1000),
    ctx.data.query(COLLECTION_PEOPLE, {}, 1000),
    ctx.data.query("cal_events", { type: "meeting" }, 1000),
    seasonSignIns(ctx, season),
    settingsOf(ctx),
  ]);
  const members = membersFrom(roster, people);
  const data: AttData = { meetings: meetingsFrom(events as unknown as CalEvent[], season), members, signIns, settings };
  const mine = members.find((m) => m.memberId && m.memberId === ctx.actor.id) ?? null;
  return { today, season, data, mine, events: events as unknown as CalEvent[] };
}

/** {} or { date } -> { day, kioskOpen } */
export async function attDay(ctx: Ctx, body: Doc) {
  const { today, data, mine } = await load(ctx);
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : today;
  const open = (await ctx.data.query(KIOSKS, { closed: false }, 20)).some((k) => String(k.expiresAt) > ctx.env.now().toISOString());
  return { day: dayView(data, date, today, mine?.studentId ?? null), kioskOpen: open };
}

/** {} -> { mine } */
export async function attMine(ctx: Ctx) {
  const { today, data, mine } = await load(ctx);
  return { mine: myView(data, mine, today) };
}

/** {} -> { meetings } */
export async function attPast(ctx: Ctx) {
  const { today, data } = await load(ctx);
  return { meetings: pastMeetings(data, today) };
}

/** {} -> { stats } */
export async function attStats(ctx: Ctx) {
  const { today, data, events } = await load(ctx);
  const competitions = events.filter((e) => e.type === "competition" && !e.cancelled).flatMap((e) => [e.startDate]);
  return { stats: teamStats(data, today, competitions) };
}

/** { month: "2026-11" } -> { rows }: a month's sign-ins, each date followed by first name, last name and student ID. */
export async function attCopyMonth(ctx: Ctx, body: Doc) {
  const month = typeof body.month === "string" && /^\d{4}-\d{2}$/.test(body.month) ? body.month : ctx.today().slice(0, 7);
  const [signIns, roster] = await Promise.all([seasonSignIns(ctx, seasonOf(`${month}-01`)), ctx.data.query(COLLECTION_ROSTER, {}, 1000)]);
  const byId = new Map(roster.map((r) => [String(r.studentId), r]));
  const rows = signIns
    .filter((s) => s.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date) || a.signedInAt.localeCompare(b.signedInAt))
    .map((s) => ({ date: s.date, firstName: String(byId.get(s.studentId)?.firstName ?? ""), lastName: String(byId.get(s.studentId)?.lastName ?? ""), studentId: s.studentId }));
  ctx.log({ kind: "attendance", id: month }, "copied", `${rows.length} sign-ins`);
  return { rows };
}

/** { rows: [{ studentId, date, time }] } (up to 500) -> { added, skipped, unknown }. The one-time import of the old Sheet's
 *  sign-ins. A sign-in with no time (typed by hand) starts when that day's meeting did. Someone who already has a sign-in
 *  that day, or whose ID isn't on the roster, is skipped. */
export async function attImport(ctx: Ctx, body: Doc) {
  const input = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];
  if (!input.length || input.length > 500) throw apiError("bad-request", "Send between 1 and 500 sign-ins at a time.");
  const rows = input.map((r, i) => {
    const studentId = String(r.studentId ?? "");
    const date = String(r.date ?? "");
    const time = String(r.time ?? "");
    if (!/^\d{6,12}$/.test(studentId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (time && !/^\d{2}:\d{2}$/.test(time))) throw apiError("bad-request", `Row ${i + 1} isn't a sign-in.`);
    return { studentId, date, time };
  });
  const seasons = [...new Set(rows.map((r) => seasonOf(r.date)))];
  const [roster, events, ...existing] = await Promise.all([
    ctx.data.query(COLLECTION_ROSTER, {}, 1000),
    ctx.data.query("cal_events", { type: "meeting" }, 1000),
    ...seasons.map((season) => seasonSignIns(ctx, season)),
  ]);
  const known = new Set(roster.map((r) => String(r.studentId)));
  const have = new Set(existing.flat().map((s) => `${s.studentId}|${s.date}`));
  const meetings = new Map((events as unknown as CalEvent[]).filter((e) => e.type === "meeting" && !e.cancelled).map((e) => [e.startDate, e]));
  const docs: Doc[] = [];
  let unknown = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!known.has(r.studentId)) unknown++;
    else if (have.has(`${r.studentId}|${r.date}`)) skipped++;
    else {
      have.add(`${r.studentId}|${r.date}`);
      docs.push({ season: seasonOf(r.date), date: r.date, studentId: r.studentId, signedInAt: teamIso(r.date, r.time || meetings.get(r.date)?.startTime || "15:00"), signedOutAt: "", source: "import" });
    }
  }
  await ctx.data.saveMany(SIGNINS, docs);
  ctx.log({ kind: "attendance", id: "import" }, "imported", `${docs.length} sign-ins`);
  return { added: docs.length, skipped, unknown };
}

// ---------------------------------------------------------------------------------------------------------
// The kiosk
// ---------------------------------------------------------------------------------------------------------

function newToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The open kiosk behind a token, or an error. */
async function kioskFor(ctx: Ctx, token: unknown): Promise<Doc> {
  if (typeof token !== "string" || token.length < 32 || token.length > 200) throw apiError("kiosk-closed", "The kiosk is closed. An Attendance Admin has to open it.");
  const row = (await ctx.data.query(KIOSKS, { tokenHash: await sha256Hex(token) }, 1))[0];
  if (!row || row.closed === true || String(row.expiresAt) <= ctx.env.now().toISOString()) throw apiError("kiosk-closed", "The kiosk is closed. An Attendance Admin has to open it.");
  return row;
}

/** {} -> { kioskToken, expiresAt } */
export async function attOpenKiosk(ctx: Ctx) {
  const settings = await settingsOf(ctx);
  const token = newToken();
  const expiresAt = new Date(ctx.env.now().getTime() + settings.kioskHours * 3_600_000).toISOString();
  await ctx.data.save(KIOSKS, { tokenHash: await sha256Hex(token), openedBy: ctx.actor.id, openedAt: ctx.env.now().toISOString(), expiresAt, closed: false });
  ctx.log({ kind: "attendance", id: "kiosk" }, "opened", `until ${expiresAt}`);
  return { kioskToken: token, expiresAt };
}

/** { kioskToken } -> {}. Whoever holds the token may close it: that only takes access away. */
export async function attCloseKiosk(ctx: Ctx, body: Doc) {
  const token = typeof body.kioskToken === "string" ? body.kioskToken : "";
  const row = token ? (await ctx.data.query(KIOSKS, { tokenHash: await sha256Hex(token) }, 1))[0] : undefined;
  if (row && row.closed !== true) await ctx.data.save(KIOSKS, { ...row, closed: true });
  return {};
}

const fmt = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
const idOf = (value: unknown) => {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^\d{6,12}$/.test(id)) throw apiError("bad-request", "A student ID is 6 to 12 digits.");
  return id;
};

async function rosterRow(ctx: Ctx, studentId: string): Promise<Doc | undefined> {
  return (await ctx.data.query(COLLECTION_ROSTER, { studentId }, 1))[0];
}

/** { kioskToken, studentId, mode: "in" | "out" } -> { result } */
export async function attKioskSignIn(ctx: Ctx, body: Doc) {
  await kioskFor(ctx, body.kioskToken);
  const studentId = idOf(body.studentId);
  const person = await rosterRow(ctx, studentId);
  if (!person) {
    const settings = await settingsOf(ctx);
    const result: SignInResult = settings.allowNewMembers
      ? { status: "needs-registration", message: "We don't have that ID yet. Add your name to sign in." }
      : { status: "invalid", message: "That ID isn't on the roster. Ask a lead or mentor to add you." };
    return { result };
  }
  return { result: await signIn(ctx, person, body.mode === "out" ? "out" : "in") };
}

async function signIn(ctx: Ctx, person: Doc, mode: "in" | "out"): Promise<SignInResult> {
  const now = ctx.env.now().toISOString();
  const today = ctx.today();
  const studentId = String(person.studentId);
  const first = String(person.firstName ?? "");
  const mine = (await ctx.data.query(SIGNINS, { studentId, date: today }, 1))[0] as unknown as SignIn | undefined;
  if (mode === "in") {
    if (mine) return { status: "duplicate", name: first, at: mine.signedInAt, message: `You already signed in today at ${fmt(mine.signedInAt)}.` };
    await ctx.data.save(SIGNINS, { season: seasonOf(today), date: today, studentId, signedInAt: now, signedOutAt: "", source: "kiosk" });
    return { status: "signed-in", name: first, at: now, message: `You're signed in at ${fmt(now)}. No need to sign out unless you leave before the meeting ends.` };
  }
  if (!mine) return { status: "not-signed-in", name: first, message: "You haven't signed in today, so there is nothing to sign out of." };
  if (mine.signedOutAt) return { status: "duplicate", name: first, at: mine.signedOutAt, message: `You already signed out at ${fmt(mine.signedOutAt)}.` };
  await ctx.data.save(SIGNINS, { ...mine, signedOutAt: now } as unknown as Doc);
  const meeting = ((await ctx.data.query("cal_events", { startDate: today }, 5)) as unknown as CalEvent[]).find((e) => e.type === "meeting" && !e.cancelled);
  const minutes = countedMinutes({ signedInAt: mine.signedInAt, signedOutAt: now }, meeting ? { endTime: meeting.endTime } : undefined);
  const counted = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
  return { status: "signed-out", name: first, at: now, minutes, message: `You're signed out at ${fmt(now)}. Counted: ${counted} today.` };
}

const nameOf = (value: unknown, what: string) => {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text || text.length > 60) throw apiError("bad-request", `Type your ${what}.`);
  return text;
};

/** { kioskToken, studentId, firstName, lastName } -> { result }. Adds an ID that isn't on the roster, then signs them in. */
export async function attKioskRegister(ctx: Ctx, body: Doc) {
  await kioskFor(ctx, body.kioskToken);
  const studentId = idOf(body.studentId);
  if (!(await settingsOf(ctx)).allowNewMembers) throw apiError("forbidden", "New names can't be added at the kiosk right now.");
  if (await rosterRow(ctx, studentId)) throw apiError("bad-request", "That ID is already on the roster. Sign in with it.");
  const row = { studentId, firstName: nameOf(body.firstName, "first name"), lastName: nameOf(body.lastName, "last name"), grade: "", subteam: "", memberId: "", active: true, source: "kiosk" };
  const saved = await ctx.data.save(COLLECTION_ROSTER, row);
  ctx.log({ kind: "attendance", id: studentId }, "registered", `${row.firstName} ${row.lastName} added at the kiosk`);
  return { result: await signIn(ctx, { ...row, _id: saved._id }, "in") };
}

/** { kioskToken } -> { rows }: today's sign-ins, newest first (names and times only). */
export async function attKioskToday(ctx: Ctx, body: Doc) {
  await kioskFor(ctx, body.kioskToken);
  const [today, roster] = [ctx.today(), await ctx.data.query(COLLECTION_ROSTER, {}, 1000)];
  const names = new Map(roster.map((r) => [String(r.studentId), `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()]));
  const rows = ((await ctx.data.query(SIGNINS, { date: today }, 1000)) as unknown as SignIn[])
    .sort((a, b) => b.signedInAt.localeCompare(a.signedInAt))
    .map((s): KioskRow => ({ name: names.get(s.studentId) ?? "Someone", signedInAt: s.signedInAt, signedOutAt: s.signedOutAt }));
  return { rows };
}

export { schoolYear, teamTime };
