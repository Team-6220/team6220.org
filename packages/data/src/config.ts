// The login client of our Wix-managed headless project (Phase 2; the WIX_CLIENT_ID that `wix env pull` writes).
// Wix's built-in login issues member tokens to this client, and the session cookie names it. It is public and safe to
// commit, NOT a secret. Never put Wix API keys, Nexus / The Blue Alliance keys or Apps Script secrets here.
// (The Phase 1 headless client, 38a0b75d-..., still serves dev.team6220.org until go-live.)
export const WIX_CLIENT_ID = "74e98aee-3daa-4452-bf00-f13523cae9c5";

// The apps dashboard. The main site's "Log In" link points here.
export const APPS_HOME_PATH = "/apps";

// The Phase 1 page that finished a login. Sign-in now goes through Wix's /api/auth/login (see auth.ts); this page
// only forwards old bookmarks to the dashboard.
export const LOGIN_CALLBACK_PATH = "/apps/login/callback";

// Badge titles as created in Wix (Site Members > Badges). There is no inventory badge: every Team Member can edit the inventory (team decision, Nov 2026). Compare with these, not with typed strings.
export const BADGES = {
  teamMember: "Team Member",
  attendanceAdmin: "Attendance Admin",
  webAdmin: "Web Admin",
  // Operations apps (Icarus, Production, BOM). What each allows: packages/data/src/ops/roles.ts.
  mentor: "Mentor",
  booster: "Booster",
  supervisor: "Supervisor",
  lead: "Lead",
} as const;
export type BadgeName = (typeof BADGES)[keyof typeof BADGES];

// The "attendance API" Apps Script web app (backend/apps-script/attendance-api). Its /exec URL is NOT a secret:
// every request is checked there with the member's Wix token. Paste the URL from Deploy > Manage deployments
// between the quotes below, or set PUBLIC_ATTENDANCE_API_URL when building. Empty = attendance not connected yet.
const ATTENDANCE_API_URL_DEFAULT = "https://script.google.com/macros/s/AKfycbxvHanf8i2Qx425LnwR1rVa8f01h-1ChHSoe424lQEvRgveyZNybhIgzG191WxWCrK6Fw/exec";
export const ATTENDANCE_API_URL: string =
  (import.meta.env?.PUBLIC_ATTENDANCE_API_URL as string | undefined) || ATTENDANCE_API_URL_DEFAULT;

// Each subteam is a Wix badge called "Subteam: <name>" (for example "Subteam: Design"). The badges are the list:
// adding a subteam means creating its badge in Wix.
export const SUBTEAM_BADGE_PREFIX = "Subteam: ";

// The "ops API" Apps Script web app (backend/apps-script/ops-api), shared by Icarus, Production and BOM.
// Like the attendance URL it is NOT a secret. Paste the /exec URL between the quotes, or set PUBLIC_OPS_API_URL
// when building. Empty = not connected yet (the apps then only work in demo mode).
const OPS_API_URL_DEFAULT = "";
export const OPS_API_URL: string = (import.meta.env?.PUBLIC_OPS_API_URL as string | undefined) || OPS_API_URL_DEFAULT;
