/**
 * ApiPacking.gs — Golden Griffins Inventory
 * ---------------------------------------------------------------------------
 * The competition packing list.
 *
 *   Sections:  always   — packed for every event
 *              season   — this season only (polybelts, Liquid Wrench, …)
 *              loadout  — big things loaded into the trailer at departure
 *   Entries form a tree (Super pit → Tools → Hex keys → 1/8"). Only entries
 *   with no children ("leaves") are checked off; a group counts as done when
 *   everything inside it is.
 *
 *   Packing mode:  anyone can tick "packed".
 *   Final check:   ONE person claims it by typing their name and gets a
 *                  private token. Only that browser can tick "verified".
 *                  If they leave the page (no "still here" signal for 90 s,
 *                  or they navigate away) it pauses; progress is kept and
 *                  they or anyone else can resume it.
 *   "Start new packing round" clears both kinds of checkmarks.
 *
 * The round info (event name, season label, final-check status) is a small
 * JSON object kept in Script Properties ("packingMeta").
 */

const FINAL_CHECK_STALE_MS = 90 * 1000;
const PACKING_META_PROP = 'packingMeta';

// ─────────────────────────── round info ───────────────────────────

function readPackingMeta_() {
  let m = {};
  try { m = JSON.parse(PropertiesService.getScriptProperties().getProperty(PACKING_META_PROP) || '{}'); } catch (e) { m = {}; }
  return {
    event: m.event || '',
    season: m.season || '',
    roundStartedAt: m.roundStartedAt || '',
    finalCheck: m.finalCheck || { state: 'none' }
  };
}

/** Call only inside withLock_. */
function writePackingMeta_(m) {
  PropertiesService.getScriptProperties().setProperty(PACKING_META_PROP, JSON.stringify(m));
}

/** What the browser sees: no token, and a check nobody has pinged for 90 s shows as paused. */
function publicPackingMeta_() {
  const m = readPackingMeta_();
  const fc = Object.assign({}, m.finalCheck);
  delete fc.token;
  if (fc.state === 'active' && Date.now() - Date.parse(fc.lastSeen || 0) > FINAL_CHECK_STALE_MS) {
    fc.state = 'paused';
    fc.pausedReason = 'left';
  }
  m.finalCheck = fc;
  return m;
}

function cleanLabel_(v, max, field) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') throw new AppError('BAD_REQUEST', 'Invalid text.');
  const s = cleanText_(v).replace(/\s+/g, ' ').trim();
  if (s.length > max) {
    const f = {}; f[field || 'value'] = 'Must be ' + max + ' characters or fewer.';
    throw new AppError('VALIDATION', 'Must be ' + max + ' characters or fewer.', { fields: f });
  }
  return s;
}

/** Edits the event name ("Beach Blitz 2026") and/or the season label ("2027 season"). */
function apiPackingSetInfo(info) {
  return api_(function () {
    if (!info || typeof info !== 'object') throw new AppError('BAD_REQUEST', 'Invalid data.');
    return withLock_(function () {
      const m = readPackingMeta_();
      if ('event' in info) m.event = cleanLabel_(info.event, 80, 'event');
      if ('season' in info) m.season = cleanLabel_(info.season, 40, 'season');
      writePackingMeta_(m);
      return { packingMeta: publicPackingMeta_(), versions: bumpVersions_(['packingMeta']) };
    });
  });
}

/** "Start new packing round": clears every packed/verified mark and the final check. */
function apiPackingReset(eventName) {
  return api_(function () {
    const ev = cleanLabel_(eventName, 80, 'event');
    return withLock_(function () {
      const t = readAll_('packingItems');
      const changed = t.rows.filter(function (r) { return r.packed || r.verified; });
      changed.forEach(function (r) { r.packed = false; r.verified = false; });
      rewriteRows_(t, changed);
      const m = readPackingMeta_();
      if (ev) m.event = ev;
      m.roundStartedAt = nowIso_();
      m.finalCheck = { state: 'none' };
      writePackingMeta_(m);
      return { cleared: changed.length, packingMeta: publicPackingMeta_(), versions: bumpVersions_(['packingItems', 'packingMeta']) };
    });
  });
}

// ─────────────────────────── editing the list ───────────────────────────

/** Depth of an entry (top level = 1). */
function packingDepth_(t, rec) {
  let d = 1, p = rec.parentId, guard = 0;
  while (p && t.byId[p] && guard++ < 20) { d++; p = t.byId[p].parentId; }
  return d;
}

/** How many levels an entry's subtree has (a leaf = 1). */
function packingHeight_(t, id) {
  const kids = t.rows.filter(function (r) { return r.parentId === id; });
  return 1 + kids.reduce(function (m, k) { return Math.max(m, packingHeight_(t, k.id)); }, 0);
}

function packingDescendants_(t, id) {
  const out = [];
  const walk = function (pid) {
    t.rows.forEach(function (r) { if (r.parentId === pid) { out.push(r); walk(r.id); } });
  };
  walk(id);
  return out;
}

function checkPackingLink_(rec) {
  if (!rec.linkTable) { rec.linkId = ''; return; }
  if (!isId_(rec.linkId) || !readAll_(rec.linkTable).byId[rec.linkId]) {
    throw new AppError('VALIDATION', 'That inventory item no longer exists.', { fields: { linkId: 'Pick an item from the list.' } });
  }
}

/** Adds an entry. input: { name, section, parentId?, note?, linkTable?, linkId? } */
function apiPackingCreate(input) {
  return api_(function () {
    return withLock_(function () {
      const ctx = newCtx_();
      const t = ctx.table('packingItems');
      if (input && input.parentId && t.byId[input.parentId]) input = Object.assign({}, input, { section: t.byId[input.parentId].section });
      const clean = validateInput_('packingItems', input, 'create', null, ctx);
      const rec = Object.assign(blankRecord_(TABLES.packingItems), clean, {
        id: newId_(TABLES.packingItems.prefix), packed: false, verified: false, updatedAt: nowIso_()
      });
      checkPackingLink_(rec);
      if (rec.parentId && packingDepth_(t, rec) > PACKING_MAX_DEPTH) {
        throw new AppError('VALIDATION', 'The list can only go ' + PACKING_MAX_DEPTH + ' levels deep.', { fields: { parentId: 'Too deep.' } });
      }
      const siblings = t.rows.filter(function (r) { return r.parentId === rec.parentId && r.section === rec.section; });
      rec.sortOrder = siblings.reduce(function (m, r) { return Math.max(m, r.sortOrder || 0); }, 0) + 1;
      insert_('packingItems', rec);
      return { record: publicRec_(rec), versions: bumpVersions_(['packingItems']) };
    });
  });
}

/** Edits an entry: name, note, link, or where it lives (parentId / section). */
function apiPackingUpdate(id, changes) {
  return api_(function () {
    assertId_(id);
    return withLock_(function () {
      const ctx = newCtx_();
      const t = ctx.table('packingItems');
      const rec = t.byId[id];
      if (!rec) throw new AppError('NOT_FOUND', 'This entry no longer exists.');
      const clean = validateInput_('packingItems', changes, 'update', rec, ctx);
      const next = Object.assign({}, rec, clean);
      const moved = 'parentId' in clean && clean.parentId !== rec.parentId;
      if (next.parentId) {
        if (next.parentId === id || packingDescendants_(t, id).some(function (d) { return d.id === next.parentId; })) {
          throw new AppError('VALIDATION', 'An entry can’t be put inside itself.', { fields: { parentId: 'Invalid' } });
        }
        next.section = t.byId[next.parentId].section;
        if (packingDepth_(t, next) + packingHeight_(t, id) - 1 > PACKING_MAX_DEPTH) {
          throw new AppError('VALIDATION', 'That would make the list more than ' + PACKING_MAX_DEPTH + ' levels deep.', { fields: { parentId: 'Too deep.' } });
        }
      }
      if ('linkTable' in clean || 'linkId' in clean) checkPackingLink_(next);
      if (moved) {
        const sib = t.rows.filter(function (r) { return r.parentId === next.parentId && r.section === next.section && r.id !== id; });
        next.sortOrder = sib.reduce(function (m, r) { return Math.max(m, r.sortOrder || 0); }, 0) + 1;
      }
      next.updatedAt = nowIso_();
      const changed = [next];
      if (next.section !== rec.section) {
        packingDescendants_(t, id).forEach(function (d) { d.section = next.section; changed.push(d); });
      }
      t.byId[id] = next; next.__i = rec.__i;
      rewriteRows_(t, changed);
      return { record: publicRec_(next), versions: bumpVersions_(['packingItems']) };
    });
  });
}

/** Deletes an entry and everything inside it. */
function apiPackingDelete(id) {
  return api_(function () {
    assertId_(id);
    return withLock_(function () {
      const t = readAll_('packingItems');
      const rec = t.byId[id];
      if (!rec) throw new AppError('NOT_FOUND', 'This entry no longer exists.');
      const all = [rec].concat(packingDescendants_(t, id));
      all.forEach(function (r) { trashImage_(r.imageId); });
      deleteRows_(t.sh, all.map(function (r) { return r.__i + 2; }));
      return { removedIds: all.map(function (r) { return r.id; }), versions: bumpVersions_(['packingItems']) };
    });
  });
}

/** Deletes every season-specific entry (when a new season starts). */
function apiPackingClearSeason() {
  return api_(function () {
    return withLock_(function () {
      const t = readAll_('packingItems');
      const rows = t.rows.filter(function (r) { return r.section === 'season'; });
      rows.forEach(function (r) { trashImage_(r.imageId); });
      deleteRows_(t.sh, rows.map(function (r) { return r.__i + 2; }));
      return { removed: rows.length, versions: bumpVersions_(['packingItems']) };
    });
  });
}

// ─────────────────────────── packing checkmarks ───────────────────────────

function checkIdList_(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 3000) throw new AppError('BAD_REQUEST', 'Invalid selection.');
  ids.forEach(assertId_);
}

/** Ticks or unticks "packed" on entries (the browser sends a group's leaves together). */
function apiPackingSetPacked(ids, value) {
  return api_(function () {
    checkIdList_(ids);
    if (value !== true && value !== false) throw new AppError('BAD_REQUEST', 'Invalid value.');
    return withLock_(function () {
      const t = readAll_('packingItems');
      const changed = [];
      ids.forEach(function (id) {
        const r = t.byId[id];
        if (r && r.packed !== value) { r.packed = value; r.updatedAt = nowIso_(); changed.push(r); }
      });
      rewriteRows_(t, changed);
      return { records: changed.map(publicRec_), versions: bumpVersions_(['packingItems']) };
    });
  });
}

// ─────────────────────────── notes for next time ───────────────────────────

function apiPackingNoteAdd(text) {
  return api_(function () {
    return withLock_(function () {
      const clean = validateInput_('packingNotes', { text: text }, 'create', null, newCtx_());
      const rec = Object.assign(blankRecord_(TABLES.packingNotes), clean, { id: newId_(TABLES.packingNotes.prefix), done: false, createdAt: nowIso_() });
      insert_('packingNotes', rec);
      return { record: publicRec_(rec), versions: bumpVersions_(['packingNotes']) };
    });
  });
}

function apiPackingNoteSet(id, done) {
  return api_(function () {
    assertId_(id);
    if (done !== true && done !== false) throw new AppError('BAD_REQUEST', 'Invalid value.');
    return withLock_(function () {
      const f = findRow_('packingNotes', id);
      if (!f) throw new AppError('NOT_FOUND', 'This note no longer exists.');
      f.rec.done = done;
      writeFound_(f, f.rec);
      return { record: publicRec_(f.rec), versions: bumpVersions_(['packingNotes']) };
    });
  });
}

function apiPackingNoteDelete(id) {
  return api_(function () {
    assertId_(id);
    return withLock_(function () {
      const f = findRow_('packingNotes', id);
      if (!f) throw new AppError('NOT_FOUND', 'This note no longer exists.');
      f.sh.deleteRow(f.rowNum);
      return { id: id, versions: bumpVersions_(['packingNotes']) };
    });
  });
}

// ─────────────────────────── final check ───────────────────────────

/** True when the stored check is owned by someone who is still on the page. */
function finalCheckLive_(fc) {
  return fc.state === 'active' && Date.now() - Date.parse(fc.lastSeen || 0) <= FINAL_CHECK_STALE_MS;
}

function requireFinalCheckToken_(m, token) {
  const fc = m.finalCheck;
  if (typeof token !== 'string' || !fc.token || fc.token !== token) {
    throw new AppError('FINAL_CHECK_LOST', fc.state === 'active' && fc.by
      ? fc.by + ' has taken over the final check.' : 'Your final check was paused. Resume it to keep going.');
  }
  if (fc.state === 'complete') throw new AppError('FINAL_CHECK_LOST', 'The final check is already complete.');
}

/**
 * Starts or resumes the final check under a name. Returns a private token.
 * restart: true clears all "verified" marks first (used after a completed check).
 */
function apiFinalCheckClaim(name, restart) {
  return api_(function () {
    const who = cleanLabel_(name, 40, 'name');
    if (!who) throw new AppError('VALIDATION', 'Type your name so others know who is checking.', { fields: { name: 'Required.' } });
    return withLock_(function () {
      const m = readPackingMeta_();
      const fc = m.finalCheck;
      if (finalCheckLive_(fc) && restart !== true) {
        throw new AppError('FINAL_CHECK_TAKEN', fc.by + ' is doing the final check right now.', { by: fc.by });
      }
      if (fc.state === 'complete' && restart !== true) {
        throw new AppError('FINAL_CHECK_DONE', 'The final check is already complete.');
      }
      const keys = ['packingMeta'];
      if (restart === true) {
        if (finalCheckLive_(fc)) throw new AppError('FINAL_CHECK_TAKEN', fc.by + ' is doing the final check right now.', { by: fc.by });
        const t = readAll_('packingItems');
        const changed = t.rows.filter(function (r) { return r.verified; });
        changed.forEach(function (r) { r.verified = false; });
        rewriteRows_(t, changed);
        keys.push('packingItems');
      }
      const token = Utilities.getUuid();
      const now = nowIso_();
      m.finalCheck = {
        state: 'active', by: who, token: token,
        startedAt: fc.state === 'none' || fc.state === 'complete' || restart === true ? now : (fc.startedAt || now),
        lastSeen: now, resumedFrom: fc.state === 'paused' || fc.state === 'active' ? (fc.by || '') : ''
      };
      writePackingMeta_(m);
      return { token: token, packingMeta: publicPackingMeta_(), versions: bumpVersions_(keys) };
    });
  });
}

/** "Still here" signal, sent every ~30 s while the checker has the page open. */
function apiFinalCheckPing(token) {
  return api_(function () {
    return withLock_(function () {
      const m = readPackingMeta_();
      requireFinalCheckToken_(m, token);
      m.finalCheck.state = 'active';
      m.finalCheck.lastSeen = nowIso_();
      writePackingMeta_(m);
      return { packingMeta: publicPackingMeta_(), versions: bumpVersions_(['packingMeta']) };
    });
  });
}

/** The checker left the page: keep progress, release the claim. */
function apiFinalCheckPause(token) {
  return api_(function () {
    return withLock_(function () {
      const m = readPackingMeta_();
      if (m.finalCheck.token !== token || m.finalCheck.state !== 'active') return { packingMeta: publicPackingMeta_(), versions: getVersions_() };
      m.finalCheck.state = 'paused';
      m.finalCheck.pausedReason = 'left';
      delete m.finalCheck.token;
      writePackingMeta_(m);
      return { packingMeta: publicPackingMeta_(), versions: bumpVersions_(['packingMeta']) };
    });
  });
}

/** Ticks or unticks "verified" (final-check holder only). */
function apiFinalCheckVerify(token, ids, value) {
  return api_(function () {
    checkIdList_(ids);
    if (value !== true && value !== false) throw new AppError('BAD_REQUEST', 'Invalid value.');
    return withLock_(function () {
      const m = readPackingMeta_();
      requireFinalCheckToken_(m, token);
      const t = readAll_('packingItems');
      const changed = [];
      ids.forEach(function (id) {
        const r = t.byId[id];
        if (r && r.verified !== value) { r.verified = value; r.updatedAt = nowIso_(); changed.push(r); }
      });
      rewriteRows_(t, changed);
      m.finalCheck.state = 'active';
      m.finalCheck.lastSeen = nowIso_();
      writePackingMeta_(m);
      return { records: changed.map(publicRec_), packingMeta: publicPackingMeta_(), versions: bumpVersions_(['packingItems', 'packingMeta']) };
    });
  });
}

/** Marks the final check complete (records how many entries were verified). */
function apiFinalCheckComplete(token) {
  return api_(function () {
    return withLock_(function () {
      const m = readPackingMeta_();
      requireFinalCheckToken_(m, token);
      const t = readAll_('packingItems');
      const parents = new Set(t.rows.map(function (r) { return r.parentId; }).filter(Boolean));
      const leaves = t.rows.filter(function (r) { return !parents.has(r.id); });
      const verified = leaves.filter(function (r) { return r.verified; }).length;
      m.finalCheck = { state: 'complete', by: m.finalCheck.by, startedAt: m.finalCheck.startedAt, completedAt: nowIso_(),
        verified: verified, total: leaves.length };
      writePackingMeta_(m);
      return { packingMeta: publicPackingMeta_(), versions: bumpVersions_(['packingMeta']) };
    });
  });
}
