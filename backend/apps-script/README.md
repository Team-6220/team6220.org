# Apps Script backends

Source code of the team's two Google Apps Script web apps, copied **unchanged** from the live projects on
Nov 9, 2026 (exported from the Apps Script editor). Nothing here is rewritten or reformatted, so what the team
runs today is exactly what is in git.

| Folder | Live name | What it is | Data |
| --- | --- | --- | --- |
| `inventory/` | Inventory Manager (Golden Griffins Inventory) | Parts, tools, audits and packing lists. Server `.gs` files plus the HTML/JS the browser loads | Bound Google Sheet (also script properties for settings) |
| `attendance/` | QR Code Scanner ("6220 Attendance") | Scans student IDs and writes sign-ins | Bound Google Sheet: `Data` and `MemberLookup` tabs |

## Rules

- **Don't edit the live scripts and this folder separately.** Change code here first (pull request), then copy it
  into the Apps Script editor, or use `clasp` once it is set up (it needs each project's script ID; not set up yet).
- **No secrets and no student data in git.** The code contains none today: spreadsheets are found with
  `getActive()` and settings live in Script Properties. Keep it that way, because this repo is public.
- The Sheets stay where they are. Attendance keeps writing to its Sheet through Apps Script (migration plan,
  "Backends and data").
- `inventory/` has no `appsscript.json` in the export. Don't invent one; `clasp pull` will bring it.

## Old deployments

The existing Apps Script web-app deployments stay up and unchanged until the new site has run a real team
meeting with Attendance and Inventory working (see docs/MIGRATION-PLAN.md, Phase 1 "Done when"). Don't delete or
redeploy them before then.
