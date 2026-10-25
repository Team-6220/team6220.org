// Shop: COTS stock, sensor planning for programming, and weight reduction decisions.
import { h, clear } from '../ui.js';
import { rngFor } from '../rng.js';
import { ALL_SENSORS } from '../data/archetypes.js';
import { derive } from '../sim/robotModel.js';
import { spend, unlock, setSlot, save } from '../state.js';
import { shell, hint, tags } from './common.js';

const COTS = [
  { id: 'neo', name: 'NEO motors (x6)' }, { id: 'belt', name: 'HTD5M 110T belts' }, { id: 'wheel', name: 'Compliant wheels 30A' },
  { id: 'chain', name: '#25 chain and sprockets' }, { id: 'll', name: 'Limelight 3' }, { id: 'rivets', name: '3/16" rivets and rivet tool' },
  { id: 'swerve', name: 'Swerve modules', only: 'swerve' }, { id: 'cyl', name: 'Pneumatic cylinders', only: 'claw' },
];

export function mount(root, run, done, node) {
  const rework = !!(node && node.params && node.params.rework);
  const rng = rngFor(run.seed, 'shop' + (rework ? 'r' : ''));
  const r = run.results.shop = run.results.shop || { weightDelta: 0, sensors: null, applied: {}, pocketedEarly: false, progExtra: 0, cots: null };
  const dtId = run.design.drivetrain && run.design.drivetrain.id, inId = run.design.intake && run.design.intake.id;
  if (!rework && !r.cots) {
    const pool = COTS.filter((c) => !c.only || c.only === dtId || c.only === inId);
    r.cots = rng.shuffle(pool).slice(0, 5).map((c) => ({ id: c.id, name: c.name, stock: rng.chance(0.75) ? 'in' : 'back', choice: null }));
  }
  let sensors = new Set(r.sensors || []);

  function applyWeight(id, label, delta, hours, extra) {
    if (r.applied[id]) return;
    r.applied[id] = true; r.weightDelta += delta; spend(hours);
    if (extra) extra();
    save(); render();
  }

  function render() {
    clear(root);
    const s = derive(run);
    const season = s.cap;
    const need = s.sensorsNeeded;
    const secWeight = h('div', { class: 'panel col grow' },
      h('h3', {}, 'Weight: ' + Math.round(s.weight) + ' / ' + season + ' lb'),
      h('p', { class: 'small muted' }, 'Lower weight means more speed. The best weight saving is building less robot. Lightening patterns come last.'),
      h('button', { class: 'btn', disabled: r.applied.thin ? true : null, onclick: () => applyWeight('thin', 'thin', -4, 3, () => unlock('pocket-last')) }, 'Use thinner material, no pocketing (-4 lb, 3 h)'),
      h('button', { class: 'btn', disabled: r.applied.pocket || r.applied.late ? true : null, onclick: () => applyWeight('pocket', 'pocket', -6, 10, () => { r.pocketedEarly = true; }) }, 'Pocket plates now (-6 lb, 10 h)'),
      h('button', { class: 'btn', disabled: !rework || r.applied.pocket || r.applied.late ? true : null, onclick: () => applyWeight('late', 'late', -6, 4, () => unlock('pocket-last')) }, rework ? 'Pocket at the very end, design frozen (-6 lb, 4 h)' : 'Pocket at the very end (available once the design is frozen)'),
      run.design.endgame && run.design.endgame.id !== 'none' ? h('button', { class: 'btn', onclick: () => { setSlot('endgame', 'none', 'scratch', false); unlock('build-less'); render(); } }, 'Build less robot: remove the endgame mechanism') : null,
      r.pocketedEarly ? h('p', { class: 'small gold' }, 'Early pockets lock the design. A later change will cost extra hours.') : null);
    const secSensors = h('div', { class: 'panel col grow' },
      h('h3', {}, 'Sensors for programming'),
      h('p', { class: 'small muted' }, 'Programmers need sensors to automate mechanisms. Missing ones mean unreliable auto and presets; unneeded ones add complexity.'),
      h('div', { class: 'small' }, 'Your mechanisms need: ', ...tags(need.length ? need : ['nothing'])),
      ...ALL_SENSORS.map((x) => h('div', { class: 'checkrow' }, h('input', { type: 'checkbox', checked: sensors.has(x) ? true : null, onchange: (e) => { e.target.checked ? sensors.add(x) : sensors.delete(x); } }), h('span', {}, x))),
      );
    const secCots = rework ? null : h('div', { class: 'panel col grow' },
      h('h3', {}, 'COTS parts'),
      h('p', { class: 'small muted' }, 'Optimize for parts we have in stock or can get easily. We cannot make the design if we do not have the parts.'),
      ...r.cots.map((c) => h('div', { class: 'checkrow' },
        h('span', { style: 'width:190px' }, c.name),
        c.stock === 'in' ? h('span', { class: 'tag good' }, 'in stock') : h('span', { class: 'tag bad' }, 'backordered 3 wk'),
        c.stock === 'back' ? h('span', {},
          h('button', { class: 'btn' + (c.choice === 'wait' ? ' sel' : ''), onclick: () => { c.choice = 'wait'; render(); } }, 'Wait (6 h)'),
          h('button', { class: 'btn' + (c.choice === 'sub' ? ' sel' : ''), onclick: () => { c.choice = 'sub'; render(); } }, 'Use in-stock substitute (+2 lb, 2 h)')) : null)));
    const ready = rework || r.cots.every((c) => c.stock === 'in' || c.choice);
    root.append(shell(rework ? 'Shop: rework between events' : 'Shop', rework ? 'Fix what the event showed you.' : 'Order parts, plan sensors, and trim weight.',
      hint(run, 'Resolve any backordered parts, buy the sensors your mechanisms actually need, and do lightening last.'),
      h('div', { class: 'row' }, secCots, secSensors, secWeight),
      h('button', { class: 'btn primary', disabled: ready ? null : true, onclick: finish }, 'Done shopping')));
  }

  function finish() {
    r.sensors = [...sensors];
    if (!rework && !r.cotsApplied) {
      for (const c of r.cots) {
        if (c.choice === 'wait') spend(6);
        if (c.choice === 'sub') { r.weightDelta += 2; spend(2); }
      }
      r.cotsApplied = true;
    }
    unlock('cots-stock'); unlock('sensors-plan');
    save(); done();
  }
  render();
}
