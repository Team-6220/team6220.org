/**
 * ApiSettings.gs — Golden Griffins Inventory
 * ---------------------------------------------------------------------------
 * Rules and browser-callable functions specific to settings tables:
 * Categories, Tags, Locations, Suppliers, dropdown Lists, and Collections.
 * (Creating and renaming use apiCreate / apiUpdate in ApiInventory.gs.)
 *
 * Because items refer to settings by ID, renaming "Tool Chest" updates every
 * item automatically, and removing a setting only needs to clear references.
 */

/** Extra checks for settings, run on create and update. */
function checkSettingRules_(key, next, prev, ctx) {
  const t = ctx.table(key);
  const others = t.rows.filter(function (r) { return r.id !== next.id; });
  const lower = function (s) { return String(s).toLowerCase(); };
  const err = function (field, msg) {
    const f = {}; f[field] = msg;
    throw new AppError('VALIDATION', msg, { fields: f });
  };

  switch (key) {
    case 'categories':
    case 'tags':
    case 'suppliers':
    case 'collections':
      if (others.some(function (r) { return lower(r.name) === lower(next.name); })) {
        err('name', 'There is already one named "' + next.name + '".');
      }
      break;

    case 'lists':
      if (others.some(function (r) { return r.listKey === next.listKey && lower(r.value) === lower(next.value); })) {
        err('value', '"' + next.value + '" is already in this list.');
      }
      break;

    case 'locations': {
      if (next.parentId) {
        if (next.parentId === next.id) err('parentId', 'A location cannot be inside itself.');
        const parent = t.byId[next.parentId];
        if (parent && parent.parentId) {
          err('parentId', 'Locations have two levels (Area → Container). Pick a top-level area.');
        }
        if (prev && others.some(function (r) { return r.parentId === next.id; })) {
          err('parentId', 'This area has containers inside it, so it cannot be moved into another area.');
        }
      }
      if (others.some(function (r) { return r.parentId === next.parentId && lower(r.name) === lower(next.name); })) {
        err('name', 'There is already a location named "' + next.name + '" here.');
      }
      break;
    }
  }
}

function nextSortOrder_(t) {
  return t.rows.reduce(function (m, r) { return Math.max(m, Number(r.sortOrder) || 0); }, 0) + 1;
}

/**
 * Removes a settings entry.
 *   force = false → if anything uses it, nothing is changed and the reply is
 *                   error IN_USE with details { counts: { parts: 3, ... }, total }
 *                   so the browser can ask "Remove it from 3 parts?"
 *   force = true  → clears it from everything that uses it, then deletes it.
 * Removing a location area also removes the containers inside it.
 */
function apiRemoveSetting(key, id, force) {
  return api_(function () {
    assertTable_(key, ['setting']);
    assertId_(id);
    return withLock_(function () {
      const ctx = newCtx_();
      const t = ctx.table(key);
      const rec = t.byId[id];
      if (!rec) throw new AppError('NOT_FOUND', 'This entry no longer exists.');

      const ids = [id];
      if (key === 'locations') {
        t.rows.forEach(function (r) { if (r.parentId === id) ids.push(r.id); });
      }
      const idSet = new Set(ids);
      const usage = findUsage_(key, idSet, ctx);
      const counts = {};
      let total = 0;
      Object.keys(usage).forEach(function (tk) { counts[tk] = usage[tk].length; total += usage[tk].length; });
      const childCount = ids.length - 1;

      if ((total > 0 || childCount > 0) && force !== true) {
        throw new AppError('IN_USE', 'This is still in use.', { counts: counts, total: total, childCount: childCount });
      }

      const changedKeys = clearUsage_(usage, idSet, ctx);
      const rowNums = ids.map(function (x) { return t.byId[x].__i + 2; });
      deleteRows_(t.sh, rowNums);
      changedKeys.push(key);
      return { removedIds: ids, cleared: counts, versions: bumpVersions_(changedKeys) };
    });
  });
}

/**
 * Reorders entries. `orderedIds` can be the whole table or just a group
 * (e.g. the containers in one area); only those swap positions.
 */
function apiReorder(key, orderedIds) {
  return api_(function () {
    assertTable_(key, ['setting', 'packing']);
    if (!TABLES[key].columns.some(function (c) { return c.name === 'sortOrder'; })) throw new AppError('BAD_REQUEST', 'This list can’t be reordered.');
    if (!Array.isArray(orderedIds) || !orderedIds.length || orderedIds.length > 2000) {
      throw new AppError('BAD_REQUEST', 'Invalid order.');
    }
    orderedIds.forEach(assertId_);
    if (new Set(orderedIds).size !== orderedIds.length) throw new AppError('BAD_REQUEST', 'Invalid order.');
    return withLock_(function () {
      const t = readAll_(key);
      if (orderedIds.some(function (x) { return !t.byId[x]; })) {
        throw new AppError('CONFLICT', 'The list changed while you were reordering. Refresh and try again.');
      }
      // Current order, then put the moved IDs into the slots they occupied, in the new order.
      const current = t.rows.slice().sort(function (a, b) {
        return ((a.sortOrder || 0) - (b.sortOrder || 0)) || (a.__i - b.__i);
      });
      const moving = new Set(orderedIds);
      let n = 0;
      const final = current.map(function (r) { return moving.has(r.id) ? t.byId[orderedIds[n++]] : r; });
      const changed = [];
      final.forEach(function (r, i) {
        if (r.sortOrder !== i + 1) { r.sortOrder = i + 1; changed.push(r); }
      });
      rewriteRows_(t, changed);
      return { versions: changed.length ? bumpVersions_([key]) : getVersions_() };
    });
  });
}

// ─────────────────────────── usage helpers ───────────────────────────

/** Finds every row (in any table) that refers to one of the IDs. Returns { tableKey: [rows] }. */
function findUsage_(key, idSet, ctx) {
  const usage = {};
  clientTableKeys_().forEach(function (tk) {
    const def = TABLES[tk];
    const refCols = def.columns.filter(function (c) {
      return (c.type === 'ref' || c.type === 'refList') && c.ref === key;
    });
    const jsonCols = tk === 'collections' ? def.columns.filter(function (c) { return c.type === 'json'; }) : [];
    if (!refCols.length && !jsonCols.length) return;
    const hits = ctx.table(tk).rows.filter(function (r) {
      if (idSet.has(r.id)) return false;   // rows being deleted themselves
      return refCols.some(function (c) {
        return c.type === 'ref' ? idSet.has(r[c.name]) : r[c.name].some(function (x) { return idSet.has(x); });
      }) || jsonCols.some(function (c) { return jsonHasId_(r[c.name], idSet); });
    });
    if (hits.length) usage[tk] = hits;
  });
  return usage;
}

/** Removes the IDs from every row found by findUsage_. Returns the table keys changed. */
function clearUsage_(usage, idSet, ctx) {
  const changedKeys = [];
  Object.keys(usage).forEach(function (tk) {
    const def = TABLES[tk];
    const rows = usage[tk];
    rows.forEach(function (r) {
      def.columns.forEach(function (c) {
        if (c.type === 'ref' && idSet.has(r[c.name])) r[c.name] = '';
        else if (c.type === 'refList') r[c.name] = r[c.name].filter(function (x) { return !idSet.has(x); });
        else if (c.type === 'json') r[c.name] = jsonStripIds_(r[c.name], idSet);
      });
      if (def.kind === 'inventory') r.version = (r.version || 0) + 1;
    });
    rewriteRows_(ctx.table(tk), rows);
    changedKeys.push(tk);
  });
  return changedKeys;
}
