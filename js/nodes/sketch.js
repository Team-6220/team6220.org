// Master Sketch: top-down design starts here. Simplified to dragging a pivot and sizing an arm.
import { h, clear } from '../ui.js';
import { SEASONS } from '../data/seasons.js';
import { archetype } from '../data/archetypes.js';
import { createArmSketch } from '../widgets/armSketch.js';
import { spend, unlock, addFlaw, save } from '../state.js';
import { shell, hint } from './common.js';

const POLISH_GAINS = [0.1, 0.05, 0.025, 0.0125];

export function mount(root, run, done) {
  const season = SEASONS[run.seasonId];
  const sc = run.design.scorer ? archetype(run.seasonId, 'scorer', run.design.scorer.id) : null;
  const reach = sc && sc.reach ? sc.reach : { x: 0, h: 36 };
  const w = createArmSketch(season, reach);
  const st = w.state;

  const checks = h('div', { class: 'col' });
  const lenLabel = h('div', { class: 'small muted' }, `Arm length: ${st.L}"`);
  const motorNote = h('p', { class: 'small muted' });
  const polishNote = h('div', { class: 'small muted' });
  const polishBtn = h('button', { class: 'btn', onclick: () => { st.polish += POLISH_GAINS[st.polishSteps++]; spend(4); w.update(); } });

  function refresh(r) {
    clear(checks);
    checks.append(
      h('div', {}, h('span', { class: r.reachOk ? 'green' : 'red' }, r.reachOk ? '✔ ' : '✘ '), 'Tip path reaches the scoring target',
        r.reachOk ? null : h('div', { class: 'small muted' }, `Target is ${r.d.toFixed(1)}" from the pivot; arm length is ${st.L}".`)),
      h('div', {}, h('span', { class: r.stowOk ? 'green' : 'red' }, r.stowOk ? '✔ ' : '✘ '), 'Stows inside the height and extension limits'),
      h('div', {}, 'Driving dimensions: ', h('b', { class: 'gold' }, r.dims)));
    lenLabel.textContent = `Arm length: ${st.L}"`;
    motorNote.textContent = st.motorAtEnd ? 'A motor far from the pivot adds inertia and torque, slowing the arm.' : 'Keeping heavy parts near the pivot makes the arm quicker and easier to control.';
    polishNote.textContent = `Polish so far: -${st.polish.toFixed(2)} s. Diminishing returns.`;
    polishBtn.textContent = st.polishSteps >= POLISH_GAINS.length ? 'Nothing left to optimize' : `Optimize further (4 h): cycle -${POLISH_GAINS[st.polishSteps].toFixed(3)} s`;
    polishBtn.disabled = st.polishSteps >= POLISH_GAINS.length;
  }
  w.onChange(refresh);

  const status = h('div', { class: 'panel col', style: 'width:400px' },
    h('h3', {}, 'Sketch checks'), checks, h('hr'),
    h('div', {}, lenLabel, h('input', { type: 'range', min: 8, max: 44, value: st.L, oninput: (e) => { st.L = +e.target.value; w.update(); } })),
    h('div', { class: 'checkrow' }, h('input', { type: 'checkbox', onchange: (e) => { st.parametric = e.target.checked; if (st.parametric) st.py = Math.round(season.heightLimit * 0.4); w.update(); } }),
      h('span', {}, 'Tie the pivot height to the frame (fewer dimensions, easier edits)')),
    h('div', { class: 'checkrow' }, h('input', { type: 'checkbox', onchange: (e) => { st.motorAtEnd = e.target.checked; w.update(); } }),
      h('span', {}, 'Mount the motor at the end of the arm (blue square)')),
    motorNote, h('hr'), polishBtn, polishNote,
    h('button', { class: 'btn primary', onclick: finish }, 'Commit master sketch (6 h)'));

  function finish() {
    const r = w.check();
    run.results.sketch = { pivotX: st.px, pivotY: st.py, L: st.L, reachOk: r.reachOk, stowOk: r.stowOk, motorAtEnd: st.motorAtEnd, parametric: st.parametric, polish: st.polish, armMass: Math.round(st.L * 0.12 * 10) / 10 };
    spend(6);
    if (!r.stowOk) addFlaw({ id: 'frameViolation', name: 'Stowed mechanism breaks the frame/extension rules', sev: 1, kind: 'inspect', fixHours: 3, onlyTesting: false, hint: 'Shorten the arm or move the pivot.', found: true });
    unlock('top-down'); unlock('parametric');
    save(); done();
  }

  root.append(shell('Master Sketch (side view)', 'The layout sketch captures mechanism dimensions and robot size limits. Components are modeled around it.',
    hint(run, 'Drag the pivot P so the dashed tip path passes through the target ring, and keep the stowed arm inside the dashed limits. Each extra polish click costs hours for a tiny gain.'),
    h('div', { class: 'row' }, w.canvas, status)));
  w.update();
}
