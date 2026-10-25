// Inspiration: adopt a published design (cheap, known flaws) or design from scratch (costly, hidden flaws, innovation bonus).
import { h, clear } from '../ui.js';
import { archList, SLOT_NAMES } from '../data/archetypes.js';
import { SEASONS } from '../data/seasons.js';
import { spend, unlock, setSlot, save, BREAKTHROUGH_CHANCE, BREAKTHROUGH_GAIN } from '../state.js';
import { notify } from '../ui.js';
import { shell, hint, tags } from './common.js';
import { artFor } from '../widgets/figures.js';
import { hasPerk } from '../sim/robotModel.js';

const SCRATCH_HOURS = 6;

export function mount(root, run, done, node) {
  const slots = node.params.slots;
  const BORROW_HOURS = hasPerk(run, 'open-alliance') ? 1 : 2;
  const season = SEASONS[run.seasonId];
  const sel = {};
  slots.forEach((s) => { sel[s] = run.design[s] ? { id: run.design[s].id, source: run.design[s].source } : null; });

  function card(slot, a) {
    const cur = sel[slot];
    const picked = cur && cur.id === a.id;
    const known = a.flaws.length ? a.flaws.map((f) => f.name) : ['None known'];
    return h('div', { class: 'card' + (picked ? ' sel' : ''), onclick: () => { sel[slot] = { id: a.id, source: cur && cur.id === a.id ? cur.source : 'borrowed' }; render(); } },
      artFor(a.id),
      h('b', {}, a.name),
      h('div', { class: 'small muted', style: 'margin:4px 0' }, a.note),
      h('div', {}, tags([`${a.wt} lb`, `complexity ${a.cx}`, `reliability ${Math.round(a.rel * 100)}%`, `driver ease ${Math.round(a.ease * 100)}%`].concat(a.cap && a.cap < 900 ? [`holds ${a.cap}`] : [], a.rate ? [`${a.rate} per s`] : []))),
      a.sensors && a.sensors.length ? h('div', {}, h('span', { class: 'small muted' }, 'Sensors needed: '), tags(a.sensors)) : null,
      h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Known issues if borrowed: '), picked && cur.source === 'scratch' ? h('span', { class: 'gold' }, 'unknown if built from scratch') : known.join('; ')),
      picked ? h('div', { style: 'margin-top:6px', class: 'row' },
        h('button', { class: 'btn' + (cur.source === 'borrowed' ? ' sel' : ''), style: 'text-align:left', onclick: (e) => { e.stopPropagation(); cur.source = 'borrowed'; render(); } },
          h('b', {}, `Adopt published design (${BORROW_HOURS} h)`), h('div', { class: 'small' }, 'Known issues are listed above, so no surprises. Leaves more hours for building and practice.')),
        h('button', { class: 'btn' + (cur.source === 'scratch' ? ' sel' : ''), style: 'text-align:left', onclick: (e) => { e.stopPropagation(); cur.source = 'scratch'; render(); } },
          h('b', {}, `Build from scratch (${SCRATCH_HOURS} h)`), h('div', { class: 'small' }, `Costs ${SCRATCH_HOURS - BORROW_HOURS} more hours and adds a hidden interface flaw, but ${Math.round(BREAKTHROUGH_CHANCE * 100)}% of the time you find a breakthrough: ${Math.round(BREAKTHROUGH_GAIN * 100)}% faster cycle time.`))) : null);
  }

  function render() {
    clear(root);
    const ready = slots.every((s) => sel[s]);
    const hours = slots.reduce((t, s) => t + (sel[s] ? (sel[s].source === 'scratch' ? SCRATCH_HOURS : BORROW_HOURS) : 0), 0);
    const sections = slots.map((slot) => h('div', { class: 'panel' },
      h('h3', {}, SLOT_NAMES[slot]),
      h('div', { class: 'grid3' }, archList(run.seasonId, slot).map((a) => card(slot, a)))));
    root.append(shell('Inspiration: ' + slots.map((s) => SLOT_NAMES[s]).join(' + '),
      'Teams publish their designs (Open Alliance threads, Ri3D builds, Behind the Bumpers, released CAD). Steal from the best, then innovate the rest.',
      hint(run, 'Adopting a proven design is cheap and its flaws are already known. A scratch design costs more hours and hides a flaw, but has a chance of a breakthrough that makes it faster.'),
      h('p', { class: 'small muted' }, `${season.name}: goal is to score ${season.tasks.filter((t) => run.req && run.req.tasks.includes(t.id)).map((t) => t.name).join(', ') || 'your chosen tasks'}.`),
      h('button', { class: 'btn primary', disabled: ready ? null : true, onclick: finish }, `Lock in choices (${hours} h)`),
      ...sections));
  }

  function finish() {
    for (const s of slots) {
      const bt = setSlot(s, sel[s].id, sel[s].source, false);
      if (sel[s].source === 'scratch' && sel[s].id !== 'none') notify(bt ? `Breakthrough on your ${SLOT_NAMES[s].toLowerCase()}: ${Math.round(BREAKTHROUGH_GAIN * 100)}% faster cycle time!` : `Your from-scratch ${SLOT_NAMES[s].toLowerCase()} works, but no breakthrough this time. Its hidden interface flaw remains.`);
    }
    spend(slots.reduce((t, s) => t + (sel[s].source === 'scratch' ? SCRATCH_HOURS : BORROW_HOURS), 0));
    unlock('steal-innovate'); unlock('simplicity');
    save(); done();
  }
  render();
}
