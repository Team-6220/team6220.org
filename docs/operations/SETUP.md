# Operations apps: what a person has to do

The apps are built so that everything runs on made-up data without any of this (`pnpm dev`, or `?demo=lead` on a
deployed page). To use real data, someone with the right access has to do the steps below. Code cannot do them.

Tick a box in a pull request when a step is done, so the next person knows where things stand.

## For every app (step 0)

Full instructions: [backend/apps-script/ops-api/README.md](../../backend/apps-script/ops-api/README.md#setup-once-by-someone-with-wix-admin-and-the-team-google-account).

| Done | Who | What | Where |
| --- | --- | --- | --- |
| [ ] | Web Admin | Create the badges `Mentor`, `Booster`, `Supervisor`, `Lead` and the five `Subteam: <name>` badges | Wix → Site Members → Badges |
| [ ] | Web Admin | Give `Lead`, `Mentor`, `Booster` and `Supervisor` to the right people | Wix → Site Members |
| [ ] | Web Admin | Create the collections `ops_counters`, `ops_history`, `ops_projects`, `ops_people` (read: Site members; write: Admin) | Wix → CMS |
| [ ] | Wix owner | Make a Wix API key (Wix Data + Manage Badges) and note the site ID | Wix account → API Keys |
| [ ] | Team Google account | Create the "6220 Operations API" Apps Script project, add the Script Properties, run `checkSetup`, deploy | script.google.com |
| [ ] | Programmer | Paste the `/exec` URL into `OPS_API_URL_DEFAULT` in `packages/data/src/config.ts` | Pull request |

## BOM (step 1)

| Done | Who | What | Where |
| --- | --- | --- | --- |
| [ ] | Web Admin | Create the collections `bom_boms`, `bom_orders`, `bom_sections`, `bom_lines` (read: Site members; write: Admin). Fields are listed in the ops-api README | Wix → CMS |
| [ ] | Team Google account | Copy `Bom.gs` and the updated `Code.gs` and `WixData.gs` into the Apps Script project, run `checkSetup`, deploy a new version | script.google.com |
| [ ] | Lead | Create the first BOM and import the 2026 sheets: in each sheet tab, File → Download → CSV, then BOM → New order → Import a sheet tab | `/apps/bom` |

## Icarus (step 2)

| Done | Who | What | Where |
| --- | --- | --- | --- |
| [ ] | Web Admin | Create `icarus_tasks` (read and write: **Site members**) | Wix → CMS |
| [ ] | Web Admin | Create `icarus_milestones`, `icarus_events`, `icarus_seasons`, `icarus_templates` (read: Site members; write: Admin). Fields are listed in the ops-api README | Wix → CMS |
| [ ] | Team Google account | Copy `Icarus.gs` and the updated `Code.gs`, `Shared.gs` and `WixData.gs` into the Apps Script project, run `checkSetup`, deploy a new version | script.google.com |
| [ ] | Lead | Create the 2027 season on Icarus → Plan, start it from the Season template, correct it, and save it as the team's own template | `/apps/icarus` |
| [ ] | Everyone | Pick your subteams on Icarus → People | `/apps/icarus` |

## Production (step 3)

| Done | Who | What | Where |
| --- | --- | --- | --- |
| [ ] | Web Admin | Create `production_parts` (read and write: **Site members**). Fields: `number`, `length`, `width`, `quantity` (number); `partName`, `designerId`, `designerName`, `projectId`, `taskId`, `cadLink`, `fileLinks`, `material`, `thickness`, `method`, `accuracy`, `priority`, `dueDate`, `details`, `status`, `setupNotes`, `setupBy`, `createdAt` (text); `work` (array); `print` (object) | Wix → CMS |
| [ ] | Manufacturing lead | Tell designers to use `/apps/production` and close the Production Form | |

## Still to build

The links between the apps (step 4) need no setup of their own, only the fields listed in the ops-api README
(`inventoryItemId` on `bom_lines`, `needs` on `icarus_tasks`).

Not built yet, so nothing to set up: the cut planner
move, Onshape import, event lookup, GitHub sync and the rest of Apollo's actions. Their keys (GitHub, The Blue
Alliance, FIRST, Onshape, Apollo) will be listed here when they are.
