# Main site (team6220.org public pages)

Everything specific to the public website lives in this folder. Apps never import from here.

| Folder | What | Served at |
| --- | --- | --- |
| `config/site.ts` | **Webmaster settings**: summer camp switch, store link, Log In link | |
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

- **Summer camp on/off:** set `SUMMER_CAMP_ENABLED` in `config/site.ts`. On shows "Summer Camp" in the menu and
  a banner on the home page. `/summer-camp` exists either way.
- **Add next season's robot:** add one entry at the top of `data/robots.ts` (and its CAD render in `media/`).
  It shows up on `/robots` and as "Latest robot" on the home page.
- **Add an app:** add one entry to `apps/dashboard/src/apps.ts` (the one list of apps). Live apps show up on `/apps`, on `/resources` and in the Resources menu.
- **Add a resource link:** add one entry to `data/resources.ts` (`menuLabel` also puts it in the Resources menu).
- **Change the menu:** `data/nav.ts`.

Old addresses and their new pages are listed in [docs/REDIRECTS.md](../../docs/REDIRECTS.md).

Shared brand media (logos, fonts) is not here: it is in [`packages/assets`](../../packages/assets/README.md).
Team photos are in `media/team/` ([docs/PHOTOS.md](../../docs/PHOTOS.md)).

## Page-change loader: when it appears

The loader (logo spin, wipe, logo flying into the header) only appears when the next page is **not ready quickly**.
On a same-site link click the site fetches the target page and waits up to a short delay:

- page arrives within the delay (or the fetch fails, for example a 404 or no network): plain navigation, no loader;
- delay passes first: the loader plays as before and the navigation finishes under it.

Hovering, focusing or touching a link starts that fetch early, so most clicks are instant. Reduced motion, new-tab and
modified clicks, `#` links, downloads, external links and back/forward behave as normal browser navigation.

**The one setting:** `LOADER_DELAY_MS` at the top of [`packages/assets/scripts/page-nav.js`](../../packages/assets/scripts/page-nav.js)
(default `200` ms; bigger = the loader shows less often, `0` = on every click as before). The file is published at
`/assets/shared/scripts/page-nav.js` and loaded by `MainLayout.astro` and `src/layouts/AppLayout.astro`. It only uses
`fetch`, so it works the same on static hosting and on Wix server rendering. Its decision logic is tested in
`packages/ui/test/page-nav.test.ts`.

Apps: the apps' layout loads the same script (hover prefetch with the same delay), but `/apps/*` pages have no loader
markup or header logo for the animation to land on, so no loader plays there yet; links from the main site into `/apps`
are plain navigations, as before. **Inventory** keeps its own boot screens ("Loading inventory…" while the sign-in is
checked, and again while `apiGetAll` loads the data) and is not wired to the shared loader. GoldSim and WingIt are
standalone static pages and are not either. Giving the apps the animation needs a decision on where the logo lands
without a header (design), and for Inventory a "ready" signal tied to the first data load.
