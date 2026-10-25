// WingIt: screen router.
import { h, clear, $, toast, setHud, fit } from './ui.js';
import { SEASONS, SEASON_IDS } from './data/seasons.js';
import { PRINCIPLES, SLICE_IDS } from './data/principles.js';
import { archetype, SLOT_NAMES } from './data/archetypes.js';
import { rngFor } from './rng.js';
import { hooks, meta, getRun, setRun, newRun, loadSavedRun, hasSavedRun, save } from './state.js';
import { tutorialMap, randomMap, nodeLabel } from './map/mapGen.js';
import { renderMap, availableNodes } from './map/mapView.js';
import * as kickoff from './nodes/kickoff.js';
import * as inspire from './nodes/inspire.js';
import * as prototype from './nodes/prototype.js';
import * as sketch from './nodes/sketch.js';
import * as gears from './nodes/gears.js';
import * as krayon from './nodes/krayon.js';
import * as cad from './nodes/cad.js';
import * as shop from './nodes/shop.js';
import * as mentor from './nodes/mentor.js';
import * as scrimmage from './nodes/scrimmage.js';
import * as event from './nodes/event.js';
import * as result from './nodes/result.js';

const NODES = { kickoff, inspire, prototype, sketch, gears, krayon, cad, shop, mentor, scrimmage, event };
const DEBUG = new URLSearchParams(location.search).has('debug');
const main = () => $('#main');

hooks.toast = toast;
hooks.hud = () => setHud(getRun());

function topButtons(buttons) {
  const el = $('#top-buttons'); clear(el);
  buttons.forEach(([label, fn]) => el.append(h('button', { class: 'btn', onclick: fn }, label)));
}

function showMenu() {
  setHud(null);
  $('#season-name').textContent = '';
  topButtons([['Codex', showCodex]]);
  const root = clear(main());
  const saved = hasSavedRun();
  const seedInput = h('input', { type: 'text', placeholder: 'seed (optional)', style: 'width:140px' });
  root.append(h('div', { class: 'col', style: 'max-width:760px;margin:30px auto' },
    h('h1', { style: 'font-size:56px;letter-spacing:3px' }, 'WING', h('span', { class: 'gold' }, 'IT')),
    h('p', {}, 'Run a build season. Analyze the game, steal the best ideas, design against the clock, and test early. Every choice trades weight, complexity and hours.'),
    h('p', { class: 'muted small' }, 'A Team 6220 Golden Griffins project that teaches our design standards. Each run is a random real FRC game (this early build has Rapid React and Crescendo).'),
    h('hr'),
    saved ? h('button', { class: 'btn primary', onclick: () => { loadSavedRun(); showMap(); } }, 'Continue your season') : null,
    h('button', { class: 'btn' + (saved ? '' : ' primary'), onclick: () => startRun('rapidreact2022', 6220, true) }, 'Tutorial season: 2022 Rapid React (guided, about 30 minutes)'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => { const seed = parseInt(seedInput.value, 10) || Math.floor(Math.random() * 1e9); startRun(rngFor(seed, 'season').pick(SEASON_IDS), seed, false); } }, 'Random season'),
      seedInput),
    h('p', { class: 'small muted' }, `Principles discovered: ${Object.keys(meta.codex).filter((id) => SLICE_IDS.includes(id)).length} of ${SLICE_IDS.length}`)));
}

function showCodex() {
  setHud(null);
  topButtons([['Menu', showMenu]]);
  const root = clear(main());
  const groups = {};
  PRINCIPLES.forEach((p) => { (groups[p.group] = groups[p.group] || []).push(p); });
  root.append(h('div', { class: 'col' }, h('h2', {}, 'Design Notebook'),
    h('p', { class: 'muted small' }, 'Principles unlock as you meet them during a season. Each cites the team document it comes from.'),
    ...Object.entries(groups).map(([g, list]) => h('div', { class: 'panel' }, h('h3', {}, g),
      ...list.map((p) => meta.codex[p.id]
        ? h('div', { class: 'principle' }, h('b', {}, p.title), h('div', { class: 'small' }, p.text), h('div', { class: 'small gold' }, p.src))
        : h('div', { class: 'principle locked' }, h('b', {}, p.slice ? '???' : p.title + ' (coming soon)')))))));
}

function startRun(seasonId, seed, tutorial) {
  const run = newRun(seasonId, seed, tutorial);
  run.map = tutorial ? tutorialMap() : randomMap(rngFor(seed, 'map'));
  setRun(run);
  showMap();
}

function designSummary(run) {
  const rows = ['drivetrain', 'intake', 'scorer', 'endgame'].map((slot) => {
    const d = run.design[slot];
    if (!d) return h('div', { class: 'small muted' }, `${SLOT_NAMES[slot]}: not chosen yet`);
    const a = archetype(run.seasonId, slot, d.id);
    return h('div', { class: 'small' }, `${SLOT_NAMES[slot]}: `, h('b', {}, a.name), h('span', { class: 'muted' }, d.source === 'scratch' ? ' (from scratch)' : ' (published design)'));
  });
  const known = run.flaws.filter((f) => f.found && !f.fixed);
  return h('div', { class: 'panel col', style: 'width:360px' }, h('h3', {}, 'Your robot'), ...rows,
    h('div', { class: 'small', style: 'margin-top:6px' }, known.length ? h('span', { class: 'gold' }, `Known open issues: ${known.length}`) : h('span', { class: 'muted' }, 'No known open issues')),
    run.req ? h('div', { class: 'small muted' }, 'Building for: ' + run.req.tasks.map((id) => SEASONS[run.seasonId].tasks.find((t) => t.id === id).name).join(', ')) : null);
}

function showMap() {
  const run = getRun();
  const season = SEASONS[run.seasonId];
  setHud(run);
  $('#season-name').textContent = `${season.year} ${season.name}` + (run.tutorial ? ' (tutorial)' : '') + ` · seed ${run.seed}`;
  topButtons([['Codex', () => { save(); showCodex(); }], ['Menu', () => { save(); showMenu(); }]]);
  const root = clear(main());
  const avail = availableNodes(run);
  const missing = DEBUG ? SLICE_IDS.filter((id) => !run.triggered.includes(id)) : null;
  root.append(h('div', { class: 'col' },
    h('div', { class: 'row' },
      h('div', { class: 'grow' }, h('h2', {}, 'Season map'), h('p', { class: 'muted' }, avail.length ? 'Pick your next stop. Gold squares are available.' : 'Season over.')),
      designSummary(run)),
    renderMap(run, openNode),
    missing ? h('div', { class: 'panel small' }, `DEBUG principles met: ${run.triggered.filter((id) => SLICE_IDS.includes(id)).length}/${SLICE_IDS.length}. Missing: ${missing.join(', ')}`) : null));
}

function openNode(node, l, i) {
  const run = getRun();
  const mod = NODES[node.type];
  topButtons([]);
  const root = clear(main());
  $('#season-name').textContent = nodeLabelFull(run, node);
  mod.mount(root, run, () => {
    run.cur = { l, i };
    run.path.push({ l, i });
    save();
    if (l + 1 >= run.map.layers.length) showResult(); else showMap();
  }, node);
  setHud(run);
}
function nodeLabelFull(run, node) { return `${SEASONS[run.seasonId].year} ${SEASONS[run.seasonId].name} · ${nodeLabel(node)}`; }

function showResult() {
  const run = getRun();
  setHud(null);
  topButtons([['Menu', showMenu]]);
  const root = clear(main());
  result.mount(root, run, () => startRun(rngFor(Date.now() % 1e9, 'season').pick(SEASON_IDS), Math.floor(Math.random() * 1e9), false), showMenu);
}

window.addEventListener('resize', fit);
fit();
showMenu();
