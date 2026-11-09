# Attendance: plan for moving the screen to `/apps/attendance`

Analysis only. Nothing here changes the Apps Script source in
[`backend/apps-script/attendance/`](../../../backend/apps-script/attendance/) or the live "QR Code Scanner" deployment.
The migration plan says the Attendance **screen** moves to the site while saving keeps going through Apps Script into
the same Sheet ("the backend stays the same").

## What the app does today

A Google Apps Script web app ("6220 Attendance"), bound to a Google Sheet with two tabs:

| Tab | Columns (by position, row 1 = header) | Written by |
| --- | --- | --- |
| `Data` | A: timestamp as text (`new Date().toLocaleString()` in the script's time zone, America/Los_Angeles), B: student ID | `processForm`, `registerNewStudent` (`appendRow`) |
| `MemberLookup` | A: student ID (10 digits), B: first name, C: last name, D: main subteam (left blank) | `registerNewStudent` (`appendRow`) |

The screen (`Index.html` + `Form.html` + `JavaScript.html` + `QrReaderJS.html`, Bootstrap 5 from a CDN):

1. A camera scanner ([html5-qrcode 2.3.8](https://github.com/mebjas/html5-qrcode) from unpkg) reads the ID barcode/QR
   code into a text box; a student can also type the ID. Pressing **Submit** sends it (scanning doesn't auto-submit).
2. The browser checks it's exactly 10 digits, then calls `processForm({ productCode })`. The server:
   - rejects anything that isn't 10 digits;
   - looks the ID up in `MemberLookup`; if it's missing → `{ needsRegistration: true }` and the screen asks for first
     and last name, then calls `registerNewStudent(id, first, last)`, which adds the person to `MemberLookup` and signs them in;
   - if the ID already has a `Data` row dated today → `{ isDuplicate: true }` ("you already signed in today at ...");
   - otherwise appends `[timestamp, id]` to `Data` → "Welcome, <name>!".
3. A "Today's Sign-Ins" list (`getTodayAttendance()`: name, time and student ID of every row dated today) refreshes after
   each sign-in. Sounds and a popup give feedback.

There is no sign-**out**, no sessions to start or stop, no admin role and no passcode in the current code, even though
the migration plan describes "start or stop sessions: Attendance Admin only". That's a new feature, not a port (see
open questions).

## How the screen talks to the backend

Only through **`google.script.run`** (`processForm`, `registerNewStudent`, `getTodayAttendance`). `google.script.run`
exists only inside pages that Apps Script itself serves (HtmlService), so it can't be used from team6220.org.

There is no HTTP API: `doGet()` returns the HTML page; there is **no `doPost`** and nothing returns JSON.
(`doGet` does set `XFrameOptionsMode.ALLOWALL`, so the page may be put in an iframe.)

## Why team6220.org can't call the current deployment

The manifest ([`appsscript.json`](../../../backend/apps-script/attendance/appsscript.json)) and the team say the deployment
is **Execute as: me (`USER_DEPLOYING`), Who has access: Only myself (`MYSELF`)**.

1. **Only the owner account can open it.** Anyone else gets Google's sign-in / "you need access" page instead of the
   app, so neither a link, an iframe nor a request from other people's browsers works.
2. **Even for the owner, a request from another site fails.** A `fetch` from `dev.team6220.org` would need the owner's
   Google cookies on a cross-site request. Browsers either don't send them (third-party cookie blocking) or the
   response isn't readable (no CORS permission for credentialed requests). In an iframe, the same third-party cookie
   rules make the signed-in state unreliable.
3. **There's nothing to call.** Without a `doPost`/JSON `doGet`, a page outside Apps Script has no endpoint at all,
   whatever the access setting.
4. Apps Script web apps can't answer CORS preflight (`OPTIONS`) requests, so any future endpoint must be called with a
   "simple" request: `POST` with `Content-Type: text/plain` and a JSON body (as the migration plan already says).

Also worth knowing before changing access: **every top-level function in the project is callable** by anyone who can
open a deployment (that's how `google.script.run` works). With access opened to "Anyone", anyone with the URL could call
`getTodayAttendance()` (names **and student ID numbers** of everyone signed in today), `processForm` (sign in any ID)
and `registerNewStudent` (add rows to `MemberLookup`). A passcode added in a new function doesn't stop that, because
those three functions stay callable directly.

## Options

### A. Second deployment of the unchanged code, embedded in `/apps/attendance` (iframe)

Create a **new** web-app deployment of the same project (Deploy → New deployment) with different access, and put its
`/exec` URL in an `<iframe allow="camera">` on `/apps/attendance`.

- Access "Anyone with a Google account": people must be signed into Google *inside the iframe*. Safari, Firefox and
  Chrome's third-party-cookie limits make this unreliable; on the attendance kiosk it may simply not work.
- Access "Anyone": works without Google sign-in, but exposes the three functions above (student IDs) to anyone who has
  the URL, and the URL sits in the page source.

| Pros | Cons |
| --- | --- |
| Zero code changes; fastest | Not our screen: old Bootstrap UI and styling, Imgur logo; can't follow the site's login or badges |
| Same Sheet, same writes | Camera inside nested iframes (our iframe → Google's sandbox iframe) must be tested on the kiosk device |
| | "Anyone" leaks today's names + student IDs; "Google account" login inside an iframe is unreliable |

Needs from the team: create the deployment (owner account), choose access, test the camera on the actual kiosk.

### B. Second deployment, opened as a link (not embedded)

Same as A, but `/apps/attendance` just links to the Apps Script URL (or keeps today's "only myself" link for the kiosk).

| Pros | Cons |
| --- | --- |
| Nothing changes; camera works as today | The screen doesn't move to the site at all; doesn't meet the plan |

### C. Add a JSON endpoint (`doPost`) to the same project, new "Anyone" deployment, our own screen

Add one new file (e.g. `Api.gs`) with a `doPost(e)` that checks a passcode (Script Properties) and calls the existing
`processForm` / `registerNewStudent` / `getTodayAttendance` unchanged. Deploy it as a new deployment with access "Anyone".
Our React screen calls it with `fetch` (`text/plain` POST).

| Pros | Cons |
| --- | --- |
| Our UI on the site; same functions write the Sheet, so the format can't drift | Changes the Apps Script project (a new file; existing files untouched) |
| Existing deployment stays as it is | **The passcode is bypassable**: with "Anyone" access the old functions are callable directly through the same deployment (see above), and the deployment URL is in the site's JavaScript |
| Phase 2: `/api/attendance` holds the secret, browser never sees the URL | Returns student IDs unless the wrapper filters them |

### D. A separate, minimal Apps Script project just for the API (recommended)

A **new, small Apps Script project** (in a new folder like `backend/apps-script/attendance-api/`, nothing in
`backend/apps-script/attendance/` changes) that contains only a `doPost(e)`:

- opens the same Sheet by ID (`SpreadsheetApp.openById`, the ID in its Script Properties) or is bound to it;
- implements exactly the same three actions with the **same rules and the same row format** (10 digits; lookup in
  `MemberLookup` columns A–C; one sign-in per ID per day; append `[new Date().toLocaleString(), id]` to `Data`;
  registration appends `[id, first, last, ""]` to `MemberLookup`), copied line for line from `Code.gs`, plus
  `LockService` around the check-then-append so two scans can't double-sign-in;
- requires a passcode (Script Properties) on every call, and returns **names and times only** (no student IDs) for
  today's list;
- is deployed **Execute as: me, Who has access: Anyone**, and is called by our `/apps/attendance` screen with
  `POST`, `Content-Type: text/plain`, JSON body `{ action, passcode, ... }` (the pattern in the migration plan).

| Pros | Cons |
| --- | --- |
| Existing project **and** deployment untouched; it keeps working as the fallback during the switch | About 80 lines of Apps Script copied from `Code.gs`; the two must stay identical until the old app is retired (a test in the repo can compare them) |
| Only one public function exists, so the passcode really protects the Sheet | A Phase 1 passcode is shared with whoever runs the kiosk (rotate it after the prototype, delete at cutover; plan, "Secrets and security rules") |
| No student IDs leave Google | One more Apps Script project and deployment to own (use the shared programming@ account) |
| Our screen: site login, team styling, camera via the html5-qrcode npm package, works on phones | |
| Phase 2: `/api/attendance` checks the Attendance Admin badge and calls the same endpoint with a server-only secret; the browser never sees the URL or a passcode | |

Needs from the team:
1. Agreement that "the backend stays the same" means **same Sheet, same format, still written only by Apps Script**,
   not literally "no new Apps Script code".
2. The owner account (programming@team6220.org) creates the project, sets Script Properties (`SHEET_ID`, `PASSCODE`),
   deploys it, and authorizes Sheet access. It needs edit access to the attendance Sheet.
3. The `/exec` URL to put in the site config (a URL, not a secret, but don't advertise it).
4. Someone to test on the actual check-in device (camera, scanner hardware) at a meeting, with the old app open as fallback.

## Recommendation

**Option D.** It is the only option that puts our own screen on the site, keeps the Sheet and its format exactly as
they are, leaves the current project and deployment completely untouched (so the team can fall back to it at any
moment), and doesn't expose student ID numbers or the old functions to the public. It also matches the migration
plan's Phase 2 design: only the passcode is replaced by a server-side secret behind `/api/attendance`.

If the team decides the backend must not get any new Apps Script code at all, use **A with "Anyone with a Google
account"** as a stopgap and test it on the kiosk first; avoid "Anyone" on the existing code because of the student IDs.

## Team decisions (Nov 9, 2026)

- **Option D is approved:** a new, separate mini Apps Script project that writes the same Sheet in the same format.
  The current project and its "Only myself" deployment stay untouched as the fallback.
- **No sessions or sign-out.** Keep today's behaviour: one sign-in per student per day. The Sheet format doesn't change.
- **Shared kiosk.** An Attendance Admin signs in on the kiosk and opens it up, which enables data entry. Students then
  enter or scan their IDs there without signing in themselves.
- **Viewing.** Any approved team member can view attendance on their own phone or laptop to check that they signed in.
  Nothing is public.
- **No Inventory Manager role** (that was for Inventory, not Attendance): all Team Members can use Inventory.

## Still open

1. **Registration.** Should unknown IDs still self-register at the kiosk, or should a lead approve new members?
   (Until decided, the new kiosk keeps today's behaviour.)
2. **Today's list.** Members can check their own sign-in. Should they also see who else signed in (names only)?
3. **The "Only myself" deployment.** Which device/account runs it today? That device keeps working throughout.
4. **Small bug to keep in mind:** the old screen builds the list with `innerHTML` from names typed at registration,
   so a crafted name would run as HTML in the old page. The new screen renders text safely; no action needed on the old one.
