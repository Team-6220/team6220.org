// attendance: the functions /apps/attendance uses. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Attendance.
//
//   import { attendance } from "@team6220/data";
//   const { day } = await attendance.today();                  // who is here and who isn't
//   const mine = await attendance.mine();                       // your sign-ins and hours
//   const kiosk = await attendance.openKiosk();                 // Attendance Admin: opens the sign-in kiosk
//   await attendance.signIn("0123456789", "in");                // on the open kiosk, no login needed per student
//
// Every call goes to the team server (/api/ops), which checks who is asking. Demo mode (?demo=attendance|member|lead|
// pending|signed-out) uses made-up data (./mock.ts).
import "./mock"; // the demo data (only used in demo mode)
import { callOps } from "../ops";
import { OpsError } from "../ops/types";
import type { ImportRow } from "./import";
import type { DayView, KioskRow, KioskSession, MyView, PastMeeting, SignInResult, TeamStats } from "./types";

export * from "./types";
export { parseSheet, type ImportRow, type ParsedSheet } from "./import";
export { countedMinutes, dayView, isExpected, myView, pastMeetings, seasonOf, teamStats } from "./stats";

// ----- the kiosk, which lives in the tab that opened it -----

const KIOSK_KEY = "team6220.attendance.kiosk";

function tabStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function forgetKiosk() {
  try {
    tabStorage()?.removeItem(KIOSK_KEY);
  } catch {
    // ignore
  }
}

/** The kiosk opened in this tab, if it hasn't expired. */
export function currentKiosk(): KioskSession | null {
  try {
    const raw = tabStorage()?.getItem(KIOSK_KEY);
    if (!raw) return null;
    const kiosk = JSON.parse(raw) as KioskSession;
    if (typeof kiosk.kioskToken !== "string" || !(Date.parse(kiosk.expiresAt) > Date.now())) {
      forgetKiosk();
      return null;
    }
    return kiosk;
  } catch {
    return null;
  }
}

/** Asks as the kiosk (its own token, no login). A closed kiosk is forgotten. */
async function asKiosk<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const kiosk = currentKiosk();
  if (!kiosk) throw new OpsError("kiosk-closed", "The kiosk is closed. An Attendance Admin has to open it.");
  try {
    return await callOps<T>(action, { kioskToken: kiosk.kioskToken, ...args });
  } catch (err) {
    if (err instanceof OpsError && err.code === "kiosk-closed") forgetKiosk();
    throw err;
  }
}

/** Attendance Admin: opens the kiosk in this tab. Students can then sign in here without logging in. */
export async function openKiosk(): Promise<KioskSession> {
  const session = await callOps<KioskSession>("attOpenKiosk");
  const kiosk: KioskSession = { kioskToken: session.kioskToken, expiresAt: session.expiresAt };
  try {
    tabStorage()?.setItem(KIOSK_KEY, JSON.stringify(kiosk));
  } catch {
    // without storage the kiosk only lasts until the page reloads
  }
  return kiosk;
}

/** Closes this tab's kiosk on the server and forgets it. Safe to call when none is open. */
export async function closeKiosk(): Promise<void> {
  const kiosk = currentKiosk();
  forgetKiosk();
  if (kiosk) await callOps("attCloseKiosk", { kioskToken: kiosk.kioskToken });
}

/** Kiosk: signs a student in (or out, when leaving early) by their ID. */
export async function signIn(studentId: string, mode: "in" | "out" = "in"): Promise<SignInResult> {
  return (await asKiosk<{ result: SignInResult }>("attKioskSignIn", { studentId: studentId.trim(), mode })).result;
}

/** Kiosk: adds an ID that isn't on the roster and signs them in. */
export async function register(studentId: string, firstName: string, lastName: string): Promise<SignInResult> {
  return (await asKiosk<{ result: SignInResult }>("attKioskRegister", { studentId: studentId.trim(), firstName, lastName })).result;
}

/** Kiosk: who signed in today, newest first. */
export async function kioskToday(): Promise<KioskRow[]> {
  return (await asKiosk<{ rows: KioskRow[] }>("attKioskToday")).rows;
}

/** Kiosk: five random student IDs for "Random quick sign in" (no names). Clicking one is the same as scanning it. */
export async function quickIds(): Promise<string[]> {
  return (await asKiosk<{ ids: string[] }>("attKioskQuick")).ids;
}

// ----- the screens -----

/** Who is here and who isn't, today or on another day (yyyy-mm-dd), and whether a kiosk is open. */
export async function today(date?: string): Promise<{ day: DayView; kioskOpen: boolean }> {
  return callOps("attDay", date ? { date } : {});
}

/** Your sign-ins, hours and attendance this season. */
export async function mine(): Promise<MyView> {
  return (await callOps<{ mine: MyView }>("attMine")).mine;
}

/** Every past meeting this season, newest first. */
export async function past(): Promise<PastMeeting[]> {
  return (await callOps<{ meetings: PastMeeting[] }>("attPast")).meetings;
}

/** The season's numbers. */
export async function stats(): Promise<TeamStats> {
  return (await callOps<{ stats: TeamStats }>("attStats")).stats;
}

/** Attendance Admin: a month's sign-ins (date, first name, last name, student ID) to paste into a Sheet. */
export async function copyMonth(month: string): Promise<{ date: string; firstName: string; lastName: string; studentId: string }[]> {
  return (await callOps<{ rows: { date: string; firstName: string; lastName: string; studentId: string }[] }>("attCopyMonth", { month })).rows;
}

/** Attendance Admin: brings in sign-ins read from the old Sheet (a few hundred at a time). Safe to repeat: a person who
 *  already has a sign-in that day is skipped. */
export async function importRows(rows: ImportRow[]): Promise<{ added: number; skipped: number; unknown: number }> {
  return callOps("attImport", { rows });
}
