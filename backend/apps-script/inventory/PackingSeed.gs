/**
 * PackingSeed.gs — Golden Griffins Inventory
 * ---------------------------------------------------------------------------
 * The starting packing list, based on the team's "2026 Beach Blitz Packing
 * List" doc (duplicates merged, big items moved to Load-out, game pieces moved
 * to Season). Used ONCE, by setupDatabase(), when the packing list is empty.
 * After that, edit the list in the app (Packing List → Edit list).
 *
 * ▶ reimportPackingList() replaces the whole list with this one. It ERASES any
 *   edits, links and photos on the current list, so only use it on purpose.
 *
 * Format: 'Name'  or  { n: 'Name', note: 'shown under the name', c: [children] }
 */

const PACKING_SEED = {
  // Things that go INSIDE the bins, boxes and the super pit — packed every event.
  always: [
    { n: 'Super pit', c: [
      { n: 'Tools', c: [
        { n: 'Screwdrivers', note: 'Flat and Phillips' },
        'Ratchets', 'Socket extensions', 'Wobble drive', 'Flush cutters', 'Scissors', 'Wire strippers',
        'Crimper', 'Utility knives', 'Deburrers', 'Files', 'Pliers', 'Vice grips', 'Punches', 'Hammers',
        'Vices', 'Clamps', 'Taps and dies', 'Drill bits',
        { n: 'Hole saws', note: 'The Diablo Steel Demon ones' },
        'Driver bits', { n: 'Rivet guns', note: 'The good ones' }, 'The polybelt clamp thingy',
        'Milwaukee boxes', 'Sharpies, pens/pencils',
        { n: 'Hex keys', c: ['3/32"', '1/8" (3mm)', '5/32" (4mm)', { n: '10mm', note: 'To raise the top of the workbench' }] },
        { n: 'Wrenches', c: ['3/8"', '7/16"', '1/2"'] },
        { n: 'Sockets', c: ['3/8"', '7/16" deep', '1/2"'] },
        { n: 'Measuring', c: ['Square', 'Calipers', 'Tape measures'] }
      ] },
      { n: 'Power tools', c: [
        'Drills', 'Drill batteries & chargers', 'Impact driver', 'Jigsaw', 'Oscillating tool', 'Dremel',
        'Hot knife', 'Angle grinder', 'Hot glue gun', { n: 'Band saw blades', note: 'For the Porta Band' }
      ] },
      { n: 'Fasteners', c: ['Bolts', 'Nuts', 'Washers', 'Spacers', 'Rivets', 'Zip ties'] }
    ] },
    { n: 'Material bucket', c: [
      '5 82x1 aluminum tubing: 1/8", 1/16"',
      'Aluminum sheets: 1/16", 1/8", 1/4"',
      'Polycarb sheets: 1/100, 1/8", 1/4"',
      'Hex shafts: 1/2", 3/8"',
      'PVC/Pex for spacers',
      'Foam'
    ] },
    { n: 'Electrical', c: [
      { n: 'Robot batteries', note: 'Bring the best ones' },
      'Battery chargers',
      { n: 'Voltage checkers', note: 'Voltmeter, not multimeter' },
      'Multimeter',
      { n: 'Storage rack', note: 'Mostly electrical supplies', c: [{ n: 'Top rack', note: 'Don’t forget it like last time!' }] }
    ] },
    { n: 'Safety box(es)', c: ['Goggles', 'Gloves', 'Masks', 'Earplugs', 'Headphones', 'Safety pamphlets', 'First aid kits'] },
    { n: 'SwerveKart', c: ['Handles', 'Ethernet cables', 'Controller(?)', 'Walkie talkie', 'Clipboards & prematch checklist papers'] },
    { n: 'Pit setup', c: [
      'Magnetic lights', 'Extension cables', 'Power strip', 'Programmer stools', '3D printer filament',
      'Baby buggy (pre-painted)', { n: 'Monitor cables', c: ['Power cable', 'HDMI cable'] }
    ] },
    { n: 'Outside', c: ['E-Z Up banner', 'Vertical banners', 'Folding chairs'] },
    { n: 'Cleaning', c: ['Brush', 'Dustpan', 'Trash can and bag(s)', 'Vacuum'] },
    { n: 'Mascots', c: ['George (monkey)', 'Fish (crocheted griffin)', 'Fossil (smaller griffin)'] }
  ],
  // This season only (game-specific). Clear and refill each season.
  season: [
    { n: '6220-labeled fuel', note: 'Game pieces — check whether this year’s game still uses them' },
    'Polybelts',
    'Liquid Wrench',
    { n: 'Rubbing alcohol', note: 'To clean off the rollers' }
  ],
  // The big things loaded into the trailer at departure.
  loadout: [
    'Rack', 'Porta Band', '3D printer', 'Monitor', 'Pit light',
    { n: 'Folding tables', note: 'Including the 6ft table' },
    'Saw horses', { n: 'E-Z Ups', note: 'Including the LAHS E-Z Up' },
    { n: 'Banners', note: 'Pit banner' }, 'Banner stand', 'Plastic wrap', 'Dolly',
    { n: 'Robot', c: [{ n: 'Bumpers', c: ['Red', 'Blue'] }] },
    { n: 'SwerveKart', c: ['Batteries', 'Lock wheels', 'Driver station'] },
    { n: 'Super pit', c: ['Lock wheels', 'Ratchet'] }
  ]
};

/** Writes the seed list into an empty PackingItems sheet. */
function seedPackingList_() {
  if (readAll_('packingItems').rows.length) return 0;
  const def = TABLES.packingItems;
  const recs = [];
  const now = nowIso_();
  const add = function (node, parentId, section, order) {
    const o = typeof node === 'string' ? { n: node } : node;
    const r = Object.assign(blankRecord_(def), {
      id: newId_(def.prefix), parentId: parentId, section: section, name: o.n, note: o.note || '',
      sortOrder: order, packed: false, verified: false, updatedAt: now
    });
    recs.push(r);
    (o.c || []).forEach(function (child, i) { add(child, r.id, section, i + 1); });
  };
  PACKING_SECTIONS.forEach(function (section) {
    (PACKING_SEED[section] || []).forEach(function (node, i) { add(node, '', section, i + 1); });
  });
  insertMany_('packingItems', recs);
  const meta = readPackingMeta_();
  meta.season = PACKING_SEED_SEASON_LABEL;
  writePackingMeta_(meta);
  return recs.length;
}

const PACKING_SEED_SEASON_LABEL = '2027 season';

/**
 * ▶ Run from the editor to REPLACE the packing list with PACKING_SEED.
 * Deletes every current entry (and its photo) and clears all checkmarks.
 * Notes for next time are kept.
 */
function reimportPackingList() {
  requireEditor_();
  withLock_(function () {
    const t = readAll_('packingItems');
    t.rows.forEach(function (r) { trashImage_(r.imageId); });
    deleteRows_(t.sh, t.rows.map(function (r) { return r.__i + 2; }));
    clearHeaderCache_();
    const n = seedPackingList_();
    const m = readPackingMeta_();
    m.finalCheck = { state: 'none' };
    writePackingMeta_(m);
    bumpVersions_(['packingItems', 'packingMeta']);
    console.log('Packing list replaced: ' + n + ' entries.');
  });
}
