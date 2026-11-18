# Operations server (`/api/ops`)

The server for the three operations apps: **Icarus** (`/apps/icarus`), **Production** (`/apps/production`) and **BOM**
(`/apps/bom`). It runs on Wix hosting as part of the website (Phase 2, [PHASE-2.md](../PHASE-2.md)); it replaced the
Apps Script "ops-api" one-to-one, so every action keeps its name, its inputs and its answers. The plan is in
[ARCHITECTURE.md](ARCHITECTURE.md).

It does the things the browser must not be trusted with: checking badges, handing out numbers (`t42`, `p10`), writing
the history log and changing subteam badges. The apps read data, and make everyday edits, straight to Wix; only
protected actions come here.

| Where | What it is |
| --- | --- |
| `packages/data/src/ops/server/handler.ts` | The three endpoints and the table of actions (who may call each) |
| `.../auth.ts` | Who is asking (the Wix session, or Apollo's key) and what their badges allow |
| `.../shared.ts` | Numbers, history, projects, people and subteam badges |
| `.../bom.ts` | BOM: orders, lines, signatures, ordering, receiving, import |
| `.../icarus.ts` | Icarus: Leads-only changes to milestones, events, seasons and templates; tasks and comments for Apollo; the "needs attention" summary |
| `.../events.ts` | Looking events up on The Blue Alliance, and the daily `refreshEvents` job |
| `.../github.ts` | Two-way sync between tasks and GitHub issues |
| `.../env.ts`, `budget.ts` | What the server needs from Wix (small interfaces), and the counter that keeps each request inside Wix's 20 calls |
| `src/server/ops-*.ts`, `github-hook-route.ts` | The Astro routes, and `ops-env.ts`, the only file that calls the Wix SDK for this |
| `backend/apps-script/ops-timer/` | The clock: Apps Script time triggers that call `/api/ops-timer` |

Tests: `packages/data/test/ops-api.test.ts`, `ops-server.test.ts`, `bom-rules.test.ts`, `icarus.test.ts`,
`events.test.ts`, `github-sync.test.ts` and `apollo.test.ts` run the real server code against an in-memory fake of Wix,
GitHub and The Blue Alliance (`pnpm --filter @team6220/data test`).

## How it differs from the Apps Script version

- **Who is asking** comes from the Wix session cookie, not a token in the request. The same-site check (`Sec-Fetch-Site`)
  refuses requests that another website makes in a member's browser. Apollo has no cookie, so it sends `apiKey`.
- **20 calls per request.** Wix allows a request 20 calls to outside services (3 go to checking who is asking). The
  server reads and writes in bulk (a BOM paste, a signing, an import, a subteam change for 50 people each take a handful
  of calls) and `budget.ts` stops a request that would go over with the error `busy`. The history lines of a request
  are written together at the end.
- **No lock.** Apps Script's script lock is gone, and numbers come from an atomic counter instead, so two requests can
  never be given the same number. The only thing a lock used to protect that is not atomic now is two people signing the
  same BOM line in the same instant: one signature can be lost, and the line shows "1 of 2" until that person signs again.
- **Errors** come with a matching HTTP status (`forbidden` is 403 and so on); the body is the same
  `{ ok: false, error, message }`.
- **Secrets** are in Wix's Secrets Manager (see [Setup](#setup)), not Script Properties, and there is no Wix API key: the
  server uses elevated permissions.

## Requests

Every request is a `POST` to `/api/ops` with a JSON body. `@team6220/data` sends them; apps never call the URL. The
member's sign-in travels in the session cookie.

```json
{ "action": "saveProject", "project": { "name": "Summer Bot" } }
```

Answers are `{ "ok": true, ... }` or `{ "ok": false, "error": "<code>", "message": "..." }`, with `error` one of
`signed-out`, `pending`, `forbidden`, `not-configured`, `bad-request`, `busy`, `conflict`, `wix-unavailable`,
`server-error`.

## Who can do what

The session is checked with Wix on every request, so a removed badge stops working at once. Hiding buttons in the
browser is only for looks.

| Role | Badges that give it | Allows |
| --- | --- | --- |
| `viewer` | any below, or `Supervisor` or `Guest` | Opening the apps. A Supervisor or Guest can view and nothing else |
| `guest` | `Guest` alone (not with `Team Member`, `Supervisor` or anything above) | Opening only the guest apps (Icarus and Inventory, view-only; the apps marked `guests` in `packages/assets/data/apps.json`). Icarus hides People; BOM and Production show the "not open to you" screen. Every change is refused by the server, as for a Supervisor |
| `team` | `Team Member`, `Mentor`, `Booster`, `Lead` | Everyday work: tasks, parts, BOM lines |
| `lead` | `Lead` | Planning: projects, milestones, templates, BOMs |
| `approver` | `Mentor`, `Booster` | Signing BOM lines and buying |
| `peopleAdmin` | `Lead`, `Mentor`, `Web Admin` | Changing anyone's subteams |

A person with several badges gets everything any of them allows. The rules are in one place, `rolesFor` in
`packages/data/src/ops/roles.ts`; the server uses it for the real check and the apps use it for showing and hiding.

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
| `listRecords` | viewer (a Guest sees only Icarus, projects, people and task history) | `collection` | `items`: every item of that collection (refused when it has 1000 or more) |
| `saveRecord` | team | `collection` (`icarus_tasks`, `icarus_comments` or `production_parts`), `item` (`_id` to change one) | `item` |
| `removeRecord` | team | `collection` (same three), `id` | |

The last three (`records.ts`) are what the apps use for reads and simple writes: `lazyWixStore` in `ops/index.ts` sends
every `store().list`, `save` and `remove` through them whenever the team server is connected. That is what lets the
server say who may read or change what (see "Locking the collections" in Setup).

### BOM actions (`bom.ts`)

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
runs the same checks against this code and against the demo backend. `signLines` and `receiveLines` take up to 200
lines, `addLines` 100 rows and `importOrder` 500 lines per request.

### Icarus actions (`icarus.ts`)

Tasks are written straight to Wix by members. These two actions are for the planning records only a Lead may change.

| Action | Who | Sends | Returns |
| --- | --- | --- | --- |
| `saveIcarusRecord` | lead | `kind`: `milestone`, `event`, `season` or `template`; `record` (`_id` to change one) | `record` |
| `removeIcarusRecord` | lead | `kind`, `id` | |

Only the fields listed for each kind in `ICARUS_KINDS` (`icarus.ts`) are saved; anything else in the request is dropped.

| Action | Who | Sends | Returns |
| --- | --- | --- | --- |
| `listTasks` | viewer, Apollo | optional `status` (`open`, `closed` or a status), `assigneeId`, `seasonId`, `search`, `overdue` | `tasks` (up to 200, in number order) |
| `saveTask` | team, Apollo | `task` (`_id` to change one; fields left out are kept) | `task`, numbered like the website (`t43`, `t42.3`) |
| `addTaskComment` | team, Apollo | `taskId`, `body` | `comment` |
| `needsAttention` | viewer, Apollo | | `overdueTasks`, `blockedTasks`, `linesWaitingForSignatures`, `orderedNotReceived`, `partsPendingSetup` |
| `lookupEvent` | team, Apollo | `code` (like `2027casd`) | `event` from The Blue Alliance (nothing saved) |
| `listTeamEvents` | team, Apollo | `year` | `events`: every event Team 6220 is registered for that year |

`refreshEvents` is not an action: it is a [timer job](#timer-and-webhook) that runs once a day and updates the dates of
saved events that came from The Blue Alliance (the team's display name is kept). A change of dates is written to the
history as "dates changed" by "The Blue Alliance"; tasks are never moved automatically. Events that ended more than a
week ago are left alone.

### GitHub actions (`github.ts`)

| Action | Who | Sends | Returns |
| --- | --- | --- | --- |
| `createGithubIssue` | team | `taskId` (the task's project must be connected to a `Team-6220/...` repository) | `task`, now linked |
| `syncGithubNow` | team | | `repos`, `pulled`, `pushed` |
| `setGithubLogin` | team (own); Lead, Mentor, Web Admin (anyone's, with `memberId`) | `login`, optional `memberId` | `person` |

GitHub sync is not an action either; see [Timer and webhook](#timer-and-webhook). For each project whose `githubRepo`
is in the Team-6220 organization it reads the issues changed since the last run, creates tasks for new issues, and
sends tasks changed in Icarus back to GitHub (title, description, open/closed, assignees). If both sides changed, the
newer edit wins and the other version is written to the task's history. Closing or reopening from Icarus also posts a
comment on the issue naming who did it. Pull requests are skipped, and nothing is ever deleted on either side. Setting
the Wix secret `GITHUB_SYNC_PAUSED` to `yes` stops it at once. Tests: `packages/data/test/github-sync.test.ts`.

Each app adds its own actions as it is built. To add one: write the function in the right file, then add one line to
`ACTIONS` in `handler.ts` saying who may call it.

**Subteams.** A subteam is a Wix badge called `Subteam: <name>`. The server reads the list of subteams from those
badges, and `changeSubteams` (`shared.ts`) is the only code that assigns or removes a badge. It only looks at badges
whose title starts with `Subteam: `, so nobody can use this API to get `Lead`, `Mentor` or `Team Member`.

**History.** The actor on every history line is the verified member (or Apollo). A name sent in the request is
ignored.

## Apollo

Apollo is the team's Hermes agent. It posts to `https://www.team6220.org/api/ops` and sends `apiKey` (no cookie):

```json
{ "action": "nextNumber", "apiKey": "<Apollo's key>", "kind": "task" }
```

- Only actions marked `agent: true` in `ACTIONS` answer to Apollo. Anything else is `forbidden`.
- Everything Apollo does is recorded under the **Apollo user** (`actorId: "apollo"`, `actorName: "Apollo"`,
  `actorIsAgent: true`).
- The server stores only the SHA-256 of the key (the Wix secret `APOLLO_KEY_SHA256`). To replace the key, change that
  secret; no new deployment is needed.

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

## Timer and webhook

Wix hosting has no scheduler, and a request may only make 20 calls, so long jobs are small and something outside calls them.

| Endpoint | Called by | Does |
| --- | --- | --- |
| `POST /api/ops-timer` `{ "job": "syncGithub" }` | The Apps Script clock every 5 minutes ([ops-timer](../../backend/apps-script/ops-timer/README.md)) | Sends Icarus changes to GitHub, and brings in anything the webhook missed. Reads at most 3 pages of issues per repository and pushes as many tasks as fit; the next run carries on |
| `POST /api/ops-timer` `{ "job": "refreshEvents" }` | The same clock, once a day | Refreshes saved events' dates from The Blue Alliance |
| `POST /api/github-hook` | GitHub, when an issue changes | Brings that repository's change into Icarus at once |

The timer sends the header `x-timer-secret` (the Wix secret `OPS_TIMER_SECRET`); the webhook is checked with GitHub's
HMAC signature (the Wix secret `GITHUB_WEBHOOK_SECRET`). Without the secrets set, both answer 401 and do nothing.

## Setup

Once, by someone with Wix admin and the team Google account.

1. **Wix badges.** In Wix → Site Members → Badges, create (exact titles): `Mentor`, `Booster`, `Supervisor`, `Lead`, `Guest`,
   and one per subteam: `Subteam: Design`, `Subteam: Manufacturing`, `Subteam: Programming`, `Subteam: Electrical`,
   `Subteam: Operations`. `Team Member` and `Web Admin` already exist.
2. **Wix collections.** In Wix → CMS, create these with the listed permissions. The server writes with elevated
   permissions, so "Admin" write is enough for it (this is also what makes the badge checks real rules):

   | Collection | Read | Insert / update / remove | Fields |
   | --- | --- | --- | --- |
   | `ops_counters` | Site members | Admin | `key` (text), `next` (number), `since` (text: where GitHub sync stopped, one row per repository) |
   | `ops_history` | Site members | Admin | `recordKind`, `recordId`, `actorId`, `actorName`, `action`, `summary`, `at` (text); `actorIsAgent` (boolean) |
   | `ops_projects` | Site members | Admin | `number` (number); `name`, `description`, `status`, `githubRepo`, `startDate`, `endDate` (text); `subteams` (tags) |
   | `ops_people` | Site members | Admin | `memberId`, `name`, `username`, `githubLogin` (text); `subteams` (tags); `active` (boolean) |

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
   | `icarus_tasks` | Site members | **Site members** | `number`, `parentId`, `title`, `description`, `projectId`, `status`, `startDate`, `dueDate`, `notes`, `seasonId`, `createdBy`, `updatedAt` (text); `subteams`, `ownerIds`, `blockedBy`, `related` (tags); `needs` (array); `githubIssue` (object) |
   | `icarus_comments` | Site members | **Site members** | `taskId`, `authorId`, `authorName`, `body`, `at` (text) |
   | `icarus_milestones` | Site members | Admin | `name`, `date`, `seasonId`, `eventId` (text); `subteams` (tags) |
   | `icarus_events` | Site members | Admin | `code`, `displayName`, `officialName`, `startDate`, `endDate`, `location`, `source` (text) |
   | `icarus_seasons` | Site members | Admin | `name`, `startDate`, `endDate` (text); `eventIds` (tags) |
   | `icarus_templates` | Site members | Admin | `name` (text); `tasks`, `milestones` (array) |

3. **Wix secrets.** Wix dashboard → Developer Tools → Secrets Manager. Each is read only when an action needs it, so
   all are optional until you use the feature. Never put a value in the repo:

   | Secret | For |
   | --- | --- |
   | `APOLLO_KEY_SHA256` | Apollo. Make a long random key (32 or more characters), store its SHA-256 (hex) here, and give the key itself only to Apollo |
   | `TBA_KEY` | A read key from your account page on The Blue Alliance, for looking events up |
   | `TEAM_NUMBER` | Optional; defaults to 6220 |
   | `GITHUB_TOKEN` | GitHub sync, see below |
   | `GITHUB_SYNC_PAUSED` | `yes` stops GitHub sync at once |
   | `GITHUB_WEBHOOK_SECRET` | A long random text; the same value goes into the GitHub webhook |
   | `OPS_TIMER_SECRET` | 20 or more random characters; the same value goes into the timer script |

   **GitHub token.** Make a fine-grained personal access token on a team bot account that is a member of Team-6220
   (not a student's own account: every synced change on GitHub shows as that account). Resource owner: Team-6220;
   repository access: all repositories; permissions: **Issues: read and write** (Metadata: read is added for you).
   Set an expiry and put a reminder in the team calendar to replace it. An organization owner may have to approve
   the token.
4. **The clock.** Set up [backend/apps-script/ops-timer](../../backend/apps-script/ops-timer/README.md): it calls
   `syncGithub` every 5 minutes and `refreshEvents` once a day.
5. **GitHub webhook.** GitHub → Team-6220 → Settings → Webhooks → Add webhook: payload URL
   `https://www.team6220.org/api/github-hook`, content type `application/json`, the secret from step 3, and only the
   **Issues** event. GitHub's "Recent deliveries" tab shows each answer (200 is good, 401 means the secrets differ).

6. **Locking the collections (at go-live, not before).** The server now does every read and write the apps make, with a
   role check, so Wix's own permissions can be tightened so nobody can go around it. Do this in Wix → CMS → each
   collection → Permissions, **after** the old static apps (the Pages site) are retired, because they still read and
   write these collections straight from the browser and would stop working:

   | Collections | Read | Insert / update / remove |
   | --- | --- | --- |
   | `icarus_tasks`, `icarus_comments`, `production_parts` | Admin | Admin |
   | `bom_*`, `ops_history` | Admin | Admin |
   | `ops_projects`, `ops_people`, `ops_counters`, `icarus_milestones`, `icarus_events`, `icarus_seasons`, `icarus_templates` | Admin | Admin |
   | `inventory_*` (Inventory reads straight from Wix) | Site members | Admin |

   Test it after the change: a Guest who calls the Wix Data API directly should be refused for every collection that
   is not an inventory one, and the apps should still work for each role. To undo it, put the old permissions back.

There is nothing to deploy: the server is part of the website. Until the site is live on Wix, the deployed apps say they
are not connected yet and only work in demo mode (`?demo=lead`).
