// Mentor / event cards: rivet quiz, rule change, out-of-stock supplier.
import { h, clear, sfx } from '../ui.js';
import { rngFor } from '../rng.js';
import { createRivetWidget } from '../widgets/rivetLayout.js';
import { figure } from '../widgets/figures.js';
import { MENTOR_CARDS } from '../data/events.js';
import { spend, unlock, addFlaw, save } from '../state.js';
import { shell, hint } from './common.js';

export function mount(root, run, done, node) {
  const id = node.params.card, card = MENTOR_CARDS[id];
  const body = h('div', { class: 'col' });

  function finishWith(msg, cls) {
    clear(body);
    body.append(h('div', { class: 'panel ' + (cls || '') }, msg), h('button', { class: 'btn primary', onclick: () => { save(); done(); } }, 'Continue'));
  }

  if (id === 'rivet') {
    const thickness = rngFor(run.seed, 'rivetsheet').pick([0.0625, 0.125, 0.125, 0.1875]);
    const checks = h('div', { class: 'col' });
    const row = (ok, text) => h('div', { class: 'small' }, h('span', { class: ok ? 'green' : 'red' }, ok ? '✔ ' : '✘ '), text);
    const w = createRivetWidget(thickness, (r) => {
      clear(checks);
      checks.append(row(r.sheetOk, `Rivet size suits a ${thickness}" sheet`), row(r.edgeOk && !r.edgeBad, 'Edge distance A is about 2.5 D'), row(r.pitchOk, 'Spacing B is between 4 D and 8 D'));
    });
    const submit = h('button', { class: 'btn primary', onclick: () => {
      const r = w.check(); spend(card.hours); unlock('rivets'); sfx('rivet');
      if (!r.ok) addFlaw({ id: 'weakJoint', name: 'Weak riveted joint (bad layout)', sev: 0.3, kind: 'cycles', fixHours: 3, onlyTesting: true, hint: 'Edge about 2.5D, pitch 4D to 8D.', found: false });
      else sfx('coin');
      const why = [];
      if (!r.sheetOk) why.push(`A ${w.state.size}" rivet is not rated for a ${thickness}" sheet.`);
      if (r.edgeBad || !r.edgeOk) why.push('The edge distance was off: too close and the edge tears out, too far wastes the plate.');
      if (!r.pitchOk) why.push(w.state.B < r.R.B[0] ? 'Holes too close together: the part can shear like a zipper.' : 'Holes too far apart: the plate flexes between rivets.');
      finishWith(r.ok ? 'Correct. Edge distance about 2.5D and pitch 4D to 8D. Too many holes make parts shear like a zipper, so fewer well-placed rivets beat a row of closely spaced ones.' : 'Not quite. ' + why.join(' ') + ' Rule of thumb: edge about 2.5D, pitch 4D to 8D.', r.ok ? '' : 'sel');
    } }, `Rivet it (${card.hours} h)`);
    body.append(h('div', { class: 'row' },
      h('div', { class: 'col' }, w.cv, figure('std-rivet-guide')),
      h('div', { class: 'col grow' }, w.controls, h('div', { class: 'panel col' }, h('b', {}, 'Rivet guide checks'), checks), submit)));
  } else if (id === 'rule') {
    const sk = run.results.sketch, cad = run.results.cad, shop = run.results.shop;
    let hours = 1; const notes = [];
    if (!sk || !sk.parametric) { hours += 3; notes.push('Your sketch was not parametric: every dimension is edited by hand (+3 h).'); } else notes.push('Your sketch was parametric: a few dimensions updated everything (1 h).');
    if (cad && cad.organized < 0.6) { hours += 2; notes.push('Messy, unnamed CAD makes it hard for teammates to find what to change (+2 h).'); }
    if (shop && shop.pocketedEarly) { hours += 8; notes.push('You pocketed early, so every pocket has to be redone (+8 h).'); }
    body.append(h('button', { class: 'btn primary', onclick: () => {
      spend(hours); unlock('parametric'); if (shop && shop.pocketedEarly) unlock('pocket-last'); if (cad && cad.organized < 0.6) unlock('naming');
      finishWith(h('div', {}, ...notes.map((t) => h('p', {}, t)), h('p', { class: 'gold' }, `Total revision time: ${hours} h.`)));
    } }, 'Revise the design'));
  } else if (id === 'stock') {
    body.append(
      h('button', { class: 'btn', onclick: () => { spend(6); unlock('cots-stock'); finishWith('You wait three weeks for the part: 6 hours of schedule gone.'); } }, 'Wait for the backordered part (6 h)'),
      h('button', { class: 'btn', onclick: () => { spend(2); run.results.shop = run.results.shop || { weightDelta: 0, sensors: null, applied: {}, progExtra: 0 }; run.results.shop.weightDelta += 2; unlock('cots-stock'); finishWith('You use the in-stock substitute: slightly heavier, but you keep moving (2 h, +2 lb).'); } }, 'Use the in-stock substitute (2 h, +2 lb)'));
  }
  root.append(shell(card.title, null, hint(run, 'Mentors and random events happen whether you are ready or not. Handle them and move on.'), h('div', { class: 'panel' }, card.intro), body));
}
