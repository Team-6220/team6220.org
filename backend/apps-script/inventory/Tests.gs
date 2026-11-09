/**
 * Tests.gs — Golden Griffins Inventory
 * ---------------------------------------------------------------------------
 * ▶ runSelfTest() checks the backend against the REAL spreadsheet:
 *   creates temporary "__TEST__" records, exercises every operation, then
 *   deletes everything it created. Your real data is not touched.
 *
 * Run it after setupDatabase(), and again after any backend code change.
 * Results appear in the Execution log at the bottom of the editor.
 */

function runSelfTest() {
  requireEditor_();
  const T = '__TEST__ ';
  const results = [];
  const made = {};   // tableKey → [ids] created by this test, cleaned up at the end
  const started = Date.now();
  let last = started;
  // Only one self-test at a time: two runs would delete each other's test records.
  const props = PropertiesService.getScriptProperties();
  const running = Number(props.getProperty('selfTestStartedAt') || 0);
  if (running && Date.now() - running < 7 * 60 * 1000) {
    console.log('⚠️ Another self-test started ' + Math.round((Date.now() - running) / 1000) +
      ' s ago and may still be running. Wait for it to finish (or up to 7 minutes), then try again.');
    return false;
  }
  props.setProperty('selfTestStartedAt', String(started));

  console.log('Self-test started. Each check is logged as it runs.');
  // Remove anything left behind by an earlier run that was stopped part-way.
  cleanupTestData_({});

  function check(name, cond, extra) {
    const line = (cond ? 'PASS  ' : 'FAIL  ') + name + (cond || !extra ? '' : '  → ' + JSON.stringify(extra));
    results.push(line);
    const now = Date.now();
    console.log(line + '   (' + (now - last) + ' ms)');
    last = now;
  }
  function need(value, what) {
    if (!value) throw new Error('Stopping early: could not ' + what + ' (see the FAIL above).');
    return value;
  }
  function ok(res, name) {
    check(name, res && res.ok === true, res && res.error);
    return res && res.ok ? res.data : null;
  }
  function err(res, code, name) {
    check(name, res && res.ok === false && res.error.code === code, res);
    return res && res.error;
  }
  function track(key, data) {
    if (data && data.record) (made[key] = made[key] || []).push(data.record.id);
    return data ? data.record : null;
  }
  function listId(listKey) {
    return readAll_('lists').rows.filter(function (r) { return r.listKey === listKey; })[0].id;
  }

  try {
    // ── Load ──
    const all = ok(apiGetAll(), 'apiGetAll loads every table');
    check('seeded categories exist', all && all.tables.categories.length >= 1);

    // ── Settings ──
    const cat = need(track('categories', ok(apiCreate('categories', { name: T + 'Category' }), 'create category')), 'create a category');
    err(apiCreate('categories', { name: T + 'category' }), 'VALIDATION', 'duplicate category name (any case) is rejected');
    const tag = need(track('tags', ok(apiCreate('tags', { name: T + 'Tag', categoryId: cat.id }), 'create tag in category')), 'create a tag');
    const area = need(track('locations', ok(apiCreate('locations', { name: T + 'Area' }), 'create location area')), 'create a location');
    const box = need(track('locations', ok(apiCreate('locations', { name: 'A1', parentId: area.id }), 'create container in area')), 'create a container');
    err(apiCreate('locations', { name: 'X', parentId: box.id }), 'VALIDATION', 'third location level is rejected');
    const sup = need(track('suppliers', ok(apiCreate('suppliers', { name: T + 'Supplier' }), 'create supplier')), 'create a supplier');
    ok(apiUpdate('locations', area.id, { name: T + 'Area Renamed' }), 'rename location');

    // ── Parts ──
    const p = track('parts', ok(apiCreate('parts', {
      name: '=1+1 ' + T + 'Bearing', quantity: 10, categoryId: cat.id, tagIds: [tag.id, tag.id],
      locationId: box.id, supplierId: sup.id, aliases: 'ball bearing, 1/2 hex', lowStockThreshold: 3,
      version: 999, id: 'PT-hacked00'
    }), 'create part'));
    need(p, 'create a part');
    const stored = findRow_('parts', p.id).rec;
    check('text starting with "=" is stored as text, not a formula', stored.name === '=1+1 ' + T + 'Bearing', stored.name);
    check('duplicate tags removed', stored.tagIds.length === 1);
    check('client cannot set id or version', p.id !== 'PT-hacked00' && stored.version === 1);
    check('aliases containing 1/2 survive (not turned into a date)', stored.aliases === 'ball bearing, 1/2 hex', stored.aliases);

    err(apiCreate('parts', { name: '', quantity: 1 }), 'VALIDATION', 'missing name is rejected');
    err(apiCreate('parts', { name: T + 'x', quantity: -1 }), 'VALIDATION', 'negative quantity is rejected');
    err(apiCreate('parts', { name: T + 'x', quantity: 1.5 }), 'VALIDATION', 'fractional part quantity is rejected');
    err(apiCreate('parts', { name: T + 'x', quantity: 1, categoryId: 'CA-00000000' }), 'VALIDATION', 'unknown category is rejected');
    err(apiCreate('parts', { name: T + 'x', quantity: 1, locationId: listId('unit') }), 'VALIDATION', 'wrong-table reference is rejected');
    err(apiCreate('nope', {}), 'BAD_REQUEST', 'unknown section is rejected');

    // ── Quantity changes ──
    let d = ok(apiAdjustQuantity('parts', p.id, 5), 'adjust +5');
    check('quantity is 15', d && d.record.quantity === 15);
    d = ok(apiAdjustQuantity('parts', p.id, -2), 'adjust -2');
    check('quantity is 13', d && d.record.quantity === 13);
    d = ok(apiAdjustQuantity('parts', p.id, -1000), 'adjust far below zero');
    check('quantity stops at 0 and reports clamped', d && d.record.quantity === 0 && d.clamped === true);
    err(apiAdjustQuantity('parts', p.id, 0.5), 'BAD_REQUEST', 'fractional delta on parts is rejected');

    // ── Edit conflicts ──
    const v = findRow_('parts', p.id).rec.version;
    err(apiUpdate('parts', p.id, { quantity: 7 }, v - 1), 'CONFLICT', 'stale edit is rejected with CONFLICT');
    d = ok(apiUpdate('parts', p.id, { quantity: 7 }, v), 'edit with current version');
    check('edit saved and version increased', d && d.record.quantity === 7 && d.record.version === v + 1);
    ok(apiUpdate('parts', p.id, { quantity: 8 }, null), 'deliberate overwrite (version null) works');
    err(apiUpdate('parts', p.id, { quantity: 8 }), 'BAD_REQUEST', 'edit without version is rejected');

    // ── Raw materials (fractions) ──
    const rm = track('rawMaterials', ok(apiCreate('rawMaterials', {
      materialTypeId: listId('materialType'), thickness: '1/8', thicknessUnitId: listId('unit'),
      length: '24', width: '36 1/2', quantity: 2, description: T
    }), 'create raw material'));
    need(rm, 'create a raw material');
    const rmRec = findRow_('rawMaterials', rm.id).rec;
    check('thickness 1/8 kept as text', rmRec.thickness === '1/8', rmRec.thickness);
    check('thickness value 0.125', rmRec.thicknessValue === 0.125, rmRec.thicknessValue);
    check('width 36 1/2 → 36.5', rmRec.widthValue === 36.5, rmRec.widthValue);
    err(apiCreate('rawMaterials', { materialTypeId: listId('materialType'), thickness: 'thin', quantity: 1 }),
      'VALIDATION', 'unparseable thickness is rejected');

    // ── Tools, fasteners, wire ──
    const tl = need(track('tools', ok(apiCreate('tools', { name: T + 'Calipers', quantity: 2 }), 'create tool')), 'create a tool');
    const fs = track('fasteners', ok(apiCreate('fasteners', {
      typeId: listId('fastenerType'), threadSizeId: listId('threadSize'), pitchId: listId('threadPitch'),
      length: '1/2', lengthUnitId: listId('unit'), description: T
    }), 'create fastener'));
    need(fs, 'create a fastener');
    err(apiAdjustQuantity('fasteners', fs.id, 1), 'BAD_REQUEST', 'fasteners have no quantity');
    const wr = track('wire', ok(apiCreate('wire', { gaugeId: listId('wireGauge'), approxLength: 50, typeColor: T + 'red' }), 'create wire'));
    need(wr, 'create wire');
    d = ok(apiAdjustQuantity('wire', wr.id, -12.5), 'wire length -12.5');
    check('wire length is 37.5', d && d.record.approxLength === 37.5);

    // ── Needs-check flag ──
    d = ok(apiSetNeedsCheck('tools', tl.id, true), 'flag tool as needs check');
    check('needsCheck saved', findRow_('tools', tl.id).rec.needsCheck === true);
    ok(apiSetNeedsCheck('tools', tl.id, false), 'clear needs check');

    // ── Archive / restore / permanent delete ──
    ok(apiArchive('tools', tl.id), 'archive tool');
    err(apiUpdate('tools', tl.id, { quantity: 3 }, null), 'ARCHIVED', 'archived item cannot be edited');
    ok(apiRestore('tools', tl.id), 'restore tool');
    err(apiDeletePermanently('tools', tl.id), 'BAD_REQUEST', 'cannot permanently delete without archiving');
    ok(apiArchive('tools', tl.id), 'archive again');
    ok(apiDeletePermanently('tools', tl.id), 'permanently delete archived tool');
    check('tool row is gone', findRow_('tools', tl.id) === null);
    made.tools = [];

    // ── Collections & removing settings that are in use ──
    const col = track('collections', ok(apiCreate('collections', {
      name: T + 'Collection', section: 'parts', filter: { tagIds: [tag.id], tagMode: 'any' }
    }), 'create collection'));
    need(col, 'create a collection');
    err(apiCreate('collections', { name: T + 'Bad', section: 'parts', filter: { 'bad key!': 1 } }), 'VALIDATION', 'malformed filter is rejected');
    const inUse = err(apiRemoveSetting('tags', tag.id, false), 'IN_USE', 'removing a used tag asks first');
    check('in-use counts include the part and collection',
      inUse && inUse.details.counts.parts === 1 && inUse.details.counts.collections === 1, inUse && inUse.details);
    ok(apiRemoveSetting('tags', tag.id, true), 'remove tag with force');
    check('tag removed from part', findRow_('parts', p.id).rec.tagIds.length === 0);
    check('tag removed from collection filter', findRow_('collections', col.id).rec.filter.tagIds.length === 0);
    made.tags = [];

    err(apiRemoveSetting('locations', area.id, false), 'IN_USE', 'removing an area with containers asks first');
    ok(apiRemoveSetting('locations', area.id, true), 'remove area and its containers');
    check('part location cleared', findRow_('parts', p.id).rec.locationId === '');
    check('container removed too', findRow_('locations', box.id) === null);
    made.locations = [];

    // ── Reorder ──
    const cats = readAll_('categories').rows.sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    const ids = cats.map(function (r) { return r.id; });
    ok(apiReorder('categories', ids.slice().reverse()), 'reorder categories');
    const after = readAll_('categories').rows.sort(function (a, b) { return a.sortOrder - b.sortOrder; }).map(function (r) { return r.id; });
    check('new order saved', JSON.stringify(after) === JSON.stringify(ids.slice().reverse()));
    ok(apiReorder('categories', ids), 'restore original order');

    // ── Audits (skipped if a real audit is in progress) ──
    if (readAll_('auditSessions').rows.some(function (r) { return r.status === 'active'; })) {
      results.push('SKIP  audit checks (an audit is in progress)');
    } else {
      const t2 = need(track('tools', ok(apiCreate('tools', { name: T + 'Audit Wrench', quantity: 5 }), 'create tool for audit')), 'create a tool');
      const t3 = need(track('tools', ok(apiCreate('tools', { name: T + 'Audit Drill', quantity: 2 }), 'create second tool for audit')), 'create a tool');
      const t4 = need(track('tools', ok(apiCreate('tools', { name: T + 'Audit Saw', quantity: 1 }), 'create third tool for audit')), 'create a tool');
      const st = ok(apiStartAudit(T + 'Audit', ['tools']), 'start audit');
      err(apiStartAudit(T + 'Audit 2', ['tools']), 'AUDIT_ACTIVE', 'second simultaneous audit is refused');
      err(apiStartAudit(T + 'Bad', ['fasteners']), 'VALIDATION', 'fasteners cannot be audited');
      const items = readAll_('auditItems').rows.filter(function (r) { return st && r.auditId === st.session.id; });
      const ai = function (toolId) { return items.filter(function (r) { return r.itemId === toolId; })[0]; };
      check('audit includes every tool with baseline', ai(t2.id) && ai(t2.id).baselineQty === 5);
      ok(apiSetAuditCount(ai(t2.id).id, 'different', 3), 'count wrench as 3');
      const same = ok(apiSetAuditCount(ai(t3.id).id, 'different', 2), 'count drill = expected');
      check('count equal to expected is saved as confirmed', same && same.record.status === 'confirmed');
      ok(apiSetAuditCount(ai(t4.id).id, 'missing'), 'mark saw missing');
      err(apiSetAuditCount(ai(t2.id).id, 'different', 1.5), 'VALIDATION', 'fractional count for tools is rejected');
      // Someone uses a wrench during the audit → conflict on finalize
      ok(apiAdjustQuantity('tools', t2.id, -1), 'wrench used mid-audit');
      const c = err(apiFinalizeAudit(st.session.id, {}), 'AUDIT_CONFLICTS', 'finalize reports mid-audit change');
      check('conflict lists counted 3 vs current 4', c && c.details.conflicts.length === 1 &&
        c.details.conflicts[0].counted === 3 && c.details.conflicts[0].current === 4, c && c.details);
      check('nothing written while conflicts are unresolved', findRow_('tools', t4.id).rec.needsCheck === false);
      const res = {}; res[ai(t2.id).id] = 'counted';
      const fin = ok(apiFinalizeAudit(st.session.id, res), 'finalize with resolution');
      check('wrench set to counted 3', findRow_('tools', t2.id).rec.quantity === 3);
      check('drill unchanged at 2', findRow_('tools', t3.id).rec.quantity === 2);
      check('saw keeps quantity and is flagged', findRow_('tools', t4.id).rec.quantity === 1 && findRow_('tools', t4.id).rec.needsCheck === true);
      check('summary counts', fin && fin.summary.updated === 1 && fin.summary.missing === 1 && fin.summary.confirmed === 1, fin && fin.summary);
      check('audit rows removed after finalize', !readAll_('auditItems').rows.some(function (r) { return r.auditId === st.session.id; }));
      err(apiSetAuditCount(ai(t3.id).id, 'confirmed'), 'AUDIT_CLOSED', 'counting after finalize is refused');
      const st2 = ok(apiStartAudit(T + 'Cancelled audit', ['tools']), 'start another audit');
      ok(apiCancelAudit(st2.session.id), 'cancel audit');
      check('cancelled audit leaves inventory alone', findRow_('tools', t2.id).rec.quantity === 3);
    }

    // ── Photos ──
    // 1×1 pixel PNG
    const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const up = ok(apiUploadImage('parts', p.id, px), 'upload photo');
    const imgId = up && up.record.imageId;
    check('photo saved to Drive', Boolean(imgId));
    if (up && !up.shared) results.push('NOTE  Photo link-sharing is blocked by the Workspace admin; the app will use the slower fallback.');
    ok(apiGetImage(imgId), 'fallback photo fetch works');
    err(apiGetImage('1AbCdEfGhIjKlMnOpQrStUv'), 'NOT_FOUND', 'fallback refuses files that are not item photos');
    err(apiUploadImage('parts', p.id, 'data:text/html;base64,PGI+aGk8L2I+'), 'BAD_REQUEST', 'non-image upload rejected');
    ok(apiRemoveImage('parts', p.id), 'remove photo');
    check('photo removed from item', findRow_('parts', p.id).rec.imageId === '');

    // ── Packing list (the real round info is saved first and put back after) ──
    const savedMeta = PropertiesService.getScriptProperties().getProperty('packingMeta');
    try {
      const g = need(track('packingItems', ok(apiPackingCreate({ name: T + 'Pit box', section: 'always' }), 'packing: add group')), 'add a packing group');
      const k1 = need(track('packingItems', ok(apiPackingCreate({ name: T + 'Zip ties', parentId: g.id, section: 'loadout' }), 'packing: add item in group')), 'add a packing item');
      check('child takes its group’s section', k1.section === 'always');
      err(apiPackingCreate({ name: T + 'Calipers', parentId: g.id, linkTable: 'tools', linkId: 'TL-00000000' }), 'VALIDATION', 'packing: link to a missing inventory item is rejected');
      const k3 = need(track('packingItems', ok(apiPackingCreate({ name: T + 'Bearing kit', parentId: g.id, linkTable: 'parts', linkId: p.id }), 'packing: item linked to a part')), 'link');
      const l2 = need(track('packingItems', ok(apiPackingCreate({ name: T + 'L2', parentId: k1.id }), 'packing: level 2')), 'l2');
      const l3 = need(track('packingItems', ok(apiPackingCreate({ name: T + 'L3', parentId: l2.id }), 'packing: level 4')), 'l3');
      err(apiPackingCreate({ name: T + 'L5', parentId: l3.id }), 'VALIDATION', 'packing: 5th level is refused');
      err(apiPackingUpdate(g.id, { parentId: l2.id }), 'VALIDATION', 'packing: can’t move a group inside itself');
      ok(apiPackingSetPacked([k3.id, l3.id], true), 'packing: tick two items');
      check('packed saved', findRow_('packingItems', k3.id).rec.packed === true);
      ok(apiPackingUpdate(g.id, { section: 'season' }), 'packing: move group to season');
      check('moving a group moves everything inside', findRow_('packingItems', l3.id).rec.section === 'season');
      // final check
      PropertiesService.getScriptProperties().setProperty('packingMeta', JSON.stringify({ event: T, season: '', finalCheck: { state: 'none' } }));
      const c1 = ok(apiFinalCheckClaim(T + 'Sam'), 'final check: claim');
      err(apiFinalCheckClaim(T + 'Alex'), 'FINAL_CHECK_TAKEN', 'final check: second person refused while first is on the page');
      err(apiFinalCheckVerify('wrong-token', [k3.id], true), 'FINAL_CHECK_LOST', 'final check: only the holder can verify');
      ok(apiFinalCheckVerify(c1.token, [k3.id], true), 'final check: holder verifies');
      ok(apiFinalCheckPause(c1.token), 'final check: pause when leaving');
      check('paused check shows as paused', publicPackingMeta_().finalCheck.state === 'paused');
      const c2 = ok(apiFinalCheckClaim(T + 'Alex'), 'final check: someone else resumes');
      check('progress kept after resume', findRow_('packingItems', k3.id).rec.verified === true);
      err(apiFinalCheckVerify(c1.token, [l3.id], true), 'FINAL_CHECK_LOST', 'final check: old holder’s token stops working');
      ok(apiFinalCheckComplete(c2.token), 'final check: complete');
      check('token never sent to browsers', !('token' in publicPackingMeta_().finalCheck));
      // notes
      const nt = ok(apiPackingNoteAdd(T + 'Bring more zip ties'), 'packing note: add');
      if (nt) { track('packingNotes', nt); ok(apiPackingNoteSet(nt.record.id, true), 'packing note: mark done'); }
      ok(apiPackingDelete(g.id), 'packing: delete group with everything inside');
      check('children deleted with group', findRow_('packingItems', l3.id) === null);
      made.packingItems = [];
    } finally {
      const pr = PropertiesService.getScriptProperties();
      if (savedMeta === null) pr.deleteProperty('packingMeta'); else pr.setProperty('packingMeta', savedMeta);
    }

    // ── Stock shapes, production jobs and cutting ──
    const al = listId('materialType');
    const rect = function (L, W) { return { kind: 'rect', points: [[0, 0], [L, 0], [L, W], [0, W]], edges: [L, W, L, W] }; };
    err(apiCreate('rawMaterials', { materialTypeId: al, thickness: '1/8', quantity: 1, description: T,
      shape: { kind: 'traced', points: [[0, 0], [10, 10], [10, 0], [0, 10]] } }), 'VALIDATION', 'shape: self-crossing outline is rejected');
    const sp = need(track('rawMaterials', ok(apiCreate('rawMaterials', { materialTypeId: al, thickness: '1/8', quantity: 1, description: T, shape: rect(24, 12.5) }), 'shape: create rectangle piece')), 'create a stock piece');
    check('shape: length/width/area filled from the shape', sp.length === '24' && sp.width === '12 1/2' && sp.area === 300, [sp.length, sp.width, sp.area]);
    const jobs = ok(apiProductionCreate([
      { partName: T + 'Gusset A', materialTypeId: al, thickness: '1/8', partLength: 5, partWidth: 11, method: 'shapeoko', stockLength: 6, stockWidth: 12.5,
        rawMaterialId: sp.id, copyIndex: 0, placement: { x: 0, y: 0, w: 6, h: 12.5, angle: 0 } },
      { partName: T + 'Gusset B', materialTypeId: al, thickness: '1/8', partLength: 5, partWidth: 5, method: 'handmade', stockLength: 5.25, stockWidth: 5.25,
        rawMaterialId: sp.id, copyIndex: 0, placement: { x: 10, y: 0, w: 5.25, h: 5.25, angle: 0 } }]), 'production: create 2 planned jobs');
    const ja = jobs && jobs.records[0], jb = jobs && jobs.records[1];
    err(apiRawCut(sp.id, 999, 0, [ja.id], [], {}), 'CONFLICT', 'cut: stale piece version is refused');
    const reas = {}; reas[jb.id] = 0;
    const cut = ok(apiRawCut(sp.id, sp.version, 0, [ja.id], [{ points: [[6, 0], [24, 0], [24, 12.5], [6, 12.5]] }], reas), 'cut: mark job A as cut');
    const spAfter = findRow_('rawMaterials', sp.id).rec;
    check('cut: piece shrinks to the leftover', spAfter.area === 225 && spAfter.length === '18', [spAfter.area, spAfter.length]);
    check('cut: job A is cut, job B still planned on the piece', findRow_('production', ja.id).rec.status === 'cut' &&
      findRow_('production', jb.id).rec.rawMaterialId === sp.id && findRow_('production', jb.id).rec.status === 'planned');
    const full = need(track('rawMaterials', ok(apiCreate('rawMaterials', { materialTypeId: al, thickness: '1/4', quantity: 3, description: T, shape: rect(48, 24) }), 'shape: 3 identical full sheets')), 'sheets');
    const jc = ok(apiProductionCreate([{ partName: T + 'Plate', materialTypeId: al, thickness: '1/4', partLength: 10, partWidth: 10, method: 'shapeoko',
      stockLength: 10.75, stockWidth: 10.75, rawMaterialId: full.id, copyIndex: 1, placement: { x: 0, y: 0, w: 10.75, h: 10.75, angle: 0 } }]), 'production: job on sheet copy 2');
    const cut2 = ok(apiRawCut(full.id, full.version, 1, [jc.records[0].id],
      [{ points: [[10.75, 0], [48, 0], [48, 24], [0, 24], [0, 10.75], [10.75, 10.75]] }], {}), 'cut: from one of 3 identical sheets');
    check('cut: sheet count goes 3 → 2 and the leftover becomes a new piece', findRow_('rawMaterials', full.id).rec.quantity === 2 &&
      cut2 && cut2.newPieces.length === 1 && cut2.newPieces[0].area > 1000);
    if (cut2) made.rawMaterials.push(cut2.newPieces[0].id);
    ok(apiProductionDelete([ja.id, jb.id, jc.records[0].id]), 'production: delete jobs');

    // ── Polling ──
    const ch = ok(apiGetChanges(getVersions_()), 'poll with current versions');
    check('poll returns no tables when nothing changed', ch && Object.keys(ch.tables).length === 0);

    // ── Security ──
    check('internal functions are private (end in _)', typeof readAll_ === 'function');
  } catch (e) {
    results.push('FAIL  test crashed: ' + (e.stack || e));
  } finally {
    console.log('Cleaning up test data...');
    try { cleanupTestData_(made); } finally { props.deleteProperty('selfTestStartedAt'); }
  }

  const failed = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
  console.log(results.join('\n') + '\n\n' +
    (failed ? '❌ ' + failed + ' of ' + results.length + ' checks FAILED' : '✅ All ' + results.length + ' checks passed') +
    '  (' + Math.round((Date.now() - started) / 1000) + ' s total)');
  return failed === 0;
}

/** Deletes everything the self-test created (and any leftover __TEST__ rows). */
function cleanupTestData_(made) {
  withLock_(function () {
    // Audit rows belonging to test audits (e.g. if a run stopped mid-audit).
    const testAudits = new Set(readAll_('auditSessions').rows.filter(function (r) { return /__TEST__/.test(r.name); })
      .map(function (r) { return r.id; }));
    const ai = readAll_('auditItems');
    const aiRows = ai.rows.filter(function (r) { return testAudits.has(r.auditId); });
    if (aiRows.length) deleteRows_(ai.sh, aiRows.map(function (r) { return r.__i + 2; }));
    clearHeaderCache_();
    Object.keys(TABLES).forEach(function (key) {
      const t = readAll_(key);
      if (key === 'auditItems') return;
      if (key === 'auditSessions') {
        const tests = t.rows.filter(function (r) { return /__TEST__/.test(r.name); });
        if (tests.length) deleteRows_(t.sh, tests.map(function (r) { return r.__i + 2; }));
        return;
      }
      const ids = new Set(made[key] || []);
      const rows = t.rows.filter(function (r) {
        return ids.has(r.id) || /__TEST__/.test(String(r.name || '') + String(r.description || '') + String(r.typeColor || '') + String(r.text || '') + String(r.partName || ''));
      });
      if (key === 'locations') {
        // Containers whose test area was removed (left over from an interrupted run).
        const gone = new Set(rows.map(function (r) { return r.id; }));
        t.rows.forEach(function (r) {
          if (r.parentId && (gone.has(r.parentId) || !t.byId[r.parentId]) && !gone.has(r.id)) {
            gone.add(r.id);
            rows.push(r);
          }
        });
      }
      if (rows.length) deleteRows_(t.sh, rows.map(function (r) { return r.__i + 2; }));
    });
    bumpVersions_(Object.keys(TABLES));
  });
}
