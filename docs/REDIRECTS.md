# Old addresses and where they go

The new site has one page per address (structure from issue #69). Old links must keep working.

**The list of old addresses lives in [redirects.json](redirects.json)** (old address, new address, status 301, decision,
note). Edit that file, never the tables below: they are generated from it.

| File | What it is |
| --- | --- |
| [redirects.json](redirects.json) | The map. One entry per old Wix page, plus the old `#` addresses of the prototype |
| [redirects.csv](redirects.csv) | The same Wix pages as a two-column CSV, ready to paste or import into Wix's URL Redirect Manager. Generated |
| `scripts/redirects/` | `check.mjs` (every new address exists in the built site), `csv.mjs` (writes the CSV and the tables below), and the test |

```sh
pnpm redirects:csv      # after editing redirects.json: rewrites redirects.csv and the tables below
pnpm build
pnpm redirects:check    # every new address is a real page / anchor in dist/; the CSV and tables are up to date
```

`pnpm test` runs the same check on every pull request (against `src/pages` when there is no build yet), and the
e2e workflow runs it again strictly against the built site.

## How to use it in Phase 3, step 2

1. Open the Wix dashboard, **Marketing & SEO → SEO tools → URL Redirect Manager**.
2. Import [redirects.csv](redirects.csv) (**Import**, choose "New"; the file has a header row and two columns, old address
   then new address), or add the rows by hand from the table below. Wix takes at most 500 rows per file.
3. Rows marked **proposed** are suggestions, not decisions. Get a yes from the web team, then change `decision` to
   `confirmed` in `redirects.json` (or change the target and regenerate).
4. After the switch, open each old address once and check it lands on the new address.

Wix may not accept a `#` in the new address (`/#contact`). If it refuses, use `/` for the two Contact rows: visitors
land on the home page and can scroll to the footer.

## Open item: Contact

The owner decided that "Contact" under About will **not** have its own page: it scrolls to the footer. So `/contact`
and `/copy-of-contact` go to `/#contact` (the footer's id). But `/about/contact` and the menu item still exist, and the
home page script (`sites/main/data/old-anchors.ts`) still sends `/#contact` to `/about/contact`. When that page is
removed, also remove `contact` from `old-anchors.ts` and `redirects.json`; until then `pnpm redirects:check` prints a
warning about it.

<!-- redirects:start (generated from docs/redirects.json by `pnpm redirects:csv`; do not edit by hand) -->

### Old Wix pages (301 redirects, Phase 3 step 2)

| Old address (team6220.org) | New address | Status | Decision | Notes |
| --- | --- | --- | --- | --- |
| `/summer` | `/summer-camp` | 301 | agreed | The page always exists; it shows in the menu only while the summer camp switch is on. |
| `/our-team` | `/about` | 301 | agreed |  |
| `/our-team/subteams` | `/about` | 301 | agreed | No subteams page yet. Change this if one is added. |
| `/sponsors-donations` | `/sponsors` | 301 | agreed |  |
| `/contact` | `/#contact` | 301 | owner decision | Owner decision: Contact (under About) has no page of its own; it scrolls to the footer. The footer's id is `contact` (sites/main/components/Footer.astro), so the target is /#contact. This replaces the earlier /about/contact in REDIRECTS.md. While /about/contact still exists, the home page script maps #contact to it (see anchors below); remove `contact` from sites/main/data/old-anchors.ts when that page is removed, or this redirect lands on /about/contact. If Wix's redirect manager refuses a # in the new address, use / instead. |
| `/copy-of-contact` | `/#contact` | 301 | owner decision | Wix page named APPLY, same content as /contact. SEO.md suggested /about/contact; the owner decision for Contact (footer) applies. See /contact. |
| `/gallery` | `/resources/media` | 301 | agreed |  |
| `/yearbook` | `/resources/media` | 301 | **proposed** | SEO.md names no target (one-off page of yearbook photo captions, in the old sitemap). Nearest page: Media. |
| `/saved-site-materials` | `/summer-camp` | 301 | **proposed** | SEO.md: a 'sign up with LAEF' summer camp registration note; suggested /summer-camp. In the old sitemap. |
| `/fullscreen-page` | `/` | 301 | **proposed** | SEO.md: empty template page; suggested /. Not in the old sitemap. |
| `/team` | `/about` | 301 | **proposed** | Never a real page: the old canonical address of /our-team, which returned 404. Google may still know it. Same target as /our-team. |
| `/sponsor` | `/sponsors` | 301 | **proposed** | Never a real page: the old canonical address of /sponsors-donations, which returned 404. Same target as /sponsors-donations. |

### Old one-page addresses (`#`, handled by a script)

| Old | New | Notes |
| --- | --- | --- |
| `/#about` | `/about` |  |
| `/#history` | `/about/history` |  |
| `/#robots` | `/robots` |  |
| `/#join` | `/about/join` |  |
| `/#faq` | `/about/join#faq` |  |
| `/#apply` | `/about/join#apply` |  |
| `/#sponsors` | `/sponsors` |  |
| `/#budget` | `/sponsors#budget` |  |
| `/#sponsor-list` | `/sponsors#sponsor-list` |  |
| `/#resources` | `/resources` |  |
| `/#outreach` | `/about/outreach` |  |
| `/#gallery` | `/about/outreach#gallery` |  |
| `/#social` | `/about/outreach#social` |  |
| `/#merch` | `/merch` |  |
| `/#photos` | `/resources/media` |  |
| `/#photos-<album>` | `/resources/media#<album>` | An album in the old gallery: any #photos-<name>. The check tests the pattern, not each album. |

<!-- redirects:end -->

The `#` addresses on `dev.team6220.org` need no setup in Wix: a small script on the home page (`MainLayout.astro`, map
in `sites/main/data/old-anchors.ts`) sends them to the new pages. `#photos-<album>` goes to `/resources/media#<album>`.

## Page addresses

| Page | Address |
| --- | --- |
| Home | `/` |
| Summer Camp | `/summer-camp` |
| About | `/about` |
| About: History | `/about/history` |
| About: Outreach | `/about/outreach` |
| About: Join | `/about/join` |
| About: Contact | `/about/contact` (to be replaced by the footer, see above) |
| Robots | `/robots` (one season: `/robots#2025`) |
| Sponsors | `/sponsors` |
| Merch | `/merch` (the merch page, with a link to the team store) |
| Resources | `/resources` |
| Media | `/resources/media` (one album: `/resources/media#<album>`) |
| Apps dashboard (Log In) | `/apps`, apps at `/apps/<name>` |

Links use addresses without a trailing slash (`/about`). Pages are built in Astro's default folder format
(`about/index.html`), so on GitHub Pages (dev.team6220.org) `/about` redirects once to `/about/`; both work.
