# team6220.org Headless Migration Plan

> **This file is now the source of truth.** It was imported from the planning doc on Nov 9, 2026 and is edited
> only in this repo, through pull requests. Differences from the original doc:
>
> - The "Member Authentication app" step is gone. It doesn't exist in Wix; Google sign-in is built into Wix
>   Members. The real menu paths are in [PHASE-0.md](PHASE-0.md).
> - The GitHub team is `webmasters` (the doc said "web admins").
> - Student photos are not stored in git ([PHOTOS.md](PHOTOS.md)).
> - The tree under "Monorepo structure" is the original sketch. The repo actually uses `apps/*` and
>   `packages/*` at the root (see the [README](../README.md)).
> - The architecture diagram in the original doc is replaced by a text description.

## The plan in one minute

By kickoff (early January 2027), team6220.org becomes a site we write in code instead of dragging and dropping in the Wix Studio editor. The public website and all our team apps will live together on it, with the apps under **team6220.org/apps**. All of the code lives in one GitHub repository that any programmer on the team can work on.

We keep using **Wix**, but only as the backend. Wix still hosts the site and stores our data (databases, member logins, form submissions, emails). It just stops being the place where we design pages. Wix calls this setup **headless**.

We get there in two steps:

1. **Prototype:** build the new site and publish it for free on GitHub Pages at **dev.team6220.org**, a test address. The real team6220.org stays exactly as it is.
2. **Switch over:** use Wix's built-in migration tool to move the same code onto Wix's hosting. One button makes it live at team6220.org, and a Switch Back button undoes it if something breaks.

**Cost: $0 extra.** We keep our current Wix Premium plan. GitHub Pages is free, and the test address is a free DNS setting.

### Why we're doing this

- **One home for everything.** Today our apps are scattered across Google Apps Script links, GitHub Pages and Google Forms. Afterward, there's one dashboard and one login.
- **Real code, real skills.** Website work becomes normal software work (React, Git, pull requests), so it's easier to share across the team and pass to future leaders.
- **Our data stays where it is.** Wix keeps our domain, plan, data and analytics, so nothing is lost in the move.

### Words you'll see in this doc

| Term | What it means here |
| --- | --- |
| Wix Studio | The drag-and-drop editor the current site is built in |
| Headless | We write the pages ourselves; Wix only provides the backend and hosting |
| Wix-managed headless | Wix hosts our coded site for us. It's the end goal. |
| Monorepo | One GitHub repository holding the website and every app |
| GitHub Pages | Free GitHub hosting we use for the prototype |
| Wix Members | The website's own login system; members sign in with Google |
| Badge | A tag on a member's account, like *Attendance Admin*, that unlocks admin actions |
| `/api` endpoint | Code that runs on Wix's server, not in the browser. It's where we check permissions and keep secret keys. |

## What will be on the site

### Public website (anyone can see it)

A full redesign of today's pages: Home (with About FIRST), Summer Camp, Our Team, Subteams, Sponsor Us, Contact and Gallery. The forms on these pages get redesigned too (see Forms).

### Team apps at team6220.org/apps

One dashboard at `/apps` links to every app. Team members sign in once and can open all of them.

| App | Address | What it does | Status | Who can use it | Data stored in |
| --- | --- | --- | --- | --- | --- |
| Apps dashboard | `/apps` | Home screen linking to every app | New | Team members | None |
| Attendance | `/apps/attendance` | Members check in and out at meetings | Exists on Apps Script; the screen moves to our site | Everyone on the team can view; only Attendance Admins start or stop sessions | Same Google Sheet as today, through Apps Script |
| Inventory | `/apps/inventory` | Tracks parts, tools and stock audits | Exists on Apps Script; moves fully | Team members view; Inventory Managers edit | Wix database (moved from Google Sheets) |
| GoldSim | `/apps/goldsim` | Open-source 2D FRC strategy and robot-design simulator | Exists in a personal GitHub repo; moves into the team repo | Anyone (public) | None |
| WingIt | `/apps/wingit` | Small existing team app | Exists in a personal GitHub repo; moves into the team repo | Team members | None |
| Scouting | `/apps/scouting` | Collects match data from the stands, even with bad Wi-Fi | Planned | Team members | Wix database |
| Pit display | `/apps/pit` | Screen for the pit TV: match schedule from Nexus plus our scouting data and The Blue Alliance / Statbotics stats | Planned | Anyone (public, read-only) | Reads other apps and FRC data sites |
| Production Tracker | `/apps/production` | Follows each robot part from design to finished. Replaces today's Google Forms and spreadsheets. | Planned | Designers submit parts; manufacturers update status | Wix database; design files stay in Google Drive as links |

**For kickoff we need:** the public site, the dashboard, Attendance, Inventory, GoldSim and WingIt. Scouting, Pit display and Production Tracker can launch after the switch. Adding an app later is just another update to the same repo.

## Decisions made

| Topic | Decision |
| --- | --- |
| Deadline | Switch to the new site before kickoff (early January 2027) |
| Frontend | Astro for pages, React for apps |
| Login | Wix Members with "Sign in with Google"; signups need approval; no team6220.org account required |
| Domain | team6220.org was bought through Wix, so all DNS changes happen in our Wix Domains page |
| Old site code | No Velo code or members area today, so nothing extra to port |
| Forms | All forms are redesigned as new Wix forms; old ones retire at the switch |
| Production Tracker files | Stay in Google Drive |
| Pit display | Public, read-only page (no login on the pit TV) |
| Web admins (GitHub + Wix) | losalfrc@gmail.com, operations@team6220.org, programming@team6220.org |

## Architecture at a glance

One repo, two hosts, three backends. (The original doc had a diagram here.) The repo deploys to GitHub Pages first, then to Wix hosting. Both talk to the same Wix backend, Apps Script keeps Attendance, and FRC data APIs come in once server endpoints exist.

## Step-by-step phases

Four phases, ending before kickoff. The current site stays live and untouched until the last step of Phase 3.

| Phase | Target window | Result |
| --- | --- | --- |
| 0. Setup | Mid-November | Repo, test address, logins and Wix settings ready |
| 1. Prototype | Mid-November to mid-December | Whole new site working at dev.team6220.org |
| 2. Migration preview | Mid-to-late December | Same site running on Wix hosting, visible only to us |
| 3. Switch over | Before kickoff | New site live at team6220.org |

These windows are a suggested schedule; the web team should adjust them.

### Phase 0: Setup

The checklist with exact menu paths and current status is in [PHASE-0.md](PHASE-0.md). In summary:

- [ ] Create the public repo `Team-6220/team6220.org` with a protected `main` branch (every change goes through a pull request with one review) and a `CODEOWNERS` file.
- [ ] Add the three web admin accounts as owners of the GitHub org and as admins on the Wix site. Turn on 2FA for each and store the recovery codes where two leads or a mentor can reach them.
- [ ] Set up the test address. In **Wix → Domains → team6220.org → Manage DNS Records**, add a CNAME record: host `dev`, value `team-6220.github.io`. In the repo's Pages settings, set the custom domain to `dev.team6220.org`, verify the domain for the GitHub org, and turn on Enforce HTTPS.
- [ ] In the Wix dashboard, open **Settings → Development & integrations → Headless Settings**. Create a headless (OAuth) client on our *current* site. Allow `https://dev.team6220.org` and `http://localhost:4321` as domains and redirect URIs. This lets the prototype read and write our real Wix data.
- [ ] Set up Wix Members: turn on Google sign-in and set new signups to "only people I approve." (Corrected: no app to add; see PHASE-0.md.)
- [ ] Create badges: `Team Member`, `Attendance Admin`, `Inventory Manager`, `Web Admin`.
- [ ] Run a one-day test (see Limits and risks) to confirm the repo layout works with the Wix CLI before building much.

### Phase 1: Prototype on dev.team6220.org

GitHub publishes the site automatically every time code merges into `main`. In this phase there's no server code, so the browser talks to Wix and Apps Script directly.

- [ ] Build the public pages and the `/apps` dashboard with login.
- [ ] Move in the existing apps, easiest first: GoldSim and WingIt (no backend), then Inventory (copy its Google Sheet data into new Wix databases), then the Attendance screen (still saving through Apps Script).
- [ ] Create the new Wix forms and connect the redesigned form pages to them (see Forms).
- [ ] Use mock data for anything that needs a private API key (Nexus, The Blue Alliance).

**Styling comes later in this phase.** Right now the main site and each app have their own assorted styling. Moving them in comes first; making them look alike waits until everything works. Before Phase 2 starts, unify it:

- [ ] Write one shared stylesheet in `packages/ui`: CSS variables for colors (team gold, #FA9504), fonts, spacing and corner radius, plus shared styles for buttons, forms, tables and cards.
- [ ] Convert the main site and each app to use those variables and components instead of their own colors and fonts.
- [ ] Check every page in light and dark mode and on a phone.

**Done when:** every public page and form works, Inventory plus Attendance survive a real team meeting, and the whole site shares one unified style.

### Phase 2: Migration preview

Wix's migration tool makes a hidden preview copy of the site that only we can see.

1. In Headless Settings, click **Start Migration**. Review the list of supported and unsupported Wix apps, then copy the prompt it gives.
2. Run `wix env pull` so the project uses our current site's data.
3. Connect our existing Astro project to Wix and add the Wix Astro integration.
4. Move admin actions into `/api` endpoints on Wix's server: badge checks, starting/stopping attendance, and Nexus and The Blue Alliance calls.
5. Release preview builds and have the team test them through **View** in Headless Settings.
6. Turn off the GitHub Pages deploy. From now on, Wix preview builds are our test site.

### Phase 3: Switch over

1. Open **Complete Migration** in Headless Settings and run `wix finalize-migration` with *only* the flags that dialog gives you. team6220.org now shows the new site.
2. In the URL Redirect Manager, add 301 redirects for any old page addresses that changed: `/summer`, `/our-team`, `/our-team/subteams`, `/sponsors-donations`, `/contact`, `/gallery`. Old links and Google results then still work.
3. Check page titles and descriptions for search engines, the cookie consent setting, Google Search Console, and analytics.
4. Submit every form once on the live site and confirm the emails arrive.
5. Delete the `dev` DNS record.

If something breaks, **Switch Back** in Headless Settings brings the old site back while we fix it.

# Technical details

Everything below is for the programmers building the site. Read the sections above first.

## Monorepo structure

One repo builds **one** deployable site, because Wix-managed hosting serves one project per domain. The Astro site sits at the repo root, where the Wix CLI expects it. Each app is a React package mounted at its own route under `/apps`.

```text
team6220.org/                    (repo root = the Astro site)
├─ src/
│  ├─ pages/
│  │  ├─ index.astro, summer.astro, our-team/, sponsors.astro, contact.astro, gallery.astro
│  │  ├─ apps/
│  │  │  ├─ index.astro          (dashboard)
│  │  │  ├─ attendance/  inventory/  goldsim/  wingit/
│  │  │  └─ pit/  scouting/  production/   (added as they're built)
│  │  └─ api/                     (Phase 2+: server endpoints, Wix hosting only)
│  └─ layouts/, components/       (site chrome, nav, login button)
├─ packages/
│  ├─ ui/            shared React components + brand tokens (gold, #FA9504, fonts)
│  └─ data/          the ONLY code that talks to Wix, Apps Script or FRC APIs
├─ apps/
│  └─ attendance/  inventory/  goldsim/  wingit/  … (one React package per app)
├─ backend/
│  └─ apps-script/attendance/      (Apps Script source, pushed with clasp)
├─ .github/workflows/              (CI, Pages deploy, scheduled jobs)
└─ package.json                    (workspaces)
```

Rules that keep it maintainable for future leadership:

- **Apps never import the Wix SDK directly.** They call `packages/data` functions like `inventory.listItems()`. In Phase 1 those functions call Wix from the browser; in Phase 2 they call `/api/*`. App UIs don't change.
- **Each app owns its folder.** A `CODEOWNERS` line per app sends PRs to that app's maintainers.
- **Bring in GoldSim and WingIt with their history.** Both live in personal GitHub repos today. Add each with `git subtree add` so no commits are lost. Then archive the personal repos with a README pointing to the team repo, and point their old GitHub Pages addresses to `/apps/goldsim` and `/apps/wingit`. GoldSim's MIT license file moves with it.
- **Brand lives in `packages/ui`.** The public site and every app pull colors and fonts from one place.

## Hosting and deployment

The same repo deploys to two places over its life. Only the build target and where privileged code runs differ.

| | Phase 1: Prototype | Phase 2–3: Production |
| --- | --- | --- |
| URL | dev.team6220.org | team6220.org (preview URL before cutover) |
| Host | GitHub Pages (static files only) | Wix-managed headless (CDN, SSL, server endpoints) |
| Astro output | Static, `site: 'https://dev.team6220.org'`, `public/CNAME` | Wix Astro integration |
| Deploy | GitHub Actions on every push to `main` | `npx wix release`, run by a Web Admin |
| PR checks | Install, typecheck, test, `astro build` | Same, plus `wix build` |
| Wix login client | Headless client we create in Phase 0 | Project's private app, made by the migration |
| Server code | None, so no secrets anywhere | `src/pages/api/*` with Wix secret env vars |
| Staging | `dev` CNAME | Wix preview deploys |
| Cost | $0 | $0 extra on the existing Premium plan |

**Workflow files to add in Phase 0:**

- `ci.yml` runs on every pull request: install, lint, test, build. Merges to `main` are blocked until it passes.
- `pages.yml` runs on push to `main` and uses GitHub's official `upload-pages-artifact` and `deploy-pages` actions. It is deleted in Phase 2.

Releases to Wix stay manual at first. Wix documents running CLI builds and tests in GitHub Actions, but we haven't confirmed a non-interactive login for `wix release` from CI. A Web Admin runs it from a laptop after a PR merges.

## Backends and data

Wix is the default backend. Attendance is the one exception: it keeps writing to the same Google Sheet through Apps Script, so its format never changes. Every app gets its own Wix CMS collections, named with an app prefix (`inventory_items`, `production_parts`, `scouting_matches`).

| App | Data lives in | Phase 1 (browser calls) | Phase 2+ (server calls) |
| --- | --- | --- | --- |
| Public pages | Wix CMS (bios, sponsors, subteams) + Media Manager | Read with a visitor token | Rendered on the server |
| Forms | New Wix forms made for the redesign | Wix Forms submission API | Same |
| Attendance | Google Sheets, written only by Apps Script | Apps Script web app; admin actions need a temporary lead passcode | `/api/attendance` checks the badge, then calls Apps Script with a server-only secret |
| Inventory | Wix CMS (one-time CSV import from the current Sheet) | Member token; collections set to site-member access | `/api/inventory` with badge checks |
| GoldSim, WingIt | None (static) | Static files | Static files |
| Production Tracker | Wix CMS for parts and status; files stay in Google Drive as links | Member token | `/api/production` |
| Scouting | Wix CMS, with an offline queue in the browser | Member token | `/api/scouting` |
| Pit display | Reads scouting + Nexus + The Blue Alliance / Statbotics | Mock data | `/api/pit` holds the keys and caches results |

**Attendance call details.** The frontend sends `POST` with `Content-Type: text/plain` and a JSON body. That keeps it a "simple" request with no CORS preflight, which Apps Script can't answer. Apps Script stays the only thing that writes to the Sheet, so the column format can't drift.

**Scheduled jobs.** Headless projects have no Wix scheduler, so jobs like Inventory's nightly backup run as GitHub Actions cron workflows that call an `/api` endpoint. Wix Automations are the alternative for simple triggers.

## Login and permissions

Everyone signs in once with **Wix Members + "Sign in with Google"**, using any Gmail account. No team6220.org account is needed. Wix Members is the website's own user system, separate from the people who edit the site in the Wix dashboard. Signups need approval, so only real team members get in. **Badges** decide who can take admin actions.

**How someone gets access:**

1. A student clicks **Log in** on team6220.org and picks Google.
2. A Web Admin approves the request under Site Members in the dashboard and gives them the `Team Member` badge.
3. Leads get extra badges (`Attendance Admin`, `Inventory Manager`) as their roles need.
4. At the end of each season, remove graduated members and clean up badges.

**What needs a login:** anything that writes data or shows team-internal info. Open-source tools like GoldSim can stay public.

| Area | Who can view | Who can take actions |
| --- | --- | --- |
| Public pages, forms | Anyone | Anyone can submit forms |
| `/apps` dashboard | Team Member | n/a |
| Attendance | Team Member (status, history) | Start or stop sessions: Attendance Admin only |
| Inventory | Team Member | Edit items and audits: Inventory Manager |
| GoldSim | Anyone | n/a |
| WingIt | Team Member | n/a |
| Production Tracker | Team Member | Designers submit; manufacturers update status |
| Scouting | Team Member | Team Member submits scouting data |
| Pit display | Anyone (public, read-only) | n/a |
| Site admin tools | Web Admin | Web Admin |

**Enforcement differs by phase.**

- **Phase 1:** only Wix CMS collection permissions ("site members") and the Apps Script passcode actually block anyone. Hiding a button from people without a badge is cosmetic, so prototype data shouldn't be sensitive.
- **Phase 2+:** every action is checked in an `/api` endpoint. The server reads the member's badges and refuses the request if the badge is missing. This is how "only Attendance Admins can start attendance" becomes a real rule.

## Forms

All forms are redesigned along with the new site. Each one is a **new Wix form** created in the Wix dashboard, and our React form page sends its answers to it through the Wix Forms API. Wix stores the submissions, adds the person to our contacts and sends the notification emails. The old forms retire at the switch, and their past submissions stay in the dashboard.

**Notification process: every form emails a team inbox, not one person.**

1. In Google Workspace, create one Google Group per topic, like `sponsors@team6220.org` and `outreach@team6220.org`. Allow external members so leads can join with personal Gmail. Each year, update group membership there, not in Wix.
2. Add each group address as a **contact** in Wix. Wix automations can only email people who are site collaborators or contacts.
3. For each form, create an automation: **Form submitted → Send an email**, sent to that group.
4. Turn on **Dynamic reply-to → Contact email**, so hitting Reply answers the person who filled out the form.
5. Give the web admin accounts Wix Inbox access as a backup view of every submission.

The exact list of forms comes from the new site design. A likely starting point:

| Form | Email goes to | Owner |
| --- | --- | --- |
| Contact | contact@ group | Business lead |
| Sponsor / donation inquiry | sponsors@ group | Business lead |
| Join the team (Los Al USD students) | recruiting@ group | Captains |
| Summer camp | outreach@ group | Outreach lead |

**Testing rule:** during Phase 1, point each automation's email at a web admin account only. Switch to the real groups right before the switch-over.

## Secrets and security rules

The repo is public, so assume anyone can read every file and every byte shipped to a browser.

- **Safe to commit:** the Wix headless *client ID*. It identifies the site and isn't a password.
- **Never commit or ship to the browser:** Wix API keys, the Nexus and The Blue Alliance keys, and the Apps Script shared secret. They live in Wix secret environment variables and are used only inside `/api` endpoints. Until Phase 2, nothing uses them.
- **The Phase 1 Attendance passcode is temporary.** Keep it in Apps Script Script Properties, not the repo. Rotate it after the prototype and delete it at cutover.
- **Wix CMS permissions are the real lock in Phase 1.** Set app collections to site-member read/write, never "Anyone."
- **Admin access:** the three shared web admin accounts (losalfrc@gmail.com, operations@team6220.org, programming@team6220.org) are the GitHub org owners and Wix site admins, with 2FA on, so graduating seniors never lock the team out.
- **Turn on secret scanning** and Dependabot on the repo.

## Limits, risks and things to verify

None of these block the plan. The first four should be checked in a Phase 0 test spike before we build much.

| Item | Why it matters | What we do |
| --- | --- | --- |
| Reserved URL paths | Wix serves some paths itself; those never reach our code | Check Wix's reserved-path list against `/apps` and `/api` before routing |
| Wix CLI + npm workspaces | The CLI expects a standard Astro layout | Test linking a workspace-based repo in Phase 0; fall back to `src/apps/` folders if needed |
| `wix release` from CI | Not confirmed for automated deploys | A web admin runs releases manually until confirmed |
| Offline scouting | Event Wi-Fi is unreliable | Confirm a service worker works on Wix hosting |
| Server limits: 1000 CPU ms and 20 sub-requests per request | The pit display pulls from several APIs | Cache results; one `/api` call per data source |
| Preview builds' server code stops after 3 days | A stale preview breaks on test day | Re-release the preview the day before a team test |
| Badges API is in developer preview | It may change | All badge calls live in `packages/data` |
| Unsupported Wix apps | Some widgets don't render on a headless site | Review the list shown at Start Migration |
| Cookie consent defaults to "grant all" on headless | Privacy, especially for student visitors | Set the policy before Complete Migration |
| Scheduled GitHub workflows pause after about 60 days with no repo activity | Nightly backups could stop silently over summer | Add a backup-health check to the dashboard |
| Tight timeline to kickoff | About 8 weeks, including winter break | Launch only the kickoff apps first; add the rest after the switch |

## Sources

- [Wix Headless: Moving Your Site to a Custom Frontend](https://support.wix.com/en/article/wix-headless-moving-your-site-to-a-custom-frontend)
- [Post-Migration Checklist: Wix Studio and Editor Sites to Headless](https://dev.wix.com/docs/go-headless/wix-managed-headless/full-integration-astro/get-started/post-migration-checklist-wix-studio-and-editor-sites-to-headless)
- [About Wix-Managed Headless](https://dev.wix.com/docs/go-headless/wix-managed-headless/about-wix-managed-headless)
- [Choose Your Development Path](https://dev.wix.com/docs/go-headless/get-started/choose-your-development-path)
- [Integrate the Wix CLI into CI/CD Workflows](https://dev.wix.com/docs/go-headless/wix-managed-headless/full-integration-astro/development/integrate-the-cli-into-ci-cd-workflows)
- [Build Custom Login and Signup Pages with the Astro Integration](https://dev.wix.com/docs/go-headless/authentication/members/custom-login-page/build-custom-login-with-the-astro-integration)
- [Wix Members Badges API](https://dev.wix.com/docs/sdk/backend-modules/members/badges)
- [Wix Forms: Choosing Who Gets Notified About Form Submissions](https://support.wix.com/en/article/wix-forms-choosing-who-gets-notified-about-form-submissions)
- [Connecting a Subdomain to an External Resource](https://support.wix.com/en/article/connecting-a-subdomain-to-an-external-resource)
- [How Much Does Wix Headless Cost](https://www.wix.com/blog/how-much-does-wix-headless-cost)
