# Apps

Each app is a React package that mounts at its own route under `team6220.org/apps`.

| Folder | Route | Status |
| --- | --- | --- |
| `apps/dashboard` | `/apps` | **Live.** Sign-in, the member's name and a card per app |
| `apps/attendance` | `/apps/attendance` | Moves in from Apps Script (screen only). Options and recommendation: [attendance/docs/PLAN.md](attendance/docs/PLAN.md) |
| `apps/inventory` | `/apps/inventory` | **Built.** Uses the Wix CMS on the deployed site once the collections exist; mock data in dev. See [inventory/README.md](inventory/README.md) |
| `apps/goldsim` | `/apps/goldsim` | **Live** on the site. Imported with history (Nov 2026); built with its own npm workspace. Local/guest mode only (Supabase is being dropped, #66) |
| `apps/wingit` | `/apps/wingit` | **Live** on the site. Imported with history (Nov 2026). Static HTML/JS game |
| `apps/scouting`, `apps/pit`, `apps/production` | | Planned |

Rules (from the migration plan):

- Apps never import the Wix SDK. They call functions from `@team6220/data`.
- Each app owns its folder, with its own line in `.github/CODEOWNERS`.
- Brand colors and fonts come from `@team6220/ui`.
- The Wix integration needs **React 18** (`@wix/astro` peers on `^18.3.1`), so don't use React 19 here.

## Login and the dashboard

- **The main nav's "Log In" link points to `/apps`.** Signed out, that page shows a **Sign in** button (and the
  public apps); signed in, it shows the member's name, a **Sign out** button and every app card.
- Sign-in uses the Wix login page ("Log in with Google"). New signups need a Web Admin to approve them under
  **Wix → Site Members** and give them the `Team Member` badge; until then the dashboard says "Waiting for approval".
- Routes: `/apps` (dashboard), `/apps/login/callback` (finishes sign-in; never put it under `/api/auth/*`, which
  `@wix/astro` owns in Phase 2) and `/apps/logout` (link here to sign out from anywhere).
- In an app, use `auth` from `@team6220/data`: `auth.getMember()`, `auth.hasBadge(BADGES.attendanceAdmin)`,
  `auth.login("/apps/<name>")`. Mount components that call it with `client:only="react"`. Badge checks in the browser
  only hide UI; see [`packages/data/README.md`](../packages/data/README.md) for how login works, its limits and
  what Phase 2 changes.

### Add an app card

Edit [`apps/dashboard/src/apps.ts`](dashboard/src/apps.ts), the one list of team apps (the main site's Resources
menu can import it too, from `@team6220/dashboard/apps`). Add an entry with a unique `id`, `name`, `description`,
`href` (its route under `/apps`), `status` (`"live"` or `"planned"`, which greys it out with no link) and `access`
(`"public"` cards also show to signed-out visitors; `"team"` cards only to approved members).

### Page shell for an app

Use `src/layouts/AppLayout.astro` (shared tokens from `@team6220/ui/tokens.css`, none of the main site's styles):

```astro
---
import AppLayout from "../../../layouts/AppLayout.astro";
import { MyApp } from "@team6220/my-app";
---
<AppLayout title="My app | Los Al Robotics" description="…">
  <MyApp client:only="react" />
</AppLayout>
```

## Folder layout for one app

```
apps/<name>/
  src/        the app's code
  media/      images, icons and files only this app uses  ->  /assets/<name>/<file>
  package.json
```

Media that several parts of the site use goes in [`packages/assets`](../packages/assets/README.md) instead
(`/assets/shared/...`). The main website's own files are in `sites/main/`, never inside an app.

## Imported apps (GoldSim, WingIt)

They came from their own repos with full history and keep their own tooling:

- `apps/goldsim` uses npm workspaces (`npm ci`, `npm run dev`, `npm test`). It is excluded from the root pnpm workspace
  in `pnpm-workspace.yaml`, so `pnpm install` doesn't touch it.
- `apps/wingit` is static files (`index.html`, `js/`, `css/`, `assets/`) with relative paths; run it by opening
  `index.html` or any static server.
- Issues from the old GoldSim repo were moved here with the label `APP: GOLDSIM`. Use `APP: WINGIT` for WingIt.
- The old repos are archived with a README pointing here. Don't commit there. Their old GitHub Pages addresses
  should redirect to `/apps/goldsim/` and `/apps/wingit/` (not set up yet).
- **Merge pull requests that add or move whole imported folders with "Create a merge commit"**, not squash or rebase,
  or the imported history is lost.

### How they get onto the site

`pnpm build` builds both apps as part of the normal site build, through
[`integrations/build-apps.mjs`](../integrations/build-apps.mjs) (an Astro integration that runs on `astro build`
only, not on `astro dev` or `astro check`):

| App | Build | Output |
| --- | --- | --- |
| WingIt | Nothing to build: `index.html`, `css/`, `js/` and `assets/` are copied | `dist/apps/wingit/` |
| GoldSim | `npm ci` (only if `apps/goldsim/node_modules` is missing), then `npm run build` with `BASE_PATH=/apps/goldsim/` (Vite `base`) | `dist/apps/goldsim/` |

Nothing generated is committed: the copies live only in `dist/`, and GoldSim's `node_modules/` and
`packages/web/dist/` are git-ignored by its own `.gitignore`. CI (`ci.yml`) and the Pages deploy (`pages.yml`) run
`npm ci` in `apps/goldsim` (npm cache keyed on its `package-lock.json`) before `pnpm build`. GoldSim's own tests and
lint (`npm run check` in `apps/goldsim`) don't run in the site CI yet. The workflows under `apps/goldsim/.github/`
came with the import and don't run (GitHub only reads the root `.github/`).

To work on an app, use its own dev server (`npm run dev` in `apps/goldsim`, or a static server in `apps/wingit`);
`pnpm dev` doesn't serve them. To check them as the site serves them, run `pnpm build` and serve `dist/` (for
example `pnpm preview`), then open `/apps/goldsim/` and `/apps/wingit/`.

GoldSim runs in local/guest mode: the web app has no Supabase client wired in, so it needs no keys or env vars.
Its `packages/data-layer` Supabase code and `supabase/` folder are unused by the site build and go away with #66.

GoldSim's own lint, typecheck and tests (`npm run check` in `apps/goldsim`, about 8 minutes) run in a separate
workflow, `.github/workflows/goldsim.yml`, only when files under `apps/goldsim/` change. It is not a required
check; the site's required check stays `ci`.
