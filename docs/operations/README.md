# Team Operations apps: Icarus (tasks), Production and BOM (plan)

> **Status (Nov 12, 2026): plan only, nothing is built.** This is the product plan (PRD) for three new team apps and
> how they connect to each other and to [Inventory](../../apps/inventory/README.md). It comes from issues
> [#141](https://github.com/Team-6220/team6220.org/issues/141) (Tasks and Gantt),
> [#207](https://github.com/Team-6220/team6220.org/issues/207) (Production and Inventory),
> [#147](https://github.com/Team-6220/team6220.org/issues/147) (BOM) and
> [#156](https://github.com/Team-6220/team6220.org/issues/156) (Mentor and Supervisor roles), from the team's Google
> Drive (Gantt charts, BOMs, the Production Form and Production List) and from the answers the team gave on
> Nov 12, 2026 ([Decisions](#decisions-made-nov-12-2026)).
>
> Anything marked **Proposed** is the planner's suggestion and has not been confirmed. Please correct or delete it.

| Doc | What it covers |
| --- | --- |
| This page | Why, who, the three apps at a glance, how they connect, build order, open questions |
| [ICARUS.md](ICARUS.md) | Icarus, the tasks and Gantt app (`/apps/icarus`) |
| [PRODUCTION.md](PRODUCTION.md) | Production app (`/apps/production`): parts request, print queue, tracker, cut planner and optimizer |
| [BOM.md](BOM.md) | BOM app (`/apps/bom`): orders, mentor approval, receiving into Inventory |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Shared design: folders, data collections, the `ops-api` backend, roles, the API for Apollo |
| [SETUP.md](SETUP.md) | What a person has to do in Wix and Google before the apps use real data |

## Why

Today this work is spread over files that do not know about each other:

| Today | Problem |
| --- | --- |
| One Gantt chart Google Sheet per season, copied from a template | Dates and colors are typed by hand; no link to GitHub issues, events or parts; a new sheet every season |
| Production Form (Google Form) feeding the "Production List" sheet, plus a "To do list" doc | The headings break when the form changes; who is making a part is a typed name; nothing updates stock |
| The cut planner inside Inventory | Hidden in the wrong app; designers and manufacturers do not use Inventory for this |
| One BOM Google Sheet per season with one tab per order | Mentor signatures are typed names; received parts never reach Inventory; links and prices are retyped every order |

**Goal:** one connected system. A task can say which parts it needs, a part being made knows its stock piece and its
task, a BOM line knows which inventory item it refills, and one project page shows the tasks, parts and spending for
that project.

## Who uses it

| Person | What they do here |
| --- | --- |
| Any Team Member | Sees the Gantt chart, creates and updates their own tasks, requests parts, claims parts to make, adds BOM lines |
| Leads (subteam leads, captains) | Plan: milestones, target dates, templates, other people's tasks |
| Designers | Submit parts (from Onshape, an STL or by hand), run the 3D print queue |
| Manufacturers | Plan cuts, set up Shapeoko jobs, claim parts, mark them cut or done |
| Mentors and Boosters | Approve BOM lines (two different people per line) and buy: place orders, mark them ordered, record totals |
| Supervisors | View BOMs only |
| Apollo (the team's Hermes agent) | Reads and writes tasks, parts and BOMs through the API, marks BOM lines received and writes to Inventory; posts reminders. Every write is recorded under the Apollo user |

## The three apps at a glance

| App | Route | Replaces | First release includes |
| --- | --- | --- | --- |
| **Icarus** (tasks) | `/apps/icarus` | The Gantt chart sheets | Tasks (`t42`), subtasks (`t42.1`), projects (`p10`), relations, Gantt view with countdown, target dates, season templates, events from FIRST / The Blue Alliance, two-way GitHub issue sync, Apollo API |
| **Production** | `/apps/production` | Production Form, Production List, the to-do doc, Inventory's cut planner | Design side (parts request, Onshape / STL import, 3D print queue) and Manufacturing side (tracker, Shapeoko pending list, 3D print queue), stock updates on "cut" |
| **BOM** | `/apps/bom` | The BOM sheets | Orders with vendor sections, two-signature approval by mentors or boosters (single, range and whole-section), ordered / received, receiving into Inventory, remembered prices, saved lists, CSV export in today's exact format, import of old BOMs, Apollo API |

## How they connect

```
                    Projects (p10): one shared list, used by Icarus and Production, optional on BOM orders

  GitHub issues ⇄ ┌─────────┐  needs part   ┌────────────┐  picks stock, cut updates  ┌───────────┐
  FIRST / TBA  ─▶ │ ICARUS  │ ────────────▶ │ PRODUCTION │ ─────────────────────────▶ │ INVENTORY │
                  │ (Gantt) │ ◀──────────── └────────────┘                            └───────────┘
                  └─────────┘  part status        │ add to BOM                          ▲       │
                     │   │                        ▼                          received   │       │ low stock:
                     │   │  add to BOM         ┌───────┐ ──────────────────────────────┘       │ add to BOM
                     │   └───────────────────▶ │  BOM  │ ◀──────────────────────────────────────┘
                     │                         └───────┘
                     └── needs materials: link + low-stock warning (reads Inventory, never changes stock)
```

| Link | What the user sees |
| --- | --- |
| Task → Inventory item or BOM line ("needs materials") | The task shows each item with its stock count; a warning if stock is short; an **Add to BOM** button. Stock counts do **not** change from a task |
| Task → Production part ("needs part") | The task shows the part's live status (requested, cutting, done). The part page links back to the task |
| Production part → Project | Same project list as Icarus (replaces the form's free-text "Project") |
| Production part → Inventory raw material | The cut planner picks a stock piece. **Confirm cut** replaces that piece with its leftovers in Inventory and flags them for the next audit |
| BOM line → Inventory item | Marking a line **Received** opens a confirm step that adds the quantity to the linked item, or offers to create the item |
| BOM order → Project (optional) | An order is named `Order 3`, `Summer Bot 2` (a project's name plus a number) or a custom name |
| Inventory item → the other apps | A low-stock item offers **Add to BOM**; an item page lists open BOM lines, tasks and parts that mention it |
| Everything → Dashboard | A "Needs you" list on `/apps`: tasks assigned to you, lines waiting for your signature, Shapeoko jobs waiting for setup |

## Decisions made (Nov 12, 2026)

Answers from the team account in the planning session. These are settled unless the team changes them.

1. **Three apps with shared data** (Icarus at `/apps/icarus`, `/apps/production`, `/apps/bom`), each with its own folder and
   owners.
2. **The cut planner moves out of Inventory** into Production. Inventory keeps raw material stock and links over.
3. **Cut optimizer:** "Ryan's version" is a free cut-list website (like opticutter.com), not team code. Reuse the
   planner already in Inventory where it helps and prefer an open-source library over writing our own.
4. **Real permission checks now, through an Apps Script backend** (the Attendance pattern), not waiting for Phase 2.
5. **BOM approval:** two different people per line, each a Mentor or a Booster, who can also place the order.
   Supervisors can only view. Many lines can be approved at once: drag over lines, shift-click from line A to
   line B, or approve a whole vendor section.
6. **BOM and Google Sheets:** the website is the source of truth. Export in the exact current format and import old
   BOMs. No live sync.
7. **Icarus first release** includes everything in #141: core tasks and Gantt, season templates, event
   integrations, GitHub sync and the Apollo API.
8. **Apollo is the team's Hermes agent** (one agent, one API).
9. **Parts get into Production** through the Onshape API or an STL import (and a plain form). Automatic 2D cut
   planning from STL files is a separate issue labeled `later`.
10. **Production permissions:** every Team Member can do everything, including Shapeoko setup, and the app records
    who did each step. There is no CNC badge.
11. **Materials on tasks and parts:** link and warn only. Stock changes only from a confirmed cut, a received BOM
    line or an edit in Inventory.
12. **GitHub:** two-way sync, for every repository in the Team-6220 organization.
13. **Task permissions:** members create tasks and update their own; a Lead badge is needed for milestones, target
    dates, templates and other people's tasks.
14. **Receiving:** confirm, then add to Inventory (or create the item, or choose "don't track").
15. **3D printing:** its own print queue screen, in Production's Design section. Printer hookup comes later.
16. **Projects:** Production and Icarus share one project list. BOM orders are numbered in order by default and may
    belong to a project or have a custom name.
17. **Prices:** remember each item's supplier options and last price paid and suggest the cheapest known one. Live
    price and shipping lookups come later.
18. **Notifications:** in the apps ("Needs you") and through Apollo. No built-in email in the first release.
19. **These plans live in the repo** (`docs/operations/`), reviewed by pull request.

Added later on Nov 12, 2026:

20. **The tasks app is called Icarus**, everywhere: the address, the folder, the collections, the GitHub label.
21. **BOM roles:** Mentors and Boosters approve and buy. Supervisors can only view.
22. **Several badges:** a person with more than one badge gets the rights of the highest one.
23. **Production layout:** the cut planner and cut optimizer are in the Manufacturing section; the print queue is
    in the Design section.
24. **Subteam badges:** each subteam is a Wix badge. Members pick their own subteams in Icarus; Leads, Mentors and
    Web Admins can change anyone's, in Icarus or in the Site Manager app. One Lead badge gives planning rights
    across Icarus.
25. **Apollo** may also mark BOM lines received and write to Inventory. Everything it does is recorded under the
    Apollo user.
26. **Subteams:** Design, Manufacturing, Programming, Electrical and Operations.
27. **Apollo and Inventory:** Apollo may add stock, create items and edit item details. It may not archive or
    delete items, change settings or run audits, and it must ask a person when it is not sure which item a
    received line matches.
28. **Badge assignment** is built in Icarus first; Site Manager reuses the same backend calls later. The backend
    can only change subteam badges.

## Build order (Proposed)

Each step is useful by itself and is its own set of pull requests. Details are in
[ARCHITECTURE.md](ARCHITECTURE.md#build-order).

| Step | What | Why this order |
| --- | --- | --- |
| 0 | Mentor, Booster, Supervisor, Lead and subteam badges (#156); the `ops-api` backend skeleton; the shared `projects` and people pickers | Everything else needs them |
| 1 | **BOM** core: orders, lines, approval, ordered/received, export, import of 2026 BOMs | Smallest app, replaces a sheet mentors use every week, proves the approval backend |
| 2 | **Icarus** core: tasks, projects, relations, Gantt, target dates, templates | Kickoff is in January; the 2027 Gantt sheet is already empty and waiting |
| 3 | **Production** tracker and parts request (replaces the Form and List) | Needed once build season parts start |
| 4 | Integrations between apps: receiving into Inventory, needs-materials, needs-part, Add to BOM, "Needs you" | Needs steps 1 to 3 |
| 5 | Cut planner move, cut optimizer, Shapeoko pending list, print queue, Onshape / STL import | Largest piece; Inventory's planner keeps working until this ships |
| 6 | Outside integrations: events (FIRST / TBA), GitHub two-way sync, Apollo API | Need server keys and the most testing |
| Later | See [Later](#later-not-in-the-first-release) | |

## Later (not in the first release)

- Automatic 2D cut planning from STL files ([#220](https://github.com/Team-6220/team6220.org/issues/220), label `later`).
- Live supplier prices, stock and estimated shipping dates.
- Receipt uploads per order and a tax-form category per purchase (#147).
- An AI agent that fills vendor carts for a human to check and pay (#147).
- 3D printer hookup (start and watch prints from the queue).
- Nexus and match13 event data (#141 says "maybe").
- Live two-way Google Sheets sync for BOMs.
- Email notifications.
- Moving `ops-api` checks into the Phase 2 `/api` endpoints ([MIGRATION-PLAN.md](../MIGRATION-PLAN.md)).

## Open questions for the team

These did not block the plan, but each needs an answer before its step is built.

| # | Question | Needed for |
| --- | --- | --- |
| 1 | Who owns the Onshape API keys, and is the team's Onshape plan (education) allowed to use the API? | Production step 5 |
| 2 | The Site Manager app (#109) does not assign badges yet (#100 asks for it). Should badge assignment be built there first, or in Icarus first? The plan builds it in Icarus first | Step 0 |
| 3 | #147 says "default BOM orders for certain times". Does this mean saved lists that are suggested at set times of year (kickoff order, pre-competition restock)? The plan assumes yes | BOM saved lists |
| 4 | What are the exact fields and choices on the Production Form (Accuracy, Priority, Method, Materials)? The connector could not open the Form itself, only the response sheet's headings | Production step 3 |
| 5 | Which 3D printers does the team have, and which filaments? | Print queue |
| 6 | *Answered Nov 12, 2026:* the subteams are Design, Manufacturing, Programming, Electrical and Operations (decision 26) | |
| 7 | Should the Gantt chart, or a read-only version of it, be visible to parents or the public? The plan assumes Team Members only | Icarus |
| 8 | Where does Apollo run and how should it hold its API key? | Step 6 |
| 9 | Who may see BOM prices and totals: every Team Member (as with the sheets today) or only mentors, boosters, supervisors and leads? The plan assumes every Team Member | BOM |
| 10 | Should old seasons' Gantt charts and production trackers be imported, or only linked? The plan imports the 2026 BOMs and links the rest | Steps 1 to 3 |
