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

// Badge titles as created in Wix (Site Members > Badges). Compare with these, not with typed strings.
export const BADGES = {
  teamMember: "Team Member",
  attendanceAdmin: "Attendance Admin",
  inventoryManager: "Inventory Manager",
  webAdmin: "Web Admin",
} as const;
export type BadgeName = (typeof BADGES)[keyof typeof BADGES];
