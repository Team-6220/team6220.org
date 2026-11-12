# Troubleshooting

Errors we have actually hit, what they mean, and the fix. Search this page (Ctrl/Cmd+F) for the words in your error.
If yours is not here, fix it and add it.

Jump to: [Setup and build](#setup-and-build) · [Version pins](#version-pins) · [Login and Wix](#login-and-wix) ·
[Wix hosting (Phase 2)](#wix-hosting-and-the-cli-phase-2) · [Apps](#apps) · [Publishing](#publishing)

---

## Setup and build

### Node version errors

- The repo needs **Node 22 or newer** (`.nvmrc` is `22`; `package.json` `engines.node` is `>=22.23.4`). CI installs the
  version in `.nvmrc`. Check `node -v`; with a version switcher run `nvm use` in the repo.
- The one-time Inventory import script imports TypeScript files directly and needs **Node 22.18 or newer**.
- The **Wix CLI needs Node 24.22.1 or newer** (`@wix/cli`, `headless link`). This is not needed until Phase 2; when the Wix
  packages are added the repo moves to Node 24 ([WIX-CLI-SPIKE.md](WIX-CLI-SPIKE.md)).
- Symptoms of the wrong version: syntax errors from tools, "Unsupported engine" warnings, or a Wix CLI command refusing to
  run.

### `ERR_PNPM_OUTDATED_LOCKFILE` / CI fails at "pnpm install --frozen-lockfile"

You changed `package.json` (or a workspace package's) without updating `pnpm-lock.yaml`. Run `pnpm install` locally and
**commit the updated lockfile**. CI is strict on purpose.

### `pnpm check` crashes with an `@emnapi/runtime` error

Astro's checker crashes with the 2.0 beta of `@emnapi/runtime` that pnpm would otherwise pick. `pnpm-workspace.yaml` pins it
to `1.11.3` under `overrides`. Do not delete the override until `@astrojs/check` fixes it (README, "Version notes").

### `pnpm dev` works but my change to a media file does not show

Media is copied into `public/assets/` when Astro **starts**. Edit the source (`sites/main/media`, `apps/<name>/media`,
`packages/assets/...`), then restart `pnpm dev`. Never edit `public/assets/`; it is erased and regenerated every start.

### Build error: "Wix calls only run in the browser in Phase 1 (use client:only)"

Code that touches Wix (`auth`, `attendance`, `inventory`, ...) ran while Astro was building static HTML, where there is no
browser. Mount the React component with `client:only="react"` and keep Wix calls inside `useEffect` or event handlers.

### GoldSim fails to build (cannot find Vite, or `npm ci` errors)

`pnpm build` runs `npm ci` in `apps/goldsim` if `apps/goldsim/node_modules` is missing, and builds it with a cleaned
environment (Astro sets `NODE_ENV=production`, which would make `npm ci` skip Vite, so `integrations/build-apps.mjs`
removes it). If it still fails: delete `apps/goldsim/node_modules` and run `pnpm build` again, or run `npm ci` and `npm run
build` inside `apps/goldsim` to see the error directly. `pnpm install` never touches GoldSim (it is excluded from the pnpm
workspace).

### `/apps/goldsim` or `/apps/wingit` is a 404 on `pnpm dev`

By design: those two are added to the site only by `pnpm build` (`integrations/build-apps.mjs`). To check them as the site
serves them: `pnpm build && pnpm preview`, then open `/apps/goldsim/` and `/apps/wingit/`.

### The gallery shows broken pictures on my computer

The gallery albums (`/gal/<album>/NN.webp`) are not in git yet (`public/gal/` is empty; moving media to Wix and Google
Drive is issue #8). The homepage photos are in the repo and work.

---

## Version pins

These combinations are pinned for reasons. Check before accepting a Dependabot bump:

| Pin | Why |
| --- | --- |
| **Astro 7** and **React 18** | `@wix/astro` (Phase 2) requires `astro ^7.2` and `react ^18.3`. Do not use React 19 |
| **`@astrojs/react` 7.x** with Astro 7 | Version 4.x pulls in Vite 6 and breaks the build with `'vite' does not provide an export named 'esmExternalRequirePlugin'`. (`headless link` also wrote `@astrojs/react ^6`; use 7.) |
| **TypeScript 6** | `astro check` does not support TypeScript 7 yet |
| `@emnapi/runtime` **1.11.3** | See above |
| **Node 22 now, 24 for the Wix CLI** | See above |

---

## Login and Wix

### Redirect URI rejected

Symptom: you press **Sign in**, the Wix page (or the callback page) says the redirect URI or domain is not allowed, or the
callback page shows the error text Wix returned.

Cause: Wix only sends people back to addresses listed on the headless client, and the match must be **exact** (scheme,
host, **port**, path, no stray trailing slash). Typical reasons: you opened the site at a new address (a different local
port because 4321 was busy, a preview URL, `www`, `http` vs `https`), or the list was edited.

Fix: Wix dashboard → **Settings → Development & integrations → Headless Settings** → the client → **Settings** → add both
`<origin>` as an allowed domain and `<origin>/apps/login/callback` as an *Allowed authorization redirect URI*. Allowed today:
`https://dev.team6220.org` and `http://localhost:4321` (and their `/apps/login/callback`). Full steps in
[WIX-SETUP.md](WIX-SETUP.md#headless-client-and-redirect-uris). Locally the easiest fix is to stop whatever is using port
4321 so `pnpm dev` gets the allowed port.

### The dashboard says "Waiting for approval"

The person signed in, but they are not `APPROVED` with the `Team Member` badge. A Web Admin must approve them and add the
badge ([WIX-SETUP.md](WIX-SETUP.md#site-members-and-approving-people)). Then reload.

### "Sign-in needs browser storage"

The page tried to save the login state in `sessionStorage`/`localStorage` and the browser refused (private window or blocked
site data). Use a normal window or allow site data.

### "The sign-in started in another browser or tab" / "This page finishes signing in"

The callback page was opened without the matching login attempt (opened directly, bookmarked, or the login began in another
tab). Start again from the **Sign in** button on `/apps`.

### I removed someone's badge but they can still use Attendance

The attendance API caches a successful check for up to 5 minutes (badge lists for an hour). Wait five minutes.

### A member can sign in on one device and not another

Tokens live in that browser's `localStorage`. A different browser or a cleared cache means signing in again.

---

## Wix hosting and the CLI (Phase 2)

None of this is in the repo yet; these are lessons from the Phase 0 test ([WIX-CLI-SPIKE.md](WIX-CLI-SPIKE.md)) so you do not
repeat them.

### `/sw.js` service worker never stays installed

Wix hosting **takes over `/sw.js`**: when a browser asks for it as a service worker, Wix ignores our file and serves its own
worker that unregisters itself and reloads the page. A plain `curl` of `/sw.js` still shows our file, which hides the
problem. **Name every worker something else**, for example `/apps/scouting/sw.js` (scope `/apps/scouting/`) or
`/scouting-sw.js`, served as `application/javascript` with `Cache-Control: no-store, no-cache`. Offline scouting depends on
this.

### Reserved Wix paths

Wix serves some addresses itself, so a page or endpoint there never reaches our code:

- `/_api/*`, `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout`, `/api/auth/logout-callback`, `/checkout`,
  `/__ecom/checkout`, `/_paylink/*`, `/_proposal/*`, `/robots.txt`, `/sitemap.xml`, `*-sitemap.xml`, everything under `/_wix/`,
  and the integration's admin path.
- `/.well-known/acme-challenge/*`, `/.well-known/apple-developer-merchantid-domain-association`,
  `/.well-known/assetlinks.json`, `/.well-known/connection-check/*`.
- `/sw.js` (see above).

Our rules: apps live under `/apps/*`; our server endpoints go under `/api/<name>`, never `/api/auth/*`; never use `/_api` or
`/_wix` (not even as a media folder name). That is also why the login callback is `/apps/login/callback` and not under
`/api/auth/`.

### Every page says "Internal Server Error" on a Wix preview

The project was left at `output: "static"`. The Wix adapter needs `output: "server"`. Mark pages that don't need the server
with `export const prerender = true`.

### `@wix/astro` refuses to build ("WIX_CLIENT_ID")

It needs `WIX_CLIENT_ID` in the environment. Locally run `wix env pull` (writes the git-ignored `.env.local`); in CI make it
a repository secret.

### pnpm skips install scripts for `workerd`

pnpm 10 blocks install scripts by default; the Wix adapter's local runtime (`workerd`) needs one. Allow it with
`pnpm approve-builds` or `onlyBuiltDependencies`.

### `wix headless link` changed my repo / created a new site

It rewrites `package.json` scripts, installs with the wrong tool and **provisions a brand-new Wix site**. Don't run it in the
real repo. For the real move, use **Headless Settings → Start Migration** on the existing site. Its `pnpm install` can also
fail with `ERR_PNPM_OUTDATED_LOCKFILE`.

### Uploads fail with fetch failed

`wix preview` or `wix release` stops with `FailedToUploadStaticFiles ... fetch failed`. Node's `fetch` ignores proxy settings
unless you set **`NODE_USE_ENV_PROXY=1`**. Set it (with `HTTPS_PROXY` already configured) when running the CLI from a
sandbox, corporate network or AI tool that routes traffic through an HTTP proxy. `wix login` and later commands need
`manage.wix.com` and `www.wixapis.com`.

### A preview worked and now it doesn't

Server code on preview builds stops after about **3 days**. Re-release the preview before a team test.

---

## Apps

### Attendance says "Not connected yet" or "Attendance isn't connected to its server yet"

`ATTENDANCE_API_URL` is empty or not a `https://script.google.com/macros/s/.../exec` address. Check
`packages/data/src/config.ts` (`ATTENDANCE_API_URL_DEFAULT`) or the `PUBLIC_ATTENDANCE_API_URL` build variable, and see
[APPS-SCRIPT.md](APPS-SCRIPT.md). To try the screens without a server, open `/apps/attendance?demo=admin` (also `member`,
`pending`, `signed-out`; `?demo=off` leaves demo mode).

### Attendance errors by code

The API answers `{ ok: false, error, message }` with `error` one of `signed-out`, `pending`, `forbidden` (missing
badge), `kiosk-closed` (open the kiosk again), `not-configured` (a Script Property such as `SHEET_ID` is missing),
`bad-request`, `busy` (two scans at once, try again), `wix-unavailable` (Wix didn't answer) and `server-error`. See the
[attendance-api README](../backend/apps-script/attendance-api/README.md).

### I changed the Apps Script but nothing changed

You saved code but did not redeploy. **Deploy → Manage deployments →** pencil → **Version: New version → Deploy.** Do not
choose *New deployment* or the URL changes ([APPS-SCRIPT.md](APPS-SCRIPT.md)).

### Inventory shows "Can't load the inventory"

The `inventory_*` Wix CMS collections are missing or the person lacks access. Check the collections exist and have
permissions set to *Site members* ([WIX-SETUP.md](WIX-SETUP.md#cms-collections)). In `pnpm dev` the app uses in-memory mock
data instead; add `?demo=signed-out` or `?demo=pending` to see those screens.

### Inventory says "Photos aren't available on the new site yet"

Known: adding, cropping or removing item photos is not ported (photos lived in Google Drive). Existing photos still show if
their Drive file is shared "anyone with the link".

---

## Publishing

### I merged but the site didn't change

Open the repo's **Actions** tab and look at *Deploy to GitHub Pages*. Red means the build failed (open the log). Browsers also
cache; hard-reload. Remember this publishes `dev.team6220.org`, not `team6220.org`.

### `/about` jumps to `/about/` on dev.team6220.org

Normal. Pages are built as folders (`about/index.html`) and GitHub Pages redirects once to the slash version. Both work
([REDIRECTS.md](REDIRECTS.md)).

### CI is red on my pull request

Click **Details** next to `ci` and open the failing step: install (lockfile), `Typecheck` (a `pnpm check` error),
`Test`, or `Build`. Reproduce locally with the same command ([DEPLOY-AND-CI.md](DEPLOY-AND-CI.md#ciyml-name-ci-required-job-ci)).
The separate *GoldSim checks* run is not required.
