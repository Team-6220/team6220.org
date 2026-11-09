# Apps Script backends

Source code of the team's Google Apps Script web apps. `inventory/` and `attendance/` were copied **unchanged** from
the live projects on Nov 9, 2026 (exported from the Apps Script editor); nothing there is rewritten or reformatted, so
what the team runs today is exactly what is in git. `attendance-api/` is new code written in this repo.

| Folder | Live name | What it is | Data |
| --- | --- | --- | --- |
| `inventory/` | Inventory Manager (Golden Griffins Inventory) | Parts, tools, audits and packing lists. Server `.gs` files plus the HTML/JS the browser loads | Bound Google Sheet (also script properties for settings) |
| `attendance/` | QR Code Scanner ("6220 Attendance") | Scans student IDs and writes sign-ins | Bound Google Sheet: `Data` and `MemberLookup` tabs |
| `attendance-api/` | 6220 Attendance API (not created yet; [setup steps](attendance-api/README.md)) | JSON API for `/apps/attendance`: kiosk sign-in, today's list, history. Checks the member's Wix sign-in and badges on every request | The **same** Sheet, opened by ID (Script Property `SHEET_ID`), same row format |

## Rules

- **Don't edit the live scripts and this folder separately.** Change code here first (pull request), then copy it
  into the Apps Script editor, or use `clasp` once it is set up (it needs each project's script ID; not set up yet).
- **No secrets and no student data in git.** The code contains none today: spreadsheets are found with
  `getActive()` (or, in `attendance-api/`, by an ID kept in Script Properties) and settings live in Script
  Properties. Keep it that way, because this repo is public.
- The Sheets stay where they are. Attendance keeps writing to its Sheet through Apps Script (migration plan,
  "Backends and data"). `attendance-api/` writes exactly the rows the old app writes; don't change one without the other.
- **Don't modify `attendance/`.** It is the live app and the fallback while the new screen is tested.
- `inventory/` has no `appsscript.json` in the export. Don't invent one; `clasp pull` will bring it.

## Old deployments

The existing Apps Script web-app deployments stay up and unchanged until the new site has run a real team
meeting with Attendance and Inventory working (see docs/MIGRATION-PLAN.md, Phase 1 "Done when"). Don't delete or
redeploy them before then.
