// Test / Scrimmage: building a rough version and testing it reveals flaws that design alone can't find.
import { h, clear } from '../ui.js';
import { rngFor } from '../rng.js';
import { derive } from '../sim/robotModel.js';
import { playCycle } from '../sim/cycleSim.js';
import { spend, unlock, bump, save } from '../state.js';
import { shell, hint } from './common.js';

export function mount(root, run, done, node) {
  const early = !!(node && node.params && node.params.early);
  let last = null;
  let anim = null;

  function test(thorough) {
    const rng = rngFor(run.seed, 'scrim' + bump('scrim'));
    const p = thorough ? 0.8 : 0.45;
    spend(thorough ? 10 : 4);
    let n = 0;
    for (const f of run.flaws) if (!f.found && !f.fixed && rng.chance(p)) { f.found = true; n++; }
    last = { n, thorough };
    unlock('test-early');
    save(); render();
  }
  const fixCost = (f) => Math.ceil(f.fixHours * (early ? 0.5 : 1));

  function render() {
    if (anim) anim.stop();
    clear(root);
    const s = derive(run);
    const ready = s.picks.drivetrain && s.picks.intake && s.picks.scorer;
    const found = run.flaws.filter((f) => f.found);
    const flaws = found.length ? h('table', {}, h('tr', {}, h('th', {}, 'Issue'), h('th', {}, 'What to do'), h('th', {})),
      ...found.map((f) => h('tr', {}, h('td', {}, f.name), h('td', { class: 'small muted' }, f.hint),
        h('td', {}, f.fixed ? h('span', { class: 'green' }, 'fixed') : h('button', { class: 'btn', onclick: () => { f.fixed = true; spend(fixCost(f)); save(); render(); } }, `Fix (${fixCost(f)} h)`)))))
      : h('p', { class: 'muted' }, 'No known issues yet. That does not mean there are none.');
    const cv = h('canvas', { width: 860, height: 220 });
    root.append(shell(early ? 'Early test: rough build' : 'Scrimmage', 'Build something rough, drive it, and see what breaks. Testing finds problems that design review never will.',
      hint(run, early ? 'Fixes before the design is frozen cost half as many hours. You will never find all the issues before testing, so test early.' : 'Test again before the event. Flaws that you do not find now will find you during a match.'),
      ready ? h('div', { class: 'col' }, cv, h('div', { class: 'small muted' }, `Cycle time ${s.effCycle.toFixed(1)} s · ${s.needsTurn ? 'the robot has to turn around between intake and scoring' : 'no turn-around needed'} · driver skill ${Math.round(s.driverSkill * 100)}%`))
        : h('div', { class: 'panel muted' }, 'Not all mechanisms are chosen yet, so there is only a partial rough build to test.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => test(false) }, 'Quick test (4 h)'),
        h('button', { class: 'btn', onclick: () => test(true) }, 'Thorough test (10 h)'),
        last ? h('span', { class: last.n ? 'gold' : 'muted' }, last.n ? `The test revealed ${last.n} new issue${last.n > 1 ? 's' : ''}.` : 'No new issues turned up this time (but some may remain).') : null),
      h('div', { class: 'panel' }, h('h3', {}, 'Known issues'), flaws),
      h('button', { class: 'btn primary', onclick: () => { save(); done(); } }, 'Finish testing')));
    if (ready) anim = playCycle(cv, s, { loop: true });
  }
  render();
}
