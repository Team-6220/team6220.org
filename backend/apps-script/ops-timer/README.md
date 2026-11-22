# Ops timer (Apps Script)

Wix hosting has no scheduler, so this tiny script is the team's clock. It does no work itself: its time triggers call
`https://www.team6220.org/api/ops-timer`, and the website does the job. The jobs are in
[Operations Server](https://github.com/Team-6220/team6220.org/wiki/Operations-Server#timer-and-webhook).

| Function | Trigger | Does |
| --- | --- | --- |
| `syncGithub` | every 5 minutes | Sends task changes in Icarus to GitHub (GitHub's changes arrive at once by webhook) |
| `refreshEvents` | once a day | Updates saved competition events' dates from The Blue Alliance |
| `sendDeliveries` | every 5 minutes | Sends Discord notifications that are waiting (and, after quiet hours, each person's overnight ones as one message) |
| `runReminders` | every 15 minutes | Tasks due tomorrow or overdue, BOM lines waiting for signatures (one summary a day), late orders |

## Setup (once, with the team Google account)

1. Create the Apps Script project and upload the files with `clasp` (installed by `pnpm install`), signed in as the team
   Google account. Once per computer, `pnpm clasp login` (it opens a browser; first turn on the Apps Script API at
   <https://script.google.com/home/usersettings>). Then, from the repo root:

   ```bash
   pnpm clasp create-script --type standalone --title "6220 Ops Timer" --rootDir backend/apps-script/ops-timer
   ```

   That writes `backend/apps-script/ops-timer/.clasp.json` (the script ID is not a secret; commit it). If clasp asks about
   overwriting `appsscript.json`, answer no. After that, every change is `pnpm clasp -P backend/apps-script/ops-timer push`.

   On Windows, clasp may not ask and does two things differently: it leaves `.clasp.json` in the repo root and replaces
   `appsscript.json` with Google's default. Move `.clasp.json` into this folder (keep only the `scriptId`), restore
   `appsscript.json` with `git checkout`, and give `-P` the full path, such as
   `pnpm clasp -P "C:\Users\you\team6220.org\backend\apps-script\ops-timer" push`, because the relative path is rejected
   ("escapes project root").
2. Make a long random secret (20 or more characters). Save it **twice**: as the Wix secret `OPS_TIMER_SECRET` (Wix
   dashboard → Developer Tools → Secrets Manager) and as the Script Property `OPS_TIMER_SECRET` here. Never put it in
   the repo.
3. In the editor, pick `setupTriggers` and press Run (allow the permission it asks for). It makes the four triggers:
   `syncGithub` and `sendDeliveries` every 5 minutes, `runReminders` every 15 minutes, and `refreshEvents` once a day.
   Running it again replaces them, so it never makes doubles. Run it again after a push that adds a job.
4. Run `syncGithub` once from the editor to give the permission, then open Executions: it should say
   `syncGithub: 200`.

A wrong secret answers 401; the execution then shows as failed and Apps Script can email the owner.
