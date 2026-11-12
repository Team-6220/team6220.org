# Google Apps Script backends: deploy and redeploy

Three small Google Apps Script projects live in `backend/apps-script/`. This guide explains what Apps Script is, which
project does what, and how to deploy and redeploy each. The attendance API has its own detailed README
([backend/apps-script/attendance-api/README.md](../backend/apps-script/attendance-api/README.md)); this guide does not repeat
its tables, it tells you how to get from the files in git to a running web app.

## Apps Script in five minutes

- **Apps Script** is JavaScript that runs on Google's servers, attached to your Google account. It can read and write
  Google Sheets, and it can answer web requests.
- Code is edited in a browser editor at <https://script.google.com>. A **project** is a set of files (`.gs` for server
  code, `.html` for pages). Our repo keeps a copy of each project's files.
- A project can be **bound** to one Google Sheet (opened through the Sheet's **Extensions → Apps Script**), or
  **standalone** (created at script.google.com, finds its Sheet by an ID).
- A **web app deployment** gives the project a public address ending in `/exec`. Two settings matter:
  - **Execute as**: whose Google account the code runs as (we use **Me**, the owner). It is what lets the code write to the
    Sheet no matter who calls it.
  - **Who has access**: *Only myself*, *Anyone with a Google account*, or *Anyone*.
- **Script Properties** (Project Settings → Script Properties) are the project's private settings, like environment
  variables. The Sheet ID is kept there so it is not in git.
- **Changing the code does not change the live app.** The live app runs a saved **version**. You must **redeploy**
  (below). Redeploying the *same* deployment keeps its `/exec` URL; creating a *new* deployment gives a new URL, which
  would break the website.
- Run a function manually: pick it in the editor's function menu and click **Run**. The first run asks you to
  **authorize** permissions.

## The three projects

| Folder | Live name | Bound or standalone | Web app access | Status |
| --- | --- | --- | --- | --- |
| `backend/apps-script/attendance-api/` | 6220 Attendance API | **Standalone**, finds the Sheet by `SHEET_ID` | Execute as me, **Anyone** (it checks the Wix sign-in itself on every request) | **The website uses it.** `packages/data/src/config.ts` holds a deployed `/exec` URL |
| `backend/apps-script/ops-api/` | 6220 Operations API | **Standalone**, talks only to Wix | Execute as me, **Anyone** (it checks the Wix sign-in itself on every request) | **Not deployed yet.** Icarus, Production and BOM will use it; setup is in [its README](../backend/apps-script/ops-api/README.md) |
| `backend/apps-script/attendance/` | QR Code Scanner ("6220 Attendance") | **Bound** to the attendance Sheet | Execute as me, **Only myself** | Live fallback. **Do not modify** |
| `backend/apps-script/inventory/` | Inventory Manager (Golden Griffins Inventory) | **Bound** to the inventory Sheet | set in the live deployment; the export has no manifest | Live until the new `/apps/inventory` has run a real meeting |

Rules from [backend/apps-script/README.md](../backend/apps-script/README.md):

- Don't edit the live script and the folder separately. Change the code **here first** (pull request), then copy it
  into the editor.
- **No secrets, no student data in git.** Sheets are found by `getActive()` or an ID in Script Properties.
- Don't change the attendance row format in one of the two attendance projects without the other.
- Leave the old deployments up until the new site has run a real team meeting with Attendance and Inventory.
- `clasp` (Google's command-line sync tool) is **not set up**. You need each project's script ID for it. Until then you
  copy files by hand.

Because the repo is public and these are real team accounts, use the shared **programming@team6220.org** account (or
another team-owned account) as the project **owner**, so a graduating student never owns something the team needs.

---

## A. attendance-api (the one the website calls)

**Files:** `Code.gs` and `appsscript.json` (time zone `America/Los_Angeles`, scopes for Sheets and external requests, web
app "execute as me, anyone"). Tests: `pnpm --filter @team6220/data test` runs `Code.gs` in Node against fake Apps Script
services (`packages/data/test/apps-script.test.ts`).

### First-time deploy (about 15 minutes)

The full list is in [the README](../backend/apps-script/attendance-api/README.md#set-it-up-a-web-admin-about-15-minutes).
In short:

1. <https://script.google.com> → **New project**, name it `6220 Attendance API`.
2. Replace `Code.gs` with this repo's. In **Project Settings** tick *Show "appsscript.json" manifest file in editor*
   and replace that file with this repo's `appsscript.json`.
3. **Project Settings → Script Properties:** add `SHEET_ID` (the long part of the Sheet's URL between `/d/` and
   `/edit`). Optional: `KIOSK_HOURS` (default 6) and `WIX_CLIENT_ID` (only if the Wix headless client changed).
4. In the editor choose `checkSetup` → **Run**, approve permissions. It only reads and should log
   `OK: Sheet '…' (… sign-in rows, … students). Wix badges found: …`.
5. **Deploy → New deployment → Web app**; description `attendance api v1`; **Execute as: Me**; **Who has access: Anyone**;
   **Deploy**; copy the **Web app URL** (ends in `/exec`).
6. Paste the URL into `ATTENDANCE_API_URL_DEFAULT` in `packages/data/src/config.ts` (it isn't a secret; or set
   `PUBLIC_ATTENDANCE_API_URL` when building), open a pull request, merge.
7. Test before a meeting with the old app open as a fallback: a Team Member sees today's list; an Attendance Admin opens
   the kiosk and signs in a test ID; the new row in the `Data` tab looks like the old ones; **Close kiosk**, then a scan
   is refused.

### Redeploy after changing the code

1. Change `Code.gs` in a pull request; get the tests passing (`pnpm --filter @team6220/data test`).
2. Paste the merged file into the Apps Script editor; **Save**.
3. **Deploy → Manage deployments →** pencil icon on the existing deployment **→ Version: New version → Deploy.**
   The URL stays the same, so the website needs no change.
4. Run `checkSetup` again if you changed anything about setup. Try a sign-in.

If you **do** end up with a new URL (you chose *New deployment*), put it in `ATTENDANCE_API_URL_DEFAULT` and merge.

### Turn it off / roll back

**Deploy → Manage deployments →** archive the deployment: the site's Attendance page then shows an error and the team uses
the old scanner. To roll back a bad release, edit the deployment and choose an earlier **Version**.

### Things to know

- It has no Wix keys or secrets; it checks each member's token with Wix itself, and caches a successful check for 5
  minutes and badge lists for an hour (so a removed badge takes up to 5 minutes to bite).
- Open kiosks are stored in Script Properties as `kiosk:<hash>` entries and expire after `KIOSK_HOURS`.
- If the owner account is deleted or loses edit access to the Sheet, attendance stops. Check this each season
  ([WIX-SETUP.md](WIX-SETUP.md#what-to-do-each-season)).
- **The backend README still describes this project as "not created yet" in places, but the repo contains a deployed URL
  (commit "Attendance apps script connection"). I could not verify the live deployment from the repo; open
  script.google.com as the owner account to confirm which version is deployed.**

---

## B. attendance (the old QR scanner, the fallback)

**Files:** `Code.gs`, `Index.html`, `Form.html`, `JavaScript.html`, `CSS.html`, `QrReaderJS.html`, `appsscript.json`.
It is **bound** to the attendance Sheet, with the `Data` and `MemberLookup` tabs. It started from a bpwebs.com QR-scanner
template and loads the html5-qrcode library (credits in [NOTICE.md](../NOTICE.md)).

**Don't modify it.** If you must (a bug, a new Sheet):

1. Change the files here first, in a pull request, and make the matching change in `attendance-api/Code.gs`, because both write
   the same Sheet in the same format.
2. In the Sheet: **Extensions → Apps Script**, paste the changed files, **Save**.
3. **Deploy → Manage deployments →** pencil → **New version → Deploy.** Its manifest says "execute as me, only myself",
   so only people signed in as the owner can open it.

## C. inventory (the old Inventory app, retiring)

**Files:** server code (`Main.gs`, `Config.gs`, `Db.gs`, `Setup.gs`, `Backup.gs`, `Validate.gs`, `Util.gs`, `Api*.gs`,
`PackingSeed.gs`, `Tests.gs`) and the page (`Index.html`, `Styles.html`, `Fonts.html`, `Brand.html`, `Js*.html`). It is
**bound** to the inventory Sheet. The export has no `appsscript.json`; don't invent one (a future `clasp pull` brings it).

The new `/apps/inventory` shares the same user interface (`apps/inventory/ui` is a copy of these HTML files) but stores
data in Wix, so changes to the *data rules* are in `packages/data/src/inventory/`, not here. The Apps Script version stays
until the new one has survived a real team meeting; after that it can be taken down (archive the deployment).

Redeploy (same steps as above): in the Sheet **Extensions → Apps Script**, paste the changed files, **Save**, then
**Deploy → Manage deployments →** pencil → **New version → Deploy**.

Editor-only functions (run them from the editor, never from the web app; they refuse other callers):

| Function | When |
| --- | --- |
| `setupDatabase` | After every code update that adds columns, and on first setup. Safe to re-run: it only adds what is missing and writes `SPREADSHEET_ID` to Script Properties |
| `installNightlyBackup` | Once, to schedule the nightly backup (about 3 AM script time). Safe to re-run |
| `runBackupNow` | To make a backup copy in Drive right now |

Backups go to the Drive folder `Golden Griffins Inventory / Backups`. Note that the new Wix-based Inventory has **no nightly
backup yet** (issue #96).

---

## Checklist: changing any Apps Script code

- [ ] Changed in git first and reviewed in a pull request
- [ ] Tests pass (`pnpm --filter @team6220/data test` for attendance-api)
- [ ] No keys, passwords, Sheet IDs or student data in the diff
- [ ] Pasted into the editor and saved
- [ ] **Redeployed the existing deployment with a New version** (not a new deployment)
- [ ] Tried it with the real site or the old app open as a fallback
