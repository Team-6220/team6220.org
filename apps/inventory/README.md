# Inventory (`/apps/inventory`)

The team inventory: parts, raw materials, tools, fasteners, wire, audits and the competition packing list.
It replaces the "Inventory Manager" Google Apps Script app (source kept unchanged in
[`backend/apps-script/inventory/`](../../backend/apps-script/inventory/)). **The old app stays live until this one has
survived a real team meeting.**

- Data model, old and new, with the Wix collection design: [docs/DATA-MODEL.md](docs/DATA-MODEL.md)
- What's ported and what isn't: [DATA-MODEL.md, Part 3](docs/DATA-MODEL.md#part-3-what-the-new-app-does-today)

## Code

```
apps/inventory/
  src/InventoryApp.tsx     root: sign-in check, loading, navigation
  src/context.tsx          loaded data, writes, permissions (who may do what)
  src/sections.ts          what each inventory page shows, filters, sorts and edits
  src/views/               SectionPage, AuditsPage, PackingPage, SettingsPage
  src/lib/search.ts        the search (same rules as the old app)
  src/styles.css           plain styles with CSS variables (team gold #FA9504); real branding comes later
  scripts/                 one-time import from the Google Sheet
  test/                    vitest
packages/data/src/inventory/
  schema.ts                every table, field and Wix collection
  service.ts               the rules (validation, conflicts, audits, packing...) ported from the Api*.gs files
  memory-store.ts          mock adapter (demo data, nothing saved)
  wix-store.ts             Wix adapter (@wix/data, with the signed-in member's client)
```

The page is `src/pages/apps/inventory/index.astro`. The app never imports the Wix SDK; it calls `@team6220/data/inventory`.

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
| `pnpm dev`, tests | **Mock**: in-memory demo data, reset on reload; a banner says so |

`PUBLIC_INVENTORY_BACKEND=wix|mock` overrides this (e.g. `PUBLIC_INVENTORY_BACKEND=mock pnpm build` to test a built
site without Wix, or `PUBLIC_INVENTORY_BACKEND=wix pnpm dev` to use real data locally).

In Wix mode the session comes from the site login (`packages/data/src/inventory/session.ts` uses
`auth.getMember()`, `auth.getAccess()`, `auth.getBadges()` and the shared Wix client):

- signed out: "Sign in at /apps";
- signed in but not approved / no `Team Member` badge: "waiting for approval";
- approved `Team Member`: the full app. Everyone approved can edit; there is no separate inventory role.

**Until the collections exist (go-live steps below), approved members on the deployed site see "the inventory
collections aren't set up in Wix yet".** That's expected.

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
