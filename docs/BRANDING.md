# Branding: colors, fonts and logos

How the look of the site is controlled today, exactly which files to edit to change it, and what is planned.

> **Status.** Kaydi's Branding Standards v2.0 are **partly ready: only the colors are final**. The official palette now
> lives in **one place**, the `--brand-*` variables at the top of `packages/ui/src/tokens.css`, and the main site and
> the apps read it from there. Fonts, logo rules and wing-to-text spacing still wait for the next revision.

## Rules decided so far

- **Gold**: use Primary Gold `#ffa300` almost everywhere. Secondary Gold `#fa9504` only where a second gold is really
  needed (today: button hover and one chart bar).
- **Greys**: Secondary Grey `#33333f`, Tertiary Grey `#4e4a5b`, Secondary Light Grey `#c5c6cd`. Dark panels are
  Secondary Grey mixed into black (`--brand-panel`, `--brand-panel-2`).
- **Corners**: every rounded corner uses the main site's radius (`--radius`, 4px).
- **Karnivore** text is always all UPPERCASE or all lowercase, never mixed. The site uses uppercase.
- Write **6220**, never "622o".
- **No feather** decoration. Shadows, animations and dot patterns from the main site are welcome in apps.
- **Light and dark**: everything gets one light/dark button. Dark is the default and the device setting is ignored. The
  button is in the shared sidebar; the choice is saved in the browser as `team6220.theme` and put on
  `<html data-theme="...">`.
- **Sidebar**: every app shows the same sidebar (`packages/assets/scripts/app-sidebar.js`, styles in
  `packages/assets/styles/app-sidebar.css`): main site, all apps, then fullscreen, light/dark and account at the bottom.
  It lists the apps in `packages/assets/data/apps.json`.
- **Icons**: `packages/assets/scripts/icons.js` is the team icon set (24px grid, 1.8 stroke).
- **Fonts**: Karnivore for titles (class `t-title` or `var(--font-title)`), Jura for body text (`var(--font-body)`).

## The short version

| I want to change... | Edit | Affects |
| --- | --- | --- |
| A **brand color** or the corner radius | the `--brand-*` variables and `--radius` in `packages/ui/src/tokens.css` | The main site and everything wrapped in `AppLayout` |
| Colors, fonts, spacing of the **public website** | the `:root { ... }` block at the top of `sites/main/styles/site.css` | Every public page |
| Public-site **fonts** (files) | `packages/assets/fonts/` + the `@font-face` lines at the top of `site.css`; the Google Fonts link in `sites/main/MainLayout.astro` | Public pages |
| A **logo file** (PNG/SVG for people to download or `<img>`) | Overwrite the file in `packages/assets/logos/` keeping its name | Anything that links `/assets/shared/logos/...` |
| The **griffin/wing drawn in the header, footer and loader** | `sites/main/components/Sprite.astro` (inline SVG `symbol`s such as `wing`) | Public site chrome |
| **Favicon** and home-screen icons | Replace files in `packages/assets/favicon/` keeping their names | All pages (`BaseLayout.astro`) |
| **Inventory** look | `apps/inventory/ui/Styles.html` (`:root` tokens), `Fonts.html`, `Brand.html` | `/apps/inventory` only |
| **GoldSim** look | `apps/goldsim/packages/web/src/styles/tokens.css` | `/apps/goldsim` only |
| **WingIt** look | the `:root` block in `apps/wingit/css/style.css` | `/apps/wingit` only |

After any change: `pnpm dev` to look, then `pnpm check` and `pnpm build`.

## Today's mechanism in detail

### 1. The apps: `packages/ui/src/tokens.css`

`src/layouts/AppLayout.astro` imports `@team6220/ui/tokens.css`. It defines CSS variables on `:root`:

```css
--brand-gold: #ffa300;  --brand-gold-secondary: #fa9504;  --brand-blue: #4054e4;
--brand-black / --brand-white / --brand-grey / --brand-grey-tertiary / --brand-grey-light
--color-gold, --color-ink, --color-muted, --color-bg, --color-surface, --color-border, --color-danger
--font-body: system-ui, ...;  --radius: 4px;
--space-1 ... --space-5;      --shadow: ...
```

A `@media (prefers-color-scheme: dark)` block overrides the ink/background/surface colors, and a shared button class
`.t-button` (and `.t-button--quiet`) lives in the same file. App stylesheets (`apps/dashboard/src/dashboard.css`,
`apps/attendance/src/attendance.css`) use only these variables, so **changing a value here restyles all of them**. The file
says it is a starter: "the Phase 1 styling pass replaces these with the real brand; keep using the variable names and only
the values change." So: **keep the variable names, change the values.** `packages/ui/src/index.ts` is an empty placeholder
for future shared components.

### 2. The public website: `sites/main/styles/site.css`

Self-contained and imported only by `MainLayout.astro`, so apps do not inherit it. The top of the file holds:

- **Fonts**: `@font-face` for **Karnivore** (loaded from `/assets/shared/fonts/Karnivore.ttf`) and **Apex Mk2** (only a
  `local()` lookup today: if someone has the font installed it is used, otherwise the fallback; the licensed web font file
  has not been added, see the comment in the file).
- **Variables**: `--gold`, `--gold-hot`, `--ink`, `--paper`, `--blue`, panel/line/dim colors (all pointing at the `--brand-*` palette),
  `--display` / `--body` / `--tech` font stacks, spacing `--s1`..`--s6`, `--wrap`, `--r`.
- `color-scheme: dark`: the public site is one committed look (black and gold), not light/dark switching.

The Google-hosted fonts **Jura**, **Orbitron** and **Chakra Petch** are requested by a `<link>` in
`sites/main/MainLayout.astro`. To change the body/headline fonts: add the files or link, update the `@font-face`/link, and
change `--display`, `--body`, `--tech`.

Some colors are written directly (not as variables), for example in the animated intro/loader scripts
(`sites/main/scripts/site-a.js`, `site-b.js`) and in `Sprite.astro` (the griffin is filled `#ffa300`). Search the repo for the
old color code (`grep -rni "ffa300" sites packages`) when you change gold so nothing is left behind.

### 3. Logos and fonts as files: `packages/assets`

`packages/assets/logos/` holds the team's logo kit under its original file names (`6220LogoGold.png`,
`6220LogoVectorGold.svg`, `Lockups/DoubleLockup2.svg`, ...), `fonts/` holds `Karnivore.ttf` and `favicon/` the browser icons.
They are published automatically (`/assets/shared/logos/<file>`, `/assets/shared/fonts/<file>`, favicons at the site root).
**To replace a logo, overwrite the file keeping its name** and everything that uses it updates. Details and the favicon
sizes are in [packages/assets/README.md](../packages/assets/README.md). Rules: new folders in `packages/assets` are
published at `/assets/shared/<folder>/` with no extra setup.

Licensing: logos and media are © Los Al Robotics and not under the MIT license; Karnivore is freeware with conditions
(unmodified, not for sale) ([NOTICE.md](../NOTICE.md), `apps/goldsim/packages/web/public/brand/README.md`).

### 4. Apps that have their own styling

- **Inventory** keeps its original Apps Script UI. `apps/inventory/ui/Styles.html` says "All colors are tokens below; change
  them here only." (`--orange: #FFA300`, `--orange-2: #FA9504`, `--blue`, ...). Fonts are embedded in `Fonts.html`
  (Karnivore Lite and Azoft Sans as data URIs, Jura from Google Fonts). Any file under `apps/inventory/ui/` that you change on
  purpose must contain a `team6220.org:` comment, or `apps/inventory/test/shim.test.ts` fails because the copy no longer
  matches `backend/apps-script/inventory/` ([apps/inventory/README.md](../apps/inventory/README.md)).
- **GoldSim** has its own `tokens.css` ("identical to HossHarman/WingIt", gold `#ffa300`). **WingIt** has its own `:root`
  block in `css/style.css`. Both keep their own tooling.
- **The old Apps Script apps** (`backend/apps-script/*`) are being retired; don't restyle them.

## What the guidelines should settle (known inconsistencies)

Written down now so nobody has to rediscover them:

- **Fonts.** The public site uses Karnivore (headlines), Jura (body) and Apex Mk2 (labels, not yet licensed/loaded, with
  Orbitron and Chakra Petch as stand-ins); the shared app tokens use the system font. Inventory uses Karnivore Lite, Jura and
  Azoft Sans.
- **Light vs dark.** The public site is dark only; the app tokens follow the visitor's light/dark setting.
- **Logo versions** exist in several places: files in `packages/assets/logos/`, an inline SVG in `Sprite.astro`, and copies
  inside GoldSim's `public/brand/`.

## What will change when the guidelines land (the plan)

None of this is built; it is the intended direction from the migration plan:

1. Fill `packages/ui/src/tokens.css` with the official values (colors, fonts, spacing, corner radius) and grow shared
   styles for buttons, forms, tables and cards (in `packages/ui`).
2. Point the public site's `:root` variables at those tokens (for example `--gold: var(--color-gold)`), so there is **one
   place** to change a color. Move fonts the same way.
3. Convert the apps to the shared variables and components, remove their private copies, and check each page in light and
   dark mode and on a phone.
4. Replace the hand-drawn `Sprite.astro` griffin with the official logo files from `packages/assets/logos`.
5. Update this page and the `packages/ui` comments when it is done.

Until then, **new apps should use `@team6220/ui/tokens.css` through `AppLayout`** and the `--color-*`, `--space-*` and
`.t-button` names (not their own colors) so they pick up the final brand automatically ([ADD-AN-APP.md](ADD-AN-APP.md)).
