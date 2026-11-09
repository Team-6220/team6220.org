// Krayon CAD: rough colorful packaging layout. Teaches packaging, tool access, electronics placement, CG, orientation.
import { h, clear } from '../ui.js';
import { createPackager, CG_LIMIT } from '../widgets/packager.js';
import { derive } from '../sim/robotModel.js';
import { spend, unlock, addFlaw, save } from '../state.js';
import { shell, hint } from './common.js';

export function mount(root, run, done) {
  const w = createPackager(run);
  const dyn = h('div', { class: 'col' });
  const st = w.state;

  function preview(sides) {
    const tmp = Object.assign({}, run, { results: Object.assign({}, run.results, { krayon: { intakeSide: sides.intake, scorerSide: sides.scorer } }) });
    return derive(tmp);
  }
  function row(ok, text, sub) { return h('div', {}, h('span', { class: ok ? 'green' : 'red' }, ok ? '✔ ' : '✘ '), text, sub ? h('div', { class: 'small muted' }, sub) : null); }

  function refresh(r) {
    clear(dyn);
    const pv = preview(r.sides);
    dyn.append(
      row(r.valid, 'No overlapping blocks', r.valid ? null : 'Move the red blocks apart.'),
      row(r.access.battery, 'Battery can be swapped from an edge'),
      row(r.access.rio && r.access.pdh, 'RIO and PDH are reachable with a screwdriver', 'Everything breaks and gets taken apart many times.'),
      row(!r.electronicsHard, 'Electronics are not under the scorer/endgame sweep zones (dashed)', r.electronicsHard ? 'Like our 2024 robot George: RIO and PDH under a big arm pivot. It was horrid.' : null),
      row(!r.cgHigh, `Center of gravity ${r.cg.toFixed(1)}" (keep under ${CG_LIMIT}")`, r.cgHigh ? 'Tippy: a high CG tips over in matches. Lower heavy parts such as the battery.' : null),
      h('hr'),
      h('div', {}, 'Intake faces ', h('b', { class: 'gold' }, r.sides.intake), ', scorer faces ', h('b', { class: 'gold' }, r.sides.scorer)),
      h('div', {}, pv.needsTurn ? h('span', { class: 'red' }, 'Robot must turn around between intake and scoring (+1.6 s).') : h('span', { class: 'green' }, 'No turn needed between intake and scoring.')),
      h('div', { class: 'mono' }, 'Estimated cycle time: ', h('b', { class: 'gold' }, pv.effCycle.toFixed(1) + ' s')),
      h('p', { class: 'small muted' }, 'Pieces come from one end of the field and scores happen at the other. Whether the intake and scorer share a side decides what your driver has to do on every cycle.'));
    if (run.results.sketch === undefined) dyn.append(h('div', { class: 'small red' }, 'You have no master sketch yet. Layout will drift from your mechanism sizes.'));
  }
  w.onChange(refresh);

  function finish() {
    const r = w.check();
    run.results.krayon = { intakeSide: r.sides.intake, scorerSide: r.sides.scorer, cg: r.cg, cgHigh: r.cgHigh, electronicsHard: r.electronicsHard, toolBad: r.toolBad, batteryHigh: st.batteryHigh };
    spend(8);
    if (r.cgHigh) addFlaw({ id: 'highCG', name: 'High center of gravity: the robot is tippy', sev: 0.7, kind: 'tip', fixHours: 6, onlyTesting: false, hint: 'Lower heavy mechanisms; keep the battery low.', found: true });
    if (r.electronicsHard) addFlaw({ id: 'electronicsHard', name: 'RIO/PDH buried under the arm: brownouts and slow repairs', sev: 0.5, kind: 'brownout', fixHours: 8, onlyTesting: false, hint: 'Move electronics out of the sweep zone.', found: true });
    if (!run.results.sketch) addFlaw({ id: 'noMaster', name: 'No master sketch: parts do not line up', sev: 0.5, kind: 'cycles', fixHours: 6, onlyTesting: false, hint: 'Build the layout sketch first.', found: true });
    unlock('krayon'); unlock('packaging-tools'); unlock('weight-cg'); unlock('driver-first'); unlock('electronics-place');
    if (!run.results.sketch) unlock('top-down');
    save(); done();
  }

  const side = h('div', { class: 'panel col', style: 'width:540px' },
    h('h3', {}, 'Layout checks'), dyn, h('hr'),
    h('div', { class: 'checkrow' }, h('input', { type: 'checkbox', onchange: (e) => { st.batteryHigh = e.target.checked; w.update(); } }), h('span', {}, 'Mount the battery on an upper deck (higher CG)')),
    h('button', { class: 'btn primary', id: 'krayon-commit', onclick: finish }, 'Commit Krayon CAD (8 h)'));
  const commit = side.querySelector('#krayon-commit');
  w.onChange((r) => { commit.disabled = !r.valid; });

  root.append(shell('Krayon CAD', 'A rough, colorful layout of the whole robot. Parts get added, moved and reshaped here before any detailed design.',
    hint(run, 'Drag the blocks. Keep electronics and the battery reachable and out from under the mechanisms, keep the CG low, and put the intake and scorer on opposite sides so the driver does not need to turn around.'),
    h('div', { class: 'row' }, w.canvas, side)));
  w.update();
}
