// Gears & Belts: ratio selection, center distance, belt length = teeth x 5 mm, tensioning.
import { h, clear, sfx } from '../ui.js';
import { spend, unlock, addFlaw, save } from '../state.js';
import { ratio, driveSpeed, rollerSpeed, center, round3, beltTeeth, PINIONS, GEARS, INTAKE_RATIOS, BELT_STOCK } from '../widgets/gearTrain.js';
import { rngFor } from '../rng.js';
import { shell, hint } from './common.js';

export function mount(root, run, done) {
  const s = { n1: 12, n2: 60, n3: 20, n4: 36, holes: null, intake: 3, beltQ: null, belt: null, tension: false };
  const C_MM = 203.2, T1 = 18, T2 = 36;
  const need = beltTeeth(T1, T2, C_MM);

  function render() {
    clear(root);
    const r = ratio(s.n1, s.n2, s.n3, s.n4), v = driveSpeed(r);
    const speedOk = v >= 10 && v <= 16;
    const rs = rollerSpeed(s.intake), intakeOk = rs >= v * 1.2 && rs <= v * 3.5;
    const c1 = center(s.n1, s.n2), c2 = center(s.n3, s.n4);
    const holeOpts = rngFor(run.seed, 'holes' + s.n1 + s.n2).shuffle([c1 - 0.05, c1, c1 + 0.05].map(round3));
    const exact = round3(c1);
    const sel = (opts, key) => h('select', { onchange: (e) => { s[key] = +e.target.value; render(); } }, opts.map((o) => h('option', { value: o, selected: s[key] === o ? true : null }, o)));
    const drive = h('div', { class: 'panel col grow' },
      h('h3', {}, '1. Drivetrain gearing (NEO, 4" wheels)'),
      h('div', { class: 'row' }, 'Stage 1:', sel(PINIONS, 'n1'), 'T →', sel(GEARS, 'n2'), 'T'),
      h('div', { class: 'row' }, 'Stage 2:', sel(PINIONS, 'n3'), 'T →', sel(GEARS, 'n4'), 'T'),
      h('div', { class: 'mono' }, `Ratio ${r.toFixed(2)}:1 · loaded speed `, h('b', { class: speedOk ? 'green' : 'red' }, v.toFixed(1) + ' ft/s'), h('span', { class: 'muted small' }, '  (target 10-16 ft/s)')),
      h('p', { class: 'small muted' }, 'Fewer stages are more efficient. Put the higher reduction nearer the motor.'),
      h('div', { class: 'small' }, `Center distance C = (N1 + N2) / (2 x DP):  stage 1 = (${s.n1}+${s.n2}) / 40 = `, h('b', { class: 'gold' }, c1.toFixed(3) + '"'), `, stage 2 = ${c2.toFixed(3)}". Only the sum of teeth matters.`),
      h('div', {}, 'Cut the plate holes for stage 1 at:  ', ...holeOpts.map((o) => h('button', { class: 'btn' + (s.holes === o ? ' sel' : ''), style: 'margin:2px', onclick: () => { s.holes = o; render(); } }, o.toFixed(3) + '"'))),
      s.holes === null ? null : h('div', { class: 'small ' + (s.holes === exact ? 'green' : 'red') }, s.holes === exact ? 'Correct: we cut gear plates at the exact calculated center distance.' : s.holes < exact ? 'Too tight: the gears bind and waste power.' : 'Too loose: lots of backlash and the teeth may skip.'));
    const intake = h('div', { class: 'panel col grow' },
      h('h3', {}, '2. Intake roller speed (2" roller)'),
      h('div', {}, 'Reduction: ', ...INTAKE_RATIOS.map((q) => h('button', { class: 'btn' + (s.intake === q ? ' sel' : ''), style: 'margin:2px', onclick: () => { s.intake = q; render(); } }, q + ':1'))),
      h('div', { class: 'mono' }, 'Roller surface speed ', h('b', { class: intakeOk ? 'green' : 'red' }, rs.toFixed(1) + ' ft/s'), ` vs drive ${v.toFixed(1)} ft/s`),
      h('p', { class: 'small muted' }, intakeOk ? 'Faster than the drivetrain, so a piece will be pulled in instead of pushed along the carpet.' : rs < v * 1.2 ? 'Too slow: at full speed the robot pushes the piece instead of acquiring it.' : 'Too fast: pieces get spat out or damaged.'),
      h('h3', {}, '3. Belt run (18T → 36T HTD5M, C = 8.0")'),
      h('p', { class: 'small' }, 'How long is a 110-tooth HTD5M belt?'),
      h('div', {}, ...['110 mm', '550 mm', '22 mm'].map((o) => h('button', { class: 'btn' + (s.beltQ === o ? ' sel' : ''), style: 'margin:2px', onclick: () => { s.beltQ = o; render(); } }, o))),
      s.beltQ === null ? null : h('div', { class: 'small ' + (s.beltQ === '550 mm' ? 'green' : 'red') }, s.beltQ === '550 mm' ? 'Right: belt length = teeth x 5 mm (use a calculator like reca.lc, not the belt FeatureScript).' : 'Belt length = number of teeth x 5 mm pitch.'),
      h('p', { class: 'small' }, `This run needs about ${need.toFixed(1)} teeth. Pick a stock belt:`),
      h('div', {}, ...BELT_STOCK.map((o) => h('button', { class: 'btn' + (s.belt === o ? ' sel' : ''), style: 'margin:2px', onclick: () => { s.belt = o; render(); } }, o + 'T'))),
      h('div', { class: 'checkrow' }, h('input', { type: 'checkbox', checked: s.tension ? true : null, onchange: (e) => { s.tension = e.target.checked; render(); } }), h('span', {}, 'Add a tensioner / slotted holes so the belt or chain can be tightened')));
    const ready = s.holes !== null && s.beltQ !== null && s.belt !== null;
    root.append(shell('Gears, belts and chains', 'Power transmission: get the ratio, the center distances and the belt length right.',
      hint(run, 'Aim for a drive speed in the target band, an intake faster than the drivetrain, and always plan how the belt or chain gets tensioned.'),
      h('div', { class: 'row' }, drive, intake),
      h('button', { class: 'btn primary', disabled: ready ? null : true, onclick: () => finish(speedOk && intakeOk, v, round3(c1)) }, 'Commit power transmission (5 h)')));
  }

  function finish(speedOk, v, exact) {
    sfx(speedOk ? 'coin' : 'deny');
    const beltOk = Math.abs(s.belt - need) <= 2.6;
    run.results.gears = { speedOk, driveSpeed: v, centerOk: s.holes === exact, beltOk, tension: s.tension };
    spend(5);
    if (!s.tension) addFlaw({ id: 'noTensioner', name: 'No tensioner: belt or chain jumps under load', sev: 0.5, kind: 'chain', fixHours: 4, onlyTesting: true, hint: 'Slotted holes or a tensioner, as recommended in the design guide.', found: false });
    if (!beltOk) addFlaw({ id: 'beltFit', name: 'Belt length is off: tension is too tight or too loose', sev: 0.3, kind: 'chain', fixHours: 3, onlyTesting: true, hint: 'Recalculate the belt length with a belt calculator.', found: false });
    unlock('gear-center'); unlock('belt-length');
    save(); done();
  }
  render();
}
