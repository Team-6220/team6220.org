// Event: weigh-in, pit fixes, then six watched qualification matches.
import { h, clear } from '../ui.js';
import { archList } from '../data/archetypes.js';
import { derive } from '../sim/robotModel.js';
import { simulateEvent, eventScore, MATCHES_PER_EVENT } from '../sim/match.js';
import { playClip } from '../sim/cycleSim.js';
import { spend, unlock, setSlot, addFlaw, save } from '../state.js';
import { shell, hint } from './common.js';

export function mount(root, run, done, node) {
  const idx = node.params.idx;
  let phase = 'prep', res = null, shown = 0, anim = null;
  for (const slot of ['drivetrain', 'intake', 'scorer']) if (!run.design[slot]) setSlot(slot, archList(run.seasonId, slot)[0].id, 'scratch', true);
  if (!run.design.endgame) setSlot('endgame', 'none', 'scratch', false);
  const fixCost = (f) => Math.ceil(f.fixHours * 1.5);

  function prep() {
    clear(root);
    const s = derive(run);
    const rows = run.flaws.filter((f) => f.found && !f.fixed);
    const unknown = run.flaws.some((f) => !f.found && !f.fixed);
    root.append(shell(idx === 1 ? 'Regional event: pit and weigh-in' : 'Championship: pit and weigh-in', 'Inspection comes before the first match.',
      hint(run, 'You are over the weight limit? That is a late-season scramble. Plan weight early instead.'),
      s.over ? h('div', { class: 'panel col' }, h('h3', { class: 'red' }, `Overweight: ${Math.round(s.weight)} / ${s.cap} lb`),
        h('p', {}, 'You cannot compete until you are under the limit. Late fixes are expensive.'),
        h('button', { class: 'btn', onclick: () => { run.results.shop = run.results.shop || { weightDelta: 0, sensors: null, applied: {}, progExtra: 0 }; run.results.shop.weightDelta -= 8; spend(10); addFlaw({ id: 'drilled' + Math.round(s.weight), name: 'Holes drilled in a rush weaken a part', sev: 0.3, kind: 'cycles', fixHours: 5, onlyTesting: true, hint: 'Lightening should be planned, not panicked.', found: false }); unlock('pocket-last'); prep(); } }, 'Drill lightening holes in a hurry (-8 lb, 10 h, weakens parts)'),
        run.design.endgame && run.design.endgame.id !== 'none' ? h('button', { class: 'btn', onclick: () => { setSlot('endgame', 'none', 'scratch', false); unlock('build-less'); prep(); } }, 'Remove the endgame mechanism (build less robot)') : null)
        : h('div', { class: 'panel green' }, `Weigh-in passed: ${Math.round(s.weight)} / ${s.cap} lb.`),
      h('div', { class: 'panel' }, h('h3', {}, 'Known issues (pit fixes cost 1.5x)'),
        rows.length ? h('table', {}, ...rows.map((f) => h('tr', {}, h('td', {}, f.name), h('td', {}, h('button', { class: 'btn', onclick: () => { f.fixed = true; spend(fixCost(f)); save(); prep(); } }, `Fix (${fixCost(f)} h)`)))))
          : h('p', { class: 'muted' }, 'None known.'),
        unknown ? h('p', { class: 'small gold' }, 'There may be issues you have not found yet.') : null),
      h('button', { class: 'btn primary', disabled: s.over ? true : null, onclick: () => { res = simulateEvent(run, idx); phase = 'play'; shown = 0; play(); } }, 'Start qualification matches')));
  }

  function play() {
    if (anim) anim.stop();
    clear(root);
    const cards = res.matches.slice(0, shown).map((m) => h('div', { class: 'panel' },
      h('div', { class: 'row' }, h('b', {}, 'Match ' + m.n), h('span', { class: m.win ? 'green' : m.tie ? 'muted' : 'red' }, m.win ? 'WIN' : m.tie ? 'TIE' : 'LOSS'),
        h('span', { class: 'mono grow' }, `${m.alliance} - ${m.opp}   (you ${m.ours}: auto ${m.auto}, teleop ${m.tele}, endgame ${m.end}; ${m.cycles} cycles)`)),
      ...m.moments.map((mo) => h('div', { class: 'small', style: 'margin-top:4px' }, h('b', { class: 'red' }, mo.title + ': '), mo.text))));
    const lastMatch = shown > 0 ? res.matches[shown - 1] : null;
    const clipMoment = lastMatch ? lastMatch.moments.find((m) => m.clip) : null;
    const cv = clipMoment ? h('canvas', { width: 520, height: 130 }) : null;
    const finished = shown >= MATCHES_PER_EVENT;
    root.append(shell(idx === 1 ? 'Regional event' : 'Championship', 'Watch the matches. You do not drive the robot, your design does.',
      cv, ...cards.reverse(),
      finished ? h('div', { class: 'panel col' }, h('h3', { class: 'gold' }, `Qualification rank ${res.rank} · ${res.wins} wins · ${res.rp} RP · average ${res.avg.toFixed(0)} points`),
        h('button', { class: 'btn primary', onclick: finish }, 'Finish event'))
        : h('button', { class: 'btn primary', onclick: () => { shown++; const mm = res.matches[shown - 1]; mm.moments.forEach((mo) => mo.principle && unlock(mo.principle)); play(); } }, `Play match ${shown + 1} of ${MATCHES_PER_EVENT}`)));
    if (cv) anim = playClip(cv, clipMoment.clip, null);
  }

  function finish() {
    const score = eventScore(res);
    run.events.push({ idx, rank: res.rank, wins: res.wins, rp: res.rp, avg: res.avg, score });
    unlock('consistency');
    if (idx === 1) unlock('auton');
    if (res.dtFail > 0 || run.design.drivetrain.id !== 'swerve') unlock('drivetrain-king');
    save(); done();
  }
  prep();
}
