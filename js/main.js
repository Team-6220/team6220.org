// WingIt: screen router.
import { h, clear, $, achievement, notify, setHud, fit } from './ui.js';
import { SEASONS, SEASON_IDS } from './data/seasons.js';
import { PRINCIPLES, SLICE_IDS } from './data/principles.js';
import { archetype, SLOT_NAMES } from './data/archetypes.js';
import { rngFor } from './rng.js';
import { hooks, meta, getRun, setRun, newRun, loadSavedRun, hasSavedRun, save, principleCount } from './state.js';
import { buildPlan } from './plan.js';
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
const principlesLabel = () => `Principles ${principleCount()}/${SLICE_IDS.length}`;

hooks.achieve = (p, count, total) => { achievement(p, count, total); const b = $('#btn-principles'); if (b) b.textContent = principlesLabel(); };
hooks.notify = notify;
hooks.hud = () => setHud(getRun());

function topButtons(buttons) {
  const el = $('#top-buttons'); clear(el);
  buttons.forEach(([label, fn, id]) => el.append(h('button', { class: 'btn', id, onclick: fn }, label)));
}
const principlesBtn = (fn) => [principlesLabel(), fn, 'btn-principles'];

function wordmark(style) {
  return h('h1', { style }, h('span', { class: 'gold' }, 'WING'), 'IT');
}

function showMenu() {
  setHud(null);
  $('#season-name').textContent = '';
  topButtons([principlesBtn(showCodex)]);
  const root = clear(main());
  const saved = hasSavedRun();
  const seedInput = h('input', { type: 'text', placeholder: 'seed (optional)', style: 'width:140px' });
  root.append(h('div', { class: 'col', style: 'max-width:760px;margin:30px auto' },
    wordmark('font-size:56px;letter-spacing:3px'),
    h('p', {}, 'Run a build season. Analyze the game, steal the best ideas, design against the clock, and test early. Every choice trades weight, complexity and hours.'),
    h('p', { class: 'muted small' }, 'A Team 6220 Golden Griffins project that teaches our design standards. Each run is a random real FRC game (this early build has Rapid React and Crescendo).'),
    h('hr'),
    saved ? h('button', { class: 'btn primary', onclick: continueSeason }, 'Continue your season') : null,
    h('button', { class: 'btn' + (saved ? '' : ' primary'), onclick: () => startRun('rapidreact2022', 6220, true) }, 'Tutorial season: 2022 Rapid React (guided, about 30 minutes)'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => { const seed = parseInt(seedInput.value, 10) || Math.floor(Math.random() * 1e9); startRun(rngFor(seed, 'season').pick(SEASON_IDS), seed, false); } }, 'Random season'),
      seedInput)));
}

function continueSeason() { if (!getRun()) loadSavedRun(); if (getRun()) showHub(); else showMenu(); }

function showCodex() {
  setHud(null);
  const canContinue = !!getRun() || hasSavedRun();
  topButtons([['Menu', showMenu], canContinue ? ['Continue season', continueSeason] : null].filter(Boolean));
  const root = clear(main());
  const groups = {};
  PRINCIPLES.forEach((p) => { (groups[p.group] = groups[p.group] || []).push(p); });
  root.append(h('div', { class: 'col' }, h('h2', {}, `Principles ${principleCount()}/${SLICE_IDS.length}`),
    h('p', { class: 'muted small' }, 'Principles unlock as you meet them during a season. Each cites the team document it comes from.'),
    ...Object.entries(groups).map(([g, list]) => h('div', { class: 'panel' }, h('h3', {}, g),
      ...list.map((p) => meta.codex[p.id]
        ? h('div', { class: 'principle' }, h('b', {}, p.title), h('div', { class: 'small' }, p.text), h('div', { class: 'small gold' }, p.src))
        : h('div', { class: 'principle locked' }, h('b', {}, p.slice ? '???' : p.title + ' (coming soon)')))))));
}

function startRun(seasonId, seed, tutorial) {
  const run = newRun(seasonId, seed, tutorial);
  run.plan = buildPlan(seed, tutorial);
  setRun(run);
  showHub();
}

function designSummary(run) {
  const rows = ['drivetrain', 'intake', 'scorer', 'endgame'].map((slot) => {
    const d = run.design[slot];
    if (!d) return h('div', { class: 'small muted' }, `${SLOT_NAMES[slot]}: not chosen yet`);
    const a = archetype(run.seasonId, slot, d.id);
    return h('div', { class: 'small' }, `${SLOT_NAMES[slot]}: `, h('b', {}, a.name), h('span', { class: 'muted' }, d.source === 'scratch' ? (d.breakthrough ? ' (scratch: breakthrough!)' : ' (from scratch)') : ' (published design)'));
  });
  const known = run.flaws.filter((f) => f.found && !f.fixed);
  return h('div', { class: 'panel col', style: 'width:380px' }, h('h3', {}, 'Your robot'), ...rows,
    h('div', { class: 'small', style: 'margin-top:4px' }, known.length ? h('span', { class: 'gold' }, `Known open issues: ${known.length}`) : h('span', { class: 'muted' }, 'No known open issues')));
}

function itemCard(run, it, n) {
  const done = !!run.completed[it.key];
  return h('div', { class: 'card' + (done ? ' done' : ''), style: done ? 'opacity:.55;cursor:default' : '', onclick: done ? null : () => openItem(it) },
    h('div', { class: 'row', style: 'align-items:center' },
      h('b', { class: 'grow' }, (run.tutorial && n ? `${n}. ` : '') + it.label),
      done ? h('span', { class: 'tag good' }, 'done') : (it.required ? h('span', { class: 'tag warn' }, 'required') : h('span', { class: 'tag' }, 'optional')),
      it.hours ? h('span', { class: 'tag' }, it.hours) : null),
    h('div', { class: 'small' }, it.blurb),
    !done && it.skip ? h('div', { class: 'small', style: 'margin-top:3px;color:#8a8a8a' }, it.skip) : null);
}

function showHub() {
  const run = getRun();
  const season = SEASONS[run.seasonId];
  const ph = run.plan[run.phase];
  setHud(run);
  $('#season-name').textContent = `${season.year} ${season.name}` + (run.tutorial ? ' (tutorial)' : '') + ` · seed ${run.seed}`;
  topButtons([principlesBtn(() => { save(); showCodex(); }), ['Menu', () => { save(); showMenu(); }]]);
  const root = clear(main());
  const reqDone = ph.items.filter((i) => i.required).every((i) => run.completed[i.key]);
  const tracker = h('div', { class: 'row', style: 'gap:6px' }, ...run.plan.map((p, i) => h('div', { class: 'tag' + (i === run.phase ? ' warn' : i < run.phase ? ' good' : ''), style: 'padding:3px 10px;font-size:13px' }, p.name)));
  const missing = DEBUG ? SLICE_IDS.filter((id) => !run.triggered.includes(id)) : null;
  root.append(h('div', { class: 'col' },
    h('div', { class: 'row' },
      h('div', { class: 'grow col' }, tracker, h('h2', {}, ph.name + ' phase'),
        h('p', { class: 'muted small' }, ph.id === 'design'
          ? 'Do the steps in any order you like. Required steps must be done; optional steps cost hours but skipping them has consequences later. The season clock is shared, so every hour here is an hour not spent building, programming, or practicing.'
          : ph.id === 'build' ? 'Order parts, handle surprises, and optionally test before the event.' : ph.id === 'rework' ? 'Between events: fix what you learned, as much as the clock allows.' : 'Pick your next step.'),
        run.tutorial && ph.id === 'design' ? h('div', { class: 'panel hint' }, h('span', { class: 'gold' }, 'Tutorial: '), 'Suggested order is numbered. A real team might do it differently, but try skipping a step in a later run to see what it costs.') : null),
      designSummary(run)),
    h('div', { class: 'grid2' }, ph.items.map((it, i) => itemCard(run, it, i + 1))),
    ph.advance ? h('button', { class: 'btn primary', style: 'align-self:flex-start', disabled: reqDone ? null : true, onclick: advance }, ph.advance + (reqDone ? '' : ' (finish the required steps first)')) : null,
    missing ? h('div', { class: 'panel small' }, `DEBUG principles met: ${run.triggered.filter((id) => SLICE_IDS.includes(id)).length}/${SLICE_IDS.length}. Missing: ${missing.join(', ')}`) : null));
}

function advance() {
  const run = getRun();
  if (run.phase + 1 >= run.plan.length) { showResult(); return; }
  run.phase++; save(); showHub();
}

function openItem(it) {
  const run = getRun();
  topButtons([]);
  const root = clear(main());
  $('#season-name').textContent = `${SEASONS[run.seasonId].year} ${SEASONS[run.seasonId].name} · ${it.label}`;
  NODES[it.type].mount(root, run, () => {
    run.completed[it.key] = true; save();
    const ph = run.plan[run.phase];
    if (ph.auto && ph.items.filter((i) => i.required).every((i) => run.completed[i.key])) advance(); else showHub();
  }, { type: it.type, params: it.params });
  setHud(run);
}

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
