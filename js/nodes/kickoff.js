// Kickoff: read the game, analyze it, pick what to optimize and what to build for.
import { h, clear, openVideo } from '../ui.js';
import { SEASONS } from '../data/seasons.js';
import { spend, unlock, save } from '../state.js';
import { TOTAL_HOURS } from '../sim/robotModel.js';
import { shell, hint } from './common.js';

const BASE_OPTS = {
  cycle: { name: 'Cycle time', text: 'Points per second of your main scoring loop: how fast you can fetch and score one trip.' },
  throughput: { name: 'Throughput', text: 'How many game pieces you can score per second: how much you carry per trip and how fast you load and unload.' },
  auto: { name: 'Autonomous points', text: 'Win the first seconds of the match. Strong, but only worth it if the match is close.' },
  endgame: { name: 'Endgame reliability', text: 'Make the endgame a sure thing every match.' },
  defense: { name: 'Defense resilience', text: 'Be hard to push around and hard to disable.' },
};
export function optList(season) {
  const ids = [season.bulk ? 'throughput' : 'cycle', 'auto', 'endgame', 'defense'];
  return ids.map((id) => { const l = season.opt && season.opt.labels && season.opt.labels[id]; return { id, name: l ? l[0] : BASE_OPTS[id].name, text: l ? l[1] : BASE_OPTS[id].text }; });
}

export function mount(root, run, done) {
  const season = SEASONS[run.seasonId];
  const OPT_VARS = optList(season);
  let opt = OPT_VARS[0].id;
  const chosen = new Set(season.defaultTasks);

  function render() {
    clear(root);
    const rows = season.tasks.map((t) => h('tr', {},
      h('td', {}, h('input', { type: 'checkbox', checked: chosen.has(t.id) ? true : null, onchange: (e) => { e.target.checked ? chosen.add(t.id) : chosen.delete(t.id); render(); } })),
      h('td', {}, t.name + (t.endgame ? ' (endgame)' : '')), h('td', { class: 'gold mono' }, t.pts + ' pt'), h('td', { class: 'muted small' }, t.note)));
    const bestEnd = chosen.size;
    const left = h('div', { class: 'panel grow' },
      h('h3', {}, `${season.year} ${season.name}`),
      h('div', { class: 'row' },
        h('div', { class: 'video-thumb', title: 'Play the official game animation', style: `background-image:url(https://img.youtube.com/vi/${season.videoId}/mqdefault.jpg)`, onclick: () => openVideo(season.videoId, `${season.year} ${season.name}: official game animation`) },
          h('div', { class: 'play' }), h('div', { class: 'cap' }, 'Official game animation (click to watch)')),
        h('div', { class: 'grow' }, h('p', {}, season.blurb),
          h('p', { class: 'small muted' }, `Weight cap ${season.weightCap} lb · frame perimeter ${season.perimeter}" · height ${season.heightLimit}" · extension ${season.extension}" (approximate; verify in the game manual)`),
          h('p', { class: 'small muted' }, season.tip))),
      h('h3', {}, 'Game analysis: what is worth building for?'),
      h('p', { class: 'small' }, 'Tick the scoring actions you will build for. Everything else is skipped. Mechanisms for actions you did not choose are feature creep and cost hours.'),
      h('table', {}, rows),
      null);
    const right = h('div', { class: 'col', style: 'width:420px' },
      h('div', { class: 'panel' }, h('h3', {}, 'What will you optimize?'),
        ...OPT_VARS.map((o) => h('div', { class: 'card' + (opt === o.id ? ' sel' : ''), style: 'margin-bottom:6px', onclick: () => { opt = o.id; render(); } }, h('b', {}, o.name), h('div', { class: 'small muted' }, o.text)))),
      h('div', { class: 'panel' }, h('h3', {}, 'Season clock'),
        h('p', { class: 'small' }, `You have ${TOTAL_HOURS} hours. Design, building, programming and driver practice all draw from the same clock. Every hour spent in design is an hour not spent on the others.`)),
      hint(run, 'Which variable decides this game? Look at the scoring table and the match timing, not just the cheapest points. Pick the one variable that matters most and 3 or so scoring actions.'),
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
