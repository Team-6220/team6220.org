# Site Manager app (plan)

A Web Admin app at `/apps/site` where webmasters change the website's regular content without editing code.
It started as an idea at the end of issue #69 ("Maybe a new app dedicated to site management"). The more
the backend grows, the more the team needs it, so it now has its own plan.

**Status:** draft. Several decisions below are open (see "Open questions"). Nothing here is built yet.

## Why

Today every content change is a code change: edit a file, open a pull request, wait for CI, merge. That is
fine for developers and a wall for everyone else. These things change every season or even every month:

- the new robot (and its photos, CAD link and best finish),
- sponsor logos and tiers,
- summer camp: on/off switch, year, links, text,
- the merch list on `/merch`,
- resources and links, history, gallery albums.

The goal: a Web Admin signs in, edits a form, previews it and publishes it, with no GitHub account and no
command line. Developers keep working in code for layout and features.

## Who can use it

Web Admins only (the `Web Admin` badge). Eventually leads could get a narrower badge for a single area (for
example a Sponsors lead who may edit only sponsors). That is out of scope for the first version.

## What it manages

| Area | Where it lives today | Fields the app edits |
| --- | --- | --- |
| Summer camp | `sites/main/config/site.ts` + `sections/summer-camp/` | on/off switch, title/year, registration links, text blocks |
| Sponsors | `sections/sponsors/Sponsors.astro`, home marquee | logo (color) per sponsor, name, tier, link, order, season |
| Robots | `sites/main/data/robots.ts` | year, game, name, finish, events, album, image, alt, CAD link, quote |
| Merch | `sections/merch/Merch.astro` (hand-written) | item, image, price, link, order |
| Resources and links | `sites/main/data/resources.ts` | sections, links, archive items, order |
| History / timeline | `sections/about/History.astro` | entries (year, title, text), newest first |
| Gallery | Wix Media / Google Drive (#8) | which album folders appear and in what order |

Not in this app: page layout, new sections, styling, app code, forms (Wix dashboard) and team member
accounts (Wix Site Members).

## How it works (proposed)

```
Web Admin ──► /apps/site (React) ──► packages/data `site.*` ──► Wix CMS collections `site_*`
                                                                       │
Visitor ──► Astro page (server-rendered, Phase 2) ◄────────────────────┘
```

- **Content collections.** One Wix CMS collection per area, named `site_<area>` (`site_robots`,
  `site_sponsors`, ...), following the existing `<app>_<thing>` naming. Each item has a `status`
  (`draft` or `published`) and an `order` number.
- **Images** go to the Wix Media Manager (site media), as the media rule already says. The collections store
  the media URL.
- **Data layer.** A new `site.*` module in `packages/data`, the only code that touches Wix for this app.
  Typed per area, with a mock store for local development (same pattern as `inventory.*`).
- **Pages read the CMS.** Phase 1 (static, GitHub Pages) can't change after build, so this app only becomes
  useful once pages are server-rendered in Phase 2. Until then the content stays in the code files.
- **Fallback.** Each area keeps its current code file as the seed and fallback: if the CMS is empty or
  unreachable, the page shows the file's content. This also makes the migration safe: import the current
  content into the CMS once, check it matches, then switch the page to read from the CMS.
- **Permissions.** Writes need the `Web Admin` badge. In Phase 2 an `/api/site` endpoint checks the badge on
  the server. Public reads of published items are allowed for everyone.

## Build order

Smallest and most seasonal first, so the app is useful early and every step ships on its own:

1. **Foundations:** decide the save model (below), add the `site.*` data module, the `site_*` collection
   definitions, the import-from-code script, the mock store, the app shell at `/apps/site` (Web Admin gate)
   and a dashboard card.
2. **Summer camp** (switch, title, links, text). Smallest, changes every season.
3. **Sponsors** (logos, tiers, order, upload).
4. **Robots** (the "add next season's robot" workflow, incl. image upload).
5. **Merch** and **Resources/links**.
6. **History** and **Gallery** albums (the gallery depends on the Drive sync in #8).

Each area is its own issue with: the collection fields, the edit form, the page reading from the CMS,
the import script and a check that the page looks identical before and after.

## Open questions

These shape the implementation and are being decided with the team:

1. **How are changes saved and published?** Options: edit the live content directly; draft then publish
   (a `status` field, with a preview of the draft); or have the app commit to GitHub as a pull request so
   code stays the source of truth.
2. **Who can edit?** Web Admins only at first, or also per-area leads?
3. **Is it worth waiting for Phase 2?** Server rendering makes the changes appear immediately; before that
   the site is static.
4. **History of changes.** Is "who changed what and when" (with undo) needed, or is the previous published
   version enough?
5. **First areas.** Summer camp and sponsors first, as proposed above?
6. **Images.** Upload straight to the Wix Media Manager from the app, or paste a link?

Decisions are recorded in [MIGRATION-PLAN.md](MIGRATION-PLAN.md) once made.
