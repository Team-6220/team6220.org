# Old addresses and where they go

The new site has one page per address (structure from issue #69). Old links must keep working.

## Old Wix pages (add as 301 redirects in Phase 3)

In Phase 3, step 2 of the [migration plan](MIGRATION-PLAN.md), add these as 301 redirects in Wix's
**URL Redirect Manager** (in the dashboard's SEO tools):

| Old address (team6220.org) | New address | Notes |
| --- | --- | --- |
| `/summer` | `/summer-camp` | The page always exists; it shows in the menu only while the summer camp switch is on |
| `/our-team` | `/about` | |
| `/our-team/subteams` | `/about` | No subteams page yet. Change this if one is added |
| `/sponsors-donations` | `/support-us` | |
| `/contact` | `/about/contact` | |
| `/gallery` | `/resources/media` | |

## Old one-page addresses on dev.team6220.org

The prototype was one page with `#` addresses. A small script on the home page (`MainLayout.astro`, map in
`sites/main/data/old-anchors.ts`) sends them to the new pages, so nothing needs to be set up for these.

| Old | New |
| --- | --- |
| `/#about` | `/about` |
| `/#history` | `/about/history` |
| `/#robots` | `/robots` |
| `/#join` | `/about/join` |
| `/#faq`, `/#apply` | `/about/join#faq`, `/about/join#apply` |
| `/#sponsors` | `/support-us` |
| `/#budget`, `/#sponsor-list` | `/support-us#budget`, `/support-us#sponsor-list` |
| `/#resources` | `/resources` |
| `/#outreach` | `/about/outreach` |
| `/#gallery`, `/#social` | `/about/outreach#gallery`, `/about/outreach#social` |
| `/#contact` | `/about/contact` |
| `/#merch` | `/merch` |
| `/#photos` | `/resources/media` |
| `/#photos-<album>` | `/resources/media#<album>` |

## Page addresses

| Page | Address |
| --- | --- |
| Home | `/` |
| Summer Camp | `/summer-camp` |
| About: Philosophy & Team Intro | `/about` |
| About: History | `/about/history` |
| About: Outreach | `/about/outreach` |
| About: Join | `/about/join` |
| About: Contact | `/about/contact` |
| Robots | `/robots` (one season: `/robots#2025`) |
| Support Us | `/support-us` |
| Merch | the team store (menu); the item list is at `/merch` |
| Resources | `/resources` |
| Media | `/resources/media` (one album: `/resources/media#<album>`) |
| Apps dashboard (Log In) | `/apps`, apps at `/apps/<name>` |

Pages are built as `about.html`, `about/history.html`, ... (`build.format: "file"` in `astro.config.mjs`) so
GitHub Pages serves `/about` directly, without redirecting to `/about/`.
