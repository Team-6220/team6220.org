// attendance: the functions /apps/attendance uses. See packages/data/README.md ("Attendance").
//
//   import { attendance } from "@team6220/data";
//   const viewer = await attendance.getViewer();       // signed-out | pending | member (+ isAdmin)
//   await attendance.openKiosk();                       // Attendance Admin, on the kiosk
//   await attendance.signIn("0123456789");              // on the open kiosk, no login needed per student
//   await attendance.today();                           // Team Member: names + times
//
// Real checks happen in the Apps Script (it verifies the Wix token and badges on every request).
// getViewer() is only for choosing what to show.
//
// Demo mode (?demo=admin|member|pending|signed-out on the page) swaps in the mock with made-up data and a
// fake sign-in, for trying the screens without the server. It never talks to Wix or the real Sheet.
import { BADGES, ATTENDANCE_API_URL } from "../config";
import * as auth from "../auth";
import { memberAccessToken } from "../wix";
import { createAttendanceClient } from "./client";
import { httpTransport } from "./http";
import { mockTransport, type MockRole } from "./mock";
import type { Transport, Viewer } from "./types";

export type DemoRole = MockRole | "signed-out";
const DEMO_KEY = "team6220.attendance.demo";
const DEMO_ROLES: DemoRole[] = ["admin", "member", "pending", "signed-out"];

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The demo role for this tab, or null when using the real server. */
export function demoRole(): DemoRole | null {
  const v = session()?.getItem(DEMO_KEY) as DemoRole | null | undefined;
  return v && DEMO_ROLES.includes(v) ? v : null;
}

/** Turn demo mode on (with a role) or off (null) for this tab. */
export function setDemoRole(role: DemoRole | null): void {
  const s = session();
  if (!s) return;
  try {
    if (role && DEMO_ROLES.includes(role)) s.setItem(DEMO_KEY, role);
    else s.removeItem(DEMO_KEY);
    s.removeItem("team6220.attendance.kiosk");
  } catch {
    // storage blocked: demo mode can't be used
  }
}

/** True when attendance can reach a server (real URL configured, or demo mode). */
export function isConfigured(): boolean {
  return !!demoRole() || /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(ATTENDANCE_API_URL);
}

let mock: Transport | undefined;
let http: Transport | undefined;

const client = createAttendanceClient({
  transport: () => {
    if (demoRole()) return (mock ??= mockTransport({ storage: session() }));
    if (!isConfigured()) return null;
    return (http ??= httpTransport(ATTENDANCE_API_URL));
  },
  getToken: async () => {
    const role = demoRole();
    if (role) return role === "signed-out" ? null : `mock:${role}`;
    return memberAccessToken();
  },
  kioskStorage: session(),
});

/** Who is looking (from the browser's sign-in; cosmetic). */
export async function getViewer(): Promise<Viewer> {
  const role = demoRole();
  if (role) {
    if (role === "signed-out") return { kind: "signed-out" };
    if (role === "pending") return { kind: "pending", name: "Demo Visitor" };
    return { kind: "member", name: role === "admin" ? "Demo Admin" : "Demo Member", isAdmin: role === "admin" };
  }
  const member = await auth.getMember();
  if (!member) return { kind: "signed-out" };
  const badges = member.status === "APPROVED" ? await auth.getBadges() : [];
  const isAdmin = badges.includes(BADGES.attendanceAdmin);
  if (!isAdmin && !badges.includes(BADGES.teamMember)) return { kind: "pending", name: member.name };
  return { kind: "member", name: member.name, isAdmin };
}

/** True while this browser holds a member sign-in (or a demo sign-in). Doesn't call anything. */
export function isSignedIn(): boolean {
  const role = demoRole();
  if (role) return role !== "signed-out";
  return auth.isLoggedIn();
}

export const {
  status,
  openKiosk,
  closeKiosk,
  currentKiosk,
  signIn,
  register,
  today,
  historyDays,
  historyFor,
  lookup,
} = client;

export { createAttendanceClient } from "./client";
export { httpTransport } from "./http";
export { mockTransport, MOCK_STUDENTS, type MockRole } from "./mock";
export * from "./types";
