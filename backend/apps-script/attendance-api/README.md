# Attendance API (Apps Script)

A small, **separate** Apps Script web app that lets `/apps/attendance` on the website read and write the
**same attendance Google Sheet** as the current "QR Code Scanner" app, in **exactly the same format**. The old project
(`../attendance/`) and its deployment are not touched and stay the fallback.

| File | What it is |
| --- | --- |
| `Code.gs` | The whole API: one `doPost`, the sign-in rules ported from `../attendance/Code.gs`, Wix token and badge checks, kiosk sessions |
| `appsscript.json` | Manifest: time zone `America/Los_Angeles` (same as the old app), scopes, web app "execute as me / anyone" |

Tests: `packages/data/test/apps-script.test.ts` runs `Code.gs` in Node with fake Apps Script services
(`pnpm -r test`).

## What it keeps exactly as today

- `Data` tab: one row `[new Date().toLocaleString(), studentId]` per sign-in, script time zone `America/Los_Angeles`.
- `MemberLookup` tab: column A ID, B first name, C last name; unknown IDs self-register as `[id, first, last, ""]` and are
  signed in, like the old `registerNewStudent`.
- Student IDs must be exactly 10 digits. One sign-in per ID per day ("already signed in today at …"). No sign-out, no
  new columns, no new tabs. Row 1 is a header and is skipped.
- New: a script lock around "check for today's row, then append", so two scans at once can't double-sign-in.

If the old app's rules change, change `Code.gs` here the same way (until the old app is retired).

## Who can do what

Every request is a `POST` with a JSON body sent as `Content-Type: text/plain` (a "simple" request, so the browser sends
no CORS preflight, which Apps Script can't answer). The server checks every request; hiding buttons in the browser is
only for looks.

| Action | Who | Sends | Returns |
| --- | --- | --- | --- |
| `status` | Team Member or Attendance Admin | `token` | name, roles, whether a kiosk is open |
| `today` | Team Member or Attendance Admin | `token` | today's sign-ins: **name + time only** |
| `history` | Team Member or Attendance Admin | `token`, optional `date` (`yyyy-MM-dd`) | last 60 meeting days with counts, or one day's names + times |
| `lookup` | Team Member or Attendance Admin | `token`, `studentId` | that ID's sign-in dates and times (no name) |
| `openKiosk` | Attendance Admin | `token` | `kioskToken`, `expiresAt` |
| `signIn` | the open kiosk | `kioskToken`, `studentId` | `{ status: signed-in / duplicate / needs-registration / invalid, name, time, message }` |
| `register` | the open kiosk | `kioskToken`, `studentId`, `firstName`, `lastName` | same as `signIn` |
| `closeKiosk` | whoever holds the kiosk token | `kioskToken` | `ok` |

`token` is the member's Wix access token; `@team6220/data` sends it. Errors come back as
`{ ok: false, error, message }` with `error` one of `signed-out`, `pending`, `forbidden`, `kiosk-closed`,
`not-configured`, `bad-request`, `busy`, `wix-unavailable`, `server-error`.

**What viewers see.** Student ID numbers never leave the script (except echoing back the ID a request sent). Members see
names and times for today and past days, which is what the old kiosk screen already showed everyone at the door.
`lookup` lets a member check their own ID; it returns dates and times only, no name, so it can't be used to find out
whose number an ID is. The Sheet itself (with IDs) stays visible only to the people it's shared with in Google Drive.

### The kiosk

1. An Attendance Admin signs in on the kiosk device and presses **Open kiosk**. `openKiosk` checks their badge and
   returns a random 256-bit kiosk token. The script stores only its SHA-256 (Script Property `kiosk:<hash>`) with the
   admin's member ID and an expiry (`KIOSK_HOURS`, default 6).
2. Students scan or type their ID on that device. Each `signIn` sends the kiosk token; no student logs in.
3. **Close kiosk** (or the admin signing out on that device, or the expiry) deletes it. After that, `signIn` answers
   `kiosk-closed`. Several kiosks can be open at once (each has its own token).

### How the Wix sign-in is checked

For `status`, `today`, `history`, `lookup` and `openKiosk`, with the token from the request:

1. **Token Info** `POST https://www.wixapis.com/oauth2/token-info` with `{ "token": … }`: it must be `active`, with
   `subjectType` `MEMBER` and `clientId` equal to our headless client ID (Script Property `WIX_CLIENT_ID`, default
   `38a0b75d-…4181`, the same public ID as `packages/data/src/config.ts`). A token from another Wix site or app, a
   visitor token, or an expired token fails here.
   Docs: [Token Info](https://dev.wix.com/docs/api-reference/app-management/oauth-2/token-info).
2. **Get My Member** `GET https://www.wixapis.com/members/v1/members/my?fieldSet=FULL` with the header
   `Authorization: <token>` (the raw token, no `Bearer`): gives the member ID and `status`, which must be `APPROVED`.
   Docs: [Get My Member](https://dev.wix.com/docs/api-reference/crm/members-contacts/members/member-management/members/get-my-member),
   [REST API Authentication](https://dev.wix.com/docs/api-reference/articles/rest-authentication/rest-api-authentication).
3. **Badges**, asked as an anonymous visitor of **our** site (a visitor token made from our client ID with
   `POST https://www.wixapis.com/oauth2/token` `{ clientId, grantType: "anonymous" }`, no secret needed):
   `POST /badges/v4/badges/query` for the titles and `POST /badges/v4/assignments/query` with
   `filter: { memberId }`. The member needs `Team Member` or `Attendance Admin` (titles as created in Wix).
   Docs: [Authenticate Visitors (REST)](https://dev.wix.com/docs/go-headless/authentication/visitors/authenticate-visitors-rest),
   [Query Badges](https://dev.wix.com/docs/api-reference/crm/members-contacts/members/activity/badges-v4/query-badges),
   [Query Badge Assignments](https://dev.wix.com/docs/api-reference/crm/members-contacts/members/activity/badge-assignments/query-badge-assignments).

The result is cached for 5 minutes per token (the cache key is the token's SHA-256), the badge list for an hour and the
visitor token until shortly before it expires. So removing someone's badge takes effect within 5 minutes.
No Wix API key or client secret is used, so the script holds no Wix secrets. Tokens and request bodies are never logged.

Checked on Nov 9, 2026 against the live site with a visitor token: `token-info` returns `active`, `subjectType`,
`clientId`, `siteId`; badges and badge assignments are readable with a visitor token; Get My Member refuses a visitor
token (403 "Missing site member id"). The member-token path itself is covered by the tests with a fake Wix and needs one
real check after deploying (step 7 below).

## Set it up (a web admin, about 15 minutes)

Use the shared **programming@team6220.org** account (or whichever team account should own it). It needs **edit**
access to the attendance Sheet. Don't change the Sheet, the old project or its deployment.

1. **Create the project.** Go to [script.google.com](https://script.google.com) → **New project**. Name it
   `6220 Attendance API`. (A standalone project, not bound to the Sheet.)
2. **Paste the files.**
   - Replace everything in `Code.gs` with `backend/apps-script/attendance-api/Code.gs` from this repo.
   - **Project Settings** (gear) → tick **Show "appsscript.json" manifest file in editor**. Back in the editor, open
     `appsscript.json` and replace it with this folder's `appsscript.json`.
   - Save (Ctrl/Cmd+S).
3. **Set Script Properties.** **Project Settings** → **Script Properties** → **Add script property**:
   - `SHEET_ID` = the attendance Sheet's ID: the long part of its URL between `/d/` and `/edit`.
   - Optional: `KIOSK_HOURS` (default `6`). Optional: `WIX_CLIENT_ID` (only if the headless client ever changes).
   - Never put passwords or keys in the code; there are none to add.
4. **Authorize and check.** In the editor, pick `checkSetup` in the function menu → **Run**. Approve the permissions
   (Google Sheets, connect to an external service). The log should say `OK: Sheet '…' (… sign-in rows, … students).
   Wix badges found: …`. It reads only; it changes nothing.
5. **Deploy.** **Deploy** → **New deployment** → type **Web app**:
   - Description: `attendance api v1`
   - **Execute as: Me** (the owner account)
   - **Who has access: Anyone**
   - **Deploy**, then copy the **Web app URL** (ends in `/exec`).
   "Anyone" is needed because the website calls it without Google sign-in; the script itself checks the Wix sign-in and
   badges on every request, as described above.
6. **Put the URL in the site.** In `packages/data/src/config.ts`, paste it into `ATTENDANCE_API_URL_DEFAULT`
   (it isn't a secret), open a pull request, merge. (Alternatively set `PUBLIC_ATTENDANCE_API_URL` at build time.)
7. **Test before a meeting**, with the old app open as the fallback: on `dev.team6220.org/apps/attendance`, a Team
   Member sees today's list; an Attendance Admin opens the kiosk on the real kiosk device and signs in a test ID; the
   new row looks exactly like the old ones in the `Data` tab; **Close kiosk**, and a scan is refused.

**Updating the code later:** paste the new `Code.gs`, then **Deploy → Manage deployments → (pencil) → Version: New
version → Deploy**. That keeps the same URL. A **New deployment** would create a new URL.

**Turning it off:** Deploy → Manage deployments → Archive. The website then shows an error and the team uses the old
app.

## Limits

- Apps Script quotas (consumer account): 20,000 URL fetches a day, 30 simultaneous runs. A sign-in from the kiosk
  makes no Wix calls; a viewer makes at most 4 every 5 minutes.
- The kiosk token sits in the kiosk browser's `sessionStorage` until closed. Anyone at the open kiosk can sign in any
  ID, the same as with the old kiosk.
- Phase 2: `/api/attendance` on Wix hosting will check the badge server-side and call this script with a server-only
  secret; then "Who has access" can be tightened.
