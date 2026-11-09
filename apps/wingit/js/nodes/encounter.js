// A random season encounter: pick how to respond. Costs, benefits and risks are shown up front.
import { h, clear, sfx } from '../ui.js';
import { rngFor } from '../rng.js';
import { ENCOUNTERS } from '../data/encounters.js';
import { hasPerk } from '../sim/robotModel.js';
import { save } from '../state.js';
import { shell, hint } from './common.js';

export function mount(root, run, done, node) {
  const used = run.counters.encUsed || (run.counters.encUsed = []);
  const rng = rngFor(run.seed, 'enc-' + node.params.key);
  const pool = ENCOUNTERS.filter((e) => !used.includes(e.id));
  const enc = rng.pick(pool.length ? pool : ENCOUNTERS);
  used.push(enc.id);
  const options = enc.options.slice();
  if (hasPerk(run, 'mentor-network')) options.push({ label: 'Call a mentor', detail: 'Free. Reveals one hidden flaw.', apply(r, g) { const list = r.flaws.filter((f) => !f.found && !f.fixed); if (!list.length) return 'The mentor looked over the robot and found nothing hidden.'; const f = g.pick(list); f.found = true; return `The mentor found a hidden problem: ${f.name}.`; } });

  function choose(o) {
    sfx('confirm');
    const msg = o.apply(run, rng);
    save();
    clear(root);
    root.append(shell(enc.title, null, h('div', { class: 'panel col' }, h('b', {}, o.label), h('div', {}, msg)), h('button', { class: 'btn primary', onclick: done }, 'Continue')));
  }

  root.append(shell(enc.title, 'A random encounter. Every option has a price.',
    hint(run, 'Encounters happen whether you plan for them or not. Compare the costs and benefits before you choose.'),
    h('div', { class: 'panel' }, enc.intro),
    h('div', { class: 'col' }, ...options.map((o) => h('div', { class: 'card', onclick: () => choose(o) }, h('b', {}, o.label), h('div', { class: 'small muted' }, o.detail))))));
}
