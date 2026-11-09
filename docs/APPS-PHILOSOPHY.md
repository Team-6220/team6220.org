# Why the team apps exist, and how they are designed

This page explains why Team 6220 builds its own apps on team6220.org and the design rules behind them, so new
members and future maintainers can follow the same thinking.

**How to read it.** Statements with a named source come from the [Migration Plan](MIGRATION-PLAN.md),
[apps/README.md](../apps/README.md), [packages/data/README.md](../packages/data/README.md) or an app's own docs.
Anything marked **Proposed** is an inference by the assistant that wrote this page (issue #79) and has not been
confirmed by the team. Please correct or delete it.

## Why the apps exist

- **One home for everything.** The plan says that today the team's apps are "scattered across Google Apps Script
  links, GitHub Pages and Google Forms". Afterward there is one dashboard (`/apps`) and one login.
- **The site is where the team's tools and its public face meet.** The original redesign notes want the website to
  have "everything": documentation, internal team resources, CAD, history
  ([redesign/ORIGINAL-REDESIGN.md](redesign/ORIGINAL-REDESIGN.md)). The apps are the interactive part of that.
- **Real software skills.** The plan says website and app work becomes "normal software work (React, Git, pull
  requests)", so it is easier to share across the team and pass to future leaders.
- **Replace stopgaps.** Inventory and Attendance began as Apps Script apps; Production Tracking is done with Google
  Forms and spreadsheets (apps/README.md, the plan). Each app is meant to replace a tool the team already uses.
- **Proposed:** the apps also serve the team's mission of teaching students, because students build and run the
  tools they use. WingIt (teaches the team's design principles) and GoldSim (a strategy and design simulator that
  is open source) are the clearest examples.

## Design rules

### One login for everything

Members sign in once, with Wix Members and "Sign in with Google", using any Gmail account (no team6220.org account is
needed). Signups need approval from a Web Admin, who gives the `Team Member` badge. Leads get extra badges (for
example `Attendance Admin`) as their roles need. (Plan, "Login and permissions".)

### Wix is the backend, not the website builder

The team keeps Wix for hosting and for storing data: databases (CMS collections), member logins, form submissions
and email. It stops being the place pages are designed ("headless"). Every app gets its own CMS collections with an
app prefix, such as `inventory_items`. The one exception is Attendance, which keeps writing the same Google Sheet
through Apps Script so its format never changes. (Plan, "Backends and data".)

### Apps never touch Wix directly

Apps never import the Wix SDK. They call functions from `@team6220/data`, the only code allowed to talk to Wix and
Apps Script. In Phase 1 those functions call Wix from the browser; in Phase 2 they call server `/api` endpoints, so
the backend can change without touching the apps' screens. (Plan, "Monorepo structure"; apps/README.md;
packages/data/README.md.)

### Public versus team

Each app is marked `public` (shown to everyone, signed in or not) or `team` (approved members only) in
`apps/dashboard/src/apps.ts`, the single list of apps. Open-source tools such as GoldSim stay public; the Pit
display is public and read-only. Anything that writes data or shows team-internal information needs a login.
Admin-only actions need a badge. Until Phase 2, hiding a button in the browser is only cosmetic. The real locks
are Wix CMS permissions ("site members", never "Anyone") and the attendance Apps Script, which checks the member's
token and badges with Wix itself, and in Phase 2 every action is checked in an `/api` endpoint. Student ID numbers
are never shown to viewers. (Plan, "Login and permissions"; packages/data/README.md; apps/README.md.)

### Built for phones, kiosks and bad Wi-Fi

- Attendance has a full-screen **kiosk mode** where students scan an ID card with a USB or Bluetooth scanner or
  type the ID, with big green, amber and red feedback. (apps/README.md.)
- Scouting is planned to work "from the stands, even with bad Wi-Fi", with an offline queue in the browser. (Plan.)
- The Pit display is a public read-only page for the pit TV, with no login needed. (Plan.)
- The plan's Phase 1 checklist includes checking every page on a phone.
- **Proposed:** treat phone and kiosk use as a requirement for every new app, not an afterthought.

### Simple for new members

- One dashboard with one card per app, in one list; adding an app is adding one entry. (apps/README.md.)
- The old Inventory screen was kept unchanged on purpose, behind a small compatibility shim, so members see the same
  tool they already know, and the old app stays live until the new one survives a real team meeting.
  (apps/inventory/README.md.)
- Inventory has no separate role: every approved Team Member can edit (team decision, Nov 2026).
- Attendance has a "Did I sign in?" check, and every app has demo modes (`?demo=...`) so people can try screens with
  made-up data. (apps/README.md.)
- **Proposed:** an app should be usable by a first-year member without a training session.

### Easy for future students to maintain

- One repository, one language family (Astro and React), so any programmer on the team can work on any part.
  (Plan.)
- Each app owns its folder and has its own `CODEOWNERS` line, so pull requests go to that app's maintainers.
- Brand colors and fonts come from `@team6220/ui`, and shared media from `packages/assets`.
- Shared admin accounts (not one student's account) own the GitHub org and Wix site, with 2FA, "so graduating
  seniors never lock the team out", and at the end of each season graduated members are removed and badges cleaned
  up. (Plan, "Secrets and security rules" and "Login and permissions".)
- Each app documents itself: a README, plus data-model or plan docs where needed (for example Inventory's
  `DATA-MODEL.md` and Attendance's `PLAN.md`).
- Webmasters should be able to change regular content (sponsors, summer camp, merch, resources) without editing
  code; that is the Site Manager app ([SITE-MANAGER.md](SITE-MANAGER.md), issue #109).
- **Proposed:** keep decisions and their reasons in these docs, so the next team does not have to guess why
  something works the way it does.

### Open source where it makes sense

Code is MIT licensed; logos, photos, site text and media are © Los Al Robotics, all rights reserved
([NOTICE.md](../NOTICE.md)). GoldSim is open source, independent work inspired by public descriptions of HighTide's
TideSim (apps/goldsim/docs/PRD.md).

## The apps at a glance

| App | Why it exists (from the sources) | Who can use it |
| --- | --- | --- |
| Dashboard | One home screen and login for every app | Team members (public apps are shown to everyone) |
| Attendance | Members sign in at meetings; replaces the Apps Script screen | Team members view; Attendance Admins open the kiosk |
| Inventory | Parts, tools, stock audits; moves from Google Sheets to Wix | Team members |
| GoldSim | Open-source 2D FRC strategy and robot-design simulator | Anyone |
| WingIt | Roguelite that teaches the team's design principles | Team members (plan); live on the site |
| Scouting, Pit display, Production Tracker | Planned: match data from the stands, a pit TV screen, following parts from design to finished | Team members; Pit display is public |
| Site Manager | Lets Web Admins edit regular site content with forms (opens GitHub pull requests) | Web Admins |

Statuses change often; [apps/README.md](../apps/README.md) and the Migration Plan are the current source.

## Open questions for the team

- Should every app be public by default unless it handles team data, or team-only by default? Today the dashboard
  marks each app individually.
- Is mobile and kiosk support a written requirement for new apps (**Proposed**)?
- Who owns teaching new members to use each app, and where should that guide live?
