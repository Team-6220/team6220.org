// In-browser stand-in for the attendance Apps Script, for demos, local development and tests.
// It follows the same protocol and rules as backend/apps-script/attendance-api/Code.gs (10-digit IDs,
// one sign-in per day, self-registration, kiosk tokens, no student IDs in lists) on made-up data.
// Tokens are "mock:admin", "mock:member" or "mock:pending" instead of real Wix tokens.
import type { ApiRequest, Transport } from "./types";

export type MockRole = "admin" | "member" | "pending";

interface MockState {
  students: Record<string, [first: string, last: string]>;
  rows: { at: number; id: string }[];
  kiosks: Record<string, number>; // kioskToken -> expiresAt (ms)
}

/** Minimal storage interface (sessionStorage in the browser). */
export interface MockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STATE_KEY = "team6220.attendance.mockState";
const KIOSK_MS = 6 * 3600 * 1000;

/** Made-up students. IDs start with 000 so they can't be mistaken for real school IDs. */
export const MOCK_STUDENTS: Record<string, [string, string]> = {
  "0001000001": ["Ada", "Lovelace"],
  "0001000002": ["Grace", "Hopper"],
  "0001000003": ["Alan", "Turing"],
  "0001000004": ["Katherine", "Johnson"],
  "0001000005": ["Nikola", "Tesla"],
  "0001000006": ["Hedy", "Lamarr"],
};

function seed(now: number): MockState {
  const day = 24 * 3600 * 1000;
  const today = new Date(now);
  today.setHours(15, 30, 0, 0);
  const t = Math.min(today.getTime(), now - 60_000);
  const rows: MockState["rows"] = [];
  // Three earlier meetings, then two sign-ins today.
  for (const back of [7, 4, 2]) {
    ["0001000001", "0001000002", "0001000003", "0001000005"].forEach((id, i) =>
      rows.push({ at: t - back * day + i * 90_000, id }),
    );
  }
  rows.push({ at: t - 120_000, id: "0001000002" }, { at: t - 60_000, id: "0001000004" });
  return { students: { ...MOCK_STUDENTS }, rows, kiosks: {} };
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const time = (ms: number) => new Date(ms).toLocaleTimeString();

export interface MockOptions {
  storage?: MockStorage | null;
  now?: () => number;
}

export function mockTransport({ storage = null, now = Date.now }: MockOptions = {}): Transport {
  let memory: MockState | null = null;
  const load = (): MockState => {
    if (memory) return memory;
    try {
      const raw = storage?.getItem(STATE_KEY);
      if (raw) return (memory = JSON.parse(raw) as MockState);
    } catch {
      // fall through to a fresh seed
    }
    return (memory = seed(now()));
  };
  const save = () => {
    try {
      storage?.setItem(STATE_KEY, JSON.stringify(memory));
    } catch {
      // storage full or blocked: keep it in memory
    }
  };
  const fail = (error: string, message: string) => ({ ok: false, error, message });

  const role = (token: unknown): MockRole | null =>
    typeof token === "string" && /^mock:(admin|member|pending)$/.test(token) ? (token.slice(5) as MockRole) : null;

  const nameOf = (s: MockState, id: string) => {
    const st = s.students[id];
    return st ? `${st[0]} ${st[1]}`.trim() : "Unknown";
  };
  const entry = (s: MockState, r: { at: number; id: string }) => ({
    name: nameOf(s, r.id),
    time: time(r.at),
    at: new Date(r.at).toISOString(),
  });

  return async (req: ApiRequest) => {
    const s = load();
    const r = role(req.token);
    const viewerError = () =>
      !r ? fail("signed-out", "Sign in to use attendance.") : r === "pending" ? fail("pending", "A web admin hasn't approved your account yet.") : null;
    const kioskOk = () => {
      const k = req.kioskToken;
      return typeof k === "string" && (s.kiosks[k] ?? 0) > now();
    };
    const closed = fail("kiosk-closed", "The kiosk is closed. An Attendance Admin has to open it.");

    switch (req.action) {
      case "status": {
        const err = viewerError();
        if (err) return err;
        const open = Object.values(s.kiosks).some((e) => e > now());
        return { ok: true, name: r === "admin" ? "Demo Admin" : "Demo Member", isMember: true, isAdmin: r === "admin", kioskOpen: open };
      }
      case "openKiosk": {
        if (r !== "admin") return viewerError() ?? fail("forbidden", "Only Attendance Admins can open the kiosk.");
        const kioskToken = `mockkiosk${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.padEnd(40, "0");
        const expiresAt = now() + KIOSK_MS;
        s.kiosks[kioskToken] = expiresAt;
        save();
        return { ok: true, kioskToken, expiresAt: new Date(expiresAt).toISOString() };
      }
      case "closeKiosk":
        if (typeof req.kioskToken === "string") delete s.kiosks[req.kioskToken];
        save();
        return { ok: true };
      case "signIn": {
        if (!kioskOk()) return closed;
        const id = String(req.studentId ?? "");
        if (!/^\d{10}$/.test(id)) return { ok: true, result: { status: "invalid", message: "Invalid Student ID: Must be exactly 10 digits" } };
        if (!s.students[id]) return { ok: true, result: { status: "needs-registration", message: "Student ID not found in system" } };
        const name = nameOf(s, id);
        const prev = s.rows.find((row) => row.id === id && dayKey(row.at) === dayKey(now()));
        if (prev) {
          return {
            ok: true,
            result: { status: "duplicate", name, time: time(prev.at), message: `${name}, you already signed in today at ${time(prev.at)}` },
          };
        }
        const at = now();
        s.rows.push({ at, id });
        save();
        return { ok: true, result: { status: "signed-in", name, time: time(at), message: `Welcome, ${name}!` } };
      }
      case "register": {
        if (!kioskOk()) return closed;
        const id = String(req.studentId ?? "");
        const first = typeof req.firstName === "string" ? req.firstName.trim() : "";
        const last = typeof req.lastName === "string" ? req.lastName.trim() : "";
        const invalid = (message: string) => ({ ok: true, result: { status: "invalid", message } });
        if (!first || !last) return invalid("First name and last name are required");
        if (first.length > 50 || last.length > 50) return invalid("Names must be 50 characters or fewer");
        if (!/^\d{10}$/.test(id)) return invalid("Invalid Student ID: Must be exactly 10 digits");
        if (s.students[id]) return invalid("Student ID already exists in system");
        s.students[id] = [first, last];
        const at = now();
        s.rows.push({ at, id });
        save();
        const name = `${first} ${last}`;
        return { ok: true, result: { status: "signed-in", name, time: time(at), message: `Welcome, ${name}! You've been added to the system.` } };
      }
      case "today": {
        const err = viewerError();
        if (err) return err;
        const key = dayKey(now());
        return { ok: true, entries: s.rows.filter((row) => dayKey(row.at) === key).map((row) => entry(s, row)) };
      }
      case "history": {
        const err = viewerError();
        if (err) return err;
        if (typeof req.date === "string" && req.date) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(req.date)) return fail("bad-request", "Dates look like 2026-11-09.");
          return { ok: true, date: req.date, entries: s.rows.filter((row) => dayKey(row.at) === req.date).map((row) => entry(s, row)) };
        }
        const counts = new Map<string, number>();
        for (const row of s.rows) counts.set(dayKey(row.at), (counts.get(dayKey(row.at)) ?? 0) + 1);
        const days = [...counts.keys()].sort().reverse().slice(0, 60).map((date) => ({ date, count: counts.get(date)! }));
        return { ok: true, days };
      }
      case "lookup": {
        const err = viewerError();
        if (err) return err;
        const id = String(req.studentId ?? "");
        if (!/^\d{10}$/.test(id)) return fail("bad-request", "Student IDs are exactly 10 digits.");
        const mine = s.rows.filter((row) => row.id === id).reverse();
        return {
          ok: true,
          signedInToday: mine.some((row) => dayKey(row.at) === dayKey(now())),
          signIns: mine.slice(0, 200).map((row) => ({ date: dayKey(row.at), time: time(row.at), at: new Date(row.at).toISOString() })),
        };
      }
      default:
        return fail("bad-request", "Unknown action.");
    }
  };
}
