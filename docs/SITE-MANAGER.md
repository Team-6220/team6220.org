# Site Manager app (plan)

A Web Admin app at `/apps/site` where webmasters change the website's regular content without editing code.
It started as an idea at the end of issue #69 ("Maybe a new app dedicated to site management"). The more
the backend grows, the more the team needs it, so it now has its own plan.

**Status (Nov 2026):** foundations and the **Summer camp** editor are built (#110, #111). Today the app runs in
**demo mode**: it validates, shows what would change and says "demo: no pull request is opened". It starts opening real
pull requests once the Phase 2 server (`output: "server"`) and the GitHub App exist (see "Turn on real pull requests").
Sponsors, Merch and Resources are next (#112 to #114): each is one more area (see "Add a new editable area").

| Piece | Where | Real or mocked today |
| --- | --- | --- |
| Content files | `sites/main/content/*.json` (only `summer-camp.json` so far) | Real. Public pages read them at build time |
| Schemas, diff, rendering | `packages/content` (Zod; `pnpm content:check` in CI) | Real |
| Branch, commit, pull request logic | `packages/data/src/site/` (`proposeChange`, `GithubSiteStore`) | Real code, tested with a fake GitHub; never run against github.com yet |
| `/api/site` | `src/server/site-route.ts`, handler `handleSiteRequest` in `packages/data` | Real code and tests; the route is only added when Astro runs with `output: "server"` |
| Web Admin check | `createWixVerifier` (same Wix calls as the attendance Apps Script) | Real code, tested with a fake Wix; never run against Wix yet |
| `/apps/site` editor | `apps/site` (form generated from the schema) | Real UI; Submit uses `MockSiteStore` (in memory) |

## Using it (Web Admins)

1. Open `/apps/site` (the **Site Manager** card on `/apps` appears for Web Admins) and sign in.
2. Pick the part of the site, edit the form. Errors show under the field; **What will change** lists every change.
3. **Submit**. In a real deployment this opens a pull request named `site-manager/<area>-<yyyymmdd>-<who>` whose
   description says who asked and what changed. A webmaster reviews and merges it; the site rebuilds. To undo, revert
   the pull request. The page links to the open Site Manager pull requests on GitHub.
4. Text fields accept `**bold**` and `[label](https://link)` (links must be `https://` or start with `/`). Nothing else
   is treated as formatting, and HTML is never allowed.

Developers can try the editor without signing in at `/apps/site?demo=admin` (demo mode: nothing real is touched).

## Why

Today every content change is a code change: edit a file, open a pull request, wait for CI, merge. That is
fine for developers and a wall for everyone else. These things change every season or even every month:

- the new robot (and its photos, CAD link and best finish),
- sponsor logos and tiers,
- summer camp: on/off switch, year, links, text,
- the merch list on `/merch`,
- resources and links, history, gallery albums.

The goal: a Web Admin signs in, edits a form and submits it, with no command line and no Git knowledge. Developers keep working in code for layout and features.

## Who can use it

Web Admins only (the `Web Admin` badge). Per-area leads (for example a sponsorship lead who edits only
Sponsors) are out of scope for now (team decision, Nov 2026).

## What it manages

| Area | Where it lives today | Fields the app edits | First batch |
| --- | --- | --- | --- |
| Summer camp | `sites/main/config/site.ts` + `sections/summer-camp/` | on/off switch, title/year, registration links, text blocks | Yes |
| Sponsors | `sections/sponsors/Sponsors.astro`, home marquee | logo (color) per sponsor, name, tier, link, order, season | Yes |
| Merch | `sections/merch/Merch.astro` (hand-written) | item, image, price, link, order | Yes |
| Resources and links | `sites/main/data/resources.ts` | sections, links, archive items, order | Yes |
| Robots | `sites/main/data/robots.ts` | year, game, name, finish, events, album, image, alt, CAD link, quote | Later |
| History / timeline | `sections/about/History.astro` | entries (year, title, text), newest first | Later |
| Gallery | Wix Media / Google Drive (#8) | which album folders appear and in what order | Later |

Not in this app: page layout, new sections, styling, app code, forms (Wix dashboard) and team member
accounts (Wix Site Members).

## How it works: the app opens pull requests (decided)

The repo stays the single source of truth. The app is a friendly editor for content files, and "Submit"
opens a pull request. Nothing changes on the live site until the pull request is merged.

```
Web Admin ──► /apps/site (forms) ──► /api/site (checks Web Admin badge) ──► GitHub: branch + commit + PR
                                                                                  │
                                                      CI + Wix preview build ◄────┘   merge ► site rebuilds
```

1. **Content moves out of code into data files.** Each area gets a plain JSON file under
   `sites/main/content/<area>.json` (for example `summer-camp.json`, `sponsors.json`). Pages import the
   JSON. Today's hand-written `.astro` and `.ts` content is converted once and checked page-for-page.
   Each file has a schema (Zod) that the app and CI both validate, so a bad edit can't break the build.
2. **The editor.** `/apps/site` shows a form per area built from the same schema, with image upload and
   reordering. The form edits the file's current contents from `main`.
3. **Submit.** The browser sends the new JSON to `/api/site`. The server verifies the member's Wix token
   and `Web Admin` badge, validates against the schema, then uses the GitHub API to create a branch
   (`site-manager/<area>-<date>-<who>`), commit the file (and any images) and open a pull request that
   names who asked for it. The commit is attributed to the app; the PR body says which admin made it.
4. **Review and publish.** CI runs on the PR. In Phase 2 the PR also gets a Wix preview build link, so the
   admin sees the real site with the change before merging. A webmaster merges (this is also where
   "undo" lives: revert the PR).
5. **Change history** comes free from Git: who, what, when, and one-click revert. No separate history
   feature is built (team decision, Nov 2026).

**Why this fits the project:** no second copy of content to keep in sync, review and rollback already
exist, previews are the Phase 2 PR previews, and the live site stays static and fast.

**Dependencies and consequences:**

- Needs a server endpoint to hold the GitHub credential, so it starts in **Phase 2** (`/api/site`).
  Until then content stays in code and is edited by pull request, as today.
- The GitHub credential is a secret. Preferred: a GitHub App installed on this repo only, with
  *Contents* and *Pull requests* write access. It is stored as a Wix secret, never in the repo or browser.
- Merging is a deliberate step, not instant. Small edits take a minute or two to appear (CI + rebuild).
- Images: small ones (sponsor logos, robot renders, merch photos) are committed with the PR, in the media
  folders `sync-media` already publishes. Large media (galleries) stays in Wix Media / Google Drive (#8).
- Only the Site Manager edits `sites/main/content/*.json`; developers keep editing code, templates and styles.

## Build order

1. **Foundations:** content JSON + schemas package, a `site.*` module (read file, validate, commit/PR via the
   GitHub API) with a mock mode for local development, `/api/site` with the badge check, the `/apps/site`
   shell and a dashboard card.
2. **Summer camp**, then **Sponsors**, then **Merch**, then **Resources and links** (first batch).
3. **Later:** Robots, History, Gallery albums.

Each area is its own issue: convert the content to JSON, make the page read it, build the form, and check
the page is identical before and after.

## Decisions (Nov 2026)

- **A webmaster merges every pull request.** No auto-merge: a typo would reach the public site on merge.
- **GitHub App** (installed on this repo only, not tied to one person's account). An org owner installs it when `/api/site` is built.
- **Logos and photos** are committed with the pull request when small (sponsor logos, merch photos, robot renders). Large galleries stay in Wix Media / Google Drive (#8).

Nothing is left open for the first batch. These are recorded in [MIGRATION-PLAN.md](MIGRATION-PLAN.md).

## Add a new editable area (sponsors, merch, resources, ...)

An area is one JSON file, one Zod schema and one registry line. The form, validation, preview, API and pull request come
for free. Do this in one pull request per area (it is its own issue: #112 sponsors, #113 merch, #114 resources).

1. **Write the schema** in `packages/content/src/<area>.ts` (copy `summer-camp.ts`). Use `.meta({ title })` for the
   label of each field, `.meta({ ui: "textarea" })` for long text, `z.array(...)` for lists (the form adds reorder and
   remove buttons) and `z.discriminatedUnion("type", [...])` for lists of mixed kinds. Reuse `richText` and the link
   check (`isSafeHref`) for anything that becomes a link. Keep it to `object`, `array`, `string`, `boolean`, `const` and
   `oneOf`: those are what the form renders (`apps/site/src/Field.tsx` and `schema.ts`; extend them for new field types).
2. **Move the content** out of code into `sites/main/content/<area>.json`. Run `pnpm content:check --write` to put the
   file in the canonical format (two-space JSON, final newline) so later edits make small pull request diffs.
3. **Register it** in `AREAS` in `packages/content/src/index.ts`: `id` (also the file name and the URL/branch name),
   `label`, `path`, `schema`, and `initial` (the imported JSON). The area then shows up in the Site Manager's list and
   `/api/site` accepts it. CI fails if a JSON file has no registered schema or the other way round.
4. **Make the page read it.** Validate with the schema where the page imports the JSON (see `SUMMER_CAMP` in
   `sites/main/config/site.ts`: `summerCamp.parse(json)`), so an invalid file fails the build. If the page needs HTML,
   build it with a pure function in the content package (like `renderBlocks`) so it is unit-testable.
5. **Prove the page did not change.** Build before your change (`pnpm build`, copy `dist/`), build after, and run
   `diff -r` on the two `dist/` folders. Only files for pages you meant to change may differ (hashed `_astro` file
   names under `/apps` change whenever shared app code changes; that is expected). Test the "on" and "off" states if
   the content has a switch.
6. **Images** (sponsor logos, merch photos): small ones go in `sites/main/media/` and travel with the pull request.
   `site.submit(area, value, images)` takes `{ path, base64 }` files; the server accepts only png, jpg, webp, gif and
   avif under `sites/main/media/`, at most 2 MB each and 10 per change (larger media stays in Wix Media / Drive).
   The summer camp has no image fields, so the form has no uploader yet: add one to `Field.tsx` with the first area
   that needs it.
7. **Tests:** add the area to `packages/content/test` (valid, invalid, rendering) and run `pnpm content:check`,
   `pnpm -r --if-present test`, `pnpm check` and `pnpm build`.

## Turn on real pull requests (needs the owner, Phase 2)

Nothing here can be done from the repo; it needs an org owner and the Phase 2 server.

1. **Create the GitHub App** (org owner): GitHub, Team-6220 org, Settings, Developer settings, GitHub Apps, New GitHub App.
   Name it for example "Team 6220 Site Manager"; homepage `https://www.team6220.org`; uncheck Webhook "Active".
   Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**, Metadata: Read (automatic).
   Install on this account only. Create it.
2. **Install it** on the Team-6220 org, selecting **only the `team6220.org` repository**. Note the *App ID* (app page)
   and the *Installation ID* (the number at the end of the installation's settings URL).
3. **Generate a private key** on the app page (downloads a `.pem`). Convert it once, because the server uses the Web
   Crypto API: `openssl pkcs8 -topk8 -nocrypt -in downloaded-key.pem -out site-manager-key-pkcs8.pem`.
4. **Store three secrets in Wix** (server secrets, never in the repo): `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`,
   `GITHUB_APP_PRIVATE_KEY` (the converted PEM; `\n` for newlines is fine). Alternative for a quick test: one
   `SITE_MANAGER_GITHUB_TOKEN` with the same two permissions. Optional `SITE_MANAGER_GITHUB_REPO` (default
   `Team-6220/team6220.org`). The server asks GitHub for a one-hour installation token on each request, so nothing expires.
5. **Phase 2 build:** set `output: "server"` with the Wix adapter in `astro.config.mjs` (the `site-api` integration then
   adds `/api/site`), set the build variable `PUBLIC_SITE_MANAGER_API=on`, and check `readEnv()` in
   `src/server/site-route.ts` reads the secrets the way Wix exposes them (swap that one function if Wix only offers
   `astro:env/server` `getSecret`).
6. **Branch protection:** keep `ci` required and a webmaster review on `main`; the app can only open pull requests and
   can't merge them. Add `/apps/site/`, `packages/content/` and `sites/main/content/` to CODEOWNERS if you want.
7. **Try it:** sign in as a Web Admin, change the summer camp title, Submit, and open the pull request. Then check that a
   Team Member without the badge gets "Web Admins only" and that `/api/site` answers 403 to them.

Until then everything above works in demo mode and the tests cover the logic against fake GitHub and Wix servers.
