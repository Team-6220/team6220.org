// Mentor / event cards: rivet quiz, rule change, out-of-stock supplier.
import { h, clear } from '../ui.js';
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
    card.options.forEach((o) => {
      body.append(h('div', { class: 'card', onclick: () => {
        spend(card.hours); unlock('rivets');
        if (!o.good) addFlaw({ id: 'weakJoint', name: 'Weak riveted joint (bad layout)', sev: 0.3, kind: 'cycles', fixHours: 3, onlyTesting: true, hint: 'Edge about 2.5D, pitch 4D to 8D.', found: false });
        finishWith(o.good ? 'Correct. Edge distance about 2.5D (0.47") and pitch 4D to 8D (0.75" to 1.5"). Too many holes make parts shear like a zipper.' : 'Not quite. ' + o.why + ' Rule of thumb: edge about 2.5D, pitch 4D to 8D.', o.good ? '' : 'sel');
      } }, o.text));
    });
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
