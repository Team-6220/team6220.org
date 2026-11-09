# Wix CLI test (Phase 0)

The migration plan asks for a one-day test of four risks before building much. This file records what was checked,
how, and what is still open. Checked Nov 9, 2026 against `@wix/cli` 1.2.9, `@wix/create-new` 0.0.144,
`@wix/astro` 3.1.1 and `@wix/astro-wix-hosting-adapter` 3.0.5.

## Results

Tested end to end on a throwaway Wix project ("6220 CLI test") created with `headless link`, deployed with
`wix preview` and `wix release`.

| # | Question | Result |
| --- | --- | --- |
| 1 | Does this repo's layout (pnpm workspaces, Astro at the root, `sites/`, `apps/`, `packages/`) work with the Wix CLI? | **Yes.** `headless link` detected pnpm, `wix build`, `wix preview` and `wix release` all worked, and the homepage rendered on Wix hosting. Needs `output: "server"` (see below) |
| 2 | Do Wix's reserved paths collide with `/apps` or `/api`? | **No collision for `/apps`.** Under `/api`, only `/api/auth/*` is taken. **Also: Wix overrides `/sw.js`** (see 4) |
| 3 | Can `wix release` run from GitHub Actions? | **Yes, very likely.** `wix release` ran to completion with no prompts in a non-interactive shell. Login in CI uses `wix login --api-key` (documented; not yet run with a real key) |
| 4 | Do service workers work on Wix hosting? | **Yes, but not at `/sw.js`.** A worker at `/app-sw.js` registered, cached the page, and the page loaded offline. At `/sw.js`, Wix serves its own worker that unregisters itself |

## Details

### 1. Repo layout

What was done: a copy of `main` with these added at the root: `@wix/astro`, `@wix/astro-wix-hosting-adapter`,
`@wix/essentials`, `@astrojs/react@^7`, `react@^18.3.1`, `react-dom@^18.3.1`, `@wix/cli`. Config the same way
`headless link` writes it:

```js
// astro.config.mjs (Phase 2 shape, not committed yet)
output: "server",
adapter: wixHostingAdapter(),            // top-level key, NOT in integrations
integrations: [syncMedia(), wix(), react()],
image: { domains: ["static.wixstatic.com"] },
```

`astro build` succeeded with `WIX_CLIENT_ID` set. Our `sync-media` integration still ran (`dist/client/assets/...`,
favicons at the root). Findings:

- **Node 24.22.1 or newer is required** by `@wix/cli` and by `headless link`. The repo is on Node 22 (`.nvmrc`,
  `engines`, CI). Bump to Node 24 when the Wix packages are added.
- **Use `@astrojs/react` 7.x** with Astro 7. Version 4.x pulls in Vite 6 and breaks the build
  (`'vite' does not provide an export named 'esmExternalRequirePlugin'`).
- `@wix/astro` refuses to build without `WIX_CLIENT_ID` (from `wix env pull`; in CI a repo secret).
- pnpm's strict layout leaves some Wix SDK packages unresolved (`@wix/sdk`, `@wix/site`, `@wix/headless-site`, ...,
  warnings only). Add them as direct dependencies when we switch.
- pnpm 10 blocks install scripts for `workerd` (the adapter's local runtime; it is Cloudflare's Workers runtime).
  Allow it with `pnpm approve-builds` / `onlyBuiltDependencies`.
- `headless link` rewrites `package.json` scripts to `wix dev|build|preview|release` and installs with **npm**.
  In this pnpm monorepo, run it in a scratch copy and port the changes by hand rather than letting it edit the repo.
- **`headless link` provisions a new Wix site.** For the real switch we use the existing site's
  *Headless Settings → Start Migration* flow instead (migration plan, Phase 2), so our data, members and domain stay.
- With `output: "server"`, pages are rendered per request. Mark pages that don't need server code with
  `export const prerender = true` so they stay static.

### 2. Reserved paths

From Wix's "Reserved URL Paths for the Astro Integration":

- Taken by the integration: `/_api/*`, `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout`,
  `/api/auth/logout-callback`, `/checkout`, `/__ecom/checkout`, `/_paylink/*`, `/_proposal/*`, `/robots.txt`,
  `/sitemap.xml` and `*-sitemap.xml`, everything under `/_wix/`, and the `adminPathname` we choose.
- Served by Wix on a connected domain before our code: `/.well-known/acme-challenge/*`,
  `/.well-known/apple-developer-merchantid-domain-association`, `/.well-known/assetlinks.json`,
  `/.well-known/connection-check/*`.
- **Our rules:** apps stay under `/apps/*`; our endpoints go under `/api/<name>`, never `/api/auth/*`;
  never use `/_api` or `/_wix`. Don't name a media folder `_wix`.

### 3. Releasing from CI

- `wix login --api-key <token>` is documented for CI. The API key is created in the Wix account settings; keep it
  as a GitHub Actions secret, never in the repo.
- `wix release` uploads a preview and then releases it. Flags: `--comment`, `--version-type`. Whether it runs to
  completion without prompts in a non-interactive shell is untested.
- `wix login` and every later command need `manage.wix.com` and `www.wixapis.com`.
- Until tested: a Web Admin runs `wix release` from a laptop (as the plan already says).

### 4. Service workers

Wix doesn't document service workers on headless hosting, so this was tested on a preview in Chromium:

- **`/sw.js` is taken by Wix.** When a browser requests `/sw.js` as a service worker (`Service-Worker: script`
  header), Wix ignores our file and serves its own worker that unregisters itself and reloads the page. Our worker
  never stays installed. A plain `curl` of `/sw.js` still shows our file, which makes this easy to miss.
- **Any other name works.** `/app-sw.js` served as `application/javascript` with `Cache-Control: no-store, no-cache`,
  registered with scope `/`, controlled the page after a reload, cached it, and the page loaded with the network off.
- **Rule:** name workers per app, e.g. `/apps/scouting/sw.js` (scope `/apps/scouting/`) or `/scouting-sw.js`.
  Never `/sw.js`.

### What `headless link` actually did here

- Detected **pnpm** and installed with it (the docs say npm). Its `pnpm install` failed on our lockfile
  (`ERR_PNPM_OUTDATED_LOCKFILE`); `pnpm install --no-frozen-lockfile` finished it. The Wix business and project were
  already created by then.
- Added `wix.config.json` (`appId`, `siteId`; not secret), `react()`, `wix()`, `wixPages()` (`@wix/astro-pages`),
  the hosting adapter and `static.wixstatic.com` images. It chose `@astrojs/react` ^6, `@wix/sdk`,
  `@wix/dashboard`.
- It **kept `output: "static"`**. With that, every page on the preview returned "Internal Server Error". With
  `output: "server"` everything rendered. Set `output: "server"` and mark pages static with
  `export const prerender = true` only after testing them on a preview.
- Replaced our scripts with `wix dev|build|preview|release|env|generate|skills`.
- `wix env pull` writes `.env.local` with `WIX_CLIENT_ID`, `WIX_CLIENT_INSTANCE_ID`, `WIX_CLIENT_PUBLIC_KEY` and
  **`WIX_CLIENT_SECRET`**. It is git-ignored (`.env.*`); never commit it. In CI these become repository secrets.

## Cleanup and follow-ups

- [ ] Delete the throwaway **"6220 CLI test"** site in Wix (My Sites). It is published at a free
      `*.wix-site-host.com` address and needs no Premium plan, but there's no reason to keep it.
- [ ] Before Phase 2: create a Wix API key with Wix CLI permissions, store it as a GitHub Actions secret, and run
      `wix login --api-key` + `wix build` + `wix preview` in a workflow to confirm CI end to end.
- [ ] When adding Wix to this repo (Phase 2, via the existing site's Start Migration flow): Node 24, `output: "server"`,
      allow `workerd` builds in pnpm, no `/sw.js`.

Note for whoever reruns this from an AI sandbox: Node's `fetch` needs `NODE_USE_ENV_PROXY=1` to go through an HTTP
proxy, otherwise uploads fail with `FailedToUploadStaticFiles ... fetch failed`.
