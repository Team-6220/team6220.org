# @team6220/data

The **only** code in this repo that talks to Wix and Apps Script (and later FRC data sites). Apps import
functions from here and never import `@wix/*` themselves, so the backend can change without touching app UIs.

```ts
import { auth, BADGES } from "@team6220/data";

await auth.login("/apps/inventory"); // go to the Wix login page, come back to this path
const member = await auth.getMember(); // { id, name, email, photoUrl, status } or null
await auth.hasBadge(BADGES.attendanceAdmin); // cosmetic only (hide buttons), never security
await auth.getAccess(); // "approved" | "pending" | "signed-out"
await auth.logout(); // or link to /apps/logout
```

Wix calls only run in the browser in Phase 1. Mount components that use them with `client:only="react"`.

## Attendance

```ts
import { attendance } from "@team6220/data";

await attendance.getViewer(); // { kind: "signed-out" | "pending" | "member", name, isAdmin } (cosmetic)
await attendance.openKiosk(); // Attendance Admin: opens the kiosk in this tab (token kept in sessionStorage)
await attendance.signIn("0123456789"); // on the open kiosk: { status: "signed-in" | "duplicate" | "needs-registration" | "invalid", name, time, message }
await attendance.register(id, first, last); // unknown ID: add to the roster and sign in
await attendance.closeKiosk();
await attendance.today(); // Team Member: [{ name, time, at }], never student IDs
await attendance.historyDays(); // [{ date, count }]; attendance.historyFor("2026-11-09")
await attendance.lookup("0123456789"); // "did I sign in?" for your own ID: dates and times only
```

- Talks to the Apps Script in [`backend/apps-script/attendance-api`](../../backend/apps-script/attendance-api/README.md)
  with `POST`, `Content-Type: text/plain`, JSON body (no CORS preflight). Viewer and admin calls send the member's Wix
  access token (refreshed first if needed); the script verifies it with Wix and checks the badges. Errors are
  `AttendanceError` with a `code` (`signed-out`, `forbidden`, `kiosk-closed`, `not-configured`, …).
- The URL is `ATTENDANCE_API_URL` in [`src/config.ts`](src/config.ts) (or the `PUBLIC_ATTENDANCE_API_URL` build
  variable). It isn't a secret. Empty means "not connected yet".
- `src/attendance/mock.ts` is an in-memory stand-in with the same rules, used by tests and by demo mode
  (`attendance.setDemoRole("admin")`, or `?demo=admin` on the page).
- Tests: `pnpm --filter @team6220/data test` (vitest). `test/apps-script.test.ts` also runs the Apps Script `Code.gs`
  against fake Apps Script services.

## Operations apps (`ops`)

What Icarus, Production and BOM share. The plan is [docs/operations/ARCHITECTURE.md](../../docs/operations/ARCHITECTURE.md).

```ts
import { ops } from "@team6220/data";

const viewer = await ops.getViewer();           // signed-out | pending | member (me.roles, me.subteams)
const projects = await ops.listProjects();      // p1, p2, ... shared by all three apps
await ops.saveProject({ name: "Summer Bot" });  // Leads only; refused by the server for anyone else
await ops.setMySubteams(["Design"]);            // changes the member's "Subteam: " badges
const log = await ops.listHistory({ kind: "project", id });
```

Inside this package there are two ways data moves, and each app's data module uses both:

| | Used for | Real backend | Demo backend |
| --- | --- | --- | --- |
| `ops.store()` | Reads, and edits any member may make | Wix CMS as the signed-in member (`ops/wix-store.ts`) | Memory (`ops/mock.ts`) |
| `ops.callOps(action, args)` | Anything needing a badge, a number or a signature | The ops API Apps Script (`backend/apps-script/ops-api`) | The same rules in memory |

**Demo mode.** `pnpm dev` and tests always use made-up data, signed in as a lead. On a deployed page add
`?demo=member`, `lead`, `mentor`, `booster`, `supervisor`, `pending` or `signed-out` to try each role; `?demo=off`
leaves it. Call `ops.readDemoFromUrl()` once when the app starts. Demo data resets when the page reloads.

**Roles.** `ops/roles.ts` turns badges into `viewer / team / lead / approver / peopleAdmin`. It only decides what to
show; the same rules in `ops-api/Auth.gs` are the real check.

**A new data module** (for example `bom/`) adds its made-up data with `seedMock(...)` and its protected actions with
`mockActions(...)`, both from `ops/mock.ts`, so the demo and the real server follow the same rules.

## Site Manager

```ts
import { site } from "@team6220/data"; // browser side
const viewer = await site.getViewer(); // signed-out | pending | member | admin (cosmetic)
const { value } = await site.load("summer-camp"); // current content
const { pullRequest, changes } = await site.submit("summer-camp", edited); // pullRequest.mock is true in demo mode
```

- **Server side** (never import in a component): `@team6220/data/site-server` has `handleSiteRequest` (the
  `/api/site` logic: Wix token + `Web Admin` badge on every request), `GithubSiteStore`, `githubStoreFromEnv`,
  `MockSiteStore`, `createWixVerifier` and `proposeChange`. This is the only code that talks to GitHub.
- **Mock vs real:** the browser uses `MockSiteStore` (in memory, no network) unless the build sets
  `PUBLIC_SITE_MANAGER_API=on`, in which case it POSTs to `/api/site`. Tests use fake `fetch` functions.
- The server reads `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY` (or one ready
  `SITE_MANAGER_GITHUB_TOKEN`) and optionally `SITE_MANAGER_GITHUB_REPO`. Values are secrets: see
  [docs/SITE-MANAGER.md](../../docs/SITE-MANAGER.md).

## How login works (Phase 1, GitHub Pages)

There is no server, so the browser runs Wix's "Wix login page" OAuth flow with PKCE, using the headless client ID
in [`src/config.ts`](src/config.ts) (not a secret):

1. `auth.login()` calls `generateOAuthData()` + `getAuthUrl()` and sends the browser to the Wix-hosted login page
   on www.team6220.org, where members pick **Log in with Google**.
2. Wix sends the browser back to the redirect URI with `#code=…&state=…`. The callback page
   (`/apps/login/callback`) calls `auth.handleLoginCallback()`, which exchanges the code for member tokens with
   `getMemberTokens()` and returns to where the member started.
3. Tokens are kept in `localStorage` (`team6220.wix.tokens`). The SDK refreshes expired access tokens itself; if
   that fails the member is simply signed out.
4. `auth.getMember()` uses `members.getCurrentMember()`. Badges come from `badgeAssignments.queryBadgeAssignments()`
   filtered by the member ID plus `badgesV2.queryBadges()` for the titles.

**Redirect URI.** Wix only accepts redirect URIs that exactly match an *Allowed authorization redirect URI* on the
headless client (**Wix → Settings → Headless Settings → (client) → Settings**). Allowed today:
`https://dev.team6220.org/apps/login/callback` and `http://localhost:4321/apps/login/callback`, plus the bare origins.
A new origin (for example a Wix preview URL) must be added there before login works on it.

**Limits in Phase 1**

- Badge and approval checks in the browser are **cosmetic**. Anyone can read the page's JavaScript. Real locks are
  Wix CMS collection permissions (set app collections to site members, never "Anyone") and the attendance Apps Script,
  which verifies the member's token and badges with Wix itself.
- Badge assignments are readable by any visitor token, so badges are not secret either.
- Refresh tokens live in `localStorage`. Wix recommends keeping them server-side; Phase 2 does.
- The flow must not be mixed with `@wix/astro` (Wix says the integration won't recognize members who signed in
  through a flow you run yourself).

## What Phase 2 changes (`@wix/astro` on Wix hosting)

Only the bodies of the functions in `src/auth.ts` change; their names and return values stay.

- `login(returnTo)` → navigate to `/api/auth/login?returnToUrl=<returnTo>` (built into the integration).
- `logout(returnTo)` → `POST /api/auth/logout?returnToUrl=<returnTo>`.
- `getMember()` / `getBadges()` → the SDK with the integration's cookie session, or our own `/api/me` endpoint.
- `/apps/login/callback`, `src/wix.ts` and the `localStorage` tokens are deleted.
- Badge checks that matter move into `/api/<name>` endpoints, which refuse requests from members without the badge.

Docs: [Add a Wix Login Page (JS SDK)](https://dev.wix.com/docs/go-headless/authentication/members/wix-login-page/add-a-wix-login-page-js-sdk),
[OAuthStrategy](https://dev.wix.com/docs/sdk/core-modules/sdk/oauth-strategy),
[Allow Redirect URIs and Domains](https://dev.wix.com/docs/go-headless/authentication/setup/allow-redirect-uris-and-domains),
[Add Member Login with the Astro Integration](https://dev.wix.com/docs/go-headless/authentication/members/wix-login-page/add-member-login-with-the-astro-integration),
[Get My Member](https://dev.wix.com/docs/api-reference/crm/members-contacts/members/member-management/members/get-my-member?apiView=SDK),
[Query Badge Assignments](https://dev.wix.com/docs/api-reference/crm/members-contacts/members/activity/badge-assignments/query-badge-assignments?apiView=SDK).
