# Shared assets

Brand media that **any** part of the site (main site or any app) may use. Nothing here belongs to one page.

| Folder | URL on the site | Contents |
| --- | --- | --- |
| `logos/` | `/assets/shared/logos/<file>` | Logo variations from the team's logo kit, with their original file names (`6220LogoGold.png`, `Lockups/DoubleLockup2.svg`, ...) |
| `fonts/` | `/assets/shared/fonts/<file>` | `Karnivore.ttf` |
| `loader/` | `/assets/shared/loader/<file>` | The page-change loader's spin video (`pgl-spin.webm`, `.mp4`) |
| `favicon/` | `/favicon.ico`, `/favicon.svg`, `/favicon-32.png`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png` and the wing set `/favicon-wing.svg`, `/favicon-wing-32.png`, `/apple-touch-icon-wing.png` | Browser tab and home-screen icons. The main site uses the gold logo; the team apps use the gold wing |

Any new folder you add here is published automatically at `/assets/shared/<folder>/`. Use the URL straight from
HTML, CSS or React, for example `<img src="/assets/shared/logos/6220LogoVectorGold.svg">`.

**Use the SVG version of a logo whenever there is one** (`...Vector.svg`, `...VectorGold.svg`); PNGs are for places that
cannot show an SVG, such as favicons.

## Changing things

- **Replace a logo:** overwrite the file keeping its name. Everything that uses it updates.
- **Change the favicon:** replace the SVGs in `favicon/` (`favicon.svg` is the gold logo, `favicon-wing.svg` the gold wing) and
  re-render the PNGs and `favicon.ico` from them (transparent background; the logo set is 16/32/48 for the `.ico`, 32, 180, 192
  and 512 pixels, the wing set 32 and 180). Keep the file names.
- **Never edit `public/assets/`.** It is generated from these folders (see `integrations/sync-media.mjs`).

Photos don't belong here; they live with the site that uses them. Media that only one
site or app uses goes in that site's or app's own `media/` folder instead.
