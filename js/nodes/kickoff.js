// Kickoff: read the game, analyze it, pick what to optimize and what to build for.
import { h, clear } from '../ui.js';
import { SEASONS } from '../data/seasons.js';
import { spend, unlock, save } from '../state.js';
import { shell, hint } from './common.js';

const OPT_VARS = [
  { id: 'cycle', name: 'Cycle time', text: 'Points per second of your main scoring loop. In most games this decides matches.' },
  { id: 'auto', name: 'Autonomous points', text: 'Win the first 15 seconds. Strong, but only worth it if the match is close.' },
  { id: 'endgame', name: 'Endgame reliability', text: 'Make the endgame a sure thing every match.' },
  { id: 'defense', name: 'Defense resilience', text: 'Be hard to push around and hard to disable.' },
];

export function mount(root, run, done) {
  const season = SEASONS[run.seasonId];
  let opt = 'cycle';
  const chosen = new Set(season.tasks.filter((t) => ['taxi', 'low', 'high', 'speaker', 'climbLow', 'climb'].includes(t.id)).map((t) => t.id));

  function render() {
    clear(root);
    const rows = season.tasks.map((t) => h('tr', {},
      h('td', {}, h('input', { type: 'checkbox', checked: chosen.has(t.id) ? true : null, onchange: (e) => { e.target.checked ? chosen.add(t.id) : chosen.delete(t.id); render(); } })),
      h('td', {}, t.name + (t.endgame ? ' (endgame)' : '')), h('td', { class: 'gold mono' }, t.pts + ' pt'), h('td', { class: 'muted small' }, t.note)));
    const bestEnd = chosen.size;
    const left = h('div', { class: 'panel grow' },
      h('h3', {}, `${season.year} ${season.name}`), h('p', {}, season.blurb),
      h('p', { class: 'small muted' }, `Weight cap ${season.weightCap} lb · frame perimeter ${season.perimeter}" · height ${season.heightLimit}" · extension ${season.extension}" (approximate; verify in the game manual)`),
      h('h3', {}, 'Game analysis: what is worth building for?'),
      h('p', { class: 'small' }, 'Tick the scoring actions you will build for. Everything else is skipped. Mechanisms for actions you did not choose are feature creep and cost hours.'),
      h('table', {}, rows),
      h('p', { class: 'small muted' }, season.tip));
    const right = h('div', { class: 'col', style: 'width:420px' },
      h('div', { class: 'panel' }, h('h3', {}, 'What will you optimize?'),
        ...OPT_VARS.map((o) => h('div', { class: 'card' + (opt === o.id ? ' sel' : ''), style: 'margin-bottom:6px', onclick: () => { opt = o.id; render(); } }, h('b', {}, o.name), h('div', { class: 'small muted' }, o.text)))),
      h('div', { class: 'panel' }, h('h3', {}, 'Season clock'),
        h('p', { class: 'small' }, 'You have 200 hours. Design, building, programming and driver practice all draw from the same clock. Every hour spent in design is an hour not spent on the others.')),
      hint(run, 'Pick the one variable that matters most and 3 or so scoring actions. Do not try to do everything.'),
      h('button', { class: 'btn primary', disabled: bestEnd === 0 ? true : null, onclick: finish }, 'Commit requirements (4 h)'));
    root.append(shell('Kickoff', 'Strategic design starts before any CAD.', h('div', { class: 'row' }, left, right)));
  }

  function finish() {
    run.req = { optVar: opt, tasks: [...chosen] };
    spend(4);
    unlock('game-analysis'); unlock('opt-variable'); unlock('req-creep'); unlock('time-budget');
    if (chosen.size < season.tasks.length) unlock('build-less');
    save(); done();
  }
  render();
}
