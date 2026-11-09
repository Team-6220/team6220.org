# Inventory (`/apps/inventory`)

The team inventory: parts, raw materials, tools, fasteners, wire, audits and the competition packing list.
It replaces the "Inventory Manager" Google Apps Script app (source kept unchanged in
[`backend/apps-script/inventory/`](../../backend/apps-script/inventory/)). **The old app stays live until this one has
survived a real team meeting.**

- Data model, old and new, with the Wix collection design: [docs/DATA-MODEL.md](docs/DATA-MODEL.md)
- What's ported and what isn't: [DATA-MODEL.md, Part 3](docs/DATA-MODEL.md#part-3-what-the-new-app-does-today)

## How it's built: the original UI + a shim

The page **is the original Apps Script UI**, unchanged: same HTML, CSS and JavaScript, same look. Only the server
side is new. In Apps Script, every server call in the UI went through `google.script.run.apiXxx(...)` (all of them
via `App.api()` in `JsCore.html`). On this site a small shim provides `google.script.run`, and the `apiXxx` functions
are a TypeScript port of the `Api*.gs` files that store data in Wix.

```
browser:  ui/*.html (original UI)  --google.script.run.apiCreate(...)-->  shim/google-script-stub.js
          --> shim/main.ts (sign-in check)  -->  createScriptApi()  (packages/data/src/inventory/script-api.ts)
          --> inventory service (service.ts, the rules from Api*.gs)  -->  WixStore (Wix CMS) or MemoryStore (demo)
```

```
apps/inventory/
  ui/                      THE FRONTEND. Copies of backend/apps-script/inventory/*.html (Index, Styles, Fonts, Brand,
                           JsCore, JsParts, ...). Branding and UI changes are made here.
  shim/assemble.ts         builds the page at build time: Index.html with every <?!= include('X'); ?> filled in,
                           like Apps Script's include(); window.BOOT = {"ok":false} so the UI loads data with apiGetAll
  shim/google-script-stub.js  google.script.run / host / url / history. Inlined before the UI's scripts; queues calls
                           until the sign-in check is done
  shim/main.ts             sign-in check (signed out -> link to /apps; not approved -> "waiting for approval"),
                           connects to the data, answers google.script.run calls
  scripts/                 one-time import from the Google Sheet
  test/                    vitest (page assembly, stub, import script)
packages/data/src/inventory/
  script-api.ts            every apiXxx function with the old arguments and replies ({ ok, data } / { ok:false, error })
  service.ts               the rules (validation, conflicts, audits, packing, final check, production, "Mark as cut")
  schema.ts                every table, field and Wix collection
  memory-store.ts          mock adapter (demo data, nothing saved)
  wix-store.ts             Wix adapter (@wix/data, with the signed-in member's client)
```

The page is `src/pages/apps/inventory/index.astro` (no site layout: the original page brings its own fonts, styles
and logos). The UI never imports the Wix SDK; the shim calls `@team6220/data/inventory`.

### Changing the UI

Edit the files in `ui/` like you would have in the Apps Script editor. Keep server calls going through `App.api()` /
`App.write()`; a new server function needs a matching entry in `script-api.ts` (plus the rule in `service.ts`).
`test/shim.test.ts` checks that `ui/` still matches `backend/apps-script/inventory/` **unless** the changed file
contains a `team6220.org:` comment, so mark intentional changes that way (e.g. `// team6220.org: new logo`).
So far no UI file has been changed.

### What works differently from Apps Script

| | |
| --- | --- |
| Photos | Lived in Google Drive. Adding, re-cropping or removing a photo shows "Photos aren't available on the new site yet." Existing photos still show if their Drive file is shared "anyone with the link" (the UI loads them straight from Drive); otherwise the thumbnail stays blank. Moving photos to Wix is a later step |
| Change polling | Apps Script kept a change counter per table. Wix has none, so `apiGetChanges` re-reads the collections (about 17 reads) and compares them with what this tab last saw. The UI polls every 30 s (8 s on a running audit) while the tab is visible |
| Locking | Apps Script ran every write under one lock. Here one tab's writes run one at a time; different people's writes aren't locked (see DATA-MODEL.md, "What's different") |
| Nightly job | No nightly backup or 30-day purge of archived items yet (issue #96), although Settings → Archive still says items are deleted after 30 days |
| `google.script.host` / `url` / `history` | Harmless stand-ins (the inventory UI doesn't use them) |

## Run it

```sh
pnpm dev                              # http://localhost:4321/apps/inventory  (mock data)
pnpm --filter @team6220/app-inventory test
pnpm --filter @team6220/data test
```

The mock backend signs you in as a demo team member (every approved member can edit; there is no separate
inventory role). Add `?demo=signed-out` to the URL for the sign-in prompt, or `?demo=pending` for the
"waiting for approval" screen.

### Backend switch

| Build | Data |
| --- | --- |
| `pnpm build` (the deployed site, dev.team6220.org) | **Wix**: the `inventory_*` CMS collections, as the signed-in member |
| `pnpm dev`, tests | **Mock**: in-memory demo data, reset on reload; a message says so when the page opens |

`PUBLIC_INVENTORY_BACKEND=wix|mock` overrides this (e.g. `PUBLIC_INVENTORY_BACKEND=mock pnpm build` to test a built
site without Wix, or `PUBLIC_INVENTORY_BACKEND=wix pnpm dev` to use real data locally).

In Wix mode the session comes from the site login (`packages/data/src/inventory/session.ts` uses
`auth.getMember()`, `auth.getAccess()`, `auth.getBadges()` and the shared Wix client):

- signed out: "Sign in at /apps";
- signed in but not approved / no `Team Member` badge: "waiting for approval";
- approved `Team Member`: the full app. Everyone approved can edit; there is no separate inventory role.

The `inventory_*` collections exist on the live Wix site with the team's data imported (Nov 2026). If they were ever
missing, the UI's own "Can't load the inventory" screen shows the error.

## Going live (needs a human with Wix admin access)

Nothing below has been done yet. Do it in this order; nothing touches the old Apps Script app or its Sheet.

1. **Export the Sheet.** Open the inventory Google Sheet → for each tab: File → Download → Comma-separated values.
   You get files like `Golden Griffins Inventory - Parts.csv`. Put them in a folder **outside this repo** (they're real
   team data; `.gitignore` also blocks CSV files under `apps/inventory/` except the made-up test fixtures).
   Tabs: Parts, RawMaterials, Tools, Fasteners, Wire, Categories, Tags, Locations, Suppliers, Lists, Collections,
   AuditSessions, AuditItems, PackingItems, PackingNotes, Production. (Config isn't needed.)
2. **Check the export (no Wix access needed):**
   ```sh
   node apps/inventory/scripts/import-from-sheet.mjs ~/inventory-export --dry-run
   ```
   It lists every problem (missing columns, bad IDs, dangling references) and how many items each collection will get.
   Errors stop it; warnings are informational.
3. **Make an API key.** Wix account → API Keys → Generate API Key, with the permission to manage Wix Data / CMS
   (data collections and data items) for the team site. Note the **site ID** too
   ([Generate an API key](https://dev.wix.com/docs/api-reference/articles/authentication/api-keys/generate-an-api-key)).
   Keep both out of the repo; put them only in your shell for this one run, and delete the key afterwards.
4. **Dry run against Wix (read-only):**
   ```sh
   export WIX_API_KEY='...'  WIX_SITE_ID='...'
   node apps/inventory/scripts/import-from-sheet.mjs ~/inventory-export --dry-run
   ```
   This checks which `inventory_*` collections exist and that they're empty. It writes nothing.
5. **Create the collections.** Either let the script do it (step 6 with `--create-collections`), or create them in
   the Wix dashboard (CMS → Create collection) using `--print-schema` for the exact IDs, fields and types:
   ```sh
   node apps/inventory/scripts/import-from-sheet.mjs --print-schema > /tmp/inventory-collections.json
   ```
   Permissions for **every** `inventory_*` collection (Phase 1): read, insert, update, remove = **Site members**
   ("Members"). Never "Anyone". (Phase 2 changes insert/update/remove to Admin; see DATA-MODEL.md.)
6. **Import:**
   ```sh
   node apps/inventory/scripts/import-from-sheet.mjs ~/inventory-export --create-collections
   ```
   It refuses to import into a collection that already has items (so running it twice can't duplicate data).
   Then `unset WIX_API_KEY WIX_SITE_ID` and revoke the key.
7. **Spot-check** a few parts, a location, a tag and the packing list in the Wix CMS dashboard.
8. **Nothing to switch**: the deployed site already uses Wix and the site login. Open `/apps/inventory` signed in as
   an approved member and check that the imported items appear and an edit saves.
9. **Re-enter by hand**: the packing list's event name and season label (they lived in Script Properties).
10. **Run a real meeting** on the new app. Only after that, take down the Apps Script deployment (see
    `backend/apps-script/README.md`).

Between steps 1 and 10 people may keep using the old app, so export right before importing, and tell the team
when to stop editing the old one.
