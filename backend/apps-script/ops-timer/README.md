# Ops timer (Apps Script)

Wix hosting has no scheduler, so this tiny script is the team's clock. It does no work itself: its time triggers call
`https://www.team6220.org/api/ops-timer`, and the website does the job. The jobs are in
[docs/operations/SERVER.md](../../../docs/operations/SERVER.md#timer-and-webhook).

| Function | Trigger | Does |
| --- | --- | --- |
| `syncGithub` | every 5 minutes | Sends task changes in Icarus to GitHub (GitHub's changes arrive at once by webhook) |
| `refreshEvents` | once a day | Updates saved competition events' dates from The Blue Alliance |

## Setup (once, with the team Google account)

1. Create the Apps Script project and upload the files with `clasp` (installed by `pnpm install`), signed in as the team
   Google account. Once per computer, `pnpm clasp login` (it opens a browser; first turn on the Apps Script API at
   <https://script.google.com/home/usersettings>). Then, from the repo root:

   ```bash
   pnpm clasp create-script --type standalone --title "6220 Ops Timer" --rootDir backend/apps-script/ops-timer
   ```

   That writes `backend/apps-script/ops-timer/.clasp.json` (the script ID is not a secret; commit it). If clasp asks about
   overwriting `appsscript.json`, answer no. After that, every change is `pnpm clasp -P backend/apps-script/ops-timer push`.
2. Make a long random secret (20 or more characters). Save it **twice**: as the Wix secret `OPS_TIMER_SECRET` (Wix
   dashboard → Developer Tools → Secrets Manager) and as the Script Property `OPS_TIMER_SECRET` here. Never put it in
   the repo.
3. Triggers → Add trigger: `syncGithub`, time-driven, minutes timer, every 5 minutes; and `refreshEvents`,
   time-driven, day timer.
4. Run `syncGithub` once from the editor to give the permission, then open Executions: it should say
   `syncGithub: 200`.

A wrong secret answers 401; the execution then shows as failed and Apps Script can email the owner.
