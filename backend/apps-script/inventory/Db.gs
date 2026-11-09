/**
 * Db.gs — Golden Griffins Inventory
 * ---------------------------------------------------------------------------
 * The only file that talks to the spreadsheet directly.
 *
 * Rules this layer follows:
 *   - Columns are located by header name (row 1), never by position.
 *   - Records are located by their ID, never by row number from the browser.
 *   - Every write happens inside withLock_(), so two writes never interleave.
 *   - Unknown extra columns someone adds to a sheet are preserved untouched.
 */

let __spreadsheet = null;
const __headerCache = {};

function ss_() {
  if (__spreadsheet) return __spreadsheet;
  let ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (!ss) {
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new AppError('NOT_SETUP', 'The database is not set up yet. Run setupDatabase from the Apps Script editor.');
    ss = SpreadsheetApp.openById(id);
  }
  __spreadsheet = ss;
  return ss;
}

function sheet_(key) {
  const name = TABLES[key].sheet;
  const sh = ss_().getSheetByName(name);
  if (!sh) {
    throw new AppError('NOT_SETUP', 'The "' + name + '" sheet is missing. Run setupDatabase from the Apps Script editor.');
  }
  return sh;
}

/**
 * Reads row 1 and maps header name → column index (0-based). Cached per request.
 * Pass headerRow if you already have it (saves a spreadsheet call).
 */
function headerMap_(key, sh, headerRow) {
  if (__headerCache[key]) return __headerCache[key];
  let row = headerRow;
  if (!row) {
    const lastCol = sh.getLastColumn();
    if (lastCol < 1) throw new AppError('NOT_SETUP', 'The "' + sh.getName() + '" sheet has no headers. Run setupDatabase.');
    row = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  }
  const headers = row.map(function (h) { return String(h).trim(); });
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  const idx = {};
  headers.forEach(function (h, i) { if (h && !(h in idx)) idx[h] = i; });
  const missing = TABLES[key].columns.filter(function (c) { return !(c.name in idx); })
    .map(function (c) { return c.name; });
  if (missing.length) {
    throw new AppError('NOT_SETUP', 'The "' + sh.getName() + '" sheet is missing columns: ' + missing.join(', ') +
      '. Run setupDatabase from the Apps Script editor to repair it.');
  }
  const hm = { headers: headers, idx: idx, width: headers.length };
  __headerCache[key] = hm;
  return hm;
}

function clearHeaderCache_() {
  Object.keys(__headerCache).forEach(function (k) { delete __headerCache[k]; });
}

// ─────────────────────────── cell ⇄ value conversion ───────────────────────────

const TEXT_TYPES = ['id', 'string', 'text', 'date', 'enum', 'ref', 'refList', 'measure', 'json'];

function isTextType_(type) {
  return TEXT_TYPES.indexOf(type) >= 0;
}

/** Spreadsheet cell → JavaScript value. */
function fromCell_(col, v) {
  switch (col.type) {
    case 'int':
    case 'number': {
      if (v === '' || v === null || v === undefined) return null;
      const n = Number(v);
      return isFinite(n) ? n : null;
    }
    case 'bool':
      return v === true || String(v).toUpperCase() === 'TRUE';
    case 'refList':
      return v === '' || v === null ? [] : String(v).split('|').map(function (s) { return s.trim(); }).filter(Boolean);
    case 'json': {
      const empty = Array.isArray(col.empty) ? [] : {};
      if (v === '' || v === null) return empty;
      try { return JSON.parse(String(v)); } catch (e) { return empty; }
    }
    default: {
      if (v instanceof Date) return v.toISOString();
      let s = v === null || v === undefined ? '' : String(v);
      if (s.charAt(0) === "'" && s.charAt(1) === '=') s = s.slice(1);   // see toCell_
      return s;
    }
  }
}

/** JavaScript value → spreadsheet cell. */
function toCell_(col, v) {
  switch (col.type) {
    case 'int':
    case 'number':
      return v === null || v === undefined || v === '' ? '' : Number(v);
    case 'bool':
      return v === true;
    case 'refList':
      return (v || []).join('|');
    case 'json':
      return v === null || v === undefined ? '' : JSON.stringify(v);
    default: {
      const s = v === null || v === undefined ? '' : String(v);
      // Text starting with "=" would become a formula. The leading apostrophe
      // forces Sheets to keep it as plain text.
      return s.charAt(0) === '=' ? "'" + s : s;
    }
  }
}

function fromRow_(def, hm, raw) {
  const rec = {};
  def.columns.forEach(function (c) { rec[c.name] = fromCell_(c, raw[hm.idx[c.name]]); });
  return rec;
}

/** Builds a sheet row. Starts from `base` (the existing row) so extra columns survive. */
function toRow_(def, hm, rec, base) {
  const row = base ? base.slice() : new Array(hm.width).fill('');
  while (row.length < hm.width) row.push('');
  def.columns.forEach(function (c) {
    if (Object.prototype.hasOwnProperty.call(rec, c.name)) row[hm.idx[c.name]] = toCell_(c, rec[c.name]);
  });
  return row;
}

/** A record with every column at its empty value. */
function blankRecord_(def) {
  const rec = {};
  def.columns.forEach(function (c) {
    switch (c.type) {
      case 'int': case 'number': rec[c.name] = null; break;
      case 'bool': rec[c.name] = false; break;
      case 'refList': rec[c.name] = []; break;
      case 'json': rec[c.name] = Array.isArray(c.empty) ? [] : {}; break;
      default: rec[c.name] = '';
    }
  });
  return rec;
}

// ─────────────────────────── reading ───────────────────────────

/**
 * Reads a whole table in one batch call.
 * Returns { key, def, sh, hm, raws, rows, byId }.
 *   raws  – every data row exactly as stored (used when rewriting)
 *   rows  – parsed records (rows with a blank ID are skipped); rec.__i = index into raws
 */
function readAll_(key) {
  const def = TABLES[key];
  const sh = sheet_(key);
  const values = sh.getDataRange().getValues();   // one call: headers + data
  const hm = headerMap_(key, sh, values[0]);
  const raws = values.slice(1).map(function (r) {
    if (r.length === hm.width) return r;
    const out = r.slice(0, hm.width);
    while (out.length < hm.width) out.push('');
    return out;
  });
  while (raws.length && raws[raws.length - 1].every(function (c) { return c === ''; })) raws.pop();
  const rows = [];
  const byId = {};
  raws.forEach(function (raw, i) {
    const id = String(raw[hm.idx.id] || '').trim();
    if (!id) return;
    const rec = fromRow_(def, hm, raw);
    rec.__i = i;
    rows.push(rec);
    byId[id] = rec;
  });
  return { key: key, def: def, sh: sh, hm: hm, raws: raws, rows: rows, byId: byId };
}

/**
 * Finds one record by ID without reading the whole table (uses TextFinder on the id column).
 * Returns { key, def, sh, hm, rowNum, raw, rec } or null.
 */
function findRow_(key, id) {
  const def = TABLES[key];
  const sh = sheet_(key);
  const hm = headerMap_(key, sh);
  const last = sh.getLastRow();
  if (last < 2) return null;
  const cell = sh.getRange(2, hm.idx.id + 1, last - 1, 1)
    .createTextFinder(id).matchCase(true).matchEntireCell(true).findNext();
  if (!cell) return null;
  const rowNum = cell.getRow();
  const raw = sh.getRange(rowNum, 1, 1, hm.width).getValues()[0];
  return { key: key, def: def, sh: sh, hm: hm, rowNum: rowNum, raw: raw, rec: fromRow_(def, hm, raw) };
}

/**
 * A per-operation memo so one write doesn't read the same reference table twice.
 * Use only inside a lock (the data is then guaranteed current).
 */
function newCtx_() {
  const cache = {};
  return {
    table: function (key) {
      if (!cache[key]) cache[key] = readAll_(key);
      return cache[key];
    },
    forget: function (key) { delete cache[key]; }
  };
}

// ─────────────────────────── writing (call only inside withLock_) ───────────────────────────

/** Overwrites the row found by findRow_. */
function writeFound_(found, rec) {
  const row = toRow_(found.def, found.hm, rec, found.raw);
  found.sh.getRange(found.rowNum, 1, 1, found.hm.width).setValues([row]);
}

/** Appends one or more records in a single batch write. */
function insertMany_(key, recs) {
  if (!recs.length) return;
  const def = TABLES[key];
  const sh = sheet_(key);
  const hm = headerMap_(key, sh);
  const start = sh.getLastRow() + 1;
  if (start - 1 + recs.length > APP.MAX_ROWS_PER_TABLE + 1) {
    throw new AppError('LIMIT', 'This section has reached its maximum size (' + APP.MAX_ROWS_PER_TABLE + ' rows).');
  }
  const needed = start + recs.length - 1;
  const maxRows = sh.getMaxRows();
  if (needed > maxRows) sh.insertRowsAfter(maxRows, Math.max(needed - maxRows, 100));
  const rows = recs.map(function (r) { return toRow_(def, hm, r, null); });
  sh.getRange(start, 1, rows.length, hm.width).setValues(rows);
}

function insert_(key, rec) {
  insertMany_(key, [rec]);
}

/**
 * Writes changed records back into a table read with readAll_, in one batch call.
 * `changed` must be records that came from t.rows (they carry __i).
 */
function rewriteRows_(t, changed) {
  if (!changed.length) return;
  changed.forEach(function (rec) { t.raws[rec.__i] = toRow_(t.def, t.hm, rec, t.raws[rec.__i]); });
  t.sh.getRange(2, 1, t.raws.length, t.hm.width).setValues(t.raws);
}

/**
 * Deletes rows (sheet row numbers). Neighbouring rows are deleted in one call,
 * bottom-up so the remaining numbers stay valid. If every data row is being
 * removed, the rows are cleared instead (Sheets can't delete all unfrozen rows).
 */
function deleteRows_(sh, rowNums) {
  if (!rowNums.length) return;
  const sorted = rowNums.slice().sort(function (a, b) { return a - b; });
  const last = sh.getLastRow();
  if (sorted.length === last - 1 && sorted[0] === 2 && sorted[sorted.length - 1] === last) {
    sh.getRange(2, 1, last - 1, Math.max(1, sh.getLastColumn())).clearContent();
    return;
  }
  const runs = [];
  sorted.forEach(function (r) {
    const run = runs[runs.length - 1];
    if (run && r === run.start + run.count) run.count++;
    else runs.push({ start: r, count: 1 });
  });
  runs.reverse().forEach(function (run) {
    if (run.count === 1) sh.deleteRow(run.start); else sh.deleteRows(run.start, run.count);
  });
}

// ─────────────────────────── locking & change tracking ───────────────────────────

/**
 * Runs fn while holding the script-wide lock. All writes go through here, so
 * concurrent requests queue up instead of overwriting each other.
 */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(APP.LOCK_WAIT_MS)) {
    throw new AppError('BUSY', 'The inventory is busy right now. Please try again in a moment.');
  }
  try {
    const result = fn();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

const VERSIONS_PROP = 'tableVersions';

/**
 * Each table has a change counter. Browsers remember the counters they have
 * and only re-download tables whose counter moved.
 */
function getVersions_() {
  const raw = PropertiesService.getScriptProperties().getProperty(VERSIONS_PROP);
  let v = {};
  try { v = raw ? JSON.parse(raw) : {}; } catch (e) { v = {}; }
  Object.keys(TABLES).concat(['packingMeta']).forEach(function (k) { if (typeof v[k] !== 'number') v[k] = 0; });
  return v;
}

/** Call only inside withLock_. */
function bumpVersions_(keys) {
  const v = getVersions_();
  keys.forEach(function (k) { v[k] = (v[k] || 0) + 1; });
  PropertiesService.getScriptProperties().setProperty(VERSIONS_PROP, JSON.stringify(v));
  return v;
}

// ─────────────────────────── Config sheet (key / value) ───────────────────────────

function configSheet_() {
  const sh = ss_().getSheetByName(CONFIG_SHEET);
  if (!sh) throw new AppError('NOT_SETUP', 'The Config sheet is missing. Run setupDatabase from the Apps Script editor.');
  return sh;
}

function readConfig_() {
  const sh = configSheet_();
  const last = sh.getLastRow();
  const out = {};
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) {
    const k = String(r[0]).trim();
    if (k) out[k] = String(r[1]);
  });
  return out;
}

function getConfig_(key) {
  const c = readConfig_();
  return Object.prototype.hasOwnProperty.call(c, key) ? c[key] : null;
}

function setConfig_(key, value) {
  const sh = configSheet_();
  const last = sh.getLastRow();
  const keys = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];
  const i = keys.indexOf(key);
  if (i >= 0) sh.getRange(i + 2, 2).setValue(String(value));
  else sh.getRange(last + 1, 1, 1, 2).setValues([[key, String(value)]]);
}
