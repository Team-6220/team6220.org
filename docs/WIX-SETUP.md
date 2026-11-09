# Wix setup and upkeep

Everything in Wix that the code depends on, why it matters, and what to do each season. Wix chores are done in the
**Wix dashboard** (log in at <https://manage.wix.com> with a web admin account and open the site
"Los Al Robotics | FRC Team 6220"). Nothing here can be changed from this repo.

> **A warning about menu names.** The exact menu paths below are the ones recorded in [PHASE-0.md](PHASE-0.md) on
> Nov 9, 2026. Wix renames and moves menus fairly often. If a path no longer matches, use the dashboard's search box
> and the keywords in **bold**, or the Wix help center. Anything we could not confirm from the repo is marked *(check)*.

Contents: [Who can administer Wix](#who-can-administer-wix) · [Site members](#site-members-and-approving-people) ·
[Badges](#badges) · [Headless client and redirect URIs](#headless-client-and-redirect-uris) ·
[CMS collections](#cms-collections) · [API keys](#api-keys) · [Domain and DNS](#domain-and-dns) ·
[Forms](#forms-and-emails) · [Each season](#what-to-do-each-season) · [Phase 2 tasks](#phase-2-tasks-not-done-yet)

## Who can administer Wix

Three shared web admin accounts are admins on the Wix site, and the same three are owners of the GitHub organization,
all with 2FA on and the recovery codes stored where two leads or a mentor can reach them, so graduating seniors never
lock the team out: `losalfrc@gmail.com`, `operations@team6220.org`, `programming@team6220.org`
([PHASE-0.md](PHASE-0.md), items 2 and 8). Wix **admins** (people who edit the Wix site) are a different list from
**site members** (people who log in to the website).

## Site members and approving people

**What it is.** A *site member* is a person with a login on team6220.org. They sign in with **Google** (any Gmail; no
`team6220.org` address needed); Wix runs the Google sign-in itself, so there are no Google keys to manage.

**The one setting that matters** *(set; verify if people can get in without approval)*: Dashboard → **Settings →
Site member settings → Signup & login security → "Who can be a site member?" → "Only people I manually approve"**. With
this, every new signup is `PENDING` until you approve them. There is no separate "Member Authentication app" to
install.

**Approving a new person** (do this when a student says "it says waiting for approval"):

1. They go to `/apps` on the site, press **Sign in**, and choose Google. This creates their member record.
2. In the Wix dashboard open the **Member List** (Site members). The new person appears as awaiting approval.
   *(check the exact menu name)*
3. **Approve** them, then give them the **`Team Member`** badge ([Badges](#badges)). Both are needed: the code treats
   someone as approved only if their status is `APPROVED` **and** they hold `Team Member`
   (`auth.getAccess()` in `packages/data/src/auth.ts`).
4. Ask them to reload `/apps`. The Attendance API caches a member's check for up to 5 minutes, so an Attendance change
   may take that long.

**Removing someone:** remove their `Team Member` badge or block/remove the member in the Member List. Their access to
the apps ends; the Attendance API notices within about 5 minutes.

## Badges

Badges are the roles. Create them under Dashboard → **Settings → Site member settings → Member badges → Manage Badges**.
The titles must match **exactly**, because code compares text:

| Badge title | Constant in `packages/data/src/config.ts` | Who has it | What it unlocks |
| --- | --- | --- | --- |
| `Team Member` | `BADGES.teamMember` | Every approved student/mentor | The apps (dashboard, Attendance view, Inventory) |
| `Attendance Admin` | `BADGES.attendanceAdmin` | Leads who run meeting sign-in | Opening and closing the attendance kiosk |
| `Web Admin` | `BADGES.webAdmin` | The webmasters | Reserved for the Site Manager app (not built yet) |

(An `Inventory Manager` badge was created and later dropped: every Team Member can edit inventory, a team decision from
Nov 2026. You can delete it from Wix if it is still there.)

**Giving or removing a badge:** open the person in the Member List and add or remove the badge *(check where Wix
puts it)*.

**Adding a new role:** create the badge here with its exact title, add the title to `BADGES` in
`packages/data/src/config.ts`, and use the constant in code ([ADD-AN-APP.md](ADD-AN-APP.md#4-decide-who-can-use-it-login-and-badges)).
If an Apps Script backend checks the badge by name, update it too (the attendance API has the titles near the top of
`backend/apps-script/attendance-api/Code.gs`).

**Remember:** in Phase 1 the badge list is readable by any visitor token and the browser-side checks only hide buttons.
The server-side check that truly blocks people is in the attendance API.

## Headless client and redirect URIs

**What it is.** Our website's JavaScript is allowed to log people in and read Wix data because we created a **headless
(OAuth) client** on the Wix site. Its **client ID** is committed in `packages/data/src/config.ts` as `WIX_CLIENT_ID`
(`38a0b75d-6959-4630-ac13-73004c094181`). It is public and not a secret.

**Where:** Dashboard → **Settings → Development & integrations → Headless Settings** → our client → **Settings**.

**Allowed domains and redirect URIs.** After a member logs in, Wix sends the browser back to an address. It will only
use addresses on this list, and they must match **exactly** (scheme, host, port, path). The list today:

| Value | Used for |
| --- | --- |
| `https://dev.team6220.org` and `https://dev.team6220.org/apps/login/callback` | The published prototype |
| `http://localhost:4321` and `http://localhost:4321/apps/login/callback` | Running `pnpm dev` on your computer |

The path `/apps/login/callback` is `LOGIN_CALLBACK_PATH` in `packages/data/src/config.ts`. The page for it is
`src/pages/apps/login/callback.astro`.

**When to add one:** any time the site is served from a new address and people must log in there: a different local port
(`pnpm dev` picks another port if 4321 is busy), a Phase 2 preview URL, or the final `https://team6220.org`. Add **both**
the bare origin and `<origin>/apps/login/callback` as an *Allowed authorization redirect URI*, plus the origin as an
allowed domain, then update the comments in `config.ts`. If you skip this, login fails with a redirect URI error
([TROUBLESHOOTING.md](TROUBLESHOOTING.md#redirect-uri-rejected)).

**If the client is ever re-created,** the client ID changes in two places: `WIX_CLIENT_ID` in
`packages/data/src/config.ts` and the `WIX_CLIENT_ID` Script Property (or the default in `Code.gs`) of the attendance API.

## CMS collections

A **collection** is a table in the Wix **CMS** (Dashboard → **CMS**). Rules:

- **Name them with an app prefix**: `inventory_parts`, `scouting_matches`.
- **Permissions in Phase 1: read, insert, update and remove = "Site members".** Never "Anyone". This is a real lock; the
  browser-side badge check is cosmetic. (Phase 2 moves writes behind server endpoints and makes them Admin only.
  `apps/inventory/docs/DATA-MODEL.md` explains the permission levels.)
- **Define collections in code** so they can be recreated. Inventory's are described in
  `packages/data/src/inventory/schema.ts` (17 `inventory_*` collections, including `inventory_meta`).

**Inventory's collections** exist on the live Wix site with the team's data imported (Nov 2026, per
`apps/inventory/README.md`). If they were ever lost or you need a copy on another site, the one-time script
`apps/inventory/scripts/import-from-sheet.mjs` can create them (`--create-collections`) and fill them from CSV exports
of the old Google Sheet; the exact steps are in [apps/inventory/README.md](../apps/inventory/README.md#going-live-needs-a-human-with-wix-admin-access).
`node apps/inventory/scripts/import-from-sheet.mjs --print-schema` prints the definitions so you can also create them by
hand in the dashboard.

**A new app's collections:** create them (by hand or by script), set the permissions above, and write the access code in
`packages/data` ([ADD-AN-APP.md](ADD-AN-APP.md#5-add-the-data-layer)). Note the CMS storage limit (about 10 GB, per
the plan): do not store photos there. Apps that take photos (Inventory) are meant to put the file in Google Drive and
only a link in the CMS.

## API keys

An **API key** lets a script act as the site owner. It is powerful and **must never be committed** to this public repo,
put in a `.env` file that is committed, or shipped to a browser.

**Today you only need one for the one-time Inventory import.** Make it in your Wix account's API Keys page
(*Generate API Key*, with permission to manage Wix Data / CMS for the site; see Wix's
[Generate an API key](https://dev.wix.com/docs/api-reference/articles/authentication/api-keys/generate-an-api-key)).
Put `WIX_API_KEY` and `WIX_SITE_ID` in your shell for that single run (`export ...`), then `unset` them and **revoke the
key** in Wix afterwards.

**Phase 2 (not built yet):** the Wix CLI in CI uses an API key stored as the secret `WIX_API_KEY` in a GitHub
environment called `wix`, and local development uses `.env.local` from `wix env pull`, which also holds a client secret
and is git-ignored ([WIX-CLI-SPIKE.md](WIX-CLI-SPIKE.md#what-headless-link-actually-did-here)). Server-only keys for Nexus
and The Blue Alliance and an Apps Script secret will live in Wix secret environment variables. I could not check from
this repo whether the `wix` GitHub environment exists yet *(check in GitHub → Settings → Environments)*.

## Domain and DNS

`team6220.org` was bought through Wix, so **all DNS changes are made in Wix**: Dashboard → **Domains → team6220.org →
Manage DNS Records**. Two records matter for the prototype (set in Phase 0):

- a **TXT** record GitHub gives you to verify the domain for the GitHub organization, and
- a **CNAME**: host `dev`, value `team-6220.github.io`.

`public/CNAME` in the repo contains `dev.team6220.org` and tells GitHub Pages which domain to answer to. **Do not touch
the existing A, CNAME or MX records**: the current site and team email depend on them. In Phase 3 the `dev` record is
deleted.

## Forms and emails

The public forms are planned but not built (the Join page's interest form is a design preview that sends nothing;
see the migration plan's **Forms** section for the design: Wix forms, one Google Group per topic, an automation per form
that emails the group with reply-to set to the person who filled it out). When those exist, this is where their
upkeep goes: update Google Group membership in Google Workspace each season, not in Wix.

## What to do each season

Do this after the season ends and again before kickoff. Items from the plan are marked (plan); the rest are sensible
checks.

1. **Members** (plan): in the Member List, remove or block graduated members; approve this year's new students and give
   them `Team Member`. Remove old leads' `Attendance Admin` / `Web Admin` badges and give them to the new leads.
2. **Admin accounts**: confirm someone current can log in to all three shared accounts and has the 2FA recovery codes.
   Rotate passwords if a former student knew them. Confirm GitHub org owners and the `webmasters` team are current.
3. **Attendance Sheet**: make sure the account that owns the attendance API Apps Script still exists and has edit access
   to the Sheet ([APPS-SCRIPT.md](APPS-SCRIPT.md)).
4. **API keys**: revoke any key you no longer use.
5. **Redirect URIs**: remove addresses that no longer serve the site; add new ones before they are needed.
6. **Google Groups** (plan, when forms exist): update membership.
7. **Site content**: new robot, sponsors, summer camp switch and links, merch ([COOKBOOK.md](COOKBOOK.md)).
8. **Dependencies and GitHub alerts**: merge or close Dependabot pull requests; read any security alerts.

## Phase 2 tasks (not done yet)

Moving the site onto Wix hosting happens in the same Wix dashboard: **Headless Settings → Start Migration**, then
`wix env pull`, preview builds, the cookie-consent policy, **Complete Migration** (`wix finalize-migration` with only the
flags the dialog gives), 301 redirects in the **URL Redirect Manager**, and deleting the `dev` DNS record. The full list
is in [MIGRATION-PLAN.md](MIGRATION-PLAN.md#phase-2-migration-preview) and what we learned testing it is in
[WIX-CLI-SPIKE.md](WIX-CLI-SPIKE.md). **If something breaks after the switch, Switch Back in Headless Settings restores
the old site.**
