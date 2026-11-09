/**
 * Util.gs — Golden Griffins Inventory
 * ---------------------------------------------------------------------------
 * Shared helpers: error type, the API response wrapper, IDs, and parsing.
 *
 * SECURITY NOTE (read before adding functions):
 *   Any top-level function whose name does NOT end in "_" can be called by
 *   anyone who opens the web app. Internal helpers MUST end in "_".
 *   Maintenance functions meant only for the editor (setupDatabase, etc.)
 *   must call requireEditor_() first.
 */

/** An error with a code the browser can react to (shown to users as message). */
class AppError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;          // VALIDATION, CONFLICT, NOT_FOUND, IN_USE, BUSY, BAD_REQUEST, ...
    this.details = details || null;
  }
}

/** A single field failed validation (collected into one VALIDATION AppError). */
class FieldError extends Error {}

/**
 * Wraps every browser-callable function. Always returns
 *   { ok: true, data: ... }  or  { ok: false, error: { code, message, details } }
 * so the browser never has to parse raw stack traces.
 */
function api_(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (e) {
    if (e instanceof AppError) {
      return { ok: false, error: { code: e.code, message: e.message, details: e.details } };
    }
    console.error(e && e.stack ? e.stack : e);
    return {
      ok: false,
      error: { code: 'SERVER', message: 'Something went wrong on the server. Please try again.', details: null }
    };
  }
}

function nowIso_() {
  return new Date().toISOString();
}

/** e.g. newId_('PT') → "PT-3f9a0c1e" */
function newId_(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toLowerCase();
}

const ID_PATTERN = /^[A-Z]{2}-[a-z0-9]{8}$/;

function isId_(v) {
  return typeof v === 'string' && ID_PATTERN.test(v);
}

function assertId_(id) {
  if (!isId_(id)) throw new AppError('BAD_REQUEST', 'Invalid item ID.');
}

/** Checks that `key` is a real table of one of the allowed kinds. */
function assertTable_(key, kinds) {
  if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(TABLES, key) ||
      kinds.indexOf(TABLES[key].kind) < 0) {
    throw new AppError('BAD_REQUEST', 'Unknown inventory section.');
  }
}

/** Strips internal fields (those starting with "__") before sending to the browser. */
function publicRec_(rec) {
  const out = {};
  Object.keys(rec).forEach(function (k) {
    if (k.indexOf('__') !== 0) out[k] = rec[k];
  });
  return out;
}

/**
 * Blocks web-app visitors from running editor-only maintenance functions.
 * Anonymous visitors have no active-user email, so they always fail this check.
 */
function requireEditor_() {
  const active = Session.getActiveUser().getEmail();
  const effective = Session.getEffectiveUser().getEmail();
  if (!active || active !== effective) {
    throw new AppError('FORBIDDEN', 'This can only be run from the Apps Script editor by the owner account.');
  }
}

/** "lowStockThreshold" → "Low stock threshold" (used when a column has no label). */
function humanize_(name) {
  const s = name.replace(/Ids?$/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function colLabel_(col) {
  return col.label || humanize_(col.name);
}

/**
 * Parses sizes people type: "1/8", "1 1/2", "1-1/2", "0.125", ".5", "24",
 * optionally followed by a unit ("1/8in", '1/4"', "3mm"). Returns a number or null.
 */
function parseMeasure_(text) {
  let s = String(text).trim().toLowerCase()
    .replace(/(″|"|''|inches|inch|in|mm|cm|ft|m)$/, '').trim();
  let m = s.match(/^(\d+)(?:\s+|-)(\d+)\s*\/\s*(\d+)$/);        // 1 1/2  or  1-1/2
  if (m) return Number(m[3]) ? round_(Number(m[1]) + Number(m[2]) / Number(m[3]), 4) : null;
  m = s.match(/^(\d+)\s*\/\s*(\d+)$/);                            // 1/8
  if (m) return Number(m[2]) ? round_(Number(m[1]) / Number(m[2]), 4) : null;
  m = s.match(/^(\d+(?:\.\d*)?|\.\d+)$/);                         // 0.125, 24, .5
  if (m) return round_(parseFloat(m[1]), 4);
  return null;
}

function round_(n, places) {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

/** True if a JSON value (object/array, any depth) contains any ID from idSet. */
function jsonHasId_(value, idSet) {
  if (Array.isArray(value)) return value.some(function (v) { return jsonHasId_(v, idSet); });
  if (value && typeof value === 'object') {
    return Object.keys(value).some(function (k) { return jsonHasId_(value[k], idSet); });
  }
  return typeof value === 'string' && idSet.has(value);
}

/** Returns a copy of a JSON value with any IDs from idSet removed from arrays. */
function jsonStripIds_(value, idSet) {
  if (Array.isArray(value)) {
    return value.filter(function (v) { return !(typeof v === 'string' && idSet.has(v)); })
      .map(function (v) { return jsonStripIds_(v, idSet); });
  }
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(function (k) { out[k] = jsonStripIds_(value[k], idSet); });
    return out;
  }
  return value;
}
