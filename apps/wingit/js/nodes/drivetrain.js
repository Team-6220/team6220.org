// Drivetrain gearing: trade top speed against pushing force before the wheels slip. Visual chart, no solver.
import { h, clear, C, sfx } from '../ui.js';
import { SEASONS } from '../data/seasons.js';
import { spend, unlock, addFlaw, save } from '../state.js';
import { shell, hint } from './common.js';
import { artFor } from '../widgets/figures.js';

const MOTOR = { rpm: 5676, stall: 2.6, amps: 105, limit: 40 }; // brushless motor, 40 A current limit
const SPEED_BAND = [11, 16]; // loaded ft/s that cycles well in most games
const MU = 1.1;

export function drive(wheel, motors, ratio, weightLb) {
  // weightLb: expected competition weight of the finished robot
  const free = (MOTOR.rpm / ratio) * (Math.PI * wheel / 12) / 60;
  const speed = free * 0.88;
  const torque = (MOTOR.limit / MOTOR.amps) * MOTOR.stall;
  const force = (motors * torque * ratio * 0.85) / (wheel * 0.0254 / 2);
  const traction = MU * weightLb * 0.4536 * 9.81;
  return { speed, force, traction, push: Math.min(force, traction), slips: force > traction };
}

export function mount(root, run, done) {
    const weight = Math.round(SEASONS[run.seasonId].weightCap * 0.92);
  const st = { wheel: 4, motors: 4, ratio: 7 };
  const cv = h('canvas', { width: 520, height: 300 });
  const readout = h('div', { class: 'col' });
  const slider = h('input', { type: 'range', min: 4, max: 14, step: 0.25, value: st.ratio, oninput: (e) => { st.ratio = +e.target.value; render(); } });
  const ratioLabel = h('b', { class: 'gold' });
  const btnRow = (key, values, fmt) => h('div', { class: 'row' }, ...values.map((v) => h('button', { class: 'btn' + (st[key] === v ? ' sel' : ''), onclick: (e) => { st[key] = v; [...e.target.parentNode.children].forEach((b) => b.classList.toggle('sel', b === e.target)); sfx('pop'); render(); } }, fmt(v))));

  function result() {
    const r = drive(st.wheel, st.motors, st.ratio, weight);
    return Object.assign(r, { speedOk: r.speed >= SPEED_BAND[0] && r.speed <= SPEED_BAND[1], pushOk: r.force >= 0.75 * r.traction, fast: r.speed > SPEED_BAND[1] + 2, slow: r.speed < SPEED_BAND[0] - 1.5 });
  }

  function render() {
    const r = result(), ctx = cv.getContext('2d');
    ratioLabel.textContent = `${st.ratio.toFixed(2)} : 1`;
    ctx.fillStyle = C.black; ctx.fillRect(0, 0, 520, 300);
    // chart: loaded speed (x, 4..26 ft/s) vs pushing force (y, 0..1.6 x traction), curve over all ratios
    const L = 48, T = 24, Wd = 450, Ht = 216, xs = (v) => L + ((v - 4) / 22) * Wd, ys = (f) => T + Ht - (f / (r.traction * 1.6)) * Ht;
    ctx.fillStyle = 'rgba(82,184,106,0.18)'; ctx.fillRect(xs(SPEED_BAND[0]), ys(r.traction * 1.6), xs(SPEED_BAND[1]) - xs(SPEED_BAND[0]), ys(0.75 * r.traction) - ys(r.traction * 1.6));
    ctx.strokeStyle = C.g4; ctx.lineWidth = 1; ctx.strokeRect(L, T, Wd, Ht);
    ctx.setLineDash([5, 4]); ctx.strokeStyle = C.gold; ctx.beginPath(); ctx.moveTo(L, ys(r.traction)); ctx.lineTo(L + Wd, ys(r.traction)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.gold; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('traction limit: wheels slip above this', L + 6, ys(r.traction) - 5);
    ctx.strokeStyle = C.white; ctx.lineWidth = 3; ctx.beginPath();
    for (let g = 4; g <= 14; g += 0.25) { const q = drive(st.wheel, st.motors, g, weight); const px = xs(q.speed), py = ys(Math.min(q.force, r.traction * 1.6)); if (g === 4) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.stroke();
    const px = xs(Math.min(26, Math.max(4, r.speed))), py = ys(Math.min(r.force, r.traction * 1.6));
    ctx.fillStyle = r.speedOk && r.pushOk ? C.green : C.red; ctx.fillRect(px - 6, py - 6, 12, 12);
    ctx.fillStyle = C.g5; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('loaded top speed (ft/s)', L + Wd / 2, T + Ht + 38);
    [6, 10, 14, 18, 22, 26].forEach((v) => ctx.fillText(v, xs(v), T + Ht + 16));
    ctx.save(); ctx.translate(14, T + Ht / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('pushing force', 0, 0); ctx.restore();
    ctx.fillStyle = C.green; ctx.textAlign = 'left'; ctx.fillText('green: fast enough and hard to push', L + 6, T + 14);
    clear(readout);
    const row = (ok, text) => h('div', { class: 'small' }, h('span', { class: ok ? 'green' : 'red' }, ok ? '✔ ' : '✘ '), text);
    readout.append(
      row(r.speedOk, `Loaded top speed ${r.speed.toFixed(1)} ft/s (target ${SPEED_BAND[0]} to ${SPEED_BAND[1]})` + (r.fast ? '. Too fast to control.' : r.slow ? '. Too slow to cycle.' : '')),
      row(r.pushOk, `Pushing force ${Math.round(r.force)} N vs traction ${Math.round(r.traction)} N` + (r.pushOk ? '' : '. You will lose pushing matches.')),
      h('div', { class: 'small muted' }, r.slips ? 'More torque than the wheels can use: the extra just spins the wheels. Gear for speed instead.' : 'Lower numerical ratio is faster but pushes with less force.'));
  }

  function commit() {
    const r = result();
    spend(4); unlock('gear-ratio'); unlock('drivetrain-king'); sfx('confirm');
    run.results.dtGear = { wheel: st.wheel, motors: st.motors, ratio: st.ratio, speed: r.speed, push: r.force, speedOk: r.speedOk, pushOk: r.pushOk };
    if (r.fast) addFlaw({ id: 'dtFast', name: 'Drivetrain too fast to control: overshoots and slips', sev: 0.3, kind: 'cycles', fixHours: 3, onlyTesting: true, hint: 'Gear it down or add acceleration limiting in code.', found: false });
    save(); done();
  }

  render();
  root.append(shell('Drivetrain gearing', 'Gear the drivetrain for this game: fast enough to cycle, strong enough not to be shoved.',
    hint(run, 'Pick the wheel, motors and ratio so the dot lands in the green region. Faster means less pushing force.'),
    h('div', { class: 'row' },
      h('div', { class: 'col' }, cv, readout),
      h('div', { class: 'col grow' },
        h('div', { class: 'panel col' }, h('b', {}, 'Wheel diameter'), btnRow('wheel', [3, 4, 6], (v) => `${v} in`), h('b', {}, 'Drive motors'), btnRow('motors', [4, 6], (v) => `${v} motors` + (v === 6 ? ' (+3 lb)' : '')),
          h('div', { class: 'small' }, 'Gear ratio ', ratioLabel), slider),
        artFor(run.design.drivetrain ? run.design.drivetrain.id : 'tank6'),
        h('button', { class: 'btn primary', onclick: commit }, 'Commit drivetrain gearing (4 h)')))));
}
