/**
 * Setup.gs — Golden Griffins Inventory
 * ---------------------------------------------------------------------------
 * setupDatabase() creates or repairs every sheet, creates the Drive folders,
 * and fills in the default categories/tags/lists the first time.
 *
 * It is SAFE TO RUN AGAIN at any time: it never deletes data or reorders
 * columns, it only adds what is missing. Run it after every code update that
 * adds new columns.
 */

/** ▶ Run from the Apps Script editor: select "setupDatabase" and click Run. */
function setupDatabase() {
  requireEditor_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from the spreadsheet (Extensions → Apps Script) and run it again.');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());

  withLock_(function () {
    const report = [];
    ensureConfigSheet_(ss);
    Object.keys(TABLES).forEach(function (k) { report.push(ensureTableSheet_(ss, k)); });
    clearHeaderCache_();
    report.push(ensureFolders_());

    if (getConfig_('seeded') !== 'true') {
      seedDefaults_();
      setConfig_('seeded', 'true');
      report.push('Added default categories, tags, suppliers, dropdown lists and collections.');
    }
    if (getConfig_('packingSeeded') !== 'true') {
      clearHeaderCache_();
      const n = seedPackingList_();
      setConfig_('packingSeeded', 'true');
      if (n) report.push('Imported the packing list (' + n + ' entries).');
    }
    const filled = backfillRawShapes_();
    if (filled) report.push('Gave ' + filled + ' existing raw material piece(s) a rectangle shape from their length × width.');
    setConfig_('schemaVersion', APP.SCHEMA_VERSION);
    setConfig_('appName', APP.NAME);

    // Remove the blank starter tab if it is still there and empty.
    const blank = ss.getSheetByName('Sheet1');
    if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

    bumpVersions_(Object.keys(TABLES));
    console.log('Setup complete:\n  ' + report.filter(Boolean).join('\n  '));
  });
}

function ensureConfigSheet_(ss) {
  let sh = ss.getSheetByName(CONFIG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG_SHEET);
    sh.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
  }
  sh.getRange(1, 1, sh.getMaxRows(), 2).setNumberFormat('@');
  styleHeader_(sh, 2);
}

/** Creates the sheet if needed, adds missing columns at the end, sets formats. */
function ensureTableSheet_(ss, key) {
  const def = TABLES[key];
  let sh = ss.getSheetByName(def.sheet);
  let note = '';
  if (!sh) {
    sh = ss.insertSheet(def.sheet);
    note = 'Created sheet ' + def.sheet + '.';
  }
  const lastCol = sh.getLastColumn();
  const headers = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  const missing = def.columns.map(function (c) { return c.name; }).filter(function (n) { return headers.indexOf(n) < 0; });
  if (missing.length) {
    const start = headers.length + 1;
    const needCols = start + missing.length - 1;
    if (needCols > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), needCols - sh.getMaxColumns());
    sh.getRange(1, start, 1, missing.length).setValues([missing]);
    if (!note) note = 'Added columns to ' + def.sheet + ': ' + missing.join(', ') + '.';
  }

  // Text columns must be "plain text" or Sheets turns values like 1/8 into dates.
  const all = headers.concat(missing);
  def.columns.forEach(function (c) {
    const col = all.indexOf(c.name) + 1;
    const range = sh.getRange(1, col, sh.getMaxRows(), 1);
    range.setNumberFormat(isTextType_(c.type) ? '@' : (c.type === 'int' ? '0' : 'General'));
  });
  styleHeader_(sh, all.length);
  return note;
}

function styleHeader_(sh, width) {
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#FFA300').setFontColor('#000000');
}

/** Creates "Golden Griffins Inventory / Item Images" and "/ Backups" in My Drive. */
function ensureFolders_() {
  const notes = [];
  const getFolder = function (id) {
    if (!id) return null;
    try {
      const f = DriveApp.getFolderById(id);
      return f.isTrashed() ? null : f;
    } catch (e) { return null; }
  };
  let root = getFolder(getConfig_('rootFolderId'));
  if (!root) {
    root = DriveApp.createFolder(APP.ROOT_FOLDER_NAME);
    setConfig_('rootFolderId', root.getId());
    notes.push('Created Drive folder "' + APP.ROOT_FOLDER_NAME + '".');
  }
  [['imageFolderId', APP.IMAGE_FOLDER_NAME], ['backupFolderId', APP.BACKUP_FOLDER_NAME]].forEach(function (p) {
    if (!getFolder(getConfig_(p[0]))) {
      const f = root.createFolder(p[1]);
      setConfig_(p[0], f.getId());
      notes.push('Created Drive folder "' + p[1] + '".');
    }
  });
  return notes.join(' ');
}

/** Writes the SEED values (only ever runs once). */
function seedDefaults_() {
  const ctx = newCtx_();
  const seedTable = function (key, makeRecs) {
    const t = ctx.table(key);
    if (t.rows.length) return;   // never seed into a table that already has data
    const def = TABLES[key];
    const recs = makeRecs().map(function (fields, i) {
      const r = Object.assign(blankRecord_(def), fields);
      r.id = newId_(def.prefix);
      r.sortOrder = i + 1;
      return r;
    });
    insertMany_(key, recs);
    ctx.forget(key);
  };

  seedTable('categories', function () {
    return SEED.categories.map(function (n) { return { name: n }; });
  });

  const catId = {};
  ctx.table('categories').rows.forEach(function (r) { catId[r.name] = r.id; });

  seedTable('tags', function () {
    const out = [];
    Object.keys(SEED.tags).forEach(function (group) {
      SEED.tags[group].forEach(function (n) { out.push({ name: n, categoryId: catId[group] || '' }); });
    });
    return out;
  });

  seedTable('suppliers', function () {
    return SEED.suppliers.map(function (n) { return { name: n }; });
  });

  seedTable('lists', function () {
    const out = [];
    Object.keys(SEED.lists).forEach(function (k) {
      SEED.lists[k].forEach(function (v) { out.push({ listKey: k, value: v }); });
    });
    return out;
  });

  const tagId = {};
  ctx.table('tags').rows.forEach(function (r) { tagId[r.name] = r.id; });

  seedTable('collections', function () {
    return SEED.collections.map(function (c) {
      const filter = {};
      if (c.tags) { filter.tagIds = c.tags.map(function (n) { return tagId[n]; }).filter(Boolean); filter.tagMode = 'any'; }
      if (c.categories) filter.categoryIds = c.categories.map(function (n) { return catId[n]; }).filter(Boolean);
      return { name: c.name, section: c.section, filter: filter };
    });
  });
}

/**
 * Stock recorded before shapes existed: turn its length × width into a
 * rectangle so it shows a drawing and can be used by the cut planner.
 */
function backfillRawShapes_() {
  clearHeaderCache_();
  const data = readAll_('rawMaterials');
  const changed = [];
  data.rows.forEach(function (r) {
    if (r.shape && r.shape.points && r.shape.points.length >= 3) return;
    const L = Number(r.lengthValue), W = Number(r.widthValue);
    if (!(L > 0) || !(W > 0)) return;
    r.shape = { kind: 'rect', points: [[0, 0], [L, 0], [L, W], [0, W]], edges: [L, W, L, W] };
    r.area = round_(L * W, 3);   // length / width text stay exactly as typed
    changed.push(r);
  });
  if (changed.length) rewriteRows_(data, changed);
  return changed.length;
}
