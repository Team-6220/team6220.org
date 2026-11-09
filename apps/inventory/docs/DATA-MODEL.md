# Inventory data model: Google Sheet today, Wix CMS next

Part 1 describes the current app exactly as the source in [`backend/apps-script/inventory/`](../../../backend/apps-script/inventory/)
works (read from the code, Nov 2026). Part 2 is the Wix CMS design the new app at `/apps/inventory` uses.
The machine-readable version of both is [`packages/data/src/inventory/schema.ts`](../../../packages/data/src/inventory/schema.ts);
if this page and that file disagree, the file wins.

---

## Part 1: the current Apps Script app

### How it is built

- **Web app**: `doGet()` (Main.gs) serves `Index.html`, which pulls in the CSS/JS files with `include()` and embeds
  all data as `window.BOOT` (from `apiGetAll()`), so the page works without a second request.
- **Database**: the Google Sheet the script is bound to. One tab per table. Columns are found by **header name**
  in row 1, never by position (Db.gs `headerMap_`), so columns can be reordered; extra columns are kept untouched.
- **Rows** are found by their ID (`PT-3f9a0c1e`: 2-letter prefix + 8 hex), never by row number.
- **Locking**: every write runs inside `withLock_()` (LockService script lock, waits up to 20 s, else error `BUSY`).
- **Change polling**: every table has a counter in Script Properties (`tableVersions`). The browser polls
  `apiGetChanges(known)` every 30 s (faster on the Audits page) and only re-downloads tables whose counter moved.
- **Responses**: every `api*` function returns `{ ok: true, data }` or `{ ok: false, error: { code, message, details } }`.
  Error codes: `VALIDATION`, `CONFLICT`, `NOT_FOUND`, `IN_USE`, `ARCHIVED`, `BUSY`, `BAD_REQUEST`, `LIMIT`, `NOT_SETUP`,
  `AUDIT_ACTIVE`, `AUDIT_CLOSED`, `AUDIT_CONFLICTS`, `FINAL_CHECK_TAKEN`, `FINAL_CHECK_LOST`, `FINAL_CHECK_DONE`, `FORBIDDEN`, `SERVER`.
- **Security model**: none beyond the deployment's access setting. Any function whose name doesn't end in `_` can be
  called by anyone who can open the web app; editor-only maintenance functions call `requireEditor_()`.

### Column types (Config.gs)

| Type | Stored in the Sheet as | Read as |
| --- | --- | --- |
| `id` | text `PT-3f9a0c1e` | string |
| `string` / `text` | text (one line / multi-line). A leading `=` is saved as `'=` so it isn't a formula | string |
| `int` / `number` | number, blank = empty | number or null |
| `bool` | `TRUE` / `FALSE` | boolean |
| `date` | ISO timestamp text | string (`''` when empty) |
| `enum` | one of a fixed list | string |
| `ref` | ID of a row in another tab | string |
| `refList` | IDs joined with `\|` (`TG-1\|TG-2`) | array of strings |
| `measure` | what people typed (`1 1/2`), plus a numeric copy in the `...Value` column | string (+ number) |
| `json` | JSON text | object / array |

`system` columns are set only by the server; anything the browser sends for them is ignored.

### Tabs and columns

Inventory tabs end with the same system columns: `needsCheck` (audited tabs only), `version`, `createdAt`, `updatedAt`,
`archivedAt`. *Bold* = required; (s) = system.

| Tab | ID prefix | Columns |
| --- | --- | --- |
| **Parts** | `PT` | id, **name** (≤150), **quantity** (int 0–1,000,000), categoryId → Categories, tagIds → Tags (≤30), locationId → Locations, supplierId → Suppliers, description (≤2000), aliases (≤500, extra search words), lowStockThreshold (int), imageId (s, Drive file ID), needsCheck (s), version (s), createdAt (s), updatedAt (s), archivedAt (s) |
| **RawMaterials** | `RM` | id, **materialTypeId** → Lists[materialType], thickness (measure) + thicknessValue (s), thicknessUnitId → Lists[unit], length (measure) + lengthValue (s), width (measure) + widthValue (s), dimUnitId → Lists[unit], shape (json outline `{kind:'rect'\|'traced', points:[[x,y]...], edges:[...]}`), area (s), **quantity** (int), locationId, description, + inventory system columns |
| **Tools** | `TL` | id, **name**, **quantity** (int), locationId, description, imageId (s), + inventory system columns |
| **Fasteners** | `FS` | id, **typeId** → Lists[fastenerType], **threadSizeId** → Lists[threadSize], pitchId → Lists[threadPitch], length (measure) + lengthValue (s), lengthUnitId → Lists[unit], materialId → Lists[fastenerMaterial], description, version/createdAt/updatedAt/archivedAt (no quantity, not audited) |
| **Wire** | `WR` | id, **gaugeId** → Lists[wireGauge], **approxLength** (decimal; the "quantity" of wire), lengthUnitId → Lists[unit], typeColor (≤80), locationId, description, + inventory system columns |
| **Categories** | `CA` | id, **name** (≤60, unique), sortOrder (s) |
| **Tags** | `TG` | id, **name** (≤60, unique), categoryId → Categories (the tag's group; blank = mechanism tags like Swerve), sortOrder (s) |
| **Locations** | `LO` | id, parentId → Locations (two levels only: Area → Container), **name** (unique within its area), sortOrder (s) |
| **Suppliers** | `SU` | id, **name** (≤80, unique), sortOrder (s) |
| **Lists** | `LI` | id, **listKey** (one of `materialType`, `unit`, `fastenerType`, `threadSize`, `threadPitch`, `fastenerMaterial`, `wireGauge`; can't change after creation), **value** (unique within the list), sortOrder (s) |
| **Collections** | `CO` | id, **name** (unique), **section** (an inventory tab key), filter (json saved filter, e.g. `{tagIds:[...], tagMode:'any', categoryIds:[...], locationIds:[...], supplierIds:[...], lowStock, needsCheck}`), sortOrder (s) |
| **AuditSessions** | `AS` | id, **name** (≤80), status (s: `active`/`finalized`/`cancelled`), sections (json array of audited tab keys), createdAt (s), finalizedAt (s), summary (s, json counts) |
| **AuditItems** | `AI` | id, auditId (s), itemTable (s), itemId (s), nameSnapshot (s), baselineQty (s), countedQty, status (`unchecked`/`confirmed`/`different`/`missing`), updatedAt (s). Only holds rows for the audit in progress; they are deleted when it is finalized or cancelled |
| **PackingItems** | `PK` | id, parentId → PackingItems (tree, ≤4 levels), **section** (`always`/`season`/`loadout`), **name** (≤150), note (≤500), linkTable (`parts`/`tools`), linkId, imageId (s), sortOrder (s), packed (s), verified (s), updatedAt (s) |
| **PackingNotes** | `PN` | id, **text** (≤500), done, createdAt (s) |
| **Production** | `PR` | id, **partName**, **materialTypeId**, **thickness** + thicknessValue, **partLength**, **partWidth** (inches), **method** (`handmade`/`shapeoko`), stockLength, stockWidth, rawMaterialId (stock piece), copyIndex, placement (json `{x,y,w,h,angle}`), **status** (`planned`/`cut`/`done`), notes, createdAt, updatedAt |
| **Config** | — | key / value pairs: `rootFolderId`, `imageFolderId`, `backupFolderId` (Drive folders), `seeded`, `packingSeeded`, `schemaVersion` (4), `appName` |

Limits in code: 20,000 rows per tab, quantity ≤ 1,000,000, packing list ≤ 4 levels deep.

### Other storage

| Where | Key | What |
| --- | --- | --- |
| Script Properties | `SPREADSHEET_ID` | The Sheet's ID (fallback when not opened from the Sheet) |
| Script Properties | `tableVersions` | JSON change counters per table (for polling) |
| Script Properties | `packingMeta` | JSON `{ event, season, roundStartedAt, finalCheck: { state, by, token, startedAt, lastSeen, ... } }` |
| Script Properties | `lastBackupAt`, `lastBackupSignature` | Nightly backup bookkeeping |
| Google Drive | `Golden Griffins Inventory/Item Images` | Item photos (`imageId` = Drive file ID), shared "anyone with the link" when allowed |
| Google Drive | `Golden Griffins Inventory/Backups` | Nightly copies of the whole Sheet |
| Browser localStorage | `ggi.*` | Per-person view preferences (sort order, etc.) |

### Server functions the UI calls (`google.script.run`)

| Function | File | What it does |
| --- | --- | --- |
| `apiGetAll()` | ApiInventory.gs | All tables (inventory, settings, audits, packing, production) + `packingMeta` + versions. Also embedded at page load |
| `apiGetChanges(known)` | ApiInventory.gs | Only the tables whose version changed |
| `apiCreate(key, input)` | ApiInventory.gs | Create an inventory item or a settings entry (validated; settings also checked for duplicate names) |
| `apiUpdate(key, id, changes, expectedVersion)` | ApiInventory.gs | Edit fields. Inventory items need the version the user saw; mismatch → `CONFLICT` with the current record; `null` overwrites on purpose |
| `apiAdjustQuantity(key, id, delta)` | ApiInventory.gs | +/- buttons. Sends a change, not a total; clamps at 0 |
| `apiSetNeedsCheck(key, id, value)` | ApiInventory.gs | Set / clear the "Needs check" flag |
| `apiArchive` / `apiRestore(key, id)` | ApiInventory.gs | "Delete" = archive; restore |
| `apiDeletePermanently(key, id)` | ApiInventory.gs | Only for archived items; also trashes the photo |
| `apiRemoveSetting(key, id, force)` | ApiSettings.gs | Remove a category/tag/location/supplier/list value/collection. If in use → `IN_USE` with counts; `force` clears it everywhere first. Removing an area removes its containers |
| `apiReorder(key, orderedIds)` | ApiSettings.gs | Reorder settings or packing entries (a subset swaps within its own slots) |
| `apiStartAudit(name, sections)` | ApiAudit.gs | One active audit at a time; snapshots each item's quantity as `baselineQty` |
| `apiSetAuditCount(auditItemId, status, countedQty)` | ApiAudit.gs | Confirm / Different (with count; equal to baseline → Confirmed) / Missing / Undo |
| `apiFinalizeAudit(auditId, resolutions)` | ApiAudit.gs | Different → quantity = count; Missing → keep quantity, set `needsCheck`; items changed mid-audit → `AUDIT_CONFLICTS` until each is resolved `counted`/`current` |
| `apiCancelAudit(auditId)` | ApiAudit.gs | Stop without changing inventory |
| `apiPackingSetInfo(info)` | ApiPacking.gs | Event name / season label |
| `apiPackingReset(eventName)` | ApiPacking.gs | New packing round: clear all packed/verified marks |
| `apiPackingCreate` / `apiPackingUpdate` / `apiPackingDelete` | ApiPacking.gs | Edit the tree (move, nest, link to a part/tool); delete removes children |
| `apiPackingClearSeason()` | ApiPacking.gs | Delete every `season` entry |
| `apiPackingSetPacked(ids, value)` | ApiPacking.gs | Tick leaves (a group sends all its leaves) |
| `apiPackingNoteAdd` / `NoteSet` / `NoteDelete` | ApiPacking.gs | "Notes for next time" |
| `apiFinalCheckClaim(name, restart)` / `Ping` / `Pause` / `Verify` / `Complete` | ApiPacking.gs | Final check: one named person holds a private token, pings every 30 s; paused after 90 s without a ping |
| `apiUploadImage(key, id, dataUrl)` / `apiRemoveImage` / `apiGetImage(fileId)` | ApiImages.gs | Photos for parts, tools and packing entries (≤2 MB JPEG/PNG/WebP, shrunk in the browser) |
| `apiProductionCreate(jobs)` / `Update` / `Delete` | ApiRaw.gs | Cut-planner jobs |
| `apiRawCut(pieceId, pieceVersion, copyIndex, cutJobIds, leftovers, reassign)` | ApiRaw.gs | "Mark as cut": replaces the stock outline with the leftovers, makes new pieces, moves other jobs |

Editor-only (not callable from the page): `setupDatabase()`, `installNightlyBackup()`, `runBackupNow()`,
`reimportPackingList()`, `runSelfTest()`; trigger: `nightlyMaintenance()` (backup if anything changed, prune backups
older than 90 days keeping 3, permanently delete items archived over 30 days).

### Features

- **Parts**: instant local search (partial words, plurals, small typos, aliases), filters (category, tags any/all,
  location incl. containers, supplier, low stock, needs check), sorting, saved filters ("Collections"), +/- steppers
  with batching, add/edit drawer with tag picker, photos, archive/restore, conflict handling on edit.
- **Raw Materials**: pieces drawn to scale; shape as rectangle or traced from a photo; **cut planner** that picks stock
  with least waste; production jobs; "Mark as cut" updates leftovers.
- **Tools, Fasteners, Wire**: same list page built from per-section configs; fasteners have no quantity and warn on duplicates.
- **Audits**: start, count in parallel, finalize with conflict resolution, cancel, history.
- **Packing list**: three sections, nested groups, packing mode, final check mode (one verifier), edit mode,
  notes for next time, new round, clear season.
- **Settings**: categories, tags (with groups), locations (2 levels), suppliers, dropdown lists, collections, archive.
- **Safety**: nightly backups, archive with 30-day purge, optimistic version checks, server validation of everything.

---

## Part 2: Wix CMS design

### Collections

One collection per Sheet tab, named with the app prefix (migration plan, "Backends and data"), plus one for the
values that lived in Script Properties. The plan's example name `inventory_items` is split by section because each
section has different fields; one mixed collection would need dozens of mostly-empty fields.

| Collection ID | From tab | Display field |
| --- | --- | --- |
| `inventory_parts` | Parts | name |
| `inventory_raw_materials` | RawMaterials | — |
| `inventory_tools` | Tools | name |
| `inventory_fasteners` | Fasteners | — |
| `inventory_wire` | Wire | — |
| `inventory_categories` | Categories | name |
| `inventory_tags` | Tags | name |
| `inventory_locations` | Locations | name |
| `inventory_suppliers` | Suppliers | name |
| `inventory_lists` | Lists | value |
| `inventory_saved_filters` | Collections (renamed so it isn't confused with a Wix collection) | name |
| `inventory_audit_sessions` | AuditSessions | name |
| `inventory_audit_items` | AuditItems | — |
| `inventory_packing_items` | PackingItems | name |
| `inventory_packing_notes` | PackingNotes | text |
| `inventory_production` | Production (cut planner jobs) | partName |
| `inventory_meta` | Script Property `packingMeta` (item `_id: "packingMeta"`, fields `key`, `value`) | key |

`node apps/inventory/scripts/import-from-sheet.mjs --print-schema` prints every collection with every field, type
and permission, in the body format of the Wix **Create Data Collection** call.

### Fields

- **Item ID**: the Wix `_id` **is the old ID** (`PT-3f9a0c1e`). Wix lets you choose an item's ID on insert (≤128 chars),
  so references between collections, saved filters and audit rows keep working with no re-mapping, and new items get
  IDs in the same format. ([Bulk Insert Data Items](https://dev.wix.com/docs/api-reference/business-solutions/cms/data-items/bulk-insert-data-items))
- **Field keys** are the old column names (`quantity`, `locationId`, ...), which fit Wix's recommended key pattern
  `[a-zA-Z_][a-zA-Z0-9_-]{0,63}`. ([About the Wix Data APIs](https://dev.wix.com/docs/api-reference/business-solutions/cms/introduction))
- **Types**:

  | Sheet type | Wix type | Notes |
  | --- | --- | --- |
  | string, text, enum, measure | `TEXT` | allowed values / lengths are checked by the app (`validate.ts`); Wix doesn't enforce a schema |
  | int, number | `NUMBER` | |
  | bool | `BOOLEAN` | |
  | date | `DATETIME` | SDK uses `Date`, REST uses `{ "$date": "<ISO>" }` |
  | ref | `REFERENCE` to the target collection | stored as the item ID string; shows as a link in the CMS dashboard |
  | refList (`tagIds`) | `ARRAY_STRING` of IDs | **not** `MULTI_REFERENCE`: Wix silently drops multi-reference values on insert, bulk insert, save and update, so the import and every edit would need extra reference calls ([CMS Data Items CRUD, "Reference Fields"](https://dev.wix.com/docs/api-reference/business-solutions/cms/skills/cms-data-items-crud)) |
  | json | `OBJECT`, or `ARRAY_STRING` for `auditSessions.sections` | |

- **Required**: nothing is marked required in Wix. Wix data-collection schemas aren't enforced ("if you add or update
  an item containing a field or data type that doesn't match the collection's schema specification, your data is
  stored anyway"), so required fields, lengths, ranges, uniqueness and reference checks stay in the app's validation,
  which is the same code the Apps Script ran (bold columns in the table above are the required ones).
- **Empty values** are left out of the Wix item (no empty refs, dates or numbers); the app reads a missing field as empty.
- `auditItems.auditId` is a `REFERENCE` to `inventory_audit_sessions`. `auditItems.itemId`, `packingItems.linkId` and
  `production.rawMaterialId` stay `TEXT` because they can point at more than one collection.

### Permissions

Wix collection permissions take a minimum role per action: `ADMIN`, `SITE_MEMBER_AUTHOR`, `SITE_MEMBER`, `ANYONE`
(plus `PRIVILEGED`/CMS roles for Wix dashboard users, not site members).
([About the Wix Data APIs, "Permissions"](https://dev.wix.com/docs/api-reference/business-solutions/cms/introduction),
[Data Permissions API](https://dev.wix.com/docs/api-reference/business-solutions/cms/collection-management/data-permissions/introduction))

| Phase | read | insert | update | remove | Who can really edit |
| --- | --- | --- | --- | --- | --- |
| **Phase 1** (browser talks to Wix) | `SITE_MEMBER` | `SITE_MEMBER` | `SITE_MEMBER` | `SITE_MEMBER` | Any signed-in site member. The app only opens for approved members with the `Team Member` badge, but Wix has no permission level for "members with a badge", so that check is cosmetic. Never `ANYONE`. |
| **Phase 2** (`/api/inventory`) | `SITE_MEMBER` | `ADMIN` | `ADMIN` | `ADMIN` | The server endpoint checks the `Team Member` badge and writes with elevated permissions. |

Because Phase 1 is cosmetic, the team should treat the prototype's data as non-sensitive (the plan says the same),
and member signups must stay "approval required".

Who can do what in the app (the sign-in check in `apps/inventory/shim/main.ts`). **Team decision (Nov 2026): there
is no Inventory Manager role.** The old app had none either (anyone with the link could edit).

| Who | Can |
| --- | --- |
| Signed out | See "Sign in at /apps" |
| Signed in, not yet approved / no `Team Member` badge | See "waiting for approval" |
| Approved member with the `Team Member` badge | Everything: view, +/- quantities, add / edit / archive items, audits, the packing list, settings, the archive |

### Limits and API behaviour checked against the Wix docs (Nov 2026)

| Item | Value | Effect on this app | Source |
| --- | --- | --- | --- |
| Collections per site | 1,000 | 17 used | [Wix Data intro](https://dev.wix.com/docs/api-reference/business-solutions/cms/introduction) |
| Item size | 500 KB (error WDE0009 says 512 KB) | Largest items (traced shapes, saved filters) are a few KB | same; [error codes](https://dev.wix.com/docs/api-reference/business-solutions/cms/wix-data-error-codes) |
| Items per query page | 1,000 (`limit()` max) | The adapter pages through with `hasNext()`/`next()` | [WixDataQuery limit()](https://dev.wix.com/docs/sdk/backend-modules/data/items/wix-data-query/limit) |
| Items per bulk insert/remove | 1,000 (WDE0006) | Adapter and import send ≤1,000 / ≤500 per call | [Bulk Insert](https://dev.wix.com/docs/api-reference/business-solutions/cms/data-items/bulk-insert-data-items) |
| Request rate | 3,000 reads / 1,500 writes per minute per site | Loading the app makes about 17 reads (one per collection); polling is every 60 s and only while the tab is visible | [Velo: About Data Quotas](https://support.wix.com/en/article/velo-about-data-quotas) |
| Storage | 10 GB per site | negligible | same |
| Request timeout | 5 s on Premium plans below Business Elite | queries are small | [Wix Data intro, "Request timeouts"](https://dev.wix.com/docs/api-reference/business-solutions/cms/introduction) |
| Eventual consistency | A read right after a write may be stale unless `consistentRead: true` | The adapter reads with `consistentRead`, and the UI applies each write's result locally instead of re-reading | [Wix Data intro](https://dev.wix.com/docs/api-reference/business-solutions/cms/introduction), [Query Data Items](https://dev.wix.com/docs/api-reference/business-solutions/cms/data-items/query-data-items) |
| Update replaces the whole item | `update` / bulk update drop fields that aren't sent | The adapter always sends the full record | [CMS Data Items CRUD](https://dev.wix.com/docs/api-reference/business-solutions/cms/skills/cms-data-items-crud) |
| Conditional writes | `update` and `patch` accept a `condition` filter | Edits only save if `version` is unchanged → `CONFLICT` like before | [items.patch()](https://dev.wix.com/docs/sdk/backend-modules/data/items/patch) |
| Atomic increment | `patch().incrementField()` | +/- quantity sends a change, so simultaneous changes are all counted | same |
| No transactions or locks | — | See "What's different from Apps Script" | — |
| API keys | Sent as `Authorization` plus a `wix-site-id` header; never in frontend code | Import script only, from env vars | [REST API Authentication](https://dev.wix.com/docs/api-reference/articles/rest-authentication/rest-api-authentication) |

### What's different from Apps Script

- **No lock.** Apps Script ran every write under one script lock. Wix has none, so:
  single-record edits use a conditional update on `version`; quantity changes use an atomic increment;
  but multi-record operations are a sequence of writes: finalizing an audit, removing a setting that's in use
  (clearing it from every item), reordering, and moving a packing group. If the connection drops halfway, the earlier
  writes stay. They are all safe to run again. Phase 2 (`/api/inventory`) is the place to make these sturdier.
- **No change counters.** `apiGetChanges` re-reads all collections when the UI polls (every 30 s, 8 s on a running
  audit, only while the tab is visible) and compares them with what the tab last saw, instead of reading counters.
  Fine at the team's size (hundreds of items, about 17 reads per poll).
- **No nightly job.** Backups and the 30-day purge of archived items were Apps Script triggers. In the new app,
  archived items stay until someone deletes them (Settings → Archive), even though that page still says "after 30 days". The migration plan's answer for backups is a
  GitHub Actions cron calling an `/api` endpoint in Phase 2; until then Wix's own CMS backups apply.
- **Photos** were Drive files. `imageId` is imported as-is (Drive file ID). The UI still loads existing photos straight
  from Drive (works when the file is shared by link), but uploading, re-cropping and removing photos reply
  "Photos aren't available on the new site yet"; moving them to Wix is a separate step.

---

## Part 3: what the new app does today

The new app **is the original UI**: `apps/inventory/ui/` holds unchanged copies of the Apps Script HTML files, and a
shim (`apps/inventory/shim/`) gives them a `google.script.run` whose functions are a port of the `Api*.gs` files
(`packages/data/src/inventory/script-api.ts`, same arguments, same `{ ok, data }` / `{ ok:false, error }` replies and
error codes, on top of `service.ts`). So every screen and feature of the old app is there; only the storage changed.
Details: [apps/inventory/README.md](../README.md#how-its-built-the-original-ui--a-shim).

| Server function(s) | Status on the new site |
| --- | --- |
| `apiGetAll`, `apiGetChanges` | Ported. Change counters are kept per browser tab (Wix has none): a poll re-reads the collections and sends tables whose content changed |
| `apiCreate`, `apiUpdate`, `apiAdjustQuantity`, `apiSetNeedsCheck`, `apiArchive`, `apiRestore`, `apiDeletePermanently` | Ported |
| `apiRemoveSetting`, `apiReorder` | Ported |
| `apiStartAudit`, `apiSetAuditCount`, `apiFinalizeAudit`, `apiCancelAudit` | Ported |
| `apiPackingCreate` / `Update` / `Delete`, `apiPackingSetInfo`, `apiPackingReset`, `apiPackingClearSeason`, `apiPackingSetPacked`, `apiPackingNote*` | Ported |
| `apiFinalCheckClaim` / `Ping` / `Pause` / `Verify` / `Complete` | Ported (token kept in `inventory_meta`, never sent to browsers) |
| `apiProductionCreate` / `Update` / `Delete`, `apiRawCut` | Ported (cut planner, production jobs, "Mark as cut") |
| `apiUploadImage`, `apiRemoveImage`, `apiGetImage` | **Not yet**: reply `NOT_SETUP` "Photos aren't available on the new site yet." Existing Drive photos still show when the file is shared by link |
| Nightly backup, 30-day archive purge (triggers) | **Not yet** (issue #96) |
