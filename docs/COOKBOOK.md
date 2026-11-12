# Cookbook: "How do I change X?"

Recipes for the edits people make most. Each one names the real files. Paths are from the repo root.

**Every recipe ends the same way:**

1. Make the edit on a new branch.
2. Check it on your computer: `pnpm dev`, open <http://localhost:4321>.
3. Run `pnpm check` and `pnpm build` (both must succeed).
4. Open a pull request. After review and merge, the site publishes itself in a minute or two
   ([DEPLOY-AND-CI.md](DEPLOY-AND-CI.md)).

Not sure what a tool word means? See [TOOLS.md](TOOLS.md). Today all of these are code edits. When the Site Manager app
exists ([SITE-MANAGER.md](SITE-MANAGER.md), #109) the summer camp, sponsors, merch and resources recipes will move
into forms; **it is not built yet**.

| Recipe | Jump |
| --- | --- |
| Add next season's robot | [1](#1-add-next-seasons-robot) |
| Add or change a sponsor logo | [2](#2-add-or-change-a-sponsor-logo) |
| Summer camp on/off, title and sign-up links | [3](#3-summer-camp-onoff-title-and-sign-up-links) |
| Merch: store link and items | [4](#4-merch-store-link-and-items) |
| Resources and links | [5](#5-resources-and-links) |
| The main menu and "Log In" | [6](#6-the-main-menu-and-log-in) |
| Contact info (email, address, Instagram) | [7](#7-contact-info) |
| Add a team app to the dashboard | [8](#8-add-a-team-app-to-the-dashboard) |
| Add a whole new public page | [9](#9-add-a-new-public-page) |
| Add, replace or remove an image | [10](#10-images-and-other-media) |
| Make an old address redirect | [11](#11-old-addresses-and-redirects) |
| Change who can do what (badges) | [12](#12-people-and-permissions) |

---

## 1. Add next season's robot

File: **`sites/main/data/robots.ts`**. Put the new entry at the **top** of the `ROBOTS` list: the first entry is
"Latest robot" on the home page and the first tab on `/robots`.

1. Add the CAD render to **`sites/main/media/`** (a `.webp` works well). It is published at `/assets/main/<file name>`.
   Existing files have random-looking names; any name without spaces is fine.
2. Copy an existing entry and fill in: `year` (also the link `/robots#2027`), `game`, `name`, `finish`, optional
   `homeFinish` (shorter text for the home card), `events`, `album` (see below), `img` (`"/assets/main/<file name>"`),
   `alt` (describes the picture for screen readers), `cad` (Onshape link, or `null` to hide the "View CAD" button) and
   `quip` (or `null`).
3. `album`: the name of a gallery album if one exists (the part after `#` in `/resources/media#socal-showdown-2025`),
   otherwise `null`, which shows "See all photos".

Nothing else needs to change. Gallery albums themselves are hand-written in
`sites/main/sections/media/Gallery.astro`, and their photos are not in git yet (issue #8; `public/gal/` is empty), so the
gallery shows broken pictures when you run it locally.

## 2. Add or change a sponsor logo

A sponsor logo is written out **by hand in three places** (no list file yet; the Site Manager will fix this):

| Where | What to add |
| --- | --- |
| `sites/main/sections/sponsors/Sponsors.astro`, the `<ul class="wall">` list | one `<li class="rv" style="--d:N"><img class="lg lg-<name>" src="/assets/main/<file>" alt="Sponsor name"></li>` |
| `sites/main/sections/home/SponsorMarquee.astro`, the **first** `<ul>` | the same `<li>` |
| `sites/main/sections/home/SponsorMarquee.astro`, the **second** `<ul aria-hidden="true">` | a copy with `alt=""` and `data-a="Sponsor name"` (the scrolling strip repeats itself so it loops) |

Steps:

1. Put the logo file in **`sites/main/media/`** (transparent PNG or WebP; the marquee is on a dark background, so use a
   light/white version if the logo is dark).
2. Copy an existing `<li>` in each of the three places and change `src`, `alt` and the `lg-<name>` class.
3. If the logo looks too big or small, add a size rule for `lg-<name>` next to the others in
   **`sites/main/styles/site.css`** (search for `.marquee .lg-simkin`). The defaults are 52px tall in the marquee and
   72px in the wall.
4. To **remove** a sponsor, delete its `<li>` from all three places (you can leave the file in `media/`, or delete it).

The sponsorship packet button is the `Open sponsorship packet` link in `Sponsors.astro`; the business email on the same
page is in that file too (see [contact info](#7-contact-info)). Tier text and the budget are written into
`Sponsors.astro` as well.

## 3. Summer camp on/off, title and sign-up links

- **Switch on/off and the headline**: **`sites/main/config/site.ts`**.
  - `SUMMER_CAMP_ENABLED = true` shows "Summer Camp" in the menu and a banner on the home page; `false` hides both. The
    `/summer-camp` page itself always exists so old links work.
  - `SUMMER_CAMP_TITLE` is the headline on the page and banner. Update the year each season.
- **Sign-up links, dates, price, grades and descriptions**: written directly in
  **`sites/main/sections/summer-camp/SummerCamp.astro`**. The "Sign up now" and "Sign up for week 1/2/3" buttons link to
  LAEF's registration site (`app.thestudiodirector.com/...`); replace those URLs each year with the new camp links.
  Search the file for `href=`, `$` (the price) and `2026-27` (the grades line).

## 4. Merch: store link and items

- **Store link**: `MERCH_STORE_URL` in **`sites/main/config/site.ts`**. The `/merch` page's main button uses it.
  The footer (`sites/main/components/Footer.astro`, "Team merch") has the same address typed in directly. Change both.
- **Items on `/merch`**: **`sites/main/sections/merch/Merch.astro`**. Each item is one `<li class="photo-card ...">` with
  its photo, category (`Apparel`, `Accessories`, `Bottles`, `Gift`), name, price and product link. Put new product photos
  in `sites/main/media/`. The small heading "11 items" near the top is typed in by hand; update the count when you add
  or remove items.

## 5. Resources and links

File: **`sites/main/data/resources.ts`**. Each entry in `RESOURCES` becomes a card on `/resources`:
`kind` (small label), `title`, `href`, `blurb`, `external: true` for links to other sites (opens in a new tab), and
optional `menuLabel`: if you give one, the link is **also** listed in the Resources dropdown in the main menu.
The apps on that page come from the apps list ([recipe 8](#8-add-a-team-app-to-the-dashboard)), not from this file.

## 6. The main menu and "Log In"

- **Menu**: **`sites/main/data/nav.ts`**. Each tab has an `id`, `label`, `href` and optional `children` for the
  dropdown. The `id` must match the `page` prop that the page passes to `MainLayout` (for example `page="robots"` in
  `src/pages/robots.astro`), which is how the current tab gets highlighted. The Summer Camp tab appears only when
  `SUMMER_CAMP_ENABLED` is on; the Resources dropdown is built automatically from Media, the apps list and any
  `menuLabel` resources.
- **"Log In" button**: its address is `LOGIN_URL` in `sites/main/config/site.ts` (the apps dashboard, `/apps`).

## 7. Contact info

There is no single contact file yet, and the Contact page is still a placeholder
(`sites/main/sections/contact/Contact.astro`, issues #76/#77). Today the details are typed in these places; search for the
old value (for example `grep -rn "losalfrc@gmail.com" sites src`) and change them all:

| What | Where |
| --- | --- |
| Team email, school address, Instagram, Remind, GitHub, The Blue Alliance, Amazon wishlist, booster club line (footer on every page) | `sites/main/components/Footer.astro` |
| Business email | `sites/main/sections/sponsors/Sponsors.astro` |
| Instagram link | `sites/main/sections/home/Hero.astro` and `sites/main/sections/outreach/Outreach.astro` |
| Booster checks / EIN text | `Sponsors.astro` and `Footer.astro` |
| The interest form on the Join page | `sites/main/sections/join/Join.astro`. The form checks the name and email in the browser but does not send them anywhere yet (the planned Wix forms are in the migration plan under Forms) |

## 8. Add a team app to the dashboard

One entry in **`apps/dashboard/src/apps.ts`** (the list of apps). The `/apps` dashboard, the Resources page and the
Resources menu all read it. Give it a unique `id`, `name`, `description`, `href` (its route under `/apps`), `status`
(`"live"` or `"planned"`; planned is greyed out with no link) and `access` (`"public"` shows to signed-out visitors,
`"team"` only to approved members). Building the app itself is in [ADD-AN-APP.md](ADD-AN-APP.md).

## 9. Add a new public page

1. Create **`src/pages/<name>.astro`** (the file name is the address). Copy a short existing page such as
   `src/pages/robots.astro`: it uses `MainLayout` (with `page="<tab id>"`), `PageHero` for the banner and one section.
2. Put the page's content in a section file under `sites/main/sections/<name>/`.
3. Add it to the menu ([recipe 6](#6-the-main-menu-and-log-in)).
4. Add the address to the table in [REDIRECTS.md](REDIRECTS.md).

Avoid addresses Wix reserves: `/api/auth/*`, `/_api`, `/_wix`, `/sw.js` (more in
[TROUBLESHOOTING.md](TROUBLESHOOTING.md#reserved-wix-paths)).

## 10. Images and other media

Media lives next to what uses it and is copied to a public address when Astro starts
(`integrations/sync-media.mjs`):

| Put the file in | It appears at | Use for |
| --- | --- | --- |
| `sites/main/media/` | `/assets/main/<file>` | Public-site images: sponsors, CAD renders, merch |
| `sites/main/media/team/` | `/assets/main/team/<file>` (in code: `media("team/<file>")` from `sites/main/lib/media.ts`) | Homepage and banner photos |
| `apps/<name>/media/` | `/assets/<name>/<file>` | One app's own images |
| `packages/assets/<folder>/` | `/assets/shared/<folder>/<file>` | Logos, fonts used by several parts |

To replace an image, overwrite the file keeping its name. **Never edit `public/assets/`**: it is regenerated.
Prefer `.webp` and keep files small; the repo is meant to stay light and bigger media is moving to Wix and Google Drive
(issue #8).

## 11. Old addresses and redirects

[REDIRECTS.md](REDIRECTS.md) lists every old address and its new page. Old `dev.team6220.org/#...` one-page links are
handled in code by `sites/main/data/old-anchors.ts`. Old *Wix* addresses (`/summer`, `/our-team`, ...) are redirected in
the Wix **URL Redirect Manager** during Phase 3; that is a dashboard task, not code.

## 12. People and permissions

Who may log in, who is a Team Member / Attendance Admin / Web Admin: that is done in the **Wix dashboard**, not in the
repo. See [WIX-SETUP.md](WIX-SETUP.md). To change what a *badge* is allowed to do inside an app you must change code:
the badge names are in `BADGES` in `packages/data/src/config.ts`, and see [ADD-AN-APP.md](ADD-AN-APP.md#4-decide-who-can-use-it-login-and-badges).
