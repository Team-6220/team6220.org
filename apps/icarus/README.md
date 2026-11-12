# Icarus (`/apps/icarus`)

Tasks and the team Gantt chart. It replaces the Gantt chart Google Sheets (one per season). The plan and the reasons
behind it are in [docs/operations/ICARUS.md](../../docs/operations/ICARUS.md).

## What is built

- **Tasks** (`t42`), **subtasks** (`t42.1`) and **projects** (`p10`), laid out like GitHub issues: title and status
  at the top, description and a **conversation** (comments) on the left, details on the right, **Close as done** /
  **Reopen**, and a history of changes.
- **Assignees** by **@mention**: type `@` and part of a name or username; several people per task. The list is the
  site's approved members (Leads and Mentors press "Update from the members list" on People).
- **Relations** from a dropdown: needs completion of, blocks, related to. Both tasks show the relation.
- The task list works like GitHub's: **Open / Closed** with counts, search, filters by assignee, subteam and project,
  subteams shown as labels.
- **Gantt chart** laid out like the sheets: days-left and weeks-left countdown rows, month, date and weekday rows,
  the task, owner, status, start and due columns, a group per subteam (General first), bars colored by status,
  Saturdays and today highlighted, events and whole-team target dates as lines, subteam target dates as ◆.
- **My tasks** and **All tasks** lists with filters and search. On a phone, My tasks opens first.
- **Click the chart to add**: click an empty day in a subteam's row to add a task there (members), or a target date
  or event (Leads). Click a bar to open its task.
- **Seasons**, **target dates** and **events** (Leads), and **templates**: two built-in ones, a preview before
  anything is created, and "Save this season as a template".
- **Subteams**: members pick their own; Leads and Mentors change anyone's, one at a time or many at once.
- Print the chart, and export tasks as CSV in the sheet's column order.
- **Needs materials** on a task: Inventory parts with the stock count, a warning when there aren't enough, and
  **Add to BOM** for what is missing. A task never changes stock.
- **Parts being made** on a task: the Production parts requested for it with their status, and **Request a part
  for this task**.
- **Projects** show their tasks, the parts being made for them and what their BOM orders cost.

## Not built yet

In the plan, coming with later build steps:

- Dragging bars to change dates, and dependency arrows (a blocked task shows ⏳ for now).
- @mentions inside comments and descriptions (assignees use them already), and notifications for them.
- The board-by-status view.
- Looking events up by code from The Blue Alliance and FIRST (events are typed in for now), GitHub issue sync and
  the Apollo actions (step 6).
- Editing a template's tasks one by one. For now: start a season from a template, fix it on the chart, then save
  that season as a new template.
- The built-in templates are a first guess (marked PROPOSED in `templates.ts`). Leads should correct them.

## Where things are

```
apps/icarus/src/
  Icarus.tsx     loads everything, picks the season and the screen
  Gantt.tsx      draws the chart (all the numbers come from icarus.buildGantt)
  TaskForm.tsx   new / edit task, its subtasks and history
  TaskList.tsx   My tasks and All tasks
  People.tsx     subteams
  Plan.tsx       seasons, templates, target dates, events
  icarus.css
packages/data/src/icarus/
  index.ts       the functions the screens call
  gantt.ts       works out the chart: countdown rows, groups, bars, lines
  templates.ts   templates and the two built-in ones
  dates.ts       date arithmetic on "yyyy-mm-dd" text
  mock.ts        demo data and the demo copy of the planning rules
backend/apps-script/ops-api/Icarus.gs   Leads-only changes to milestones, events, seasons and templates
```

**Who can change what.** Tasks are written straight to Wix by members, like Inventory items, so "only owners and
leads can edit a task" is a rule of the screen, not of the server. Milestones, events, seasons and templates are
real Lead-only rules: members can read those collections but only the ops API can write them.

## Run it

```sh
pnpm dev                                 # http://localhost:4321/apps/icarus  (demo data, signed in as a lead)
pnpm --filter @team6220/data test        # the chart's numbers, templates, numbering, the planning rules
```

Add `?demo=member`, `lead`, `mentor`, `supervisor`, `pending` or `signed-out` to see each role. The demo season
always starts three weeks before today, so the chart shows done, running, overdue and upcoming tasks.

## Going live

See [docs/operations/SETUP.md](../../docs/operations/SETUP.md).
