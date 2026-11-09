# Main site (team6220.org public pages)

Everything specific to the public website lives in this folder. Apps never import from here.

| Folder | What | Served at |
| --- | --- | --- |
| `content/` | `home.html` (homepage markup) and `early.js` (runs before first paint) | rendered by `src/pages/index.astro` |
| `styles/` | `site.css` | bundled by `MainLayout.astro` |
| `scripts/` | `site-a.js`, `site-b.js` | `/assets/main/js/` |
| `media/` | Sponsor logos, CAD renders, merch images, loader videos (hashed file names) | `/assets/main/<file>` |
| `MainLayout.astro` | Page shell for public pages (fonts, styles, early script) | |

Pages themselves are in `src/pages/` because Astro requires it (and Wix hosting expects the Astro project at the
repo root). Each page file should stay thin and pull its content from here.

Shared brand media (logos, fonts) is not here: it is in [`packages/assets`](../../packages/assets/README.md).
Team photos are in `media/team/` ([docs/PHOTOS.md](../../docs/PHOTOS.md)).
