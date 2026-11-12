# Operations API (Apps Script)

One Apps Script web app shared by the three operations apps: **Icarus** (`/apps/icarus`), **Production**
(`/apps/production`) and **BOM** (`/apps/bom`). The plan is in
[docs/operations/ARCHITECTURE.md](../../../docs/operations/ARCHITECTURE.md).

It does the things the browser must not be trusted with: checking badges, handing out numbers (`t42`, `p10`),
writing the history log and changing subteam badges. The apps read data, and make everyday edits, straight to Wix;
only protected actions come here.

| File | What it is |
| --- | --- |
| `Code.gs` | Entry points (`doPost`, `doGet`, `checkSetup`) and the table of actions |
| `Auth.gs` | Who is asking (Wix member token or Apollo's key) and what their badges allow |
| `WixData.gs` | Reading and writing Wix with the server's API key |
| `Shared.gs` | Numbers, history, projects, people and subteam badges |
| `Bom.gs` | BOM: orders, lines, signatures, ordering, receiving, import |
| `Icarus.gs` | Icarus: Leads-only changes to milestones, events, seasons and templates; tasks and comments for Apollo; the "needs attention" summary |
| `Events.gs` | Looking events up on The Blue Alliance, and the daily `refreshEvents` trigger |
| `appsscript.json` | Manifest: web app "execute as me / anyone", one scope (outside requests) |

Tests: `packages/data/test/ops-api.test.ts` runs these files in Node with fake Apps Script services
(`pnpm --filter @team6220/data test`).

## Requests

Every request is a `POST` with a JSON body sent as `Content-Type: text/plain` (a "simple" request, so the browser
sends no CORS preflight, which Apps Script can't answer). `@team6220/data` sends them; apps never call the URL.

```json
{ "action": "saveProject", "token": "<the member's Wix access token>", "project": { "name": "Summer Bot" } }
```

Answers are `{ "ok": true, ... }` or `{ "ok": false, "error": "<code>", "message": "..." }`, with `error` one of
`signed-out`, `pending`, `forbidden`, `not-configured`, `bad-request`, `busy`, `conflict`, `wix-unavailable`,
`server-error`.

## Who can do what

The token is checked with Wix on every request (cached for five minutes), the same way as in
[attendance-api](../attendance-api/README.md). Hiding buttons in the browser is only for looks.

| Role | Badges that give it | Allows |
| --- | --- | --- |
| `viewer` | any below, or `Supervisor` | Opening the apps. A Supervisor can view and nothing else |
| `team` | `Team Member`, `Mentor`, `Booster`, `Lead` | Everyday work: tasks, parts, BOM lines |
| `lead` | `Lead` | Planning: projects, milestones, templates, BOMs |
| `approver` | `Mentor`, `Booster` | Signing BOM lines and buying |
| `peopleAdmin` | `Lead`, `Mentor`, `Web Admin` | Changing anyone's subteams |

A person with several badges gets everything any of them allows. The same table is in code twice and must be changed
together: `roles_` in `Auth.gs` (the real check) and `packages/data/src/ops/roles.ts` (for showing and hiding).

## Actions so far

| Action | Who | Sends | Returns |
| --- | --- | --- | --- |
| `whoAmI` | viewer | | `me` (id, name, badges, subteams, roles) and the list of `subteams` |
| `nextNumber` | team, Apollo | `kind`: `task`, `project`, `part` or `order`; optional `count` (up to 200) to set aside several in a row | `number` (the first) |
| `logHistory` | team | `record` (`kind`, `id`), `change`, `summary` | |
| `saveProject` | lead | `project` (`_id` to change one) | `project` |
| `setMySubteams` | team | `subteams` (names) | `subteams` |
| `setSubteams` | peopleAdmin | `memberIds` (up to 50), `subteams` | `changed` |
| `syncPeople` | peopleAdmin | | `people`, `added`, `removed`: copies the site's approved members into `ops_people` (name and @username) |

### BOM actions (`Bom.gs`)

Members can read the `bom_*` collections but not write them, so every BOM change is one of these.

| Action | Who | Sends | Returns |
| --- | --- | --- | --- |
| `saveBom` | lead | `bom` (`name`, `season`, `status`) | `bom` |
| `createOrder` | lead | `order` (`bomId`, `projectId`, `customName`) | `order`, its default vendor `sections` |
| `importOrder` | lead | `bomId`, `customName`, `sections` read from an old sheet | `order` |
| `addSection` | team | `orderId`, `vendor` | `section` |
| `saveLine` | team, Apollo | `line` (`sectionId`, `name`, `link`, `unitCost`, `quantity`, ...) | `line`, `signaturesCleared` |
| `addLines` | team, Apollo | `sectionId`, `lines` (up to 100, pasted rows) | `lines`; all or none are saved |
| `removeLine` | team | `lineId` (only a line nobody has signed) | |
| `reopenLine` | lead | `lineId` | `line` |
| `signLines` | approver | `lineIds` (up to 200) | `signed`, `skipped` (with reasons), `total` |
| `approveSection` | approver | `sectionId` | `section` |
| `markOrdered` | approver | `sectionId`, `orderDate`, `finalTotal`, `expectedArrival` | `section`, `ordered`, `notReady` |
| `receiveLines` | team, Apollo | `items` (`lineId`, `quantity`, optional `inventoryItemId`) | `lines` |
| `linkLineToInventory` | team, Apollo | `lineId`, `inventoryItemId` | `line` |

The rules: two signatures from two different people, each a Mentor or Booster; changing the item, link, cost or
quantity of a signed line removes its signatures; only fully signed lines in a section with Approval to Order can be
ordered; an ordered line cannot be edited; a Supervisor can call none of these. `packages/data/test/bom-rules.test.ts`
runs the same checks against this code and against the demo backend.

### Icarus actions (`Icarus.gs`)

Tasks are written straight to Wix by members. These two actions are for the planning records only a Lead may change.

| Action | Who | Sends | Returns |
| --- | --- | --- | --- |
| `saveIcarusRecord` | lead | `kind`: `milestone`, `event`, `season` or `template`; `record` (`_id` to change one) | `record` |
| `removeIcarusRecord` | lead | `kind`, `id` | |

Only the fields listed for each kind in `ICARUS_KINDS` are saved; anything else in the request is dropped.

| Action | Who | Sends | Returns |
| --- | --- | --- | --- |
| `listTasks` | viewer, Apollo | optional `status` (`open`, `closed` or a status), `assigneeId`, `seasonId`, `search`, `overdue` | `tasks` (up to 200, in number order) |
| `saveTask` | team, Apollo | `task` (`_id` to change one; fields left out are kept) | `task`, numbered like the website (`t43`, `t42.3`) |
| `addTaskComment` | team, Apollo | `taskId`, `body` | `comment` |
| `needsAttention` | viewer, Apollo | | `overdueTasks`, `blockedTasks`, `linesWaitingForSignatures`, `orderedNotReceived`, `partsPendingSetup` |
| `lookupEvent` | team, Apollo | `code` (like `2027casd`) | `event` from The Blue Alliance (nothing saved) |
| `listTeamEvents` | team, Apollo | `year` | `events`: every event Team 6220 is registered for that year |

`refreshEvents` is not an action: it is run once a day by a time trigger and updates the dates of saved events that
came from The Blue Alliance (the team's display name is kept). A change of dates is written to the history as
"dates changed" by "The Blue Alliance"; tasks are never moved automatically.

Each app adds its own actions as it is built. To add one: write the function in the right file, then add one line to
`actions_()` in `Code.gs` saying who may call it.

**Subteams.** A subteam is a Wix badge called `Subteam: <name>`. The server reads the list of subteams from those
badges, and `changeSubteams_` is the only code that assigns or removes a badge. It refuses any badge whose title
does not start with `Subteam: `, so nobody can use this API to get `Lead`, `Mentor` or `Team Member`.

**History.** The actor on every history line is the verified member (or Apollo). A name sent in the request is
ignored.

## Apollo

Apollo is the team's Hermes agent. It sends `apiKey` in place of `token`:

```json
{ "action": "nextNumber", "apiKey": "<Apollo's key>", "kind": "task" }
```

- Only actions marked `agent: true` in `actions_()` answer to Apollo. Anything else is `forbidden`.
- Everything Apollo does is recorded under the **Apollo user** (`actorId: "apollo"`, `actorName: "Apollo"`,
  `actorIsAgent: true`).
- The script stores only the SHA-256 of the key (`APOLLO_KEY_SHA256`). To replace the key, change that property; no
  new deployment is needed.

Actions open to Apollo today:

| Action | Sends | Returns | Example |
| --- | --- | --- | --- |
| `nextNumber` | `kind` | `number` | `{ "action": "nextNumber", "apiKey": "...", "kind": "task" }` → `{ "ok": true, "number": 43 }` |
| `saveLine` | `line`: `sectionId`, `name`, `link`, `vendorPartNumber`, `unitCost`, `quantity`, `comments` (`_id` to change one) | `line`, `signaturesCleared` | `{ "action": "saveLine", "apiKey": "...", "line": { "sectionId": "...", "name": "NEO Vortex", "unitCost": 90, "quantity": 4, "link": "https://..." } }` |
| `receiveLines` | `items`: list of `lineId`, `quantity`, optional `inventoryItemId`, and `addToInventory: true` to add the quantity to the linked Inventory part | `lines` | `{ "action": "receiveLines", "apiKey": "...", "items": [{ "lineId": "...", "quantity": 4, "addToInventory": true }] }` |

| `linkLineToInventory` | `lineId`, `inventoryItemId` | `line` | `{ "action": "linkLineToInventory", "apiKey": "...", "lineId": "...", "inventoryItemId": "PT-..." }` |

Apollo reads BOMs, orders, sections and lines from the Wix collections (`bom_boms`, `bom_orders`, `bom_sections`,
`bom_lines`). It cannot sign, approve or mark ordered.

**Receiving into Inventory.** With `addToInventory: true`, the server adds the quantity to the line's linked
Inventory part (its `inventoryItemId`, sent now or remembered from before). If the line isn't linked to a part, the
whole request is refused and nothing is received: Apollo must ask a person which part it is (team decision), or
receive without `addToInventory`. Every item is checked before any is saved. Apollo can't create Inventory parts yet.

| Action | Sends | Returns | Example |
| --- | --- | --- | --- |
| `listTasks` | see the Icarus table | `tasks` | `{ "action": "listTasks", "apiKey": "...", "status": "open", "overdue": true }` |
| `saveTask` | `task` | `task` | `{ "action": "saveTask", "apiKey": "...", "task": { "title": "Order bearings", "subteams": ["Manufacturing"], "dueDate": "2027-01-20" } }` |
| `addTaskComment` | `taskId`, `body` | `comment` | `{ "action": "addTaskComment", "apiKey": "...", "taskId": "...", "body": "Reminder: due Friday" }` |
| `needsAttention` | | the summary | `{ "action": "needsAttention", "apiKey": "..." }` |
| `lookupEvent`, `listTeamEvents` | `code` / `year` | `event` / `events` | `{ "action": "listTeamEvents", "apiKey": "...", "year": 2027 }` |

`packages/data/test/apollo.test.ts` runs these against this code, including the things Apollo is refused.

This table is the contract Apollo's tools are written against. When an action is opened to Apollo, add its row here
in the same pull request.

## Setup (once, by someone with Wix admin and the team Google account)

1. **Wix badges.** In Wix → Site Members → Badges, create (exact titles): `Mentor`, `Booster`, `Supervisor`, `Lead`,
   and one per subteam: `Subteam: Design`, `Subteam: Manufacturing`, `Subteam: Programming`, `Subteam: Electrical`,
   `Subteam: Operations`. `Team Member` and `Web Admin` already exist.
2. **Wix collections.** In Wix → CMS, create these with the listed permissions:

   | Collection | Read | Insert / update / remove | Fields |
   | --- | --- | --- | --- |
   | `ops_counters` | Site members | Admin | `key` (text), `next` (number) |
   | `ops_history` | Site members | Admin | `recordKind`, `recordId`, `actorId`, `actorName`, `action`, `summary`, `at` (text); `actorIsAgent` (boolean) |
   | `ops_projects` | Site members | Admin | `number` (number); `name`, `description`, `status`, `githubRepo`, `startDate`, `endDate` (text); `subteams` (tags) |
   | `ops_people` | Site members | Admin | `memberId`, `name`, `username` (text); `subteams` (tags); `active` (boolean) |

   BOM (same permissions for all four: read Site members, write Admin):

   | Collection | Fields |
   | --- | --- |
   | `bom_boms` | `name`, `season`, `status` (text) |
   | `bom_orders` | `bomId`, `projectId`, `customName`, `createdAt` (text); `sequence` (number) |
   | `bom_sections` | `orderId`, `vendor`, `orderDate`, `expectedArrival` (text); `sortOrder`, `finalTotal` (number); `approval`, `orderedBy` (object) |
   | `bom_lines` | `sectionId`, `name`, `link`, `vendorPartNumber`, `comments`, `orderedAt`, `receivedAt` (text); `unitCost`, `quantity`, `receivedQty` (number); `requestedBy`, `receivedBy` (object); `signatures` (array); `inventoryItemId` (text) |

   Icarus:

   | Collection | Read | Write | Fields |
   | --- | --- | --- | --- |
   | `icarus_tasks` | Site members | **Site members** | `number`, `parentId`, `title`, `description`, `projectId`, `status`, `startDate`, `dueDate`, `notes`, `seasonId`, `createdBy` (text); `subteams`, `ownerIds`, `blockedBy`, `related` (tags); `needs` (array) |
   | `icarus_comments` | Site members | **Site members** | `taskId`, `authorId`, `authorName`, `body`, `at` (text) |
   | `icarus_milestones` | Site members | Admin | `name`, `date`, `seasonId`, `eventId` (text); `subteams` (tags) |
   | `icarus_events` | Site members | Admin | `code`, `displayName`, `officialName`, `startDate`, `endDate`, `location`, `source` (text) |
   | `icarus_seasons` | Site members | Admin | `name`, `startDate`, `endDate` (text); `eventIds` (tags) |
   | `icarus_templates` | Site members | Admin | `name` (text); `tasks`, `milestones` (array) |

3. **Wix API key.** Wix account → API Keys → Generate, with permissions for **Wix Data** (read and write data items)
   and **Manage Badges** and **Read Members** (for the people list), limited to the team site. Copy the key and the **site ID**. The key is a secret: it goes
   only into Script Properties, never into this repo.
4. **Apps Script project.** Create a project named "6220 Operations API" in the team Google account and copy in the
   `.gs` files and `appsscript.json` ([docs/APPS-SCRIPT.md](../../../docs/APPS-SCRIPT.md) has the clicks).
5. **Script Properties** (Project Settings): `WIX_API_KEY`, `WIX_SITE_ID`. Optional: `APOLLO_KEY_SHA256` (make a long
   random key for Apollo, store its SHA-256 here, give the key itself only to Apollo); `TBA_KEY` (a read key from
   your account page on The Blue Alliance, for looking events up); `TEAM_NUMBER` (defaults to 6220).
6. **Time trigger** (only with `TBA_KEY`): Triggers → Add trigger → `refreshEvents`, time-driven, day timer.
7. **Run `checkSetup`** from the editor. It asks for permission and checks the badges and collections exist.
8. **Deploy** as a web app (execute as me, anyone can access). Paste the `/exec` URL into `OPS_API_URL_DEFAULT` in
   `packages/data/src/config.ts` (it is not a secret) and open a pull request.

Until step 8 is done, the deployed apps say they are not connected yet and only work in demo mode (`?demo=lead`).
