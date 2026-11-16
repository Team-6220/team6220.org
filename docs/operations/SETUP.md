# Operations apps: what a person has to do

The apps are built so that everything runs on made-up data without any of this (`pnpm dev`, or `?demo=lead` on a
deployed page). To use real data, someone with the right access has to do the steps below. Code cannot do them.

Tick a box in a pull request when a step is done, so the next person knows where things stand.

## For every app (step 0)

Full instructions: [SERVER.md](SERVER.md#setup).

| Done | Who | What | Where |
| --- | --- | --- | --- |
| [ ] | Web Admin | Create the badges `Mentor`, `Booster`, `Supervisor`, `Lead` and the five `Subteam: <name>` badges | Wix → Site Members → Badges |
| [ ] | Web Admin | Give `Lead`, `Mentor`, `Booster` and `Supervisor` to the right people | Wix → Site Members |
| [ ] | Web Admin | Create the collections `ops_counters`, `ops_history`, `ops_projects`, `ops_people` (read: Site members; write: Admin) | Wix → CMS |
| [ ] | Wix owner | Make a Wix API key (Wix Data, Manage Badges, Read Members) and note the site ID | Wix account → API Keys |
| [ ] | Team Google account | Create the "6220 Operations API" Apps Script project, add the Script Properties, run `checkSetup`, deploy | script.google.com |
| [ ] | Programmer | Paste the `/exec` URL into `OPS_API_URL_DEFAULT` in `packages/data/src/config.ts` | Pull request |

## BOM (step 1)

| Done | Who | What | Where |
| --- | --- | --- | --- |
| [ ] | Web Admin | Create the collections `bom_boms`, `bom_orders`, `bom_sections`, `bom_lines` (read: Site members; write: Admin). Fields are listed in SERVER.md | Wix → CMS |
| [ ] | Team Google account | Copy `Bom.gs` and the updated `Code.gs` and `WixData.gs` into the Apps Script project, run `checkSetup`, deploy a new version | script.google.com |
| [ ] | Lead | Create the first BOM and import the 2026 sheets: in each sheet tab, File → Download → CSV, then BOM → New order → Import a sheet tab | `/apps/bom` |

## Icarus (step 2)

| Done | Who | What | Where |
| --- | --- | --- | --- |
| [ ] | Web Admin | Create `icarus_tasks` and `icarus_comments` (read and write: **Site members**) | Wix → CMS |
| [ ] | Web Admin | Create `icarus_milestones`, `icarus_events`, `icarus_seasons`, `icarus_templates` (read: Site members; write: Admin). Fields are listed in SERVER.md | Wix → CMS |
| [ ] | Team Google account | Copy `Icarus.gs` and the updated `Code.gs`, `Shared.gs` and `WixData.gs` into the Apps Script project, run `checkSetup`, deploy a new version | script.google.com |
| [ ] | Lead | Create the 2027 season on Icarus → Plan, start it from the Season template, correct it, and save it as the team's own template | `/apps/icarus` |
| [ ] | Lead or Mentor | Press "Update from the members list" on Icarus → People, so everyone can be @mentioned | `/apps/icarus` |
| [ ] | Everyone | Pick your subteams on Icarus → People | `/apps/icarus` |

## Production (step 3)

| Done | Who | What | Where |
| --- | --- | --- | --- |
| [ ] | Web Admin | Create `production_parts` (read and write: **Site members**). Fields: `number`, `length`, `width`, `quantity` (number); `partName`, `designerId`, `designerName`, `projectId`, `taskId`, `cadLink`, `fileLinks`, `material`, `thickness`, `method`, `accuracy`, `priority`, `dueDate`, `details`, `status`, `setupNotes`, `setupBy`, `createdAt` (text); `work` (array); `print` (object) | Wix → CMS |
| [ ] | Manufacturing lead | Tell designers to use `/apps/production` and close the Production Form | |

## Outside connections (steps 5 and 6)

Each one is optional: the apps work without it, and the button that needs it explains what is missing.

| Done | Who | What | Where |
| --- | --- | --- | --- |
| [ ] | Team Google account | Set up the clock: copy `backend/apps-script/ops-timer` into an Apps Script project, add its `OPS_TIMER_SECRET`, and add the triggers (5-minute `syncGithub`, daily `refreshEvents`) | script.google.com |
| [ ] | Anyone with a TBA account | Make a read key on The Blue Alliance (Account → Read API Keys), add it as the Wix secret `TBA_KEY` | thebluealliance.com, Wix → Secrets Manager |
| [ ] | Org owner | Make a fine-grained GitHub token on a team bot account (Team-6220, all repositories, Issues read and write), add it as the Wix secret `GITHUB_TOKEN`, then add the GitHub webhook. Details in SERVER.md, steps 3 to 5 | github.com, Wix → Secrets Manager |
| [ ] | Web Admin | Add `githubLogin` (text) to `ops_people`, and `updatedAt` (text) and `githubIssue` (object) to `icarus_tasks` | Wix → CMS |
| [ ] | Lead | Connect each project to its repository: Icarus → Projects → Connect a GitHub repository | `/apps/icarus` |
| [ ] | Everyone who uses GitHub | Set your GitHub username on Icarus → People | `/apps/icarus` |
| [ ] | Whoever runs Apollo | Make a long random key, store its SHA-256 as the Wix secret `APOLLO_KEY_SHA256`, and give the key to Apollo. Apollo's actions are listed in SERVER.md | Wix → Secrets Manager |
| [ ] | Manufacturing lead | Use the cut planner in Production at a real meeting; then a programmer removes Inventory's own planner | `/apps/production` |

Not built yet, so nothing to set up: Onshape import (it will need Onshape API keys).
