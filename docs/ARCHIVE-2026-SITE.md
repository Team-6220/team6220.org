# Archive of the old team website (issue #82)

A copy of the old Wix site, team6220.org, as it was on **Nov 9, 2026**, taken before Phase 2 of the
[migration plan](MIGRATION-PLAN.md) so future teams can see what the site looked like. The files are **not in this repo**:
they are about 40 MB and show students. This page describes the bundle.

## What was captured

For each of the 11 pages below:

- full-page screenshot with a 1440 px wide window (`<page>-desktop.png`)
- full-page screenshot with a 390 px wide window (`<page>-phone.png`)
- the page's HTML after the page's scripts ran (`html/`)
- the page's visible text (`text/`)
- address, title, HTTP status and the links on the page (`index.json`)

Also saved: `robots.txt`, `sitemap.xml`, `pages-sitemap.xml`, and the one PDF the site links to (`site-files/`). The
search-engine settings of each page are in [SEO.md](SEO.md).

## Pages

All returned 200 on Nov 9, 2026. File names are the address with `/` replaced by `__`; the home page is `home`.

| Old address | Title | Notes |
| --- | --- | --- |
| `/` | Robotics \| FRC Team 6220 \| Los Alamitos, CA | Home: about, support, FIRST, mailing list sign-up |
| `/summer` | Summer Robotics Program \| LAHS FRC 6220 | 2026 FRC and LEGO summer camps |
| `/our-team` | Our Team \| FRC Team 6220 \| Los Alamitos, CA | |
| `/our-team/subteams` | OUR SUBTEAMS \| Los Al Robotics \| FRC Team 6220 | |
| `/sponsors-donations` | Sponsor Us \| FRC Team 6220 \| Los Alamitos, CA | |
| `/contact` | Contact \| FRC Team 6220 \| Los Alamitos, CA | |
| `/gallery` | Gallery \| FRC Team 6220 \| Los Alamitos, CA | List of seasons 2016 to 2025 (album pages are inside the page, not separate addresses) |
| `/copy-of-contact` | Contact \| FRC Team 6220 \| Los Alamitos, CA | Hidden duplicate of Contact (Wix name "APPLY") |
| `/yearbook` | Yearbook Pictures \| Los Al Robotics \| FRC Team 6220 | Hidden; photo captions for the school yearbook |
| `/saved-site-materials` | Saved Site Materials \| Los Al Robotics \| FRC Team 6220 | Hidden; summer camp sign-up note |
| `/fullscreen-page` | Fullscreen Page \| Los Al Robotics \| FRC Team 6220 | Hidden; empty |

The pages were found from the site's sitemap, its menu, and Wix's own page list in the page data.

## How it was captured

Playwright with Chromium (headless), one fresh browser window per page and size, `deviceScaleFactor` 1. For each page:
open it, wait for it to load, scroll to the bottom so lazy images load, scroll back, then take the screenshot and save
the HTML and text. The sitemap, `robots.txt` and the PDF were downloaded with `curl`. Nothing was logged in to and
nothing on Wix was changed. The script is a short Playwright loop; rerun it against the same address list to repeat.

## Limits of this archive

- It is a picture and a text copy, **not a working copy of the site**. Images, fonts and scripts are not saved, so the
  HTML files will not look right when opened offline. Use the screenshots to see the design.
- The **embedded forms** (mailing list sign-up, and similar) did not render in the screenshots: they show as empty
  space. The old Wix form submissions and data are separate and not part of this archive.
- **Gallery albums** are shown as the list of seasons; the photos inside each album open in Wix's own viewer and are
  not captured one by one.
- The **old site is not built for phones**: in a 390 px window it still draws a page about 1010 px wide, so the
  `-phone.png` files are wider than a phone and the menu is cut off. That is how the live site behaves.
- The Wix blog, members area and the Wix dashboard are not included.

## Where the files are and where to keep them

The bundle is a folder `archive-2026-site/` and a zip of it, `archive-2026-site.zip` (about 40 MB), made in the Claude Code
session's scratchpad. The session's scratchpad is temporary, so **the owner should copy it somewhere permanent now**.

Recommended:

1. Put the zip and the unzipped folder in the team's Google Drive, in a shared team folder (for example
   `Team 6220 / Archive / Website 2026`), owned by the team Workspace (team6220.org) rather than a person's account.
2. Keep the zip as the master copy; the folder is for browsing.
3. Do **not** commit it to the repo (size, and it shows students). Link to the Drive folder from this page once it exists.
4. Share it only with the team: the screenshots show students' photos and names.
5. Repeat the capture after Phase 3 if the team also wants a picture of the site at the switch date.
