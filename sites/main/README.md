# Main site (team6220.org public pages)

Everything specific to the public website lives in this folder. Apps never import from here.

| Folder | What | Served at |
| --- | --- | --- |
| `config/site.ts` | **Webmaster settings**: store link, Log In link; summer camp values (read from `content/summer-camp.json`) | |
| `content/*.json` | **Editable content**, one file per area, edited in the Site Manager (schemas: `packages/content`) | |
| `data/` | Lists the pages are built from: `nav.ts` (menu), `robots.ts`, `apps.ts`, `resources.ts`, `old-anchors.ts` | |
| `components/` | Header, Footer, PageHero (page banner), Placeholder, logo sprite, intro and loader markup | |
| `sections/` | Page content, one folder per page (`home/`, `about/`, `robots/`, ...) | |
| `MainLayout.astro` | Page shell for public pages (fonts, styles, header, footer, scripts) | |
| `content/early.js` | Runs before first paint (intro and loader classes) | inlined by `MainLayout.astro` |
| `styles/` | `site.css` | bundled by `MainLayout.astro` |
| `scripts/` | `site-a.js` (page-change loader), `site-b.js` (intro, menu, robots, gallery, ...) | `/assets/main/js/` |
| `media/` | Sponsor logos, CAD renders, merch images, loader videos (hashed file names) | `/assets/main/<file>` |

Pages themselves are in `src/pages/` because Astro requires it (and Wix hosting expects the Astro project at the
repo root). Each page file only picks a layout, a banner and sections from here.

## Common jobs

- **Summer camp (on/off, title, page text and registration links):** edit `content/summer-camp.json`, or use the
  Site Manager (`/apps/site`, Web Admins). `enabled` on shows "Summer Camp" in the menu and a banner on the home
  page; `/summer-camp` exists either way. `config/site.ts` still exports `SUMMER_CAMP_ENABLED` and
  `SUMMER_CAMP_TITLE`, now read from that file. CI validates the file (`pnpm content:check`).
- **Add next season's robot:** add one entry at the top of `data/robots.ts` (and its CAD render in `media/`).
  It shows up on `/robots` and as "Latest robot" on the home page.
- **Add an app:** add one entry to `apps/dashboard/src/apps.ts` (the one list of apps). Live apps show up on `/apps`, on `/resources` and in the Resources menu.
- **Add a resource link:** add one entry to `data/resources.ts` (`menuLabel` also puts it in the Resources menu).
- **Change the menu:** `data/nav.ts`.

Old addresses and their new pages are listed in [docs/REDIRECTS.md](../../docs/REDIRECTS.md).

Shared brand media (logos, fonts) is not here: it is in [`packages/assets`](../../packages/assets/README.md).
Team photos are in `media/team/` ([docs/PHOTOS.md](../../docs/PHOTOS.md)).
