// Season result and unlock summary.
import { h } from '../ui.js';
import { SEASONS } from '../data/seasons.js';
import { PRINCIPLES, SLICE_IDS } from '../data/principles.js';
import { derive } from '../sim/robotModel.js';
import { meta, saveMeta, clearRun } from '../state.js';

export function mount(root, run, onNew, onMenu) {
  const season = SEASONS[run.seasonId];
  const s = derive(run);
  const total = run.events.reduce((t, e) => t + e.score, 0);
  const hit = SLICE_IDS.filter((id) => run.triggered.includes(id));
  if (!run.done) {
    run.done = true; run.score = total;
    meta.runsDone++; if (run.tutorial) meta.tutorialDone = true;
    if (!meta.best[run.seasonId] || total > meta.best[run.seasonId]) meta.best[run.seasonId] = total;
    saveMeta(); clearRun();
  }
  const best = meta.best[run.seasonId];
  const opt = { cycle: 'cycle time ' + s.effCycle.toFixed(1) + ' s', auto: 'autonomous', endgame: 'endgame reliability', defense: 'defense' }[run.req ? run.req.optVar : 'cycle'];
  root.append(h('div', { class: 'col' },
    h('h1', {}, `${season.year} ${season.name}: season complete`),
    h('div', { class: 'grid3' },
      h('div', { class: 'panel' }, h('h3', {}, 'Season score'), h('div', { style: 'font-size:34px', class: 'gold mono' }, total), h('div', { class: 'small muted' }, 'Best on this season: ' + best)),
      h('div', { class: 'panel' }, h('h3', {}, 'Events'), ...run.events.map((e) => h('div', { class: 'small' }, `${e.idx === 1 ? 'Regional' : 'Championship'}: rank ${e.rank}, ${e.wins}-${6 - e.wins}, avg ${e.avg.toFixed(0)} pts (+${e.score})`))),
      h('div', { class: 'panel' }, h('h3', {}, 'Your robot'), h('div', { class: 'small' }, `${Math.round(s.weight)} lb · complexity ${s.complexity.toFixed(1)} · optimized for ${opt}`),
        h('div', { class: 'small' }, `Hours: design ${Math.round(s.budget.design)}, build ${Math.round(s.budget.mfgNeed)}, code ${Math.round(s.budget.progNeed)}, driver practice ${Math.max(0, Math.round(s.budget.practice))}`))),
    h('div', { class: 'panel' }, h('h3', {}, `Principles you met this season: ${hit.length} of ${SLICE_IDS.length}`),
      h('div', { class: 'grid3' }, ...PRINCIPLES.filter((p) => p.slice).map((p) => h('div', { class: 'principle' + (run.triggered.includes(p.id) ? '' : ' locked') }, h('b', {}, p.title), h('div', { class: 'small' }, run.triggered.includes(p.id) ? p.src : 'Not met this run'))))),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: onNew }, 'New random season'), h('button', { class: 'btn', onclick: onMenu }, 'Main menu'))));
}
