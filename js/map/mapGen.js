// Season map generation. Tutorial = fixed linear route that hits every principle; otherwise a branching map.
export const NODE_INFO = {
  kickoff: { letter: 'K', label: 'Kickoff' },
  inspire: { letter: 'I', label: 'Inspiration' },
  prototype: { letter: 'P', label: 'Prototype' },
  sketch: { letter: 'S', label: 'Master Sketch' },
  gears: { letter: 'G', label: 'Gears & Belts' },
  krayon: { letter: 'C', label: 'Krayon CAD' },
  cad: { letter: 'D', label: 'Organized CAD' },
  shop: { letter: '$', label: 'Shop' },
  mentor: { letter: 'M', label: 'Mentor' },
  scrimmage: { letter: 'T', label: 'Scrimmage' },
  event: { letter: 'E', label: 'Event' },
};

const n = (type, params) => ({ type, params: params || {}, next: [] });
const key = (x) => x.type + JSON.stringify(x.params);

export function nodeLabel(node) {
  const base = NODE_INFO[node.type].label;
  if (node.type === 'inspire') return 'Inspire: ' + node.params.slots.map((s) => ({ drivetrain: 'drive', intake: 'intake', scorer: 'scorer', endgame: 'endgame' })[s]).join(' + ');
  if (node.type === 'mentor') return 'Mentor: ' + ({ rivet: 'rivets', rule: 'rule change', stock: 'out of stock' })[node.params.card];
  if (node.type === 'event') return node.params.idx === 1 ? 'Regional event' : 'Championship';
  if (node.type === 'scrimmage' && node.params.early) return 'Early test';
  return base;
}

export function tutorialMap() {
  const seq = [
    n('kickoff'),
    n('inspire', { slots: ['drivetrain', 'intake'] }),
    n('prototype'),
    n('inspire', { slots: ['scorer', 'endgame'] }),
    n('sketch'),
    n('gears'),
    n('scrimmage', { early: true }),
    n('krayon'),
    n('cad'),
    n('mentor', { card: 'rivet' }),
    n('shop'),
    n('mentor', { card: 'rule' }),
    n('event', { idx: 1 }),
    n('shop', { rework: true }),
    n('scrimmage'),
    n('event', { idx: 2 }),
  ];
  const layers = seq.map((x) => [x]);
  layers.forEach((l, i) => { if (i + 1 < layers.length) l[0].next = [0]; });
  return { layers, tutorial: true };
}

const DT_IN = () => n('inspire', { slots: ['drivetrain', 'intake'] });
const SC_EG = () => n('inspire', { slots: ['scorer', 'endgame'] });

export function randomMap(rng) {
  const pools = [
    [n('kickoff')],
    [DT_IN(), SC_EG(), n('prototype')],
    [DT_IN(), SC_EG(), n('sketch'), n('gears')],
    [n('sketch'), n('gears'), n('scrimmage', { early: true }), n('krayon')],
    [n('krayon'), n('cad'), n('mentor', { card: 'rivet' }), n('shop')],
    [n('cad'), n('shop'), n('mentor', { card: 'rule' }), n('scrimmage')],
    [n('shop'), n('mentor', { card: 'stock' }), n('krayon'), n('cad')],
    [n('event', { idx: 1 })],
    [n('shop', { rework: true }), n('scrimmage'), n('mentor', { card: 'rule' }), n('cad')],
    [n('scrimmage'), n('shop', { rework: true }), n('mentor', { card: 'stock' })],
    [n('event', { idx: 2 })],
  ];
  const used = new Set();
  const layers = pools.map((pool, li) => {
    if (pool.length === 1) { used.add(key(pool[0])); return [pool[0]]; }
    const want = 2 + (rng.chance(0.5) ? 1 : 0);
    const picked = [];
    for (const cand of rng.shuffle(pool)) {
      if (picked.length >= want) break;
      if (used.has(key(cand))) continue;
      picked.push(cand); used.add(key(cand));
    }
    if (!picked.length) { const c = pool[0]; picked.push(Object.assign({}, c, { next: [] })); }
    return picked;
  });
  for (let l = 0; l + 1 < layers.length; l++) {
    const next = layers[l + 1], hasIn = new Array(next.length).fill(false);
    for (const nd of layers[l]) {
      const count = Math.min(next.length, 1 + (rng.chance(0.4) ? 1 : 0));
      nd.next = rng.shuffle(next.map((_, i) => i)).slice(0, count);
      nd.next.forEach((i) => { hasIn[i] = true; });
    }
    hasIn.forEach((v, i) => { if (!v) { const src = rng.pick(layers[l]); src.next.push(i); } });
  }
  return { layers, tutorial: false };
}
