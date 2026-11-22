// What Attendance stores (collections att_signins, att_kiosks, att_settings) and what its screens show.
// Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Attendance. Browser-safe.
import type { Item } from "../ops/types";

/** One person's sign-in on one day (collection att_signins). Dates are team time (America/Los_Angeles). */
export interface SignIn extends Item {
  /** The school year it belongs to: "2026" is August 2026 to July 2027. */
  season: string;
  /** yyyy-mm-dd */
  date: string;
  /** The roster's student ID. Never sent to the browser, except to an Attendance Admin copying a month. */
  studentId: string;
  /** ISO time of signing in, and of signing out ("" while still here or when they never signed out). */
  signedInAt: string;
  signedOutAt: string;
  /** kiosk, or import (from the old Google Sheet). */
  source: "kiosk" | "import";
}

/** The team's Attendance settings (one row in att_settings). */
export interface AttSettings {
  /** The attendance a member should keep, as a percent. */
  minPercent: number;
  /** Let someone whose ID isn't on the roster add their name at the kiosk. */
  allowNewMembers: boolean;
  /** How long an opened kiosk stays open at most. */
  kioskHours: number;
}

export const DEFAULT_SETTINGS: AttSettings = { minPercent: 75, allowNewMembers: true, kioskHours: 6 };

/** Someone who is expected at meetings (a roster row, with their subteams from their account when they have one). */
export interface AttMember {
  /** The roster's student ID: how sign-ins find them. Server only. */
  studentId: string;
  /** Their Wix member ID, or "" when they haven't signed in to the apps yet. */
  memberId: string;
  name: string;
  subteams: string[];
}

/** A meeting that counts for attendance: from the Calendar. */
export interface AttMeeting {
  id: string;
  date: string;
  title: string;
  /** HH:MM, when it ends: signing in counts until then. */
  endTime: string;
  mandatory: boolean;
  subteams: string[];
}

// ----- what the screens get (no student IDs) -----

export interface PersonRow {
  name: string;
  subteams: string[];
}

export interface HereRow extends PersonRow {
  /** ISO times. */
  signedInAt: string;
  signedOutAt: string;
  /** Hours this season, and meetings missed this season. */
  hours: number;
  absences: number;
}

export interface AbsentRow extends PersonRow {
  absences: number;
}

/** Today (or any day): who is here and who isn't. */
export interface DayView {
  date: string;
  meetings: { id: string; title: string; mandatory: boolean; subteams: string[]; startTime: string; endTime: string }[];
  here: HereRow[];
  absent: AbsentRow[];
  /** Members expected: everyone, or the subteams the meetings are for. */
  expected: number;
  /** Signed in so far this month and the average per meeting this month. */
  monthAverage: number;
  /** Your hours this season, if you are on the roster. */
  myHours: number | null;
}

export interface MyRow {
  date: string;
  meeting: string;
  mandatory: boolean;
  signedInAt: string;
  signedOutAt: string;
  here: boolean;
}

/** Did I sign in? / My hours. */
export interface MyView {
  /** False when your account isn't linked to a roster row, so there is nothing to show. */
  onRoster: boolean;
  signedInToday: string; // ISO time, or ""
  rows: MyRow[];
  seasonHours: number;
  monthHours: number;
  /** Meetings you were expected at so far, and how many you came to. */
  expected: number;
  attended: number;
  mandatoryExpected: number;
  mandatoryAttended: number;
  percent: number;
  minPercent: number;
  /** One per month since August: yyyy-mm, percent, meetings you came to, hours. */
  months: { month: string; percent: number; meetings: number; hours: number }[];
}

export interface PastMeeting {
  id: string;
  date: string;
  title: string;
  mandatory: boolean;
  subteams: string[];
  signedIn: number;
  absent: string[];
}

export interface TeamStats {
  members: number;
  meetings: number;
  averagePerMeeting: number;
  seasonPercent: number;
  bestDay: { weekday: string; average: number } | null;
  bestMeeting: { date: string; here: number; expected: number; percent: number } | null;
  averageIndividual: number;
  aboveMinimum: number;
  minPercent: number;
  /** Each past meeting's attendance percent, oldest first (the chart), for the team and for each subteam. */
  chart: { date: string; title: string; percent: number; subteams: Record<string, number>; competition: boolean }[];
  subteams: { name: string; members: number; average: number }[];
}

// ----- the kiosk -----

export interface KioskSession {
  kioskToken: string;
  /** ISO time the server closes the kiosk by itself. */
  expiresAt: string;
}

export type SignInStatus = "signed-in" | "signed-out" | "duplicate" | "not-signed-in" | "needs-registration" | "invalid";

export interface SignInResult {
  status: SignInStatus;
  /** First name. */
  name?: string;
  /** ISO time. */
  at?: string;
  /** For a sign-out: minutes counted today. */
  minutes?: number;
  message: string;
}

/** Who is on the kiosk's list "Signed in today". */
export interface KioskRow {
  name: string;
  signedInAt: string;
  signedOutAt: string;
}
