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

// Where Wix sends the browser after login. Wix only accepts redirect URIs that EXACTLY match an
// "Allowed authorization redirect URI" on the headless client (checked Nov 2026: a path like
// /apps/login/callback is rejected with "Invalid redirect URI" while only the bare origins are listed).
//
// So for now Wix redirects to the site root ("") and a tiny script in src/layouts/BaseLayout.astro
// forwards "/#code=...&state=..." to LOGIN_CALLBACK_PATH. Once a Web Admin adds
//   https://dev.team6220.org/apps/login/callback  and  http://localhost:4321/apps/login/callback
// to the client's allowed redirect URIs, set this to LOGIN_CALLBACK_PATH and delete that script.
export const LOGIN_REDIRECT_PATH: string = "";

// Badge titles as created in Wix (Site Members > Badges). Compare with these, not with typed strings.
export const BADGES = {
  teamMember: "Team Member",
  attendanceAdmin: "Attendance Admin",
  inventoryManager: "Inventory Manager",
  webAdmin: "Web Admin",
} as const;
export type BadgeName = (typeof BADGES)[keyof typeof BADGES];
