# Team Operations apps: architecture (plan)

> **Plan only, not built.** How Icarus (tasks), Production and BOM are put together and how they share data with each other and
> with Inventory. Read the [overview](README.md) first. This follows the site's existing rules
> ([ARCHITECTURE.md](../ARCHITECTURE.md), [ADD-AN-APP.md](../ADD-AN-APP.md),
> [APPS-PHILOSOPHY.md](../APPS-PHILOSOPHY.md)); where it adds something new, it says so.
>
> Library names and outside API details below were written from memory during planning and are marked **check**.
> Confirm each against its current documentation before building on it.

## The short version

- Three React apps in `apps/`, one data module each in `packages/data`, data in Wix CMS collections. This is the
  same shape as every other app.
- **New:** one Apps Script backend, `ops-api`, does everything that must not be trusted to the browser: mentor
  signatures, numbering, receiving into Inventory, GitHub sync, outside API keys and the API for Apollo. It is the
  [attendance-api](../../backend/apps-script/attendance-api/README.md) pattern used again.
- **New:** a few things are shared by all three apps (projects, people, links between records, the history log) and
  live in one small shared module, so no app reaches into another app's code.

```
 browser                                                         servers
┌──────────────────────────────┐
│ apps/icarus  apps/production  │   reads + simple writes (member token)
│ apps/bom    apps/inventory   │ ───────────────────────────────────────▶  Wix CMS
│        (React screens)       │                                           icarus_*  production_*  bom_*
│             │                │                                           ops_*    inventory_*
│             ▼                │                                              ▲
│ packages/data                │   protected actions                         │ Wix API key
│  tasks/ production/ bom/     │   POST text/plain + member token            │ (Script Property)
│  ops/  inventory/            │ ───────────────────────────────────────▶ ops-api (Apps Script)
└──────────────────────────────┘                                              │  ▲
                                                                              ▼  │ time triggers
 Apollo (Hermes agent) ── API key ──▶ ops-api          GitHub · Onshape · The Blue Alliance · FIRST Events
```

## Folders

```
apps/
  tasks/                 /apps/icarus       React. Gantt, list, board, project pages, templates
  production/            /apps/production  React. Design, Manufacturing
  bom/                   /apps/bom         React. BOMs, orders, approval, receiving
  inventory/             unchanged, except: links out to the new apps, and its cut planner is removed at the end
packages/
  data/src/
    ops/                 shared: projects, people, record links, history, the ops-api client, mock
    tasks/               types.ts  index.ts  wix-store.ts  mock.ts        (same four files as other apps)
    production/          types.ts  index.ts  wix-store.ts  mock.ts
    bom/                 types.ts  index.ts  wix-store.ts  mock.ts  export.ts  import.ts
    inventory/           existing. Gains a small public surface the other apps call (see "Inventory")
  cut-engine/            NEW package. Pure functions: stock + parts in, layout out. No React, no Wix
  ui/                    existing. Gains shared pieces: PersonPicker, ProjectPicker, RecordLink, HistoryList
backend/apps-script/
  ops-api/               NEW. One project: Code.gs split into files by area (Auth, Icarus, Bom, Production,
                         GitHub, Events, Onshape, Agent). README with setup, like attendance-api
docs/operations/         these plans
```

Each app follows [ADD-AN-APP.md](../ADD-AN-APP.md): its own `package.json`, a page under `src/pages/apps/<name>/`, a
card in `apps/dashboard/src/apps.ts`, a CODEOWNERS line, a GitHub label (`APP: ICARUS`, `APP: PRODUCTION TRACKER`
already exists, `APP: BOM`), and `?demo=` modes backed by `mock.ts`.

## Rules for keeping the apps connected but separate

1. **An app never imports another app.** `apps/icarus` does not import from `apps/bom`. If Icarus needs to show a BOM
   line, it calls `bom.getLineSummary(id)` from `@team6220/data`.
2. **Each data module owns its collections.** Only `packages/data/src/bom` reads or writes `bom_*`. Other modules
   ask it through exported functions. This is what lets one app's storage change without breaking the others.
3. **Records point at each other with a typed link**, not loose text: `{ kind: "task" | "project" | "part" |
   "bomLine" | "order" | "inventoryItem" | "rawMaterial" | "githubIssue", id }`. One `RecordLink` component in
   `@team6220/ui` shows any link as a chip with its number, name and live status, and opens the right app.
4. **Numbers come from the server.** `t42`, `p10`, `PR-0123` and order numbers are handed out by `ops-api` under a
   lock, because two browsers writing to Wix at once would give two tasks the same number.
5. **Every change is logged** in one `ops_history` collection: who (member or Apollo or GitHub sync), when, which
   record, what changed. All three apps show it through one `HistoryList`.

## Data collections (Wix CMS)

Collection names use the app prefix, as the [Migration Plan](../MIGRATION-PLAN.md) says. Every item also has the
usual `_id`, `createdAt`, `updatedAt` and a `version` number used to detect two people editing the same thing (the
same check Inventory uses). Field lists are the important fields, not every field.

### Shared (`ops_`)

| Collection | Holds | Main fields |
| --- | --- | --- |
| `ops_projects` | The shared project list | number (`p10`), name, description, subteams, status, githubRepo, startDate, endDate |
| `ops_counters` | The next number for tasks, projects, parts and orders | key, next. Written only by `ops-api` |
| `ops_history` | The change log for all three apps | record link, actor, action, before/after summary, time. Written only by `ops-api` and the data modules |
| `ops_people` | What the apps need to know about a member beyond Wix | memberId, display name, subteams, githubLogin, active |

### Icarus (`icarus_`)

| Collection | Holds | Main fields |
| --- | --- | --- |
| `icarus_tasks` | Tasks and subtasks | number, path (`42.1`), parentId, title, description, projectId, subteams, ownerIds, status, startDate, dueDate, notes, seasonId, templateKey, githubIssue `{repo, number, syncedAt}` |
| `icarus_relations` | Links between tasks | fromTaskId, toTaskId, type (`blocks`, `related`). Parent/child is `parentId` on the task |
| `icarus_needs` | What a task needs | taskId, record link (inventory item, BOM line or part), quantity |
| `icarus_milestones` | Target dates | name, date, subteams (empty = whole team), seasonId, eventId |
| `icarus_events` | Competitions and scrimmages | code, displayName, officialName, startDate, endDate, location, source (`tba`, `first`, `manual`) |
| `icarus_seasons` | One Gantt chart | name, startDate, endDate, eventIds, templateId |
| `icarus_templates` | Season and offseason templates | name, items (tasks and milestones with date offsets from named anchors) |
| `icarus_subteams` | The list of subteams | name, badgeId, color, order, githubLabel |

### Production (`production_`)

| Collection | Holds | Main fields |
| --- | --- | --- |
| `production_parts` | One row per requested part | number (`PR-0123`), partName, designerId, projectId, taskId, cadLink, files, materialTypeId, thickness, length, width, quantity, method, accuracy, priority, dueDate, details, status, rawMaterialId, placement, stockLength, stockWidth |
| `production_work` | Who worked on a part | partId, copyIndex, memberId, startedAt, endedAt, result (`finished`, `unfinished`), note, leftAt |
| `production_prints` | Print queue details for printed parts | partId, printer, filament, color, estMinutes, estGrams, queueOrder, result, failReason |

`production_parts` starts as a copy of today's `inventory_production` (same `PR` numbers; `planned`/`cut`/`done`
become `Ready`/`Cut`/`Done`). Material types, units and locations are **read from Inventory's lists**, not copied.

### BOM (`bom_`)

| Collection | Holds | Main fields |
| --- | --- | --- |
| `bom_boms` | One season's purchasing | name, season, budget, status |
| `bom_orders` | One order (a tab today) | bomId, sequence, projectId, customName, status |
| `bom_sections` | One vendor inside an order | orderId, supplierId, orderDate, approvalToOrder `{memberId, at}`, orderedBy, finalTotal, expectedArrival |
| `bom_lines` | One item to buy | sectionId, name, link, vendorPartNumber, unitCost, quantity, comments, catalogItemId, inventoryItem link, requestedBy, source link (task or part), signatures `[{memberId, name, at}]`, orderedAt, receivedQty, receivedAt |
| `bom_catalog` | Remembered items | name, inventoryItem link, options `[{supplierId, link, vendorPartNumber, lastPrice, lastPaidAt, packSize}]` |
| `bom_lists` | Saved lists | name, items `[{catalogItemId, defaultQty}]`, suggestedFor |

Suppliers are **Inventory's `inventory_suppliers`** list, used by both apps, so "REV Robotics" is one record.

### Who can write what

Wix collection permissions are the real lock in Phase 1, so they are set by how sensitive the data is:

| Collections | Read | Write |
| --- | --- | --- |
| `icarus_*` except the fields below, `production_parts`, `production_work`, `production_prints`, `bom_catalog`, `bom_lists`, `ops_people` | Site members | Site members (directly from the browser, like Inventory) |
| `bom_boms`, `bom_orders`, `bom_sections`, `bom_lines` | Site members | **Admin only.** Every write goes through `ops-api`, which checks the member's badge first |
| `ops_counters`, `ops_history`, `ops_projects`, `icarus_milestones`, `icarus_events`, `icarus_seasons`, `icarus_templates`, `icarus_subteams` | Site members | **Admin only**, through `ops-api` |

The rule: if a change needs a badge, a number or a signature, the collection is Admin-write and the browser asks
`ops-api`. Everything else is written straight to Wix, which is faster and works when Apps Script is slow.

**Known limit:** a Team Member who knows how could edit another member's task directly in Wix, even though the
screen only lets leads do that. That matches Inventory today and is acceptable for tasks. It is not acceptable for
purchases, which is why all of `bom_*` is locked.

## The `ops-api` backend

One Apps Script web app, deployed "execute as me / anyone", source in `backend/apps-script/ops-api/`, deployed as
[APPS-SCRIPT.md](../APPS-SCRIPT.md) describes.

**Requests from the apps.** Exactly like attendance-api: `POST`, `Content-Type: text/plain`, JSON body
`{ action, token, ...args }`, where `token` is the member's Wix access token. The script asks Wix who the token
belongs to and which badges they have, on every request, and answers `{ ok, data }` or `{ ok: false, error,
message }`. The client lives in `packages/data/src/ops/http.ts`; apps never call the URL themselves.

**Writing to Wix.** The script holds a Wix API key in Script Properties and calls the Wix Data REST API. The key is
never in the repo or the browser.

**Locking.** Numbering and signature writes run under Apps Script's `LockService`, so two requests cannot hand out
the same number or both become "the second signature".

| Area | Actions (examples) | Who |
| --- | --- | --- |
| Shared | `nextNumber`, `logHistory`, `saveProject` | Team Member; Lead for projects |
| Icarus | `saveMilestone`, `saveEvent`, `saveSeason`, `saveTemplate`, `startSeasonFromTemplate` | Lead |
| Icarus | `setMySubteams(subteams)` | Team Member, for themselves |
| Icarus | `setSubteams(memberIds, add, remove)`, `saveSubteamList` | Lead or Mentor (and Web Admin from Site Manager) |
| BOM | `saveLine`, `removeLine` | Team Member, Mentor or Booster, only while the line is unsigned |
| BOM | `signLines(lineIds)` | Mentor or Booster. Skips lines already signed by this person; the confirm total is recomputed on the server |
| BOM | `approveSection`, `markOrdered`, `setFinalTotal` | Mentor or Booster |
| BOM | `receiveLines([{lineId, qty, inventory: add / create / none}])` | Team Member, Mentor or Booster. Writes `bom_lines` and Inventory in one request |
| BOM | `reopenLine`, `saveBom`, `saveOrder` | Lead |
| Outside APIs | `lookupEvent`, `listTeamEvents`, `readOnshapeParts`, `syncGithubNow` | Team Member or Lead; keys stay in Script Properties |
| Agent | everything under [API for Apollo](#api-for-apollo) | Apollo's API key |

### Who can do what

New Wix badges, added to `BADGES` in `packages/data/src/config.ts` and to the script's constants:

| Badge | Used for | Issue |
| --- | --- | --- |
| `Mentor` | Approving (signing lines, Approval to Order) and buying (marking ordered, totals) in BOM | #156 |
| `Booster` | The same BOM rights as Mentor | new (team decision, Nov 12, 2026) |
| `Supervisor` | View only in BOM: no adding, signing, approving, ordering or receiving. Used by other apps (#156) | #156 |
| `Lead` | Planning in Icarus, managing BOMs and projects, changing anyone's subteams | new |
| `Subteam: <name>` (one per subteam) | Which subteams a member is on. No extra rights | new |

As #156 says, none of them gives any other permission, and `Web Admin` gives none of these. A person with several
badges gets the rights of the highest one (the backend checks "has any badge that allows this"). Production has no
badge of its own: every Team Member can do everything there, Shapeoko setup included.

### Subteam badges

Subteams are real Wix badges, so other apps and the Site Manager see the same thing.

- The browser never assigns a badge. It calls `setMySubteams` or `setSubteams`, and `ops-api` checks who is asking,
  then assigns or removes the badge with its Wix API key (Wix Badges API; **check** the exact calls and that an API
  key may assign badges).
- `ops-api` only ever touches badges whose title starts with `Subteam: `. It cannot give Team Member, Lead, Mentor,
  Booster, Supervisor or any admin badge, whoever asks.
- `ops_people.subteams` is a copy kept for fast filtering; the badge is the truth, and a daily job fixes any
  difference.
- The list of subteams is in `icarus_subteams` (name, badge id, color, order, GitHub label).
- Site Manager: when it gains a members screen (#100, #109), it calls the same two actions, so there is one
  implementation.

### GitHub sync

- A GitHub App (or a bot account's token) with issue read/write on the Team-6220 organization. The credential is a
  Script Property.
- **Polling, not webhooks.** A time trigger runs every five minutes: for each connected repository it asks GitHub
  for issues updated since the last run, and it pushes tasks changed since the last run. Polling is chosen because
  an Apps Script web app cannot read request headers, so it cannot verify GitHub's webhook signature (**check**).
- Each linked task stores the issue's `updated_at` and the task's own last-synced version. If both changed, the
  newer one wins and the loser is written to `ops_history`.
- Changes the sync itself makes are tagged so they do not bounce back and forth.
- Apps Script limits: a run may last six minutes and there is a daily limit on outside requests (**check** current
  quotas). The sync handles a few repositories per run and remembers where it stopped.

### Events, Onshape

- **The Blue Alliance** (read key) and **FIRST Events API** (username and token) are called only from `ops-api`,
  with answers cached for a day in `icarus_events`. This matches the repo rule that TBA and Nexus keys never go in
  the browser ([ADD-AN-APP.md](../ADD-AN-APP.md#keep-secrets-out)).
- **Onshape:** `readOnshapeParts(documentUrl)` signs a request with the team's Onshape API keys and returns part
  names, materials and bounding boxes for the Production import screen. Which endpoints give bounding boxes and
  whether the education plan allows API use need checking (**check**, open question 1).
- **STL files** are parsed in the browser. Nothing is uploaded to the backend.

### API for Apollo

Apollo (the team's Hermes agent) uses the same web app with `{ action, apiKey, ...args }` in place of a member
token. The key is stored hashed in Script Properties and can be replaced without a deploy.

| Area | Apollo can | Apollo cannot |
| --- | --- | --- |
| Icarus | List and search; create and update tasks, subtasks, relations, comments; read projects, milestones and events | Delete tasks; edit templates; change badges |
| Production | List parts and the print queue; create part requests | Confirm cuts; release Shapeoko jobs |
| BOM | Read BOMs, lines, totals; add and edit **draft** lines; read "waiting for signatures" and "ordered, not received"; **mark lines received** (`receiveLines`) | Sign, approve, mark ordered |
| Inventory | Read items and stock; **add stock, create items and edit an item's details** | Archive or delete items; change settings (categories, locations, lists); run audits (**Proposed** limits) |

**The Apollo user.** Apollo has its own entry in `ops_people` (name "Apollo", marked as an agent, no Wix login).
Every write it makes is stored with that user as the actor in `ops_history`, and anywhere the apps show a person
("Received by", "Created by", an Inventory item's last change) they show "Apollo". When Apollo passes along which
member asked it to act, that member is stored beside it as "on behalf of". Nothing Apollo does is recorded under a
real member's name.

**Documentation.** Every action Apollo may call, with its arguments, its answers and an example, is written in the
"Apollo" section of the `ops-api` README. That section is the contract Apollo's tools are written against, and a
test fails if an action is open to the Apollo key but missing from it. Reminders ("3 lines are waiting for a second
signature") are Apollo's job: it reads the "needs attention" actions and posts where the team chats.

## Inventory

Inventory stays the original UI on its shim. The other apps need four things from it, exported from
`packages/data/src/inventory` as a small, stable surface:

| Function | Used by |
| --- | --- |
| `searchItems(text)`, `getItemSummary(link)` | Icarus (needs materials), BOM (linking lines) |
| `listRawMaterials()`, `listMaterialTypes()` | Production cut planner |
| `applyCut(pieceId, version, leftovers, flagForAudit)` | Production "Confirm cut". Wraps the existing `apiRawCut` rule in `service.ts` |
| `addStock(itemId, qty)`, `createItem(draft)`, `updateItem(id, changes)` | BOM receiving and Apollo, called by `ops-api` |

Inside Inventory's own screen, the changes are small and marked with `team6220.org:` comments as its README
requires: an **Add to BOM** button on low-stock items, "Open BOM lines / tasks / parts" on an item, a **Plan cuts**
link to Production, and, at the end, removal of the built-in planner. The other Inventory requests in #207 (item
preview on image click, the stock-size drawing tool, straight-line suggestions) are Inventory work and are not part
of this plan.

## Cut engine

`packages/cut-engine` is plain TypeScript with tests and no screen code:

```ts
planLinear(stock: Length[], parts: Length[], options: { kerf }): LinearPlan     // tube, shaft
planSheets(stock: Sheet[], parts: Rect[], options: { kerf, allowRotate }): SheetPlan   // plate
```

- **Start from what exists:** port the placement and leftover logic from `apps/inventory/ui/JsPlanner.html` and
  `JsGeometry.html`, with its behavior pinned by tests before anything is changed.
- **Use a library where it is better.** Candidates to evaluate (**check** license, size and upkeep): for
  rectangles, a MaxRects or guillotine packer such as `maxrects-packer` or `guillotine-packer`; for 1D, first-fit
  decreasing is a few lines and needs no library; for irregular outlines later, SVGnest / Deepnest-style nesting.
  Shop saws and the Shapeoko favor guillotine (straight through) cuts for handmade parts, which narrows the choice.
- **PDF:** the cut list and layout print through the browser's print-to-PDF from a print stylesheet. No PDF library
  unless that proves not good enough.

## Screens and shared UI

- React 18, `AppLayout`, shared classes from `@team6220/ui` (`t-page`, `t-panel`, `t-button`), app-prefixed class
  names (`icarus__`, `prod__`, `bom__`).
- New shared components in `@team6220/ui`: `PersonPicker`, `ProjectPicker`, `RecordLink`, `HistoryList`,
  `StatusPill`. Built once, in the first app that needs each.
- **Gantt:** drawn by our own component on a CSS grid (one column per day), because the chart has to match the
  team's sheet (countdown rows, subteam groups, event lines) and most Gantt libraries are large or paid. Revisit if
  drag-to-reschedule or dependency arrows prove costly.
- **Phones first** for: My tasks, the Production tracker, receiving. **Wide screens first** for: the Gantt, BOM
  approval, the cut planner.
- **Dashboard:** `/apps` gets a "Needs you" panel fed by one function from each data module
  (`icarus.needsMe()`, `bom.needsMe()`, `production.needsMe()`).
- **Refreshing:** like Inventory, the apps re-read on a timer while the tab is visible and compare `version` on
  save, telling the member if someone else changed the record first.

## Testing

- Each data module has a `mock.ts`, so `pnpm dev` and `?demo=` work with no network.
- vitest in `packages/data/test/` for rules: signature rules, line states, numbering, receiving, sync conflict
  choice, template date offsets. `packages/cut-engine` has its own tests with fixed inputs and expected waste.
- `ops-api` is tested the way attendance-api is: the `.gs` files run in Node with fake Apps Script services.
- BOM export has a "golden file" test against an imported 2026 order.
- One Playwright path per app in `e2e/` ([E2E-TESTS.md](../E2E-TESTS.md)): sign two lines as a mentor and a booster; start a
  season from a template; request, claim and confirm-cut a part.

## Build order

Each bullet is roughly one pull request. Steps match the [overview](README.md#build-order-proposed).

**Step 0: foundations**
- Badges in Wix and `config.ts` (#156, plus Booster, Lead and one per subteam); `setMySubteams` / `setSubteams` and the People table in Icarus.
- `ops-api` skeleton: token and badge check, Wix API key, `nextNumber`, `logHistory`, tests, deploy doc.
- `packages/data/src/ops` (projects, people, links, history, mock) and the shared UI pickers.

**Step 1: BOM**
- Collections and `packages/data/src/bom` with mock; BOM, order and section screens; line editing.
- Signing (single, drag, shift-click, section, order) through `ops-api`.
- Approval to Order, ordered, final totals, the ordering checklist, open all links.
- Export in today's format with the golden-file test; import of the 2026 BOMs.

**Step 2: Icarus**
- Collections and `packages/data/src/icarus` with mock; task list, task page, My tasks, relations.
- Gantt view; milestones; seasons.
- Templates and "start a season"; first Season and Offseason templates.
- Project pages.

**Step 3: Production tracker**
- Collections and `packages/data/src/production` with mock; request form; tracker with claim / hand back / done.
- Copy of `inventory_production` rows.

**Step 4: connections**
- Receiving into Inventory; catalog and remembered prices; saved lists; Add to BOM from Inventory.
- Needs materials and needs part on tasks; project pages show parts and spending; "Needs you" on the dashboard.

**Step 5: cutting and printing**
- `packages/cut-engine` ported with tests; Cut optimizer screen (Manufacturing).
- Cut planner in Production (Manufacturing); Confirm cut through Inventory's `applyCut`; Shapeoko pending; print queue (Design).
- Onshape and STL import. Remove the planner from Inventory's screen after a real meeting.

**Step 6: outside integrations**
- Events from TBA and FIRST. GitHub two-way sync. Apollo API and its README contract.

## Risks

| Risk | What we do about it |
| --- | --- |
| Apps Script is slow (a second or more per call) and has daily limits | Only protected actions go through it; reads and simple writes go straight to Wix. Batch actions (`signLines`) are one call |
| Two-way GitHub sync can loop or overwrite | Tagged sync writes, newer-wins with history, a kill switch (Script Property) that pauses sync |
| Wix has no transactions | Receiving and signing run under a script lock; each step is safe to repeat; `ops_history` shows what happened |
| Three apps drift apart in look and behavior | Shared pickers, links and history in `@team6220/ui` and `data/ops`; the rules in this doc |
| Scope: this is a lot for a student team | The build order ships something usable at every step; BOM alone already replaces a sheet |
| Phase 2 changes the backend | Apps only call `@team6220/data`; `ops-api` actions map one-to-one to future `/api/icarus`, `/api/production`, `/api/bom` endpoints |
| Onshape API access or limits are not what we expect | STL import and the plain form do not depend on it |
