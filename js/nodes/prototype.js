// Prototype: cheap wood-and-drill tests vs. costly high-fidelity tests. Teaches touch it/own it, rollers, test early.
import { h, clear, C } from '../ui.js';
import { SEASONS } from '../data/seasons.js';
import { rngFor } from '../rng.js';
import { spend, unlock, removeFlaw, bump, save } from '../state.js';
import { shell, hint, pct } from './common.js';

const WHEELS = [
  { id: 'compliant30', name: 'Compliant wheel 30A', fit: 1.0, opt: 20 },
  { id: 'flex45', name: 'Flex wheel 45A', fit: 0.92, opt: 15 },
  { id: 'mecanum', name: 'Mecanum wheel', fit: 0.8, opt: 12 },
  { id: 'colson', name: 'Colson wheel 65A', fit: 0.7, opt: 8 },
];
const FIDELITY = { wood: { name: 'Wood + hand drills', hours: 1, noise: 0.13 }, hifi: { name: 'High-fidelity prototype', hours: 3, noise: 0.03 } };

export function trueSuccess(wheel, comp) {
  const w = WHEELS.find((x) => x.id === wheel);
  return w.fit * Math.exp(-(((comp - w.opt) / 11) ** 2));
}

export function mount(root, run, done) {
  const season = SEASONS[run.seasonId];
  let fid = 'wood', wheel = 'compliant30', comp = 10;
  const tests = [];

  function runTest() {
    const n = bump('protoTests');
    const rng = rngFor(run.seed, 'proto' + n);
    const t = trueSuccess(wheel, comp);
    const seen = Math.max(0, Math.min(1, t + rng.normal(0, FIDELITY[fid].noise)));
    tests.push({ fid, wheel, comp, seen });
    spend(FIDELITY[fid].hours);
    if (fid === 'wood') unlock('test-early');
    render();
  }

  function render() {
    clear(root);
    const best = tests.length ? tests.reduce((a, b) => (b.seen > a.seen ? b : a)) : null;
    const cv = h('canvas', { width: 520, height: 220 });
    const ctx = cv.getContext('2d');
    ctx.fillStyle = C.black; ctx.fillRect(0, 0, 520, 220);
    ctx.strokeStyle = C.g4; ctx.beginPath(); ctx.moveTo(30, 190); ctx.lineTo(500, 190); ctx.moveTo(30, 190); ctx.lineTo(30, 10); ctx.stroke();
    ctx.fillStyle = C.g5; ctx.font = '11px sans-serif'; ctx.fillText('compression % →', 400, 208); ctx.fillText('pickup %', 34, 14);
    tests.forEach((t) => {
      const x = 30 + (t.comp / 40) * 470, y = 190 - t.seen * 170;
      ctx.fillStyle = t.wheel === wheel ? C.gold : C.g5; ctx.fillRect(x - 3, y - 3, 6, 6);
    });
    const ctrl = h('div', { class: 'panel col', style: 'width:420px' },
      h('h3', {}, 'Test setup'),
      h('div', {}, h('span', { class: 'small muted' }, 'Fidelity: '),
        ...Object.entries(FIDELITY).map(([k, v]) => h('button', { class: 'btn' + (fid === k ? ' sel' : ''), onclick: () => { fid = k; render(); } }, `${v.name} (${v.hours} h)`))),
      h('div', {}, h('div', { class: 'small muted' }, 'Roller wheel'),
        ...WHEELS.map((w) => h('button', { class: 'btn' + (wheel === w.id ? ' sel' : ''), style: 'margin:2px', onclick: () => { wheel = w.id; render(); } }, w.name))),
      h('div', {}, h('div', { class: 'small muted' }, `Compression: ${comp}%`),
        h('input', { type: 'range', min: 0, max: 40, value: comp, oninput: (e) => { comp = +e.target.value; e.target.previousSibling.textContent = `Compression: ${comp}%`; } })),
      h('button', { class: 'btn primary', onclick: runTest }, `Run test (${FIDELITY[fid].hours} h)`),
      h('p', { class: 'small muted' }, `Roller speed should be at least faster than drive speed. Wood tests are quick but noisy (±${Math.round(FIDELITY.wood.noise * 100)}%); high-fidelity tests are accurate but cost three times as much.`));
    const log = h('div', { class: 'panel grow' },
      h('h3', {}, 'Test log'),
      tests.length ? h('table', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Fidelity'), h('th', {}, 'Wheel'), h('th', {}, 'Comp.'), h('th', {}, 'Pickup')),
        ...tests.map((t, i) => h('tr', {}, h('td', {}, i + 1), h('td', {}, FIDELITY[t.fid].name), h('td', {}, WHEELS.find((w) => w.id === t.wheel).name), h('td', {}, t.comp + '%'), h('td', { class: 'gold mono' }, pct(t.seen)))))
        : h('p', { class: 'muted' }, 'No tests yet.'),
      cv);
    root.append(shell('Prototype: intake rollers', `Touch it, own it. Find a wheel and compression that reliably controls a ${season.pieceName}.`,
      hint(run, 'A few cheap wood tests will point you at the right area. You will never find every issue before testing, so test early and cheaply, then commit.'),
      h('div', { class: 'row' }, ctrl, log),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: finish }, `Commit: ${WHEELS.find((w) => w.id === wheel).name} at ${comp}%`),
        best ? h('span', { class: 'small muted' }, `Best result so far: ${pct(best.seen)} with ${WHEELS.find((w) => w.id === best.wheel).name} at ${best.comp}%`) : null)));
  }

  function finish() {
    const ts = trueSuccess(wheel, comp);
    const tuned = ts >= 0.85;
    run.results.proto = { tuned, wheel, comp, tests: tests.length };
    if (tuned) removeFlaw('intakeJam');
    unlock('touch-own'); unlock('rollers');
    if (!tests.length) unlock('test-early');
    save(); done();
  }
  render();
}
