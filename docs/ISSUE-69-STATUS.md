# Issue #69 status audit

Audit date: 2026-11-09. Built from `origin/main` at `c6620c0` (`pnpm install && pnpm build`, served `dist/`, checked with
Playwright and by reading `sites/main`, `src/pages` and the config). Items marked "this PR" are fixed by the pull request that
adds this file. Hoss' checkboxes in #69 are not kept up to date, so this list is the check, not the issue.

**Status:** DONE, PARTIAL, TODO, BLOCKED (waits for Kaydi's branding guidelines), NEEDS-OWNER (a copy, design, content, asset or decision call).

**Who can do it** (for everything not DONE):

- `agent-ok`: no wording or design choice involved.
- `needs-owner-copy`: wording to write or approve.
- `needs-owner-design`: layout or visual decision.
- `needs-assets`: a file, link or piece of information is missing (named in the row).
- `needs-decision`: a choice for Hoss and the leads.

## Navigation and page addresses

| Item | Status | What is missing | Who |
| --- | --- | --- | --- |
| Tabs with several subpages where categories differ | DONE | About and Resources have dropdowns (`sites/main/data/nav.ts`) | n/a |
| Tabs: Home, Summer Camp (if enabled), About, Robots, Sponsors, Merch, Resources, plus Log In | PARTIAL | All tabs exist. Log In goes to `/apps`, which only shows "Loading team apps" until the Wix login is connected | agent-ok (Phase 1 login work) |
| About split into Philosophy and Team Intro, History, Outreach, Join, Contact; apps and Media under Resources | PARTIAL | Pages and Resources entries exist. `/about/contact` is still a "Content coming soon" placeholder (contact info is in PR #122). Outreach has no extra events from the team binder | needs-owner-copy |
| Page addresses like `/about/outreach` | DONE | All 17 pages have clean addresses; old `#` addresses redirect | n/a |
| No `#` in page addresses | DONE | `/#about` style links are redirected by a script on the home page (`old-anchors.ts`) | n/a |
| Clicking a tab with a dropdown goes to the top of that tab's page | DONE | Verified in Chromium: clicking About or Resources from another page, or from a scrolled page, lands on that page at scrollY 0. The tab is a real link; the `+` button opens the dropdown | n/a |
| "Media", not "Pictures" or "Gallery" | DONE | Page and menu say "Media" | n/a |
| Summer Camp port, easy for webmasters to switch, banner while active | DONE | `SUMMER_CAMP_ENABLED` in `sites/main/config/site.ts` (currently `false`) controls the tab and the home banner; `/summer-camp` holds the full port. A forms editor for it is planned in #111 | n/a |

## Branding and naming (blocked until Kaydi's guidelines, expected mid-to-late November)

| Item | Status | What is missing | Who |
| --- | --- | --- | --- |
| "The Golden Griffins", while the site mainly says "Los Al Robotics" | BLOCKED | Header, footer and page titles still say "Golden Griffins" with "FRC Team 6220". Which name leads is a branding decision. Only the intro animation's accessible label was changed (this PR) | needs-decision |
| Nonprofit is "Los Al Robotics", EIN unchanged | DONE (this PR) | Footer and the sponsors page "make checks payable to" line fixed. Two phrases still say "booster club" / "501(c)(3) booster" (sponsors hero, home Sponsors card). Those are wording, so left alone | needs-owner-copy (leftover phrases only) |
| Header logo on the left, before the text | BLOCKED | Wordmark is at the far left and the logo is centered (x 412 at 1366px) | needs-owner-design |
| Footer logo is the griffin-with-wings file, not three images | BLOCKED | Footer builds it from two wing symbols and a griffin symbol. `packages/assets/logos/6220WingsAndLogoVector.svg` exists | needs-owner-design |
| SVG instead of PNG for logos | BLOCKED | Header, footer and intro use inline SVG already. Favicons are PNG/ICO (normal). Sponsor logos are PNG (not team logos). FIRST logo SVG is tracked in #92 | needs-assets |
| Wings around text too large or text too small | BLOCKED | Waits for the guidelines | needs-owner-design |
| Scribbles under headings look too corporate | NEEDS-OWNER | Unclear which element this is. Headings carry a short gold rule (`.ruled`). Needs Hoss to say what to change | needs-owner-design |
| Feather icon overused, not team branding | NEEDS-OWNER | Feathers still appear on Home (two cards) and the Join FAQ. A team-drawn replacement or removal is needed | needs-owner-design |
| Feather animation at the start | DONE | Owner ticked it ("it's growing on me"). The intro is unchanged | n/a |
| Karnivore font without the dot in the zero (#78) | NEEDS-OWNER | Site still ships the original `packages/assets/fonts/Karnivore.ttf`. Needs the edited font file from Hoss and the redistribution OK from the font creator | needs-assets |

## About, history and copy

| Item | Status | What is missing | Who |
| --- | --- | --- | --- |
| About page needs a central place for team philosophy and pillars | PARTIAL | `/about` has one "student-led, student-driven" paragraph; the team pillars are not there | needs-owner-copy |
| Rewrite most main and About copy | NEEDS-OWNER | Nothing to audit; copy is Hoss' | needs-owner-copy |
| Skills on About: more industry-applicable, better looking | NEEDS-OWNER | Skills are seven plain chips (CAD, Machining, Electrical, Java / WPILib, Strategy & scouting, Business & outreach, Media) | needs-owner-copy |
| Timeline most recent first | DONE (this PR) | `/about/history` now lists 2024–2026, 2020–2023, 2017–2019, 2016 | n/a |
| Update team history | NEEDS-OWNER | Waits for Hoss' history document | needs-owner-copy |

## Join and forms

| Item | Status | What is missing | Who |
| --- | --- | --- | --- |
| Join should not say "come to any meeting" or allow mid-year joining; one newsletter form; updated application info (#76) | NEEDS-OWNER | Page still has "Come to a meeting" with times, and an FAQ answer "Can I join mid-year? Yes". The form is a design preview ("nothing was sent yet") | needs-owner-copy |
| Join page about "why" more than "how"; dues, checklist, summer camp priority | NEEDS-OWNER | Not started; needs Hoss' FAQ content | needs-owner-copy |
| Better forms, automatic emails to groups (#76) | TODO | Interest form is not connected to anything. Needs the Wix form, a Google Group per topic and an automation (plan in MIGRATION-PLAN "Forms") | needs-assets (Wix form ID and group addresses; code wiring is then agent-ok) |

## Robots

| Item | Status | What is missing | Who |
| --- | --- | --- | --- |
| Robots as its own tab, easy to add yearly | DONE | `/robots`, one entry per robot in `sites/main/data/robots.ts` | n/a |
| More robots, and a 3D viewer for robots with CAD | PARTIAL | Four robots (2026, 2025, 2024, 2019); none for 2017, 2018, 2020 to 2023. No viewer | needs-assets (CAD renders and info per older robot; compressed `.glb` per robot with CAD) |
| Goober: 3rd place at CA District LA, no district playoffs | DONE (this PR) | Best finish now reads "CA District Los Angeles Event · 3rd place" on `/robots` and on the home card | n/a |
| CAD links not all going to 2026 (robots tab and Resources) | PARTIAL | Only Goober has a link. Nessie (2025), George (2024) and the 2019 robot have `cad: null`, so no button shows. The Resources "CAD on Onshape" card still links the 2026 document. No link was invented | needs-assets (Onshape links for 2025, 2024, 2019; decision on the Resources card) |
| More videos of the robot in action | NEEDS-OWNER | No robot videos on the page | needs-assets |

## Resources

| Item | Status | What is missing | Who |
| --- | --- | --- | --- |
| Resources confusing (TBA and History there), master link, helpful links (FIRST dashboard, Chief Delphi) | PARTIAL | Cards: CAD, GitHub, The Blue Alliance, Team history, Apps, Media, Archive. No master link, no helpful-links section | needs-owner-design |
| Dropdown straight to each resource plus the grid page, with sections | PARTIAL | Dropdown lists Media, Apps, each app, CAD, GitHub, The Blue Alliance. Grid has Apps, Media and Archive sections, but Archive says "Content coming soon" | needs-assets (archive content) |
| Team structure and team handbook (Google Docs) | NEEDS-OWNER | Not on the site | needs-assets (doc links) |
| Branding guidelines | BLOCKED | Waits for the guidelines | needs-assets |
| Tech/team binders with an archive; easy loading of Google Docs, Slides and Sheets | NEEDS-OWNER | No binders. No embed system | needs-decision (binder format: like HighTide/ALT-F4 or 254) |
| Link to team and subteam resource docs | NEEDS-OWNER | Not on the site | needs-assets (doc links) |

## Sponsors

| Item | Status | What is missing | Who |
| --- | --- | --- | --- |
| Home "Sponsor us" renamed "Support us", elsewhere unchanged | DONE | Home hero button reads "Support us" | n/a |
| Amazon wishlist featured on the Sponsors page | NEEDS-OWNER | Only in the footer's Support column | needs-owner-design |
| Sponsors tab is one click, no dropdown | DONE | `/sponsors` has no dropdown | n/a |
| Replace stats with ones from the packet; rework the page | NEEDS-OWNER | Stats are "2016", "$6K" and "60%"; page is unchanged | needs-owner-copy |
| Sponsorship packet as a PDF on our site | NEEDS-OWNER | Button opens a Google Slides link | needs-assets (the PDF) |
| Sponsor logos in color, easy yearly upload | NEEDS-OWNER | Logo files are white-only PNGs (RTX, Boeing, CTC Global, LAEF and others). Upload system is planned in #112 | needs-assets (color logo files) |

## Media and performance

| Item | Status | What is missing | Who |
| --- | --- | --- | --- |
| Photos too low resolution (#8) | PARTIAL | Home and page photos are 724 to 1494 px wide WebP. The gallery albums are not in git, so `dist/gal/` is empty in a clean build and the History and Media pages show broken photos until they are supplied (PHOTOS.md, #8, #94, PR #118) | needs-assets (higher-resolution originals; Wix or Drive hosting) |
| Auto-loading galleries from Google Drive with member upload (#8) | TODO | Gallery is a fixed list in `site-b.js` | needs-decision (Drive folders, Wix media setup) |
| Loading animation only when loading is needed | PARTIAL | Home intro is a fixed 4.1 s animation on the first home visit per browser session, with a Skip button. The page-change loader plays on every page change on `main`; PR #125 changes that | needs-decision (intro); agent-ok (loader, in PR #125) |

## Footer and contact

| Item | Status | What is missing | Who |
| --- | --- | --- | --- |
| "Build" links assorted; add Chief Delphi; footer categories confusing; Vietnamese text | NEEDS-OWNER | Build column mixes GitHub, TBA, Our robots, FIRST. No Chief Delphi. "Chào cô Trâm :))" is still there. No credits page | needs-owner-design |
| We don't have a Remind (#77) | TODO | Footer and Join form still link Remind. Fixed in open PR #122 for the footer; the Join form note is Join copy | agent-ok (in PR #122) |
| Defunct `losalfrcbusiness@gmail.com` to operations@team6220.org, add 657-222-6220 (#77) | TODO | Still on `/sponsors`; no phone number anywhere. In open PR #122 | agent-ok (in PR #122) |
| LinkedIn link (#77) | NEEDS-OWNER | No link. PR #122 notes it has no LinkedIn | needs-assets (LinkedIn URL) |
| Do not show losalfrc@gmail.com (#77) | TODO | Footer still shows and copies it. In open PR #122 | agent-ok (in PR #122) |

## Ideas and decisions for Hoss and leads

| Item | Status | What is missing | Who |
| --- | --- | --- | --- |
| Team blog or Instagram feed page | NEEDS-OWNER | Not built; Instagram is only a link | needs-decision |
| Google Sheets calendar, custom calendar app, public or private meeting schedule | NEEDS-OWNER | Not built | needs-decision |
| Site Manager app (#109) | TODO | Planned (`docs/SITE-MANAGER.md`, #110 to #115 open); no app code yet. Needs the Phase 2 `/api` server | agent-ok (Phase 2) |

## Sub-issues

| Issue | State on `main` |
| --- | --- |
| #8 Media from Wix instead of git | Not done: media still in git or missing; Wix/Drive hosting not set up |
| #72 Logo usage | Not done: blocked on branding guidelines |
| #75 Apps under Resources | Done: each live app is in the Resources dropdown and in an Apps section on `/resources`; no Apps tab. The owner can close it |
| #76 Forms | Not done: forms not connected |
| #77 Contact info and links | Open PR #122 covers part of it (no LinkedIn) |
| #78 Karnivore font | Not done: waits for Hoss and the font creator |
| #109 Site Manager | Not started in code; plan only |

## Count (54 checklist items)

| Status | Items |
| --- | --- |
| DONE | 13 (3 of them fixed by this PR) |
| PARTIAL | 9 |
| TODO | 6 |
| BLOCKED | 6 |
| NEEDS-OWNER | 20 |

Who can do the 41 items that are not DONE: agent-ok 5, needs-owner-copy 8, needs-owner-design 8, needs-assets 14, needs-decision 6.

## Not changed by this PR (ambiguous or not mechanical)

- "Golden Griffins" in the header wordmark, footer brand, hero heading, page titles (`· Golden Griffins`) and the WingIt text: tied to the blocked branding decision, and some need a sentence change.
- "Our booster club is a 501(c)(3)" (sponsors hero) and "a 501(c)(3) booster" (home card): wording.
- History copy and badge "State Championship 2026" and the "finishing the season at the Southern State Championship" sentence: the History page may need an owner check against the Goober best-finish correction.
- Robot CAD links for 2025, 2024 and 2019: not invented.
