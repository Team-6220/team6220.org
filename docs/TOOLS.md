# The tools, explained from scratch

Every tool used in this repo, in plain language: what it is, why we use it, and the three or four things you actually
need to know. You do not need to master any of them. Skim the one you are about to touch.

Contents: [Git and GitHub](#git-and-github) · [Node and pnpm](#node-and-pnpm) ·
[pnpm workspaces](#pnpm-workspaces-the-monorepo) · [Astro](#astro) · [React](#react) · [TypeScript](#typescript) ·
[Wix](#wix) · [Google Apps Script](#google-apps-script) · [GitHub Actions](#github-actions) · [Wix CLI](#wix-cli)

---

## Git and GitHub

- **Git** remembers every version of every file. **GitHub** hosts the repo (`Team-6220/team6220.org`) and adds pull
  requests, reviews and automatic checks.
- **Repo** = the project folder. **Branch** = your own copy of the work so you don't disturb anyone. **Pull request
  (PR)** = "please merge my branch into `main`". **`main`** = the version the website is built from.
- Our rule: nobody commits to `main` directly. You push a branch, open a PR, `ci` must pass, a reviewer from the
  `webmasters` team approves, then you merge. The site updates by itself a minute or two later
  ([DEPLOY-AND-CI.md](DEPLOY-AND-CI.md)).
- The repo is **public**. Anything you commit is readable by the world, forever. See
  [secrets](DEPLOY-AND-CI.md#secrets).

## Node and pnpm

- **Node.js** runs JavaScript outside a browser. Our build tools are Node programs. The repo wants **Node 22 or newer**
  (`.nvmrc` says `22`; `package.json` says `>=22.23.4`). If you use a version switcher such as `nvm`, run `nvm use` in
  the repo folder.
- **pnpm** is the package manager: it downloads the libraries the project depends on into `node_modules/` and runs the
  project's scripts. Use **pnpm, not npm**, in the main project (the one exception is GoldSim, below).
- Commands you will use (run them in the repo root):

| Command | What it does |
| --- | --- |
| `pnpm install` | Download all dependencies. Run after cloning and whenever `package.json` or `pnpm-lock.yaml` changes |
| `pnpm dev` | Start the site on your computer at <http://localhost:4321>. Auto-refreshes when you save |
| `pnpm check` | Type-check everything (`astro check`). Must print 0 errors |
| `pnpm build` | Build the real site into `dist/` (also builds GoldSim and copies WingIt into `dist/apps/`) |
| `pnpm preview` | Serve the built `dist/` folder so you can try exactly what will be published |
| `pnpm -r --if-present test` | Run every package's tests (what CI runs) |
| `pnpm --filter @team6220/data test` | Run the tests of one package only |

- `pnpm-lock.yaml` records the exact version of every library. Commit it when it changes; CI installs with
  `--frozen-lockfile`, which fails if the lockfile and `package.json` disagree.

## pnpm workspaces (the "monorepo")

A **monorepo** is one repo holding many projects. **pnpm workspaces** is how pnpm lets those projects use each other.
`pnpm-workspace.yaml` lists the folders that are workspace packages:

```yaml
packages:
  - "packages/*"
  - "apps/*"
  - "!apps/goldsim"   # imported with its own npm tooling
  - "!apps/wingit"
```

Each package has its own `package.json` with a name like `@team6220/data`. One package uses another by listing it as
`"@team6220/data": "workspace:*"` in `dependencies` and then `import { auth } from "@team6220/data"`. The root
`package.json` depends on the app packages so the site can import them. After adding or renaming a package, run
`pnpm install` so pnpm links it.

The packages today:

| Folder | Package name | What it is |
| --- | --- | --- |
| `packages/data` | `@team6220/data` | The only code that talks to Wix and Apps Script |
| `packages/ui` | `@team6220/ui` | Shared design tokens (colors, spacing) for the apps |
| `apps/dashboard` | `@team6220/dashboard` | The `/apps` dashboard and the list of apps |
| `apps/attendance` | `@team6220/attendance` | The Attendance screen |
| `apps/inventory` | `@team6220/app-inventory` | The Inventory app |
| `packages/assets` | (not a package) | Shared logos, fonts, favicon. Just a folder that `integrations/sync-media.mjs` publishes |

GoldSim (`apps/goldsim`) and WingIt (`apps/wingit`) are **not** workspace packages; see
[apps/README.md](../apps/README.md).

## Astro

- **Astro** turns files into a website. We use it to build **static** pages: at `pnpm build` it produces plain HTML,
  CSS and JavaScript in `dist/`, which any web host can serve.
- **Pages are files.** A file in `src/pages/` becomes a web address: `src/pages/robots.astro` is `/robots`,
  `src/pages/about/history.astro` is `/about/history`, `src/pages/apps/index.astro` is `/apps`. Pages are thin: they
  pick a layout and some sections.
- **`.astro` files** have two parts. The top, between `---` lines, is code that runs at build time (imports, reading
  data). Below is HTML where you can insert values with `{curly braces}`. Example from `src/pages/robots.astro`:
  it imports `MainLayout` and `RobotShowcase` at the top and uses them as tags below.
- **Layouts** wrap pages. `sites/main/MainLayout.astro` is the public site's shell (header, footer, fonts).
  `src/layouts/AppLayout.astro` is the plain shell for apps. Both sit on `src/layouts/BaseLayout.astro`.
- **React inside Astro.** To put an interactive React component on a page you write
  `<Dashboard client:only="react" />`. `client:only="react"` means "do not render this on the server, run it in the
  visitor's browser". We use it for everything that needs the signed-in member.
- **Config** is `astro.config.mjs`. It lists **integrations**: `integrations/sync-media.mjs` (copies media into
  place), `@astrojs/react`, and `integrations/build-apps.mjs` (builds GoldSim and WingIt). Both of ours are small
  scripts in `integrations/`.
- **Version notes.** The repo is on Astro 7 with `@astrojs/react` 7 and React 18. These versions are pinned together
  for a reason; see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## React

- **React** builds interactive screens out of **components**: functions that return a bit of HTML-like markup (JSX) and
  remember things with `useState` / `useEffect`.
- We use it for the apps (dashboard, Attendance) because they react to who is signed in and to server replies. The
  public pages are not React; they are `.astro` files.
- **Stay on React 18.** The Wix Astro integration we will need in Phase 2 requires `react ^18.3`.
- Files ending in `.tsx` are React components written in TypeScript. Look at `apps/dashboard/src/Dashboard.tsx` for a
  complete small example.

## TypeScript

JavaScript with types: you tell the code what shape the data has, and `pnpm check` catches mistakes before the
site is published. Files end in `.ts` / `.tsx`. The site is on TypeScript 6 because the Astro checker does not support
TypeScript 7 yet (see the README's "Version notes").

## Wix

Wix is where our **data, logins and (later) hosting** live. Our public site is no longer *designed* in Wix; this repo is.
Wix words you will meet:

| Word | Meaning here |
| --- | --- |
| **Wix site** | "Los Al Robotics \| FRC Team 6220". Owns the domain `team6220.org`, the Premium plan, the CMS and the members |
| **Dashboard** | The Wix admin area where Web Admins click around. Most Wix chores are done here |
| **Site Members** | People who log in to the website. A different list from the people who can edit the Wix site |
| **Member status** | `APPROVED` or `PENDING`. We require approval: a new signup waits until a Web Admin approves it |
| **Badge** | A label on a member (`Team Member`, `Attendance Admin`, `Web Admin`) that unlocks things |
| **CMS / Wix Data** | Databases ("collections") inside Wix. The Inventory app stores its data in `inventory_*` collections |
| **Media Manager** | Wix's image/file storage. Most site media is meant to live here eventually (issue #8) |
| **Headless** | Wix runs the backend only; we write the pages. "Wix-managed headless" means Wix will also host our code (Phase 2) |
| **Headless (OAuth) client** | A "key" that lets our website's JavaScript ask Wix for logins and data. It has a **client ID** (public, committed in `packages/data/src/config.ts`) and lists the **redirect URIs** it will accept |
| **Redirect URI** | The exact web address Wix is allowed to send a person back to after logging in |
| **API key** | A secret that lets a script act as the site owner. Never goes in git. See [WIX-SETUP.md](WIX-SETUP.md#api-keys) |
| **Wix Forms / Automations** | Contact-style forms and the emails they trigger. Planned; see the migration plan's Forms section |

How we use Wix in code: [ARCHITECTURE.md](ARCHITECTURE.md). Step-by-step admin tasks: [WIX-SETUP.md](WIX-SETUP.md).

## Google Apps Script

- **Apps Script** is Google's way of running small JavaScript programs attached to Google Sheets. A **web app**
  deployment gives a program a public address that can answer requests.
- We have three (source in `backend/apps-script/`): `attendance/` (the old QR scanner, still the fallback),
  `attendance-api/` (the new JSON API the website talks to) and `inventory/` (the old Inventory app, to be retired once
  the new one has run a real meeting).
- Key ideas: **Script Properties** are the script's private settings (like environment variables; this is where the
  Sheet ID lives). A **deployment** is a published version at an `/exec` URL. Changing code does nothing until you
  **redeploy**. Full steps: [APPS-SCRIPT.md](APPS-SCRIPT.md).
- Code is edited in the browser at <https://script.google.com>. `clasp` (Google's command-line sync tool) is **not set
  up** here; today you copy the files from this repo into the editor by hand.

## GitHub Actions

- **GitHub Actions** runs scripts on GitHub's computers when something happens (a pull request opens, a branch is
  merged). The scripts are YAML files in `.github/workflows/`.
- We have three: `ci.yml` (checks every PR; the required job is named `ci`), `pages.yml` (publishes `dist/` to GitHub
  Pages when `main` changes) and `goldsim.yml` (extra GoldSim checks, only when GoldSim changes, not required).
- The **Actions** tab on GitHub shows every run, with logs. A red X on your PR means "click Details and read the log".
  Details: [DEPLOY-AND-CI.md](DEPLOY-AND-CI.md).

## Wix CLI

- The **Wix CLI** (`@wix/cli`, command `wix`) is Wix's command-line tool for headless projects: `wix dev`, `wix build`,
  `wix preview` (make a preview deployment), `wix release` (publish), `wix env pull` (download the site's settings into
  `.env.local`), `wix login`.
- **It is not installed in this repo yet.** It arrives in Phase 2. We tested it on a throwaway site in Phase 0; the
  findings (Node 24 needed, `output: "server"`, never `/sw.js`) are in [WIX-CLI-SPIKE.md](WIX-CLI-SPIKE.md) and the plan
  is in [MIGRATION-PLAN.md](MIGRATION-PLAN.md#phase-2-migration-preview).
- A caution from the test: `wix headless link` creates a **new** Wix site. For the real move we use the existing
  site's **Start Migration** flow instead so our members, data and domain stay.
