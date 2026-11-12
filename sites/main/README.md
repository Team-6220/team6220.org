# Main site (team6220.org public pages)

Everything specific to the public website lives in this folder. Apps never import from here.

| Folder | What | Served at |
| --- | --- | --- |
| `config/site.ts` | **Webmaster settings**: summer camp switch, store link, Log In link | |
| `data/` | Lists the pages are built from: `nav.ts` (menu), `robots.ts`, `apps.ts`, `resources.ts`, `old-anchors.ts` | |
| `components/` | Header, Footer, PageHero (page banner), Placeholder, logo sprite (the griffin symbol is with the loader), intro markup | |
| `sections/` | Page content, one folder per page (`home/`, `about/`, `robots/`, ...) | |
| `MainLayout.astro` | Page shell for public pages (fonts, styles, header, footer, scripts) | |
| `content/early.js` | Runs before first paint (intro and loader classes) | inlined by `MainLayout.astro` |
| `styles/` | `site.css` | bundled by `MainLayout.astro` |
| `scripts/` | `site-b.js` (intro, menu, robots, gallery, ...). The page-change loader script is shared: `packages/assets/scripts/page-loader.js` | `/assets/main/js/` |
| `media/` | Sponsor logos, CAD renders, merch images (hashed file names) | `/assets/main/<file>` |

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
Team photos are in `media/team/`.

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

### Where the loader lives (shared by the main site and Inventory)

| Piece | File |
| --- | --- |
| Markup (`#pgl`, `#pgl-edge`, `#pgl-fly`, the griffin symbol) | [`packages/ui/src/PageLoader.astro`](../../packages/ui/src/PageLoader.astro) (+ `GriffinSprite.astro`) |
| Styles | [`packages/ui/src/page-loader.css`](../../packages/ui/src/page-loader.css) |
| Animation script (`G6220Loader`) | [`packages/assets/scripts/page-loader.js`](../../packages/assets/scripts/page-loader.js), served at `/assets/shared/scripts/page-loader.js` |
| Spin video | `packages/assets/loader/`, served at `/assets/shared/loader/` |

The animation ends by flying the logo into a landing spot: the header logo (`.center-logo svg`) when the page has one,
otherwise `#pgl-land`, a **placeholder** fixed in the top-left corner that `<PageLoader landing />` adds for pages
without a header. It is one clearly marked CSS block at the bottom of `page-loader.css`; its position and size
are the variables `--pgl-land-x`, `--pgl-land-y`, `--pgl-land-size` (defaults 12px, 12px, 44px). Restyle or move it there
when the branding guidelines are applied.

### Apps

- **Inventory** (`/apps/inventory`) uses the shared loader instead of its own boot screens ("Loading inventory…" while
  the sign-in is checked, and the in-app one while `apiGetAll` loads). The page marks itself `<PageLoader landing hold />`:
  the cover is up from the first paint, the spin plays and the logo holds still, and `apps/inventory/shim/main.ts`
  releases it (`G6220Loader.release()`) when the first `apiGetAll` has finished, then the usual reveal plays and the logo
  lands in the placeholder. The sign-in-needed, waiting-for-approval and "Can't load the inventory" screens are not
  hidden: they release the loader at once. If nothing releases it, the loader gives up after `HOLD_MAX_S` (20 s, top of
  `page-loader.js`) and the original boot screens show again. With reduced motion there is no loader (as on the main
  site) and the original boot screens are kept. The original UI files are untouched; the boot screens are hidden by the
  wrapper CSS in `src/pages/apps/inventory/index.astro`. Browser check: `apps/inventory/test/loader.playwright.mjs`.
- **The other `/apps/*` pages** (dashboard and the rest on `AppLayout.astro`) load only `page-nav.js` (hover prefetch with
  the same delay); they have no loader markup, so no loader plays there, and links from the main site into `/apps` are
  plain navigations. **GoldSim and WingIt** are standalone static pages and do not use it either.
