// Functions like auth.login() and attendance.today() live here.
// Phase 1: they call Wix and Apps Script from the browser. Phase 2: they call /api/* or the @wix/astro integration.
// App UIs never change between phases.
export { WIX_CLIENT_ID, APPS_HOME_PATH, LOGIN_CALLBACK_PATH, BADGES, SUBTEAM_BADGE_PREFIX, type BadgeName } from "./config";
export * as auth from "./auth";
export type { Member, MemberStatus } from "./auth";
export * as attendance from "./attendance";
export {
  AttendanceError,
  type AttendanceErrorCode,
  type AttendanceStatus,
  type DayEntry,
  type DaySummary,
  type KioskSession,
  type LookupResult,
  type SignInResult,
  type SignInStatus,
  type Viewer,
} from "./attendance/types";
// Site Manager (apps/site). Browser side only; the server side is "@team6220/data/site-server".
export * as site from "./site";
// Inventory app data (apps/inventory). Also importable as "@team6220/data/inventory".
export { inventory } from "./inventory/index.ts";
// Shared by the operations apps (Icarus, Production, BOM): who is looking, projects, people, history, subteams.
export * as ops from "./ops";
export { OpsError, type OpsErrorCode, type OpsViewer, type Me, type Roles, type Person, type Project, type HistoryEntry, type RecordLink, type RecordKind } from "./ops/types";
