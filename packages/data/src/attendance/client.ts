// The attendance functions apps call. They talk to the "attendance API" Apps Script
// (backend/apps-script/attendance-api), or to the mock in demo mode / tests.
import {
  AttendanceError,
  type AttendanceErrorCode,
  type AttendanceStatus,
  type DayEntry,
  type DaySummary,
  type KioskSession,
  type LookupResult,
  type SignInResult,
  type Transport,
} from "./types";

export interface ClientOptions {
  /** Sends requests (Apps Script over HTTP, or the mock). Null = not configured. */
  transport: () => Transport | null;
  /** The member token to send with viewer/admin requests, or null when signed out. */
  getToken: () => Promise<string | null>;
  /** Where the open kiosk's token is kept for this tab (sessionStorage in the browser). */
  kioskStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } | null;
}

const KIOSK_KEY = "team6220.attendance.kiosk";
const ERROR_CODES: AttendanceErrorCode[] = [
  "signed-out", "pending", "forbidden", "kiosk-closed", "not-configured", "bad-request", "busy",
  "wix-unavailable", "server-error", "network",
];

export function createAttendanceClient(opts: ClientOptions) {
  const storage = opts.kioskStorage ?? null;

  async function send(request: { action: string } & Record<string, unknown>): Promise<Record<string, unknown>> {
    const transport = opts.transport();
    if (!transport) {
      throw new AttendanceError("not-configured", "Attendance isn't connected to its server yet.");
    }
    const body = await transport(request);
    if (body?.ok !== true) {
      const code = ERROR_CODES.includes(body?.error as AttendanceErrorCode) ? (body.error as AttendanceErrorCode) : "server-error";
      const message = typeof body?.message === "string" ? body.message : "The attendance server had a problem.";
      if (code === "kiosk-closed") forgetKiosk();
      throw new AttendanceError(code, message);
    }
    return body;
  }

  async function asMember(action: string, extra: Record<string, unknown> = {}) {
    const token = await opts.getToken();
    if (!token) throw new AttendanceError("signed-out", "Sign in to use attendance.");
    return send({ action, token, ...extra });
  }

  function forgetKiosk() {
    try {
      storage?.removeItem(KIOSK_KEY);
    } catch {
      // ignore
    }
  }

  /** The kiosk opened in this tab, if it hasn't expired. */
  function currentKiosk(): KioskSession | null {
    try {
      const raw = storage?.getItem(KIOSK_KEY);
      if (!raw) return null;
      const k = JSON.parse(raw) as KioskSession;
      if (typeof k.kioskToken !== "string" || !(Date.parse(k.expiresAt) > Date.now())) {
        forgetKiosk();
        return null;
      }
      return k;
    } catch {
      return null;
    }
  }

  async function asKiosk(action: string, extra: Record<string, unknown>): Promise<SignInResult> {
    const kiosk = currentKiosk();
    if (!kiosk) throw new AttendanceError("kiosk-closed", "The kiosk is closed. An Attendance Admin has to open it.");
    const body = await send({ action, kioskToken: kiosk.kioskToken, ...extra });
    return body.result as SignInResult;
  }

  return {
    /** Server-checked roles and whether any kiosk is open. */
    async status(): Promise<AttendanceStatus> {
      const b = await asMember("status");
      return { name: String(b.name ?? ""), isMember: !!b.isMember, isAdmin: !!b.isAdmin, kioskOpen: !!b.kioskOpen };
    },

    /** Attendance Admin: opens the kiosk in this tab. Students can then sign in here without logging in. */
    async openKiosk(): Promise<KioskSession> {
      const b = await asMember("openKiosk");
      const session: KioskSession = { kioskToken: String(b.kioskToken), expiresAt: String(b.expiresAt) };
      try {
        storage?.setItem(KIOSK_KEY, JSON.stringify(session));
      } catch {
        // without storage the kiosk only lasts until reload
      }
      return session;
    },

    /** Closes this tab's kiosk on the server and forgets it. Safe to call when none is open. */
    async closeKiosk(): Promise<void> {
      const kiosk = currentKiosk();
      forgetKiosk();
      if (kiosk) await send({ action: "closeKiosk", kioskToken: kiosk.kioskToken });
    },

    currentKiosk,

    /** Kiosk: sign a student in by their 10-digit ID. */
    signIn(studentId: string): Promise<SignInResult> {
      return asKiosk("signIn", { studentId: studentId.trim() });
    },

    /** Kiosk: add an unknown ID to the roster and sign them in (as the old app did). */
    register(studentId: string, firstName: string, lastName: string): Promise<SignInResult> {
      return asKiosk("register", { studentId: studentId.trim(), firstName, lastName });
    },

    /** Team Member: everyone who signed in today (names and times, no IDs). */
    async today(): Promise<DayEntry[]> {
      return ((await asMember("today")).entries as DayEntry[]) ?? [];
    },

    /** Team Member: recent days with sign-ins, newest first. */
    async historyDays(): Promise<DaySummary[]> {
      return ((await asMember("history")).days as DaySummary[]) ?? [];
    },

    /** Team Member: one day's list (date as yyyy-MM-dd). */
    async historyFor(date: string): Promise<DayEntry[]> {
      return ((await asMember("history", { date })).entries as DayEntry[]) ?? [];
    },

    /** Team Member: "did I sign in?" for their own student ID. Returns dates and times only. */
    async lookup(studentId: string): Promise<LookupResult> {
      const b = await asMember("lookup", { studentId: studentId.trim() });
      return { signedInToday: !!b.signedInToday, signIns: (b.signIns as LookupResult["signIns"]) ?? [] };
    },
  };
}

export type AttendanceClient = ReturnType<typeof createAttendanceClient>;
