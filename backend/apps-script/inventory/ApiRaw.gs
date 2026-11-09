/**
 * ApiRaw.gs — Golden Griffins Inventory
 * ---------------------------------------------------------------------------
 * Production jobs and cutting parts out of raw stock.
 *
 *   The cut planner (in the browser) decides which stock piece each part
 *   comes from and where on it. apiProductionCreate saves those as jobs.
 *
 *   apiRawCut ("Mark as cut") removes the job's stock rectangle from the
 *   piece. The browser works out the leftover shape(s); this function
 *   checks and saves them in one locked step:
 *     - piece with quantity 1: its shape becomes the biggest leftover; other
 *       leftovers become new pieces; nothing left → the piece is archived.
 *     - piece with quantity > 1 (identical full sheets): one copy is used —
 *       quantity goes down by 1 and the leftovers become new pieces.
 *   Other planned jobs on the same piece move to whichever leftover they are
 *   on (or go back to "needs a stock piece" if their spot was cut away).
 */

function checkJobIds_(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 500) throw new AppError('BAD_REQUEST', 'Invalid selection.');
  ids.forEach(assertId_);
}

/** Saves planned parts. jobs: [{ partName, materialTypeId, thickness, partLength, partWidth, method, stockLength, stockWidth, rawMaterialId, copyIndex, placement }] */
function apiProductionCreate(jobs) {
  return api_(function () {
    if (!Array.isArray(jobs) || !jobs.length || jobs.length > 300) throw new AppError('BAD_REQUEST', 'Invalid list of parts.');
    return withLock_(function () {
      const ctx = newCtx_();
      const raw = ctx.table('rawMaterials');
      const now = nowIso_();
      const recs = jobs.map(function (j) {
        const input = Object.assign({ status: 'planned' }, j);
        const clean = validateInput_('production', input, 'create', null, ctx);
        if (clean.rawMaterialId) {
          const piece = raw.byId[clean.rawMaterialId];
          if (!piece || piece.archivedAt) throw new AppError('CONFLICT', 'A stock piece in this plan no longer exists. Run the planner again.');
          if ((clean.copyIndex || 0) >= (piece.quantity || 1)) throw new AppError('CONFLICT', 'The stock changed since this plan was made. Run the planner again.');
        }
        return Object.assign(blankRecord_(TABLES.production), clean, { id: newId_(TABLES.production.prefix), createdAt: now, updatedAt: now });
      });
      insertMany_('production', recs);
      return { records: recs.map(publicRec_), versions: bumpVersions_(['production']) };
    });
  });
}

/** Edits a job (status, notes, name…). Clearing rawMaterialId un-assigns it. */
function apiProductionUpdate(id, changes) {
  return api_(function () {
    assertId_(id);
    return withLock_(function () {
      const found = findRow_('production', id);
      if (!found) throw new AppError('NOT_FOUND', 'This job no longer exists.');
      const clean = validateInput_('production', changes, 'update', found.rec, newCtx_());
      const next = Object.assign({}, found.rec, clean, { updatedAt: nowIso_() });
      if ('rawMaterialId' in clean && !clean.rawMaterialId) { next.placement = {}; next.copyIndex = null; }
      writeFound_(found, next);
      return { record: publicRec_(next), versions: bumpVersions_(['production']) };
    });
  });
}

function apiProductionDelete(ids) {
  return api_(function () {
    checkJobIds_(ids);
    return withLock_(function () {
      const t = readAll_('production');
      const rows = ids.map(function (id) { return t.byId[id]; }).filter(Boolean);
      deleteRows_(t.sh, rows.map(function (r) { return r.__i + 2; }));
      return { removedIds: rows.map(function (r) { return r.id; }), versions: bumpVersions_(['production']) };
    });
  });
}

/**
 * "Mark as cut".
 *   pieceId, pieceVersion — the stock piece (version must match what the browser saw)
 *   copyIndex             — which identical copy (0 for pieces with quantity 1)
 *   cutJobIds             — planned jobs on that copy being cut now
 *   leftovers             — [{ points }] what remains (browser-computed), largest first
 *   reassign              — { jobId: leftoverIndex | -1 } for the OTHER planned jobs on that copy
 */
function apiRawCut(pieceId, pieceVersion, copyIndex, cutJobIds, leftovers, reassign) {
  return api_(function () {
    assertId_(pieceId);
    checkJobIds_(cutJobIds);
    if (!Array.isArray(leftovers) || leftovers.length > 20) throw new AppError('BAD_REQUEST', 'Invalid leftovers.');
    const shapes = leftovers.map(function (l) {
      try { return checkShape_({ kind: 'traced', points: l && l.points, edges: [] }); } catch (e) {
        if (e instanceof FieldError) throw new AppError('VALIDATION', 'A leftover shape was invalid: ' + e.message);
        throw e;
      }
    });
    const map = reassign && typeof reassign === 'object' ? reassign : {};
    return withLock_(function () {
      const found = findRow_('rawMaterials', pieceId);
      if (!found || found.rec.archivedAt) throw new AppError('NOT_FOUND', 'This stock piece no longer exists.');
      const piece = found.rec;
      if (pieceVersion !== null && pieceVersion !== piece.version) {
        throw new AppError('CONFLICT', 'This stock piece was changed by someone else. Refresh and try again.', { current: publicRec_(piece) });
      }
      const qty = Number(piece.quantity) || 1;
      const ci = Number(copyIndex) || 0;
      if (!Number.isInteger(ci) || ci < 0 || ci >= qty) throw new AppError('BAD_REQUEST', 'Invalid stock copy.');

      const jobs = readAll_('production');
      const cutting = cutJobIds.map(function (id) {
        const j = jobs.byId[id];
        if (!j || j.rawMaterialId !== pieceId || (j.copyIndex || 0) !== ci || j.status !== 'planned') {
          throw new AppError('CONFLICT', 'That job isn’t planned on this piece any more. Refresh and try again.');
        }
        return j;
      });
      const cutSet = new Set(cutJobIds);
      const now = nowIso_();

      // Leftovers → this piece and/or new pieces.
      const leftoverIds = [];
      const newRows = [];
      const makeRow = function (shape) {
        const r = Object.assign(blankRecord_(TABLES.rawMaterials), {
          id: newId_(TABLES.rawMaterials.prefix), materialTypeId: piece.materialTypeId, thickness: piece.thickness,
          thicknessValue: piece.thicknessValue, thicknessUnitId: piece.thicknessUnitId, dimUnitId: piece.dimUnitId,
          quantity: 1, locationId: piece.locationId, shape: shape,
          description: 'Leftover from cutting ' + cutting.map(function (j) { return j.partName; }).join(', ') + ' (' + now.slice(0, 10) + ')',
          version: 1, createdAt: now, updatedAt: now, archivedAt: '', needsCheck: false
        });
        deriveShapeFields_(r);
        newRows.push(r);
        return r.id;
      };
      if (qty > 1) {
        piece.quantity = qty - 1;
        shapes.forEach(function (s) { leftoverIds.push(makeRow(s)); });
      } else if (shapes.length) {
        piece.shape = shapes[0];
        deriveShapeFields_(piece);
        leftoverIds.push(pieceId);
        shapes.slice(1).forEach(function (s) { leftoverIds.push(makeRow(s)); });
      } else {
        piece.archivedAt = now;   // used up (restorable from Settings → Archive)
      }
      piece.version = (piece.version || 0) + 1;
      piece.updatedAt = now;
      writeFound_(found, piece);
      insertMany_('rawMaterials', newRows);

      // Jobs: mark the cut ones; move the others to their leftover.
      const changed = [];
      jobs.rows.forEach(function (j) {
        if (j.rawMaterialId !== pieceId) return;
        if (cutSet.has(j.id)) { j.status = 'cut'; j.updatedAt = now; changed.push(j); return; }
        if (j.status !== 'planned') return;
        const jc = j.copyIndex || 0;
        if (qty > 1 && jc > ci) { j.copyIndex = jc - 1; changed.push(j); return; }
        if (qty > 1 && jc < ci) return;
        const idx = Object.prototype.hasOwnProperty.call(map, j.id) ? Number(map[j.id]) : -1;
        if (idx >= 0 && idx < leftoverIds.length) { j.rawMaterialId = leftoverIds[idx]; j.copyIndex = 0; }
        else { j.rawMaterialId = ''; j.copyIndex = null; j.placement = {}; }
        j.updatedAt = now;
        changed.push(j);
      });
      rewriteRows_(jobs, changed);

      return {
        piece: publicRec_(piece), newPieces: newRows.map(publicRec_), jobs: changed.map(publicRec_),
        versions: bumpVersions_(['rawMaterials', 'production'])
      };
    });
  });
}
