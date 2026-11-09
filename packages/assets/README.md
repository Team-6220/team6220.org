# Shared assets

Brand media that **any** part of the site (main site or any app) may use. Nothing here belongs to one page.

| Folder | URL on the site | Contents |
| --- | --- | --- |
| `logos/` | `/assets/shared/logos/<file>` | Logo variations from the team's logo kit, with their original file names (`6220LogoGold.png`, `Lockups/DoubleLockup2.svg`, ...) |
| `fonts/` | `/assets/shared/fonts/<file>` | `Karnivore.ttf` |
| `favicon/` | `/favicon.ico`, `/favicon-32.png`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png` | Browser tab and home-screen icons |

Any new folder you add here is published automatically at `/assets/shared/<folder>/`. Use the URL straight from
HTML, CSS or React, for example `<img src="/assets/shared/logos/6220LogoGold.png">`.

## Changing things

- **Replace a logo:** overwrite the file keeping its name. Everything that uses it updates.
- **Change the favicon:** replace the files in `favicon/` (keep the names). The current ones are
  `6220LogoBlackGoldBackgroundBig.png` resized to 16/32/48 (the `.ico`), 32, 180, 192 and 512 pixels.
- **Never edit `public/assets/`.** It is generated from these folders (see `integrations/sync-media.mjs`).

Rules: no photos of students here (see [../../docs/PHOTOS.md](../../docs/PHOTOS.md)); those live with the site that uses them. Media that only one
site or app uses goes in that site's or app's own `media/` folder instead.
