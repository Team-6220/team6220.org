/**
 * ApiAudit.gs — Golden Griffins Inventory
 * ---------------------------------------------------------------------------
 * Inventory audits (preseason / postseason counts).
 *
 * How it works:
 *   1. apiStartAudit creates a session and one AuditItems row per item in the
 *      chosen sections, remembering each item's quantity at that moment
 *      (its "baseline").
 *   2. Members mark items Confirmed / Different (with the count) / Missing.
 *      Each mark writes only that item's AuditItems row, so many people can
 *      count different items at the same time.
 *   3. apiFinalizeAudit applies the results:
 *        Confirmed   → no change
 *        Different   → quantity set to the counted amount
 *        Missing     → quantity left alone, item flagged "Needs check"
 *        Not checked → no change
 *      SAFETY: if an item's live quantity changed after the audit started
 *      (someone used parts mid-audit), its counted value is NOT applied
 *      automatically. Finalize returns those items as conflicts and the
 *      person finalizing chooses, per item, "use counted" or "keep current".
 *   Only one audit can be in progress at a time.
 */

const AUDIT_STATUSES = ['unchecked', 'confirmed', 'different', 'missing'];

/** Starts an audit. sections: e.g. ['parts', 'tools']. */
function apiStartAudit(name, sections) {
  return api_(function () {
    const n = typeof name === 'string' ? cleanText_(name).replace(/\s+/g, ' ').trim() : '';
    if (!n || n.length > 80) {
      throw new AppError('VALIDATION', 'Give the audit a name (80 characters or fewer).', { fields: { name: 'Required.' } });
    }
    let secs;
    try { secs = checkSections_(sections); } catch (e) {
      if (e instanceof FieldError) throw new AppError('VALIDATION', e.message, { fields: { sections: e.message } });
      throw e;
    }
    return withLock_(function () {
      const sessions = readAll_('auditSessions');
      if (sessions.rows.some(function (r) { return r.status === 'active'; })) {
        throw new AppError('AUDIT_ACTIVE', 'An audit is already in progress. Finish or cancel it first.');
      }
      const lists = readAll_('lists');
      const session = Object.assign(blankRecord_(TABLES.auditSessions), {
        id: newId_(TABLES.auditSessions.prefix), name: n, status: 'active', sections: secs,
        createdAt: nowIso_(), finalizedAt: '', summary: {}
      });
      const items = [];
      secs.forEach(function (key) {
        const q = TABLES[key].qtyField;
        readAll_(key).rows.forEach(function (r) {
          if (r.archivedAt) return;
          items.push(Object.assign(blankRecord_(TABLES.auditItems), {
            id: newId_(TABLES.auditItems.prefix), auditId: session.id, itemTable: key, itemId: r.id,
            nameSnapshot: auditItemName_(key, r, lists).slice(0, 200),
            baselineQty: Number(r[q]) || 0, countedQty: null, status: 'unchecked', updatedAt: ''
          }));
        });
      });
      if (items.length > APP.MAX_ROWS_PER_TABLE) throw new AppError('LIMIT', 'Too many items to audit at once. Audit fewer sections.');
      insert_('auditSessions', session);
      insertMany_('auditItems', items);
      return { session: publicRec_(session), count: items.length, versions: bumpVersions_(['auditSessions', 'auditItems']) };
    });
  });
}

/** A readable name stored with each audit row (used if the item is later deleted). */
function auditItemName_(key, r, lists) {
  const v = function (id) { const x = lists.byId[id]; return x ? x.value : ''; };
  switch (key) {
    case 'rawMaterials':
      return [v(r.materialTypeId), r.thickness ? r.thickness + ' ' + v(r.thicknessUnitId) : '',
        [r.length, r.width].filter(Boolean).join(' × ')].filter(Boolean).join(' · ');
    case 'wire': return [v(r.gaugeId), r.typeColor].filter(Boolean).join(' · ');
    default: return r.name || r.id;
  }
}

/**
 * Records one count.
 *   status: 'confirmed' | 'different' | 'missing' | 'unchecked' (undo)
 *   countedQty: required for 'different'. If it equals the expected amount it
 *   is saved as 'confirmed'.
 */
function apiSetAuditCount(auditItemId, status, countedQty) {
  return api_(function () {
    assertId_(auditItemId);
    if (AUDIT_STATUSES.indexOf(status) < 0) throw new AppError('BAD_REQUEST', 'Invalid status.');
    return withLock_(function () {
      const found = findRow_('auditItems', auditItemId);
      if (!found) throw new AppError('AUDIT_CLOSED', 'This audit has already been finalized or cancelled.');
      const rec = found.rec;
      const session = findRow_('auditSessions', rec.auditId);
      if (!session || session.rec.status !== 'active') throw new AppError('AUDIT_CLOSED', 'This audit has already been finalized or cancelled.');
      let st = status, qty = null;
      if (st === 'different') {
        const def = TABLES[rec.itemTable];
        const col = def.columns.filter(function (c) { return c.name === def.qtyField; })[0];
        const n = typeof countedQty === 'string' ? Number(countedQty.trim()) : countedQty;
        if (typeof n !== 'number' || !isFinite(n) || n < 0 || n > APP.MAX_QUANTITY || (col.type === 'int' && !Number.isInteger(n))) {
          throw new AppError('VALIDATION', col.type === 'int' ? 'Enter a whole number, 0 or more.' : 'Enter a number, 0 or more.', { fields: { countedQty: 'Invalid' } });
        }
        qty = col.type === 'number' ? round_(n, 3) : n;
        if (qty === rec.baselineQty) { st = 'confirmed'; qty = null; }
      }
      rec.status = st;
      rec.countedQty = qty;
      rec.updatedAt = st === 'unchecked' ? '' : nowIso_();
      writeFound_(found, rec);
      return { record: publicRec_(rec), versions: bumpVersions_(['auditItems']) };
    });
  });
}

/**
 * Applies the audit to the inventory.
 *   resolutions: { auditItemId: 'counted' | 'current' } for items reported as
 *   conflicts by a previous call. If any conflict is unresolved, nothing is
 *   written and the error AUDIT_CONFLICTS lists them in details.conflicts.
 */
function apiFinalizeAudit(auditId, resolutions) {
  return api_(function () {
    assertId_(auditId);
    const res = resolutions && typeof resolutions === 'object' ? resolutions : {};
    return withLock_(function () {
      const sf = findRow_('auditSessions', auditId);
      if (!sf || sf.rec.status !== 'active') throw new AppError('AUDIT_CLOSED', 'This audit has already been finalized or cancelled.');
      const at = readAll_('auditItems');
      const items = at.rows.filter(function (r) { return r.auditId === auditId; });
      const tables = {};
      const table = function (k) { return tables[k] || (tables[k] = readAll_(k)); };
      const summary = { total: items.length, confirmed: 0, updated: 0, missing: 0, unchecked: 0, keptCurrent: 0, skipped: 0 };
      const conflicts = [];
      const plan = [];

      items.forEach(function (ai) {
        if (ai.status === 'unchecked') { summary.unchecked++; return; }
        if (ai.status === 'confirmed') { summary.confirmed++; return; }
        const t = table(ai.itemTable);
        const rec = t.byId[ai.itemId];
        if (!rec || rec.archivedAt) { summary.skipped++; return; }
        const q = TABLES[ai.itemTable].qtyField;
        const live = Number(rec[q]) || 0;
        if (ai.status === 'missing') { plan.push({ t: t, rec: rec, missing: true }); summary.missing++; return; }
        // 'different'
        if (live === ai.baselineQty || res[ai.id] === 'counted') {
          plan.push({ t: t, rec: rec, field: q, value: ai.countedQty }); summary.updated++;
        } else if (res[ai.id] === 'current') {
          summary.keptCurrent++;
        } else {
          conflicts.push({ auditItemId: ai.id, itemTable: ai.itemTable, itemId: ai.itemId, name: ai.nameSnapshot,
            baseline: ai.baselineQty, counted: ai.countedQty, current: live });
        }
      });

      if (conflicts.length) {
        throw new AppError('AUDIT_CONFLICTS', conflicts.length + ' item(s) changed while the audit was running.', { conflicts: conflicts });
      }

      const now = nowIso_();
      const byTable = {};
      plan.forEach(function (p) {
        if (p.missing) p.rec.needsCheck = true; else p.rec[p.field] = p.value;
        p.rec.version = (p.rec.version || 0) + 1;
        p.rec.updatedAt = now;
        (byTable[p.t.key] = byTable[p.t.key] || { t: p.t, recs: [] }).recs.push(p.rec);
      });
      Object.keys(byTable).forEach(function (k) { rewriteRows_(byTable[k].t, byTable[k].recs); });

      deleteRows_(at.sh, items.map(function (r) { return r.__i + 2; }));
      sf.rec.status = 'finalized';
      sf.rec.finalizedAt = now;
      sf.rec.summary = summary;
      writeFound_(sf, sf.rec);
      return { session: publicRec_(sf.rec), summary: summary,
        versions: bumpVersions_(Object.keys(byTable).concat(['auditItems', 'auditSessions'])) };
    });
  });
}

/** Stops an audit without changing any inventory. */
function apiCancelAudit(auditId) {
  return api_(function () {
    assertId_(auditId);
    return withLock_(function () {
      const sf = findRow_('auditSessions', auditId);
      if (!sf || sf.rec.status !== 'active') throw new AppError('AUDIT_CLOSED', 'This audit has already been finalized or cancelled.');
      const at = readAll_('auditItems');
      const items = at.rows.filter(function (r) { return r.auditId === auditId; });
      const checked = items.filter(function (r) { return r.status !== 'unchecked'; }).length;
      deleteRows_(at.sh, items.map(function (r) { return r.__i + 2; }));
      sf.rec.status = 'cancelled';
      sf.rec.finalizedAt = nowIso_();
      sf.rec.summary = { total: items.length, checked: checked };
      writeFound_(sf, sf.rec);
      return { session: publicRec_(sf.rec), versions: bumpVersions_(['auditItems', 'auditSessions']) };
    });
  });
}
