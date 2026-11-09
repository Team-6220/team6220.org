# Wix CLI test (Phase 0)

The migration plan asks for a one-day test of four risks before building much. This file records what was checked,
how, and what is still open. Checked Nov 9, 2026 against `@wix/cli` 1.2.9, `@wix/create-new` 0.0.144,
`@wix/astro` 3.1.1 and `@wix/astro-wix-hosting-adapter` 3.0.5.

## Results

| # | Question | Result | How we know |
| --- | --- | --- | --- |
| 1 | Does this repo's layout (pnpm workspaces, Astro at the root, `sites/`, `apps/`, `packages/`) work with the Wix Astro integration? | **Yes for the build.** Linking and `wix build` not tested yet | Built a copy of `main` with the Wix integration and adapter (below) |
| 2 | Do Wix's reserved paths collide with `/apps` or `/api`? | **No collision for `/apps`.** Under `/api`, only `/api/auth/*` is taken | Wix docs: Reserved URL Paths |
| 3 | Can `wix release` run from GitHub Actions? | **Probably.** `wix login --api-key` exists "for automations and CI environments". Not tested; `wix release` has no `--yes` flag documented | Wix CLI reference: login, release |
| 4 | Do service workers work on Wix hosting? | **Open.** Nothing in the docs either way. Build output supports a custom `_headers` file, which is a good sign | Needs a deployed preview |

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

Wix doesn't document service workers on headless hosting. To test: deploy a preview with `public/sw.js` that caches
one page, open it, go offline, reload. Check the `Content-Type` of `/sw.js` (must be JavaScript) and that it isn't
served with long immutable caching (the adapter adds immutable caching for `/_astro/*` only).

## Still to do (needs network access to Wix)

This test ran in an environment that can't reach `manage.wix.com`, so the following wait for a machine that can:

- [ ] In a scratch copy: `npm create @wix/new@latest -- headless link --business-name "6220 CLI test"`
      (creates a throwaway Wix site; delete it afterwards)
- [ ] `wix build` and `wix preview` from the pnpm workspace layout
- [ ] Service worker test on the preview URL (section 4)
- [ ] `wix login --api-key` plus `wix release` in a GitHub Actions run against the throwaway site
