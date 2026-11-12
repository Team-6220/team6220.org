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

## Later steps

Added here as each app is built: the app's own collections, and the keys for GitHub, The Blue Alliance, FIRST,
Onshape and Apollo.
