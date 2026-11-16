# Phase 2: moving the site to Wix hosting

The checklist for Phase 2 of the [migration plan](MIGRATION-PLAN.md): the same repo, served by Wix's hosting with server
code, first as a hidden preview and then live at www.team6220.org (Phase 3). Decisions were made with the team captain on
Nov 16, 2026. The apps overhaul's backend plan (the "Team 6220 Apps: Backend Plan" doc, and #259) builds on top of this.

## Decisions

| Topic | Decision | Why |
| --- | --- | --- |
| Main address | **www.team6220.org**; team6220.org redirects to it | What Wix serves today and what Google has indexed. Push notifications and home-screen apps belong to one exact address, so this is set before push launches |
| Apps address | www.team6220.org/apps (no subdomain) | Decided in the overhaul |
| Sign-in | **Wix's built-in login** from the Astro integration (`/api/auth/login`, session in a cookie), with **Google and email**; Facebook turned off | Every `/api` endpoint knows who is signed in without extra calls to Wix (each request may make only 20). `packages/data/src/auth.ts` was written for this switch, so app code stays the same. Members sign in again once after the move |
| Server code | **All of ops-api moves to `/api` endpoints** before go-live, one-to-one with today's actions | One backend on Wix. attendance-api and the sponsor-email scripts stay on Apps Script (overhaul decision) |
| Timer | **Apps Script time triggers** call `/api` endpoints with a shared secret | Wix headless sites have no scheduler, and Wix Automations can repeat at most once a day |
| GitHub sync | **GitHub webhooks** (signature checked) replace the 5-minute poll | Instant; fewer requests |
| Apollo | This work also updates the Team-6220/apollo repo to call the new `/api` address | Same request format, new address |
| Secrets | Wix **Secrets Manager**, read in `/api` code with elevated permissions | Wix's documented way for headless server code; nothing secret in the repo |
| Cookies | **Essential only by default**, analytics only if a visitor allows it, with a small notice | Many visitors are students. Wix's default on a new headless site allows everything |
| Reviewing changes | A **Wix preview link on every pull request** (GitHub Action) | GitHub Pages can't run the server-side site. dev.team6220.org stays at its last version and is removed at go-live |
| Wix CLI | Runs on a webmaster's computer (Node 24), shared with Claude through Remote Control | The CLI needs a Wix login |
| Form emails | Stay with operations@team6220.org | Topic groups (#216) can come later |
| Old Wix apps | Leave **Wix Hotels** and **Wix Invoices** alone | They're hidden system pieces (not visible in the dashboard) and don't show on the new site |
| Open signups (#100) | **Manual approval stays on** until inventory is locked (below), then anyone may sign up | All 17 `inventory_*` collections let any signed-in member write. Today manual approval is the only lock |
| Go-live | As soon as the preview passes team testing | Leaves the most time before kickoff (Jan 9) |

## Two builds of the same pages

- **Wix build** (`pnpm build`, or `wix build`/`wix preview`): `output: "server"` with Wix's integration and hosting
  adapter, as in Wix's own Astro template. Pages render on each request: Wix's middleware adds the dashboard's SEO
  tags, analytics and cookie-consent scripts then, and it can't run while pages are pre-built (it fails with "Could
  not fetch site scripts"). Needs the values from `wix env pull` in `.env.local`.
- **Static build** (`pnpm build:static`; `pnpm check` uses the same mode): plain HTML in `dist/` without Wix's parts.
  The e2e tests, the redirect check and CI use it, so they need no Wix secrets. `SITE_BUILD=static` switches it in
  `astro.config.mjs`; `scripts/astro-static.mjs` sets it on every platform.
- Wix's template turns off Astro's origin check (`security.checkOrigin: false`). Once sign-in lives in a cookie,
  **every `/api` endpoint that changes data checks the request's `Origin`** itself.
- The Wix CLI needs Node 24.22.1 or newer; the site itself still builds on Node 22.

## Limits that shape the code (from Wix's docs)

- **1000 CPU ms and 20 sub-requests per request** (calls to Wix, Discord, GitHub and so on). Long jobs are split into
  small requests; the timer calls them in turns.
- **No scheduler** on headless projects. Use the Apps Script timer above.
- **Preview builds' server code stops after 3 days.** Re-release a preview the day before a team test.
- **Reserved paths:** never use `/sw.js`, `/_api`, `/_wix` or `/api/auth/*` for our own files. Service workers get
  their own name, such as `/apps/sw.js` (scope `/apps/`).
- **Migration uses two sites.** The *parent site* (our current site) keeps all data, members and forms. The *preview
  site* only hosts the preview. Code must use the credentials from `wix env pull`, never the site ID in `wix.config.json`.

## Steps

### A. Before any code (webmaster)

- [x] Install **Node 24** (24.22.1 or newer).
- [ ] Share `team6220.org` with Claude: Claude desktop app → Settings → Claude Code → Remote Control.
- [x] Wix dashboard → Settings → Development & integrations → **Headless Settings → Start Migration** (done Nov 16; preview site `e2f3631f-a8c5-4c5a-bea2-bc77ade591a3`, in `wix.config.json`). Check the
      supported/unsupported apps list and copy the prompt it gives.
- [x] Site members settings: sign-in with **Google and email**; "Only people I manually approve" (on again, Nov 16, until inventory is locked).
- [x] Facebook sign-in off: in the current site's Wix Editor → Signup & Login settings → Social → turn off Facebook → Publish.

### B. Wire the repo to Wix (on the shared computer)

- [x] `wix env pull` (writes `.env.local`; never commit it). Done Nov 16 on the captain's PC.
- [x] Add `@wix/astro`, `@wix/astro-pages`, `@wix/astro-wix-hosting-adapter`, `@wix/essentials`, `@wix/sdk`,
      `@wix/dashboard` and `@wix/cli`; `output: "server"`; allow `workerd` and `esbuild` builds in pnpm.
- [x] Static build for tests and CI (`pnpm build:static`), so they need no Wix secrets.
- [x] `wix build`, then `wix preview` (preview only uploads what is already built, so always build first). First
      preview Nov 16: every page renders. Wix drops trailing slashes (`/about/` → `/about`, one redirect) and doesn't
      serve a folder's `index.html`, so `/apps/goldsim` and `/apps/wingit` redirect to their `index.html`.

### C. Server code

- [x] Sign-in: `auth.ts` uses `/api/auth/login` and `/api/auth/logout`; the browser client reads the `wixSession`
      cookie; `/api/site` reads the member and badges from the session and refuses cross-site requests
      (`Sec-Fetch-Site`). `WIX_CLIENT_ID` is the new client (`74e98aee-…`) in `config.ts`, the forms in `site-b.js`, and
      the Apps Scripts' defaults. **To do:** test sign-in on a preview.
- [x] Secrets: `src/server/wix-secrets.ts` reads Wix Secrets Manager values with elevated permissions, one secret
      per call, only when an action needs it. Form signups use an elevated Wix query, so they need no API key.
- [ ] Move every ops-api action to `/api/<area>` (one-to-one, same names and answers), with the same tests.
      `packages/data` stays the only code that calls them.
- [ ] Timer endpoint(s) for the Apps Script triggers, checked with a shared secret.
- [ ] GitHub webhook endpoint with signature checking.
- [x] **Inventory behind the server (#100), code:** `/api/inventory` (`src/server/inventory-route.ts`, logic in
      `packages/data/src/inventory/server-api.ts` and `server-writes.ts`) does every inventory write after checking the
      Team Member badge; the browser reads the collections directly and sends changes there (`remote-store.ts`, used on
      the Wix build). Writes use elevated plain `@wix/data` functions. Covered by `inventory-server.test.ts`.
- [ ] **Inventory lock, Wix side:** (1) on a preview, edit an inventory part and check the change goes to
      `/api/inventory` and sticks; (2) set the 17 `inventory_*` collections to **Admin-only write** (read stays
      Site member); (3) check the preview again. **Timing:** dev.team6220.org (Phase 1, direct writes) stops being able
      to change inventory once step 2 is done, so do it at go-live or when Inventory has moved to the new site. Check
      the other app collections (`icarus_*`, `bom_*`, `production_*`, `ops_*`) the same way. Only then turn on open signups.
- [ ] Cookie policy set to essential-only; a small notice with a link to choose.
- [ ] Apollo repo: point its team-apps calls at the new address.

### D. Review and testing

- [ ] GitHub Action: `wix preview` on every pull request, link posted on the PR; `pages.yml` removed.
- [ ] Team test on a fresh preview (sign-in, every app, every form).

### E. Go-live (Phase 3)

- [ ] attendance-api (Apps Script): set the Script Property `WIX_CLIENT_ID` to `74e98aee-3daa-4452-bf00-f13523cae9c5`
      (the new login client) right after the switch. Not before: dev.team6220.org still signs in with the old client.

Follow [MIGRATION-PLAN.md](MIGRATION-PLAN.md#phase-3-switch-over): Complete Migration with only the flags the dialog
gives, 301 redirects for old pages, SEO check, submit every form once, delete the `dev` DNS record.

## Open checks (answered while building)

- Can the `web-push` package (or a Web Crypto version of it) run in Wix's server runtime? Needed for push after go-live.
- Do the allowed addresses for the built-in login need anything besides www.team6220.org and the preview address?
- Does `/apps/sw.js` get served with the right content type and `Service-Worker-Allowed` header where needed?
