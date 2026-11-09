# Site Manager app (plan)

A Web Admin app at `/apps/site` where webmasters change the website's regular content without editing code.
It started as an idea at the end of issue #69 ("Maybe a new app dedicated to site management"). The more
the backend grows, the more the team needs it, so it now has its own plan.

**Status:** planned. The save model is decided (the app opens GitHub pull requests); a few smaller choices are still open (see "Still open"). Nothing is built yet.

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

## Still open

- **Auto-merge or a human merges?** Default proposed: a webmaster merges, since a typo reaches the public
  site on merge.
- **GitHub App or fine-grained token?** Proposed: GitHub App (not tied to one person's account). Needs an
  org owner to install it.
- **Logo/photo uploads:** commit to the repo (proposed) or upload to the Wix Media Manager and store the URL.

Decisions are recorded in [MIGRATION-PLAN.md](MIGRATION-PLAN.md) once made.
