/**
 * Validate.gs — Golden Griffins Inventory
 * ---------------------------------------------------------------------------
 * Server-side validation. Nothing from the browser is trusted:
 *   - unknown fields are ignored
 *   - system fields (id, version, timestamps, ...) are ignored
 *   - every value is type-checked, length/range-checked and cleaned
 *   - references (category, tags, location, ...) must point at rows that exist
 */

/**
 * Validates browser input for a table.
 *   mode 'create' → every non-system column is validated (missing = empty)
 *   mode 'update' → only the fields present in `input` are validated
 * Returns a clean object containing only allowed fields.
 * Throws AppError('VALIDATION', ..., { fields: { fieldName: message } }).
 */
function validateInput_(key, input, mode, existing, ctx) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError('BAD_REQUEST', 'Invalid data was sent.');
  }
  const def = TABLES[key];
  const out = {};
  const errors = {};

  def.columns.forEach(function (col) {
    if (col.system) return;
    const has = Object.prototype.hasOwnProperty.call(input, col.name);
    if (mode === 'update' && !has) return;
    if (mode === 'update' && col.immutable) {
      if (input[col.name] !== existing[col.name]) errors[col.name] = 'This cannot be changed after it is created.';
      return;
    }
    try {
      const v = coerce_(col, has ? input[col.name] : undefined, ctx);
      if (col.required && isEmptyValue_(v)) throw new FieldError('This field is required.');
      out[col.name] = v;
      if (col.type === 'measure' && col.valueColumn) out[col.valueColumn] = v === '' ? null : parseMeasure_(v);
    } catch (e) {
      if (e instanceof FieldError) errors[col.name] = e.message;
      else throw e;
    }
  });

  if (key === 'rawMaterials' && Object.prototype.hasOwnProperty.call(out, 'shape') && !errors.shape) deriveShapeFields_(out);

  const bad = Object.keys(errors);
  if (bad.length) {
    const labels = bad.map(function (n) {
      const c = def.columns.filter(function (x) { return x.name === n; })[0];
      return c ? colLabel_(c) : n;
    });
    throw new AppError('VALIDATION', 'Please check: ' + labels.join(', ') + '.', { fields: errors });
  }
  return out;
}

function isEmptyValue_(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Removes invisible control characters (keeps tabs and newlines). */
function cleanText_(s) {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‍﻿]/g, '');
}

function coerce_(col, v, ctx) {
  switch (col.type) {
    case 'string':
    case 'text': {
      if (v === null || v === undefined) return '';
      if (typeof v !== 'string' && typeof v !== 'number') throw new FieldError('Must be text.');
      let s = cleanText_(String(v));
      s = col.type === 'string' ? s.replace(/\s+/g, ' ').trim() : s.replace(/\r\n?/g, '\n').trim();
      if (col.max && s.length > col.max) throw new FieldError('Must be ' + col.max + ' characters or fewer.');
      return s;
    }

    case 'int':
    case 'number': {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'string' ? Number(v.trim()) : v;
      if (typeof n !== 'number' || !isFinite(n)) throw new FieldError('Must be a number.');
      if (col.type === 'int' && !Number.isInteger(n)) throw new FieldError('Must be a whole number.');
      if (col.min !== undefined && n < col.min) throw new FieldError('Must be at least ' + col.min + '.');
      if (col.max !== undefined && n > col.max) throw new FieldError('Must be at most ' + col.max + '.');
      return col.type === 'number' ? round_(n, 3) : n;
    }

    case 'bool':
      if (v === null || v === undefined) return false;
      if (v !== true && v !== false) throw new FieldError('Must be true or false.');
      return v;

    case 'enum':
      if (v === null || v === undefined || v === '') return '';
      if (col.values.indexOf(v) < 0) throw new FieldError('Not a valid choice.');
      return v;

    case 'ref':
      if (v === null || v === undefined || v === '') return '';
      checkRef_(col, v, ctx);
      return v;

    case 'refList': {
      if (v === null || v === undefined || v === '') return [];
      if (!Array.isArray(v)) throw new FieldError('Invalid selection.');
      const seen = {};
      const out = [];
      v.forEach(function (id) {
        checkRef_(col, id, ctx);
        if (!seen[id]) { seen[id] = true; out.push(id); }
      });
      if (col.maxItems && out.length > col.maxItems) throw new FieldError('Choose at most ' + col.maxItems + '.');
      return out;
    }

    case 'measure': {
      if (v === null || v === undefined || v === '') return '';
      if (typeof v !== 'string' && typeof v !== 'number') throw new FieldError('Must be a number or fraction.');
      const s = cleanText_(String(v)).replace(/\s+/g, ' ').trim();
      if (s === '') return '';
      if (s.length > (col.max || 30)) throw new FieldError('Too long.');
      if (parseMeasure_(s) === null) throw new FieldError('Enter a number or fraction, like 1/8 or 1 1/2.');
      return s;
    }

    case 'json':
      if (col.check === 'filter') return checkFilter_(v);
      if (col.check === 'sections') return checkSections_(v);
      if (col.check === 'shape') return checkShape_(v);
      if (col.check === 'placement') return checkPlacement_(v);
      throw new FieldError('Unsupported field.');

    default:
      throw new FieldError('Unsupported field.');
  }
}

/** A reference must be a well-formed ID of an existing row (in the right dropdown list). */
function checkRef_(col, id, ctx) {
  if (!isId_(id)) throw new FieldError('Invalid selection.');
  const row = ctx.table(col.ref).byId[id];
  if (!row || (col.listKey && row.listKey !== col.listKey)) {
    throw new FieldError('That option no longer exists. Refresh the page and try again.');
  }
}

/**
 * Collection filters are stored as JSON. Allowed shape: an object whose keys
 * are simple names and whose values are short strings, numbers, booleans or
 * arrays of short strings. Keeps junk and oversized data out of the sheet.
 */
function checkFilter_(v) {
  if (v === null || v === undefined || v === '') return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new FieldError('Invalid filter.');
  const out = {};
  Object.keys(v).forEach(function (k) {
    if (!/^[A-Za-z]{1,30}$/.test(k)) throw new FieldError('Invalid filter.');
    const x = v[k];
    if (typeof x === 'boolean' || (typeof x === 'number' && isFinite(x))) out[k] = x;
    else if (typeof x === 'string') {
      if (x.length > 200) throw new FieldError('Filter text is too long.');
      out[k] = cleanText_(x);
    } else if (Array.isArray(x)) {
      if (x.length > 100 || x.some(function (s) { return typeof s !== 'string' || s.length > 200; })) {
        throw new FieldError('Invalid filter.');
      }
      out[k] = x.map(cleanText_);
    } else if (x !== null && x !== undefined) {
      throw new FieldError('Invalid filter.');
    }
  });
  if (JSON.stringify(out).length > 4000) throw new FieldError('Filter is too large.');
  return out;
}

/**
 * A stock outline: { kind: 'rect'|'traced', points: [[x,y],…], edges: [len,…] }.
 * Must be a real, non-self-crossing polygon. Empty object = no shape recorded.
 */
function checkShape_(v) {
  if (v === null || v === undefined || v === '' || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new FieldError('Invalid shape.');
  const kind = v.kind === 'rect' ? 'rect' : (v.kind === 'traced' ? 'traced' : null);
  if (!kind) throw new FieldError('Invalid shape.');
  if (!Array.isArray(v.points) || v.points.length < 3 || v.points.length > 60) throw new FieldError('A shape needs 3 to 60 corners.');
  const pts = v.points.map(function (p) {
    if (!Array.isArray(p) || p.length !== 2) throw new FieldError('Invalid shape.');
    const x = Number(p[0]), y = Number(p[1]);
    if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 1000 || Math.abs(y) > 1000) throw new FieldError('Invalid shape.');
    return [round_(x, 4), round_(y, 4)];
  });
  if (shapeArea_(pts) < 0.01) throw new FieldError('That shape has no area.');
  if (selfIntersects_(pts)) throw new FieldError('The outline crosses itself. Re-trace the corners in order around the edge.');
  let edges = [];
  if (Array.isArray(v.edges) && v.edges.length === pts.length) {
    edges = v.edges.map(function (e) { const n = Number(e); if (!isFinite(n) || n < 0 || n > 1000) throw new FieldError('Invalid dimension.'); return round_(n, 4); });
  }
  return { kind: kind, points: pts, edges: edges };
}

function shapeArea_(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

function selfIntersects_(pts) {
  const n = pts.length;
  const cross = function (a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); };
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;   // neighbours share a corner
      const c = pts[j], d = pts[(j + 1) % n];
      const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
      if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) return true;
    }
  }
  return false;
}

/** Fills length/width (bounding box) and area from the shape, so lists and sorting still work. */
function deriveShapeFields_(out) {
  const pts = out.shape && out.shape.points;
  if (!pts) { out.area = null; return; }
  const xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
  const w = Math.max.apply(null, xs) - Math.min.apply(null, xs), h = Math.max.apply(null, ys) - Math.min.apply(null, ys);
  const L = Math.max(w, h), W = Math.min(w, h);
  out.length = fmtFraction_(L); out.lengthValue = round_(L, 4);
  out.width = fmtFraction_(W); out.widthValue = round_(W, 4);
  out.area = round_(shapeArea_(pts), 3);
}

/** 12.5 → "12 1/2", 0.0625 → "1/16" (nearest 1/16). */
function fmtFraction_(x) {
  const sixteenths = Math.round(x * 16);
  const whole = Math.floor(sixteenths / 16);
  let num = sixteenths % 16, den = 16;
  while (num && num % 2 === 0) { num /= 2; den /= 2; }
  return num ? (whole ? whole + ' ' : '') + num + '/' + den : String(whole);
}

/** Where a planned part sits on its stock piece: { x, y, w, h, angle } (inches / degrees). */
function checkPlacement_(v) {
  if (v === null || v === undefined || v === '' || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new FieldError('Invalid placement.');
  const out = {};
  ['x', 'y', 'w', 'h', 'angle'].forEach(function (k) {
    const n = Number(v[k]);
    if (!isFinite(n) || Math.abs(n) > 1000) throw new FieldError('Invalid placement.');
    out[k] = round_(n, 4);
  });
  return out;
}

function checkSections_(v) {
  if (!Array.isArray(v) || !v.length) throw new FieldError('Choose at least one section.');
  const out = [];
  v.forEach(function (s) {
    if (AUDIT_SECTIONS.indexOf(s) < 0) throw new FieldError('Invalid section.');
    if (out.indexOf(s) < 0) out.push(s);
  });
  return out;
}

/** Checks a delta for apiAdjustQuantity. */
function checkDelta_(def, delta) {
  const col = def.columns.filter(function (c) { return c.name === def.qtyField; })[0];
  if (typeof delta !== 'number' || !isFinite(delta) || delta === 0) {
    throw new AppError('BAD_REQUEST', 'Invalid quantity change.');
  }
  if (col.type === 'int' && !Number.isInteger(delta)) {
    throw new AppError('BAD_REQUEST', 'Quantity changes must be whole numbers.');
  }
  if (Math.abs(delta) > APP.MAX_QUANTITY) throw new AppError('BAD_REQUEST', 'That change is too large.');
  return col;
}
