# Add a new app

A step-by-step guide from an empty folder to a working app with a dashboard card, data, login, badges and CI. The
running example is a **Scouting** app (`/apps/scouting`), which is on the plan but not built. Replace `scouting` with
your app's short lowercase name everywhere.

Read [ARCHITECTURE.md](ARCHITECTURE.md) first (ten minutes) and have [TOOLS.md](TOOLS.md) handy.

**Real examples to copy from** (they are small and current):

| If your app is like... | Copy from |
| --- | --- |
| a React screen, with a server in Apps Script | `apps/attendance` + `packages/data/src/attendance` + `backend/apps-script/attendance-api` |
| a React screen whose data is in Wix CMS | the data side of `packages/data/src/inventory` (Wix and mock adapters) |
| the simplest possible React screen | `apps/dashboard` |
| a finished app that already has its own tooling | `apps/goldsim` / `apps/wingit` ([section at the end](#if-your-app-already-exists-as-its-own-project)) |

Rules you must keep (from the [migration plan](MIGRATION-PLAN.md)):

- **Apps never import the Wix SDK.** They call functions from `@team6220/data`.
- **Each app owns its folder** and gets a CODEOWNERS line.
- **React 18 only** (the Wix integration needs `react ^18.3`).
- **Brand comes from `@team6220/ui`** ([BRANDING.md](BRANDING.md)). Use the shared classes in `packages/ui/src/app.css` (`t-page`, `t-header`, `t-panel`,
  `t-button`, ...) before writing your own; the sidebar, light/dark mode and fonts come with `AppLayout`.
- The route is `/apps/<name>`, never under `/api/auth/*`, `/_api`, `/_wix`, and no service worker called `/sw.js`.

---

## 1. Make the folder and package

```text
apps/scouting/
  package.json
  src/
    index.ts          exports the app component
    Scouting.tsx      the app's main component
    scouting.css      the app's styles (uses the shared tokens)
  media/              images only this app uses  ->  /assets/scouting/<file>   (optional)
```

`apps/scouting/package.json` (modeled on `apps/attendance/package.json`):

```json
{
  "name": "@team6220/scouting",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "/apps/scouting: ...",
  "main": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./scouting.css": "./src/scouting.css"
  },
  "dependencies": {
    "@team6220/data": "workspace:*"
  },
  "peerDependencies": {
    "react": "^18.3.1"
  }
}
```

`src/index.ts`: `export { default as Scouting } from "./Scouting";`

`src/Scouting.tsx`: a React component. Start with the pattern from `apps/dashboard/src/Dashboard.tsx` (load state,
show "loading / signed out / waiting for approval / ready").

`src/scouting.css`: your styles. Use the shared variables (`var(--color-gold)`, `var(--space-3)`, ...) and the
`.t-button` class instead of your own colors. See `apps/attendance/src/attendance.css` for how an app adds its own
prefixed class names (`att__title`) so styles never collide.

**Wire it into the site.** In the **root** `package.json`, add to `dependencies`:

```json
"@team6220/scouting": "workspace:*",
```

Then run `pnpm install` at the repo root. (`pnpm-workspace.yaml` already includes every folder in `apps/*`, and
`tsconfig.json` already covers `apps/*/src`.)

## 2. Give it a page

Create `src/pages/apps/scouting/index.astro` (the folder name is the address `/apps/scouting`), copying
`src/pages/apps/attendance/index.astro`:

```astro
---
import AppLayout from "../../../layouts/AppLayout.astro";
import { Scouting } from "@team6220/scouting";
import "@team6220/scouting/scouting.css";
---

<AppLayout title="Scouting | Los Al Robotics" description="Match scouting for Los Al Robotics (FRC Team 6220).">
  <Scouting client:only="react">
    <main slot="fallback"><p>Loading scouting…</p></main>
  </Scouting>
  <noscript><p>Scouting needs JavaScript turned on.</p></noscript>
</AppLayout>
```

- `AppLayout` gives the plain app shell, the shared tokens and `noindex` (search engines skip apps).
- `client:only="react"` runs the component only in the browser. **Use it for anything that calls Wix or reads the
  signed-in member**; those calls throw during the static build.
- `slot="fallback"` is what shows while the component loads.

Run `pnpm dev` and open <http://localhost:4321/apps/scouting>.

## 3. Add the dashboard card

Add one entry to **`apps/dashboard/src/apps.ts`**. A `"planned"` entry already exists for scouting (greyed out, no
link): change it to

```ts
{
  id: "scouting",
  name: "Scouting",
  description: "Match data from the stands, even with bad Wi-Fi.",
  href: "/apps/scouting",
  status: "live",
  access: "team",
},
```

`access: "team"` shows the card only to approved members; `"public"` also shows it to signed-out visitors (for tools
like GoldSim). `note` is an optional small line on the card. Live apps also appear automatically on `/resources` and in
the Resources menu (`sites/main/data/apps.ts` filters this one list; you do not edit it).

## 4. Decide who can use it (login and badges)

Everyone signs in on `/apps`. Inside your app, ask `@team6220/data` who the person is:

```ts
import { auth, BADGES } from "@team6220/data";

const access = await auth.getAccess();            // "approved" | "pending" | "signed-out"
const isLead = await auth.hasBadge(BADGES.webAdmin);   // cosmetic: for showing or hiding buttons
```

- `signed-out` -> show a "Sign in" button calling `auth.login("/apps/scouting")`, or link to `/apps`.
- `pending` -> "Waiting for approval" (a Web Admin has not approved them or given the `Team Member` badge).
- `approved` -> show the app.

`Attendance.tsx` and `Dashboard.tsx` are working examples of all three states.

**A new badge.** If a role needs its own permission (for example "Scouting Lead"):

1. Create the badge in Wix with the exact title ([WIX-SETUP.md](WIX-SETUP.md#badges)).
2. Add it to `BADGES` in `packages/data/src/config.ts` and always compare with that constant.
3. If an Apps Script backend checks badges by title (attendance-api does), update its constants too.

> **Important: badge checks in the browser only hide buttons.** In Phase 1 anyone can read your JavaScript. The real
> locks are Wix CMS collection permissions and, for Apps Script backends, the server-side checks. Do not put anything in
> an app that approved members must not be able to reach. In Phase 2 the checks move to `/api/scouting` endpoints (not
> built yet).

## 5. Add the data layer

All data access goes in **`packages/data/src/scouting/`**, then is exported from `packages/data/src/index.ts`.
Apps import `{ scouting } from "@team6220/data"` and never see Wix.

Recommended shape (the same in `attendance/` and `inventory/`):

| File | Purpose |
| --- | --- |
| `types.ts` | The data shapes and error codes |
| `index.ts` | The functions the app calls (`listMatches()`, `saveMatch(...)`), exported as one namespace |
| `mock.ts` or `memory-store.ts` | An in-memory stand-in so `pnpm dev` and tests work with no network |
| the real adapter | Talks to Wix CMS (see below) or an Apps Script web app |

Export it in `packages/data/src/index.ts` the way attendance is: `export * as scouting from "./scouting";`

### Option A: data in Wix CMS (the default for new apps)

1. **Collections.** Name them with your app prefix: `scouting_matches`, `scouting_teams`. Create them in the Wix dashboard
   (**CMS**) with permissions read/insert/update/remove = **Site members** (never "Anyone" in Phase 1). Inventory's
   `packages/data/src/inventory/schema.ts` describes its collections in code, and
   `apps/inventory/scripts/import-from-sheet.mjs --create-collections` creates them from that description; you can do the
   same or click them together by hand ([WIX-SETUP.md](WIX-SETUP.md#cms-collections)).
2. **Adapter.** Copy the idea of `packages/data/src/inventory/wix-store.ts`: get the shared client from
   `packages/data/src/wix.ts`, add `@wix/data`'s `items` module with `client.use(items)`, and call
   `items.query("scouting_matches")`, `items.save(...)` and so on. Load `@wix/data` with a dynamic `import()` so mock
   builds do not download it.
3. **Mock vs real.** Inventory picks the backend with the `PUBLIC_INVENTORY_BACKEND` build variable and otherwise uses
   Wix for `pnpm build` and the mock for `pnpm dev` (`inventoryBackend()` in `inventory/index.ts`). Copy that, with your
   own variable name, and add it to `.env.example`.

### Option B: a Google Apps Script backend

Copy the attendance pattern: a `client.ts` with the rules, an `http.ts` transport that sends a `POST` with
`Content-Type: text/plain` and a JSON body (this avoids the CORS preflight that Apps Script cannot answer), a `mock.ts`,
and a `backend/apps-script/<name>-api/` project that checks the member's Wix token and badges on **every** request.
Steps to deploy it: [APPS-SCRIPT.md](APPS-SCRIPT.md). Put its public `/exec` URL in `packages/data/src/config.ts` like
`ATTENDANCE_API_URL`.

### Keep secrets out

The repo is public. The Wix **client ID** and Apps Script `/exec` URLs are fine to commit. Wix API
keys, Nexus / The Blue Alliance keys and passcodes are not; they wait for the Phase 2 `/api` endpoints
([DEPLOY-AND-CI.md](DEPLOY-AND-CI.md#secrets)). Until then, use mock data for anything that needs a private key.

### Tests

Put tests in `packages/data/test/` (vitest) or give your app package a `"test": "vitest run"` script and add
`vitest` to its `devDependencies`. CI runs `pnpm -r --if-present test`, so any package with a `test` script is picked up.
Run yours with `pnpm --filter @team6220/data test`.

## 6. Ownership and CI

- **CODEOWNERS.** In `.github/CODEOWNERS`, uncomment/add a line such as `/apps/scouting/  @Team-6220/webmasters` (or the
  app maintainers' team). It sends pull requests that touch your folder to them.
- **CI needs nothing new** for a normal pnpm app: `ci.yml` already runs install, `pnpm check`, tests and `pnpm build`
  for the whole repo. Your page is built automatically.
- **GitHub label.** Issues for the app use a label like `APP: SCOUTING` (the convention from GoldSim and WingIt).
- If your app needs its own build step (it is a separate project), see the next section.

## 7. Docs and final checklist

Add your app to the table in `apps/README.md` and, if people need to know something non-obvious, a short
`apps/scouting/README.md`. Then check:

- [ ] `pnpm check` prints 0 errors; `pnpm build` succeeds; tests pass (`pnpm -r --if-present test`)
- [ ] The app opens at `/apps/scouting` while signed out, pending and approved, and shows the right screen for each
- [ ] The dashboard shows the card to the right audience
- [ ] Collections (if any) exist in Wix with **Site members** permissions; no secrets in the diff
- [ ] Badge names match Wix exactly; CODEOWNERS line added
- [ ] Docs updated; a mentor or webmaster reviewed the pull request

---

## If your app already exists as its own project

GoldSim (Vite, npm workspaces) and WingIt (static HTML) came in this way. Details are in
[apps/README.md](../apps/README.md#imported-apps-goldsim-wingit). In short:

1. Add the project under `apps/<name>` **with its history** (`git subtree add`), and exclude it from pnpm in
   `pnpm-workspace.yaml` (a `"!apps/<name>"` line) so `pnpm install` leaves its own lockfile alone.
2. Make it build with the right base path (`/apps/<name>/`) and teach `integrations/build-apps.mjs` to build it and copy
   it into `dist/apps/<name>/`. Remember: that integration runs on `pnpm build` only, not `pnpm dev`.
3. If it has its own `npm ci`, also add the install step to `ci.yml` and `pages.yml` (GoldSim has one in each).
4. Add its dashboard card with `href: "/apps/<name>/"`.
5. **Merge the pull request that adds the folder with "Create a merge commit"**, not squash or rebase, or the history
   is lost.

## What changes in Phase 2

Nothing you write for the app UI. `packages/data` will call `/api/<name>` endpoints on Wix hosting instead of calling Wix
directly, and badge checks will move into those endpoints. Keep all Wix and Apps Script calls inside `packages/data`
and this works out by itself. The plan is in [MIGRATION-PLAN.md](MIGRATION-PLAN.md#phase-2-migration-preview).
