// Wix headless (OAuth) client for the "Los Al Robotics | FRC Team 6220" site.
// The client ID identifies the site and is safe to commit. It is NOT a secret.
// Never put Wix API keys, Nexus / The Blue Alliance keys or Apps Script secrets here.
//
// Allowed domains and redirect URIs (set in Wix: Settings > Headless settings):
//   https://dev.team6220.org
//   http://localhost:4321
export const WIX_CLIENT_ID = "38a0b75d-6959-4630-ac13-73004c094181";

// The apps dashboard. The main site's "Log In" link points here.
export const APPS_HOME_PATH = "/apps";

// The page that finishes a login (exchanges the code from Wix for member tokens).
export const LOGIN_CALLBACK_PATH = "/apps/login/callback";

// Where Wix sends the browser after login. Must EXACTLY match an "Allowed authorization redirect URI" on the
// headless client (Wix > Headless Settings). Allowed today: https://dev.team6220.org/apps/login/callback and
// http://localhost:4321/apps/login/callback. Add any new origin there before using it.
export const LOGIN_REDIRECT_PATH: string = LOGIN_CALLBACK_PATH;

// Badge titles as created in Wix (Site Members > Badges). There is no inventory badge: every Team Member can edit the inventory (team decision, Nov 2026). Compare with these, not with typed strings.
export const BADGES = {
  teamMember: "Team Member",
  attendanceAdmin: "Attendance Admin",
  webAdmin: "Web Admin",
} as const;
export type BadgeName = (typeof BADGES)[keyof typeof BADGES];

// The "attendance API" Apps Script web app (backend/apps-script/attendance-api). Its /exec URL is NOT a secret:
// every request is checked there with the member's Wix token. Paste the URL from Deploy > Manage deployments
// between the quotes below, or set PUBLIC_ATTENDANCE_API_URL when building. Empty = attendance not connected yet.
const ATTENDANCE_API_URL_DEFAULT = "https://script.google.com/macros/s/AKfycbxvHanf8i2Qx425LnwR1rVa8f01h-1ChHSoe424lQEvRgveyZNybhIgzG191WxWCrK6Fw/exec";
export const ATTENDANCE_API_URL: string =
  (import.meta.env?.PUBLIC_ATTENDANCE_API_URL as string | undefined) || ATTENDANCE_API_URL_DEFAULT;
