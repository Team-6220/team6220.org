# Go-live checklist (Phase 3)

The order of the switch from the current Wix site to the new site on Wix hosting. The reasons and the plan are in
[MIGRATION-PLAN.md](MIGRATION-PLAN.md#phase-3-switch-over); the Phase 2 steps that came before are in
[PHASE-2.md](PHASE-2.md). Tick each box as it is done, and keep the order: a few steps depend on the one before.

Who does each step:

- **Webmaster**: someone with Wix owner access and the team accounts. Claude can help with most of these, but a person
  signs in, types secrets, and approves anything that changes the live site.
- **Claude**: can do it from the repo, the Wix API, or the GitHub CLI, with the webmaster's okay.
- **Team**: students and mentors testing.

> The current site stays live until step 2 of "Switch day". **Switch Back** in Wix → Headless Settings brings it
> back at any point, so nothing here is a one-way door except deleting the `dev` DNS record and the Wix permission
> changes in step 12 (both can be undone, but by hand).

## 1. Before the day

Everything here can be done now, and none of it changes the live site.

- [ ] **Webmaster.** Roles: nobody has signed up yet, so there is nothing to give out now. After the switch, as people
      sign up, give them roles in Wix → Site Members: `Lead`, `Mentor`, `Booster`, `Supervisor`, and `Guest`. Anyone who
      should edit the inventory also needs `Team Member` (only that badge and `Web Admin` can).
- [ ] **Webmaster.** Remove the test badges from `hossfam64@gmail.com` if it should not stay an admin, and sign the test
      browsers out.
- [ ] **Team.** Test on a fresh preview: sign in, every app, every form, as a Team Member, a Lead, and a Guest. Previews
      stop working about 3 days after they are built, so push (or re-run the Wix preview workflow) right before.
- [ ] **Webmaster.** Check the Wix secrets exist (Developer Tools → Secrets Manager): `OPS_TIMER_SECRET`,
      `GITHUB_WEBHOOK_SECRET`, `APOLLO_KEY_SHA256`, the GitHub App secrets, and, if you use them, `GITHUB_TOKEN` (task sync
      with GitHub issues) and `TBA_KEY` (event lookups). Names are listed in
      [operations/SERVER.md](operations/SERVER.md#setup); values never go in the repo or in chat.
- [ ] **Webmaster.** Put the same `OPS_TIMER_SECRET` value in the "6220 Ops Timer" Apps Script (Project Settings →
      Script Properties). Done once already; check it is still there. Do **not** add its triggers yet.
- [ ] **Webmaster.** Make Apollo's key (32 or more random characters), keep its SHA-256 in the Wix secret
      `APOLLO_KEY_SHA256`, and put the key in `~/.hermes/.env` on the Pi as `TEAM_APPS_API_KEY`. Apollo can use it only
      after the switch.
- [ ] **Claude.** Re-run the content, redirect, and link checks (`pnpm content:check`, `pnpm redirects:check`, the E2E suite)
      on `main`. Generated redirects are in `docs/redirects.csv`, in the format Wix's redirect manager imports.
- [ ] **Webmaster and Claude.** Confirm the allowed addresses for the built-in login include `https://www.team6220.org`
      (the open check in PHASE-2.md). Without it, nobody can sign in after the switch.
- [ ] **Webmaster and Claude.** A merge to `main` does not release by itself (no workflow does it). To release, run
      Actions → **Wix release** → Run workflow on `main` (it builds, runs `wix release`, publishes, and clears the cache).
      Run it once after the workflow merges, to prove it works, and again after any later merge you want live. Check
      Wix → Headless Settings for a Git auto-release setting as well, and for what **Complete Migration** does.
- [ ] **Webmaster.** Backup: a zip of the export is already in the team Drive. Check it has the CMS collections, and a
      note of the current redirects and site settings. If anything goes wrong, this is what you compare with.
- [ ] **Webmaster.** Pick a time. Visitors are few, so any time outside a build meeting works; tell the team what will
      change.
- [ ] **Everyone.** Freeze merges to `main` from the start of the switch until step 11 is done.

## 2. Switch day, in this order

1. [ ] **Webmaster.** In Wix → Headless Settings, open **Complete Migration** and run `wix finalize-migration` with *only*
       the flags that dialog gives you. `team6220.org` now shows the new site.
2. [ ] **Smoke test (Webmaster and Claude).** Open `/` and `/apps`. Sign in with Google. Open Attendance, Inventory,
       Icarus, BOM, and Production. If sign-in or the apps fail, use **Switch Back** and stop.
3. [ ] **Webmaster.** attendance-api (Apps Script, on `programming@team6220.org`): set the Script Property `WIX_CLIENT_ID`
       to `74e98aee-3daa-4452-bf00-f13523cae9c5`. Not before step 1, because the dev site still signs in with the old
       client.
4. [ ] **Claude, with the webmaster's okay.** Set the site-wide cookie consent policy to essential-only with the
       [Update Consent Policy API](https://dev.wix.com/docs/api-reference/business-management/site-properties/properties/update-consent-policy),
       so analytics stay off from the very first page view. It applies to the whole Wix site.
5. [ ] **Webmaster.** Import `docs/redirects.csv` into the URL Redirect Manager (301 redirects for `/summer`,
       `/our-team`, `/our-team/subteams`, `/sponsors-donations`, `/contact`, `/gallery`, and the rest of the file). Check a
       few old addresses by hand.
6. [ ] **Team.** Submit every form once on the live site (Join, Contact, and any others) and confirm the emails arrive and
       the signups appear in Site Manager → Form signups.
7. [ ] **Webmaster.** The clock: in the "6220 Ops Timer" script, add the triggers `syncGithub` (time-driven, every 5
       minutes) and `refreshEvents` (daily). Run `syncGithub` once and check Executions says `syncGithub: 200`. (A 401
       means the two secrets differ, and a 403 or 404 means the site has not switched.)
8. [ ] **Webmaster.** GitHub webhook: Team-6220 → Settings → Webhooks → Add webhook, payload URL
       `https://www.team6220.org/api/github-hook`, content type `application/json`, the secret from
       `GITHUB_WEBHOOK_SECRET`, only the **Issues** event. In "Recent deliveries", the first delivery should be 200.
9. [ ] **Webmaster.** Merge the Apollo pull request (Apollo repository, #21) so Apollo starts using the team apps.
10. [ ] **Claude.** Remove `.github/workflows/pages.yml` in a pull request. After it merges, delete the `dev` DNS record, so
        `dev.team6220.org` stops serving the old static apps. (GitHub Pages can't run the server-side site.)

## 3. Lock the data (right after step 10)

Only now, because the old static apps on the `dev` site read and wrote these collections straight from the browser and
would stop working.

11. [ ] **Webmaster and Claude.** In Wix → CMS, change each collection's permissions as listed in
        [operations/SERVER.md](operations/SERVER.md#setup), step 6 ("Locking the collections"): everything except the
        `inventory_*` collections is read and write **Admin**; the `inventory_*` collections are read **Site members** and
        write **Admin** (this is the inventory lock: changes then go only through `/api/inventory`).
12. [ ] **Claude and Team.** Check the lock, signed in as each of Guest, Team Member, and a Lead (or Mentor):
        - a Guest who calls the Wix Data API directly is refused for every non-inventory collection (read and write);
        - every app still works for each role (tasks, comments, Production, BOM, inventory edits);
        - an inventory edit still works for a Team Member and is refused for a Guest.
        To undo it, put the old permissions back (read Site members everywhere, and write Site members on `icarus_tasks`,
        `icarus_comments`, `production_parts`, and the `inventory_*` collections).
13. [ ] **Webmaster.** Turn **manual signup approval** off only if you want anyone with a Google account to join without a
        Web Admin's approval. Leave it on otherwise; it is the first gate for every new account.

## 4. After the switch

- [ ] **Webmaster.** Check page titles and descriptions for search engines, whether a sitemap is needed, Google Search
      Console, and analytics.
- [ ] **Webmaster.** Delete the old Wix API key "Wix CLI for Claude" in `programming@team6220.org` (CI uses the key in
      `losalfrc@gmail.com`).
- [ ] **Webmaster.** Remind the team that the Wix preview link in each pull request stops working about 3 days after it
      is built.
- [ ] **Team.** Plan the next work: the apps overhaul backend (GitHub issue #259), scouting, and the pit display.
      Do not close any GitHub issue until a webmaster says so.

## If something breaks

1. **The site or sign-in:** **Switch Back** in Wix → Headless Settings, then fix it on a preview.
2. **The data lock (step 11):** put the old permissions back on the collections. The apps then work as they did before.
3. **The clock or the webhook:** remove the Apps Script triggers, or turn the webhook off in GitHub. Set the Wix secret
   `GITHUB_SYNC_PAUSED` to `yes` to stop GitHub sync at once.
