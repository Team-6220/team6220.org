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
| `nextNumber` | team, Apollo | `kind`: `task`, `project`, `part` or `order` | `number` |
| `logHistory` | team | `record` (`kind`, `id`), `change`, `summary` | |
| `saveProject` | lead | `project` (`_id` to change one) | `project` |
| `setMySubteams` | team | `subteams` (names) | `subteams` |
| `setSubteams` | peopleAdmin | `memberIds` (up to 50), `subteams` | `changed` |

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
   | `ops_people` | Site members | Admin | `memberId`, `name` (text); `subteams` (tags); `active` (boolean) |

3. **Wix API key.** Wix account → API Keys → Generate, with permissions for **Wix Data** (read and write data items)
   and **Manage Badges**, limited to the team site. Copy the key and the **site ID**. The key is a secret: it goes
   only into Script Properties, never into this repo.
4. **Apps Script project.** Create a project named "6220 Operations API" in the team Google account and copy in the
   four `.gs` files and `appsscript.json` ([docs/APPS-SCRIPT.md](../../../docs/APPS-SCRIPT.md) has the clicks).
5. **Script Properties** (Project Settings): `WIX_API_KEY`, `WIX_SITE_ID`. Optional: `APOLLO_KEY_SHA256` (make a long
   random key for Apollo, store its SHA-256 here, give the key itself only to Apollo).
6. **Run `checkSetup`** from the editor. It asks for permission and checks the badges and collections exist.
7. **Deploy** as a web app (execute as me, anyone can access). Paste the `/exec` URL into `OPS_API_URL_DEFAULT` in
   `packages/data/src/config.ts` (it is not a secret) and open a pull request.

Until step 7 is done, the deployed apps say they are not connected yet and only work in demo mode (`?demo=lead`).
