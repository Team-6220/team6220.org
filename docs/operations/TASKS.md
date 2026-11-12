# Tasks and Gantt app (`/apps/tasks`): plan

> **Plan only, not built.** Part of the [Team Operations plan](README.md). Source: issue
> [#141](https://github.com/Team-6220/team6220.org/issues/141) and the Gantt chart sheets in Google Drive
> ("Gantt Chart Template", "2026 Competition Gantt Chart", "2027 Competition Gantt Chart").

## What it replaces

One Google Sheet per season. Each sheet has columns TASK, OWNER(S), NOTES, STATUS, START and DUE, then one column
per day. Above the days are two countdown rows (days left and weeks left until the season's end date), the month,
the date and the weekday. Tasks are grouped under a subteam heading (for example "Programming"). Events such as
"SOCAL SHOWDOWN" and "BEACH BLITZ" are typed onto their day. Status is one of four: 🗒️ Not Started, ✏️ In Progress,
✅ Done, 🚫 Cancelled. A row's bar is colored by hand.

The app keeps all of that and removes the hand work.

## Words

| Word | Meaning | Written as |
| --- | --- | --- |
| Task | One piece of work, like a GitHub issue | `t42` |
| Subtask | A task inside a task, to any depth | `t42.1`, `t42.1.3` |
| Project | A group of tasks with a goal (new scouting app, elevator code, Summer Bot) | `p10` |
| Milestone | A target date. For the whole team (scrimmage, kickoff) or for one or more subteams (design review, design talk with programming) | name and date |
| Event | A competition or scrimmage, defined by its event code, with a display name | `2027casd` → "San Diego Regional" |
| Season | One Gantt chart: a start date, an end date and a template | "2027 Competition" |

Task numbers and project numbers are separate counters, so `t10` and `p10` are different things. Numbers are never
reused. Typing `t42` or `p10` in any description, note or comment in the three apps makes a link.

## What a member can do

**Everyone (Team Member)**

- Open the Gantt chart for the current season; switch to a list, a board by status, or "My tasks".
- Filter by subteam, project, owner or status; search by number or text.
- Create a task or subtask; edit tasks they own or are assigned to; change status; comment.
- Open a project page: its tasks, its parts in Production and its BOM orders with totals.

**Leads (Lead badge)**

- Edit any task; assign owners; drag bars on the Gantt to change dates.
- Create and edit milestones, events, projects and seasons.
- Edit templates and start a new season from one.
- Connect a project to a GitHub repository.

## A task

| Field | Notes |
| --- | --- |
| Number | `t42`, given by the server |
| Title, description | Description supports links and `t`/`p` references |
| Parent task | Makes it a subtask (`t42.1`) |
| Project | One, optional |
| Subteams | One or more |
| Owners | One or more members (replaces the typed OWNER(S) column) |
| Status | Not Started, In Progress, Done, Cancelled (the same four as the sheets) |
| Start, due | Dates. A task with no dates shows in the list but not as a bar |
| Notes | The sheet's NOTES column |
| Relations | **Parent / child**, **needs completion of** (blocked by) / **blocks**, **related to** |
| Needs materials | Links to Inventory items or BOM lines, each with a quantity ([how it behaves](#needs-materials-and-needs-part)) |
| Needs part | Links to Production parts |
| GitHub issue | Optional link, kept in sync ([GitHub sync](#github-two-way-sync)) |
| History | Who changed what and when |

A task that "needs completion of" an unfinished task shows as blocked. The app warns, and does not stop anyone,
when a task is due before the task it depends on.

## The Gantt view

- One row per task, grouped by subteam, then project; subtasks fold under their parent.
- Header rows as in the sheets: days left and weeks left to the season's end date, month, date, weekday. Saturdays
  and today are highlighted.
- Bars are drawn from start to due and colored by status (overdue is marked). No hand coloring.
- Milestones are diamonds on the row of each subteam they belong to; whole-team milestones and events are vertical
  lines across every row with their display name.
- Dependency arrows between bars (can be turned off).
- Leads drag a bar to move it or drag its end to change the due date.
- On a phone the default is the list ("My tasks" first); the chart scrolls sideways with the task column pinned.
- **Print / export:** a printable chart, and a CSV in the sheet's column order (TASK, OWNER(S), NOTES, STATUS, START,
  DUE).

## Templates and seasons

A template is a saved set of tasks, subtasks and milestones whose dates are stored as offsets from an anchor date
("kickoff + 3 days", "first event − 14 days"). Two templates ship first, **Season** and **Offseason**, and leads
can edit them or add more (Summer Bot, Summer Camp).

Starting a season: pick a template, set the anchor dates, choose the events, review the generated tasks, confirm.
Nothing is created until the confirm step. Changing a template later does not change seasons already started.

**Proposed:** fill the first Season template from the 2026 Competition Gantt and the Offseason template from the
"Offseason 2025" and "Summer Bot 2025" sheets, then let leads correct them.

## Events (FIRST, The Blue Alliance)

- A lead adds an event by its code. The app fetches the name, dates and location from The Blue Alliance (and the
  FIRST Events API as a second source) through the backend, because the API keys must stay off the public site.
- Each event has a **display name** the team can change ("Beach Blitz" in place of the official name).
- **Add the team's events:** one button lists every event Team 6220 is registered for in a year.
- Events that are not in either system (local scrimmages) are added by hand with a made-up code.
- Event dates refresh once a day. If an official date changes, tasks tied to that event by a template offset are
  flagged for a lead to review; they do not move by themselves.
- Nexus and match13 are [later](README.md#later-not-in-the-first-release).

## GitHub two-way sync

Covers every repository in the Team-6220 organization. A lead connects a repository to a project; from then on:

| On GitHub | In Tasks |
| --- | --- |
| New issue in a connected repository | New task in that project, linked to the issue |
| Title or description edited | Task title or description updated |
| Issue closed / reopened | Task set to Done (or Cancelled if closed as "not planned") / back to In Progress |
| Assignees changed | Task owners changed, for members whose GitHub username is known |
| Label matching a subteam name | Task subteam set |

| In Tasks | On GitHub |
| --- | --- |
| Title or description edited on a linked task | Issue updated |
| Status set to Done or Cancelled / reopened | Issue closed (completed or not planned) / reopened |
| Owners changed | Assignees changed |
| "Create GitHub issue" on an unlinked task | New issue, linked |

Rules that keep it safe:

- Dates, relations, materials and parts live only on the task. GitHub has no place for them.
- If both sides changed since the last sync, **the newer edit wins** and the other is kept in the task's history.
- Synced changes are written to GitHub by a team bot account, and each one says who made it ("Closed from
  team6220.org by Alex").
- Sync runs every few minutes (see [ARCHITECTURE.md](ARCHITECTURE.md#github-sync)), so a change can take up to about
  five minutes to appear on the other side. A "Sync now" button is on each linked task.
- Deleting a task never deletes an issue, and the other way round. The link is just removed.
- Pull requests are not synced. A linked task shows the pull requests that close its issue, read-only.

## Needs materials and needs part

- **Needs materials** (decision 11: link and warn only). A task lists Inventory items or BOM lines with a quantity.
  The task shows each item's current stock and location, or the BOM line's state (waiting for signatures, ordered,
  received). If stock is below what the task needs, the task shows a warning and an **Add to BOM** button that
  starts a BOM line for the shortfall. Stock counts never change from a task.
- **Needs part.** A task lists Production parts. The task shows each part's status and who is making it. A task can
  also start a part request, which opens Production's form with the task and project filled in.

## Apollo (the team's Hermes agent)

Apollo uses the shared API ([ARCHITECTURE.md](ARCHITECTURE.md#api-for-apollo)) to list, create and update tasks,
projects and milestones, and to ask "what is overdue", "what is blocked" and "what is assigned to this person".
Everything Apollo writes is recorded as done by Apollo in the task history.

## Not in the first release

Time tracking, workload charts, recurring tasks, attendance-based capacity, critical path, Nexus and match13.

## Done means

- A lead can start the 2027 season from the Season template in under ten minutes and the chart matches what the
  sheet would have shown (countdown rows, events, subteam groups).
- A member can find their tasks and change a status on a phone in three taps from `/apps`.
- A linked GitHub issue and its task agree within five minutes of a change on either side.
- A task that needs an out-of-stock item shows the warning and can start a BOM line.
