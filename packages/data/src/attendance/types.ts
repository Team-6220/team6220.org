// Shapes shared by the attendance client, its transports (Apps Script / mock) and the UI.
// The wire protocol is the one in backend/apps-script/attendance-api/Code.gs: POST a JSON body
// { action, token?, kioskToken?, ... } as text/plain, get back { ok: true, ... } or { ok: false, error, message }.

/** Who is looking at the attendance page (from the browser's sign-in state; cosmetic only). */
export type Viewer =
  | { kind: "signed-out" }
  | { kind: "pending"; name: string }
  | { kind: "member"; name: string; isAdmin: boolean };

/** One sign-in in a day's list. Never includes a student ID number. */
export interface DayEntry {
  name: string;
  /** Time as the Apps Script formats it (script time zone), e.g. "3:45:12 PM". */
  time: string;
  /** ISO timestamp. */
  at: string;
}

export interface DaySummary {
  /** yyyy-MM-dd in the team's time zone. */
  date: string;
  count: number;
}

export interface LookupResult {
  signedInToday: boolean;
  /** Newest first (at most 200). */
  signIns: { date: string; time: string; at: string }[];
}

export type SignInStatus = "signed-in" | "duplicate" | "needs-registration" | "invalid";

export interface SignInResult {
  status: SignInStatus;
  name?: string;
  time?: string;
  message: string;
}

export interface KioskSession {
  kioskToken: string;
  /** ISO timestamp when the server closes the kiosk by itself. */
  expiresAt: string;
}

export interface AttendanceStatus {
  name: string;
  isMember: boolean;
  isAdmin: boolean;
  kioskOpen: boolean;
}

export type AttendanceErrorCode =
  | "signed-out"
  | "pending"
  | "forbidden"
  | "kiosk-closed"
  | "not-configured"
  | "bad-request"
  | "busy"
  | "wix-unavailable"
  | "server-error"
  | "network";

export class AttendanceError extends Error {
  readonly code: AttendanceErrorCode;
  constructor(code: AttendanceErrorCode, message: string) {
    super(message);
    this.name = "AttendanceError";
    this.code = code;
  }
}

export type ApiRequest = { action: string } & Record<string, unknown>;
export type ApiResponse = { ok: true } & Record<string, unknown>;

/** Sends one request and returns the parsed body ({ ok: true|false, ... }). */
export type Transport = (request: ApiRequest) => Promise<Record<string, unknown>>;
