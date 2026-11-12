# Documentation index

Start here. These docs are written for someone who has **never seen this repo** and may never have used the tools
in it. If you only have ten minutes, read [How it fits together](ARCHITECTURE.md) and then jump to whichever guide
matches what you want to do.

> **Status (Nov 2026).** The site is in **Phase 1**: it is built from this repo and published on GitHub Pages at
> `dev.team6220.org`. The real `team6220.org` is still the old Wix Studio site. Phase 2 (hosting on Wix, server
> endpoints) and the Site Manager app ([#109](https://github.com/Team-6220/team6220.org/issues/109)) are **not built
> yet**; the guides say so wherever it matters. The plan is [MIGRATION-PLAN.md](MIGRATION-PLAN.md), and it is the
> source of truth when a doc disagrees with it.

## I want to...

| I want to... | Read |
| --- | --- |
| Understand what all the pieces are and how they connect | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Learn what Astro, pnpm, React, Wix, Apps Script, GitHub Actions and the Wix CLI are | [TOOLS.md](TOOLS.md) |
| Change something small (a robot, a sponsor logo, summer camp on/off, merch, a link, the menu, an email address) | [COOKBOOK.md](COOKBOOK.md) |
| Build a brand-new app (folder, dashboard card, data, login and badges, CI) | [ADD-AN-APP.md](ADD-AN-APP.md) |
| Set up or maintain Wix: members, badges, approving people, CMS, API keys, redirect URIs, yearly chores | [WIX-SETUP.md](WIX-SETUP.md) |
| Deploy or redeploy the Google Apps Script backends (attendance-api, inventory, attendance) | [APPS-SCRIPT.md](APPS-SCRIPT.md) |
| Understand how a change reaches the internet, what CI checks, and where secrets go | [DEPLOY-AND-CI.md](DEPLOY-AND-CI.md) |
| Fix an error | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| Change colors, fonts or logos | [BRANDING.md](BRANDING.md) |

## First day checklist

1. Install **Node 22 or newer** (the repo's `.nvmrc` says 22; Node 24 works too and Phase 2 needs 24) and
   [pnpm](https://pnpm.io/installation). Check with `node -v` and `pnpm -v`.
2. Clone the repo, then in its folder run `pnpm install`.
3. Run `pnpm dev` and open <http://localhost:4321>. You are looking at the site on your own computer. Edit a file,
   save, and the page updates.
4. Before you open a pull request, run `pnpm check` (looks for mistakes) and `pnpm build` (builds the whole site into
   a `dist/` folder). CI runs the same things and a pull request cannot be merged unless they pass.

Every change goes through a **pull request** with one review; merging to `main` publishes the site automatically
([DEPLOY-AND-CI.md](DEPLOY-AND-CI.md)). You never edit the live site directly.

## Reference docs that already existed

| Doc | What it is |
| --- | --- |
| [MIGRATION-PLAN.md](MIGRATION-PLAN.md) | The plan, the decisions and why. Source of truth |
| [PHASE-0.md](PHASE-0.md) | The one-time setup checklist for GitHub and Wix, with exact menu paths (done Nov 9, 2026) |
| [WIX-CLI-SPIKE.md](WIX-CLI-SPIKE.md) | What we learned testing the Wix CLI and Wix hosting before building |
| [SITE-MANAGER.md](SITE-MANAGER.md) | The plan for a Web Admin app that edits content with forms (not built) |
| [operations/README.md](operations/README.md) | The plan for the Tasks and Gantt, Production and BOM apps and how they connect to Inventory (not built) |
| [REDIRECTS.md](REDIRECTS.md) | Old page addresses and where they go; list of all page addresses |
| [../apps/README.md](../apps/README.md) | How apps are laid out, how GoldSim and WingIt are built in, the dashboard and Attendance details |
| [../packages/data/README.md](../packages/data/README.md) | The data layer API and how login works in detail |
| [../packages/assets/README.md](../packages/assets/README.md) | Shared logos, fonts and favicon |
| [../sites/main/README.md](../sites/main/README.md) | Map of the public website's folder |
| [../backend/apps-script/README.md](../backend/apps-script/README.md) | Rules for the Apps Script source in git |
| [../backend/apps-script/attendance-api/README.md](../backend/apps-script/attendance-api/README.md) | The Attendance API: who can do what, how Wix tokens are checked, setup |
| [../apps/inventory/README.md](../apps/inventory/README.md) | How Inventory is built, plus the one-time import from the Google Sheet |
| [../NOTICE.md](../NOTICE.md) | What the MIT license does and does not cover |

## Rules of thumb (the short version)

- **The repo is public.** Never commit API keys, passcodes or `.env` files. Details in
  [DEPLOY-AND-CI.md](DEPLOY-AND-CI.md#secrets).
- **Apps never import the Wix SDK.** They call functions from `packages/data`. This is what lets us change the backend
  without rewriting every app.
- **Each thing lives in one place.** The list of apps is one file, the menu is one file, the robots are one file. If you
  find yourself editing the same fact in five places, check the [cookbook](COOKBOOK.md) first.
- **Don't edit generated files.** `public/assets/` and `dist/` are rebuilt every time.
- **If a doc and the code disagree, trust the code and fix the doc.** Docs rot; pull requests that change behavior
  should change the matching doc.

## Keeping these docs true

When you change how something works, update the guide that mentions it in the same pull request. Paths in these docs are
relative to the repo root unless they start with `../`. If you add a guide, add it to the table above.
