/**
 * ApiInventory.gs — Golden Griffins Inventory
 * ---------------------------------------------------------------------------
 * Browser-callable functions for loading data and editing inventory records
 * (Parts, Raw Materials, Tools, Fasteners, Wire). Settings tables reuse
 * apiCreate / apiUpdate; their delete & reorder live in ApiSettings.gs.
 *
 * Every function returns { ok, data } or { ok:false, error:{code,message,details} }.
 * Write responses include `versions` so the browser can tell whether anything
 * else changed in the meantime.
 */

// ─────────────────────────── loading ───────────────────────────

/** Everything the app needs on first load. */
function apiGetAll() {
  return api_(function () {
    const versions = getVersions_();   // read BEFORE the data: worst case we refetch once
    const tables = {};
    clientTableKeys_().forEach(function (k) { tables[k] = readAll_(k).rows.map(publicRec_); });
    return { versions: versions, tables: tables, packingMeta: publicPackingMeta_(), serverTime: nowIso_() };
  });
}

/**
 * Polling call. `known` = { tableKey: version } the browser already has.
 * Returns only the tables that changed (usually none — very cheap).
 */
function apiGetChanges(known) {
  return api_(function () {
    const k0 = known && typeof known === 'object' ? known : {};
    const versions = getVersions_();
    const tables = {};
    clientTableKeys_().forEach(function (k) {
      if (k0[k] !== versions[k]) tables[k] = readAll_(k).rows.map(publicRec_);
    });
    const out = { versions: versions, tables: tables };
    if (k0.packingMeta !== versions.packingMeta) out.packingMeta = publicPackingMeta_();
    return out;
  });
}

// ─────────────────────────── create / update ───────────────────────────

/** Creates an inventory record or a settings entry. */
function apiCreate(key, input) {
  return api_(function () {
    assertTable_(key, ['inventory', 'setting']);
    return withLock_(function () {
      const def = TABLES[key];
      const ctx = newCtx_();
      const clean = validateInput_(key, input, 'create', null, ctx);
      const rec = Object.assign(blankRecord_(def), clean);
      rec.id = newId_(def.prefix);
      if (def.kind === 'inventory') {
        rec.version = 1;
        rec.createdAt = rec.updatedAt = nowIso_();
        rec.archivedAt = '';
        if (def.auditable) rec.needsCheck = false;
      } else {
        checkSettingRules_(key, rec, null, ctx);
        rec.sortOrder = nextSortOrder_(ctx.table(key));
      }
      insert_(key, rec);
      return { record: publicRec_(rec), versions: bumpVersions_([key]) };
    });
  });
}

/**
 * Updates fields of a record.
 *   expectedVersion (inventory only): the `version` the browser last saw.
 *     If someone else saved in between, returns error CONFLICT with
 *     details.current = the latest record, and nothing is written.
 *     Pass null to deliberately overwrite (after the user confirms).
 */
function apiUpdate(key, id, changes, expectedVersion) {
  return api_(function () {
    assertTable_(key, ['inventory', 'setting']);
    assertId_(id);
    const def = TABLES[key];
    if (def.kind === 'inventory' && expectedVersion === undefined) {
      throw new AppError('BAD_REQUEST', 'Missing version.');
    }
    return withLock_(function () {
      const found = findRow_(key, id);
      if (!found) throw new AppError('NOT_FOUND', 'This entry no longer exists. It may have been deleted.');
      const rec = found.rec;
      if (def.kind === 'inventory') {
        if (rec.archivedAt) throw new AppError('ARCHIVED', 'This item is archived. Restore it before editing.');
        checkVersion_(rec, expectedVersion);
      }
      const ctx = newCtx_();
      const clean = validateInput_(key, changes, 'update', rec, ctx);
      const next = Object.assign({}, rec, clean);
      if (def.kind === 'inventory') {
        next.version = (rec.version || 0) + 1;
        next.updatedAt = nowIso_();
      } else {
        checkSettingRules_(key, next, rec, ctx);
      }
      writeFound_(found, next);
      return { record: publicRec_(next), versions: bumpVersions_([key]) };
    });
  });
}

function checkVersion_(rec, expectedVersion) {
  if (expectedVersion === null) return;   // deliberate overwrite
  if (typeof expectedVersion !== 'number' || expectedVersion !== rec.version) {
    throw new AppError('CONFLICT', 'Someone else changed this item since you opened it.', { current: publicRec_(rec) });
  }
}

/**
 * Adds or subtracts from an item's quantity (used by the +/- buttons).
 * Sends a CHANGE, not a total, so two people taking parts at the same moment
 * are both counted. Never goes below 0 (returns clamped: true if it would have).
 */
function apiAdjustQuantity(key, id, delta) {
  return api_(function () {
    assertTable_(key, ['inventory']);
    assertId_(id);
    const def = TABLES[key];
    if (!def.qtyField) throw new AppError('BAD_REQUEST', 'This section does not track quantities.');
    const col = checkDelta_(def, delta);
    return withLock_(function () {
      const found = findRow_(key, id);
      if (!found) throw new AppError('NOT_FOUND', 'This item no longer exists. It may have been deleted.');
      const rec = found.rec;
      if (rec.archivedAt) throw new AppError('ARCHIVED', 'This item is archived. Restore it before editing.');
      let next = (Number(rec[def.qtyField]) || 0) + delta;
      let clamped = false;
      if (next < 0) { next = 0; clamped = true; }
      if (next > APP.MAX_QUANTITY) throw new AppError('VALIDATION', 'Quantity cannot exceed ' + APP.MAX_QUANTITY + '.');
      if (col.type === 'number') next = round_(next, 3);
      rec[def.qtyField] = next;
      rec.version = (rec.version || 0) + 1;
      rec.updatedAt = nowIso_();
      writeFound_(found, rec);
      return { record: publicRec_(rec), clamped: clamped, versions: bumpVersions_([key]) };
    });
  });
}

/** Sets or clears the "Needs check" flag (set automatically by audits for missing items). */
function apiSetNeedsCheck(key, id, value) {
  return api_(function () {
    assertTable_(key, ['inventory']);
    assertId_(id);
    if (!TABLES[key].auditable) throw new AppError('BAD_REQUEST', 'This section is not audited.');
    if (value !== true && value !== false) throw new AppError('BAD_REQUEST', 'Invalid value.');
    return withLock_(function () {
      const found = findRow_(key, id);
      if (!found) throw new AppError('NOT_FOUND', 'This item no longer exists.');
      const rec = found.rec;
      rec.needsCheck = value;
      rec.version = (rec.version || 0) + 1;
      rec.updatedAt = nowIso_();
      writeFound_(found, rec);
      return { record: publicRec_(rec), versions: bumpVersions_([key]) };
    });
  });
}

// ─────────────────────────── archive / restore / delete ───────────────────────────

/** "Delete" from the app: moves an item to the archive (restorable for 30 days). */
function apiArchive(key, id) {
  return setArchived_(key, id, true);
}

/** Brings an archived item back. */
function apiRestore(key, id) {
  return setArchived_(key, id, false);
}

function setArchived_(key, id, archive) {
  return api_(function () {
    assertTable_(key, ['inventory']);
    assertId_(id);
    return withLock_(function () {
      const found = findRow_(key, id);
      if (!found) throw new AppError('NOT_FOUND', 'This item no longer exists.');
      const rec = found.rec;
      if (archive === Boolean(rec.archivedAt)) {
        return { record: publicRec_(rec), versions: getVersions_() };   // already in that state
      }
      rec.archivedAt = archive ? nowIso_() : '';
      rec.version = (rec.version || 0) + 1;
      rec.updatedAt = nowIso_();
      writeFound_(found, rec);
      return { record: publicRec_(rec), versions: bumpVersions_([key]) };
    });
  });
}

/** Permanently deletes an ARCHIVED item (and its image). Cannot be undone. */
function apiDeletePermanently(key, id) {
  return api_(function () {
    assertTable_(key, ['inventory']);
    assertId_(id);
    return withLock_(function () {
      const found = findRow_(key, id);
      if (!found) throw new AppError('NOT_FOUND', 'This item no longer exists.');
      if (!found.rec.archivedAt) {
        throw new AppError('BAD_REQUEST', 'Only archived items can be permanently deleted. Archive it first.');
      }
      trashImage_(found.rec.imageId);
      found.sh.deleteRow(found.rowNum);
      return { id: id, versions: bumpVersions_([key]) };
    });
  });
}

/** Moves an item's image file to Drive trash. Never fails the calling operation. */
function trashImage_(imageId) {
  if (!imageId) return;
  try { DriveApp.getFileById(imageId).setTrashed(true); } catch (e) { console.warn('Could not trash image ' + imageId + ': ' + e); }
}
