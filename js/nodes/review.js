// Design review: inspect a robot layout, find what violates the team's standards, and say what is wrong.
// Problems you do not find become hidden flaws that show up at the first event.
import { h, clear, C, canvasPos, sfx } from '../ui.js';
import { rngFor } from '../rng.js';
import { PRINCIPLE_MAP } from '../data/principles.js';
import { spend, unlock, addFlaw, save } from '../state.js';
import { shell, hint } from './common.js';

const CW = 640, CH = 380;

function t(ctx, s, x, y, color = C.white, size = 11, align = 'left') { ctx.fillStyle = color; ctx.font = `${size}px sans-serif`; ctx.textAlign = align; ctx.fillText(s, x, y); }
function ring(ctx, x, y, r, stroke, fill, w = 2) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.stroke(); } }

// Each defect has a defective and a correct drawing in the same place, so you have to compare against the standard.
export const DEFECTS = [
  { id: 'electronics', rect: [40, 44, 150, 100], issue: 'The RoboRIO and PDH are buried under a pivot: nobody can reach them.', principle: 'electronics-place',
    flaw: { id: 'rev-elec', name: 'Electronics buried under the arm pivot', kind: 'brownout', sev: 0.45, fixHours: 8, onlyTesting: false, hint: 'Move the RoboRIO and PDH out from under the mechanism.' },
    draw(ctx, bad) {
      ctx.fillStyle = C.g4; ctx.fillRect(56, 76, 86, 46); ctx.strokeStyle = C.white; ctx.lineWidth = 1; ctx.strokeRect(56, 76, 86, 46); t(ctx, 'RoboRIO + PDH', 99, 104, C.white, 10, 'center');
      if (bad) { ring(ctx, 99, 92, 46, C.gold, 'rgba(255,163,0,0.35)', 3); t(ctx, 'arm pivot', 99, 62, C.gold, 10, 'center'); } else { ring(ctx, 250, 118, 0.1, C.gold, null, 1); }
    } },
  { id: 'tensioner', rect: [40, 282, 300, 66], issue: 'The chain run has no tensioner and no easy way to take it off.', principle: 'consistency',
    flaw: { id: 'rev-chain', name: 'Chain run without a tensioner', kind: 'chain', sev: 0.4, fixHours: 5, onlyTesting: false, hint: 'Add a tensioner or make one side easy to detach.' },
    draw(ctx, bad) {
      ring(ctx, 70, 312, 18, C.white, C.g3); ring(ctx, 300, 312, 18, C.white, C.g3);
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(70, 294); ctx.lineTo(300, 294); ctx.moveTo(70, 330); ctx.lineTo(300, 330); ctx.stroke();
      if (!bad) { ring(ctx, 185, 294, 8, C.green, C.g3); t(ctx, 'tensioner', 185, 280, C.green, 10, 'center'); }
    } },
  { id: 'access', rect: [208, 150, 132, 100], issue: 'A bolt sits right behind a wall: a screwdriver cannot reach it.', principle: 'packaging-tools',
    flaw: { id: 'rev-access', name: 'Fasteners that cannot be reached with a tool', kind: 'part', sev: 0.3, fixHours: 4, onlyTesting: false, hint: 'Leave room for the screwdriver and rivet gun.' },
    draw(ctx, bad) {
      ctx.fillStyle = C.g3; ctx.fillRect(220, 170, 90, 60); ctx.strokeStyle = C.white; ctx.strokeRect(220, 170, 90, 60);
      ring(ctx, 252, 200, 5, C.gold, C.black); ring(ctx, 290, 200, 5, C.gold, C.black);
      if (bad) { ctx.fillStyle = C.g5; ctx.fillRect(244, 152, 12, 18); ctx.fillRect(244, 230, 12, 18); t(ctx, 'wall', 262, 246, C.g5, 10); }
      else { ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(252, 150); ctx.lineTo(252, 192); ctx.stroke(); t(ctx, 'tool access', 262, 160, C.green, 10); }
    } },
  { id: 'rivets', rect: [40, 160, 150, 50], issue: 'The rivets are too close to the edge and to each other: it can shear like a zipper.', principle: 'rivets',
    flaw: { id: 'rev-rivet', name: 'Weak riveted joint (bad rivet layout)', kind: 'cycles', sev: 0.3, fixHours: 3, onlyTesting: true, hint: 'Edge about 2.5D, pitch 4D to 8D.' },
    draw(ctx, bad) {
      ctx.fillStyle = C.g3; ctx.fillRect(50, 168, 130, 36); ctx.strokeStyle = C.white; ctx.strokeRect(50, 168, 130, 36);
      const edge = bad ? 5 : 14, pitch = bad ? 10 : 30;
      for (let x = 50 + edge; x < 180 - edge + 1; x += pitch) ring(ctx, x, 168 + edge, 2.8, C.black, C.gold, 1);
      t(ctx, bad ? 'A, B too small' : 'A = 2.5D, B = 4D to 8D', 115, 222, bad ? C.red : C.green, 10, 'center');
    } },
  { id: 'tolerance', rect: [150, 236, 90, 52], issue: 'The 3D-printed part has no clearance around the bearing: it will not fit.', principle: 'tolerance',
    flaw: { id: 'rev-tol', name: 'Parts bind: no clearance on printed fit', kind: 'cycles', sev: 0.35, fixHours: 4, onlyTesting: false, hint: 'Use 1.127 in for a 1.125 in bearing and 0.015 in clearance to known parts.' },
    draw(ctx, bad) {
      ring(ctx, 195, 262, 20, bad ? C.red : C.white, null, 3); ring(ctx, 195, 262, bad ? 20 : 17, C.gold, C.g3, 2);
      t(ctx, bad ? 'bore = 1.125 in' : 'bore = 1.127 in', 195, 296 - 6, bad ? C.red : C.green, 10, 'center');
    } },
  { id: 'adjust', rect: [236, 44, 110, 92], issue: 'The shooter hood is bolted fixed: there is no way to adjust the shot.', principle: 'adjustability',
    flaw: { id: 'rev-adj', name: 'Shooter cannot be tuned (no adjustability)', kind: 'cycles', sev: 0.35, fixHours: 5, onlyTesting: true, hint: 'Add slots and multiple mounting points where accuracy matters.' },
    draw(ctx, bad) {
      ctx.fillStyle = C.g4; ctx.fillRect(250, 60, 80, 56); ctx.strokeStyle = C.white; ctx.strokeRect(250, 60, 80, 56);
      ring(ctx, 290, 96, 12, C.gold, null);
      if (bad) { ring(ctx, 262, 70, 4, C.black, C.gold, 1); ring(ctx, 318, 70, 4, C.black, C.gold, 1); t(ctx, 'hood: fixed bolts', 290, 134, C.red, 10, 'center'); }
      else { ctx.strokeStyle = C.green; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(290, 96, 34, -2.4, -0.7); ctx.stroke(); t(ctx, 'hood: slotted', 290, 134, C.green, 10, 'center'); }
    } },
  { id: 'duplicates', rect: [360, 30, 266, 150], issue: 'The same part appears twice in the assembly, so the automatic BOM is wrong.', principle: 'duplicates-bom',
    flaw: { id: 'rev-bom', name: 'Duplicate parts: the BOM is wrong, parts missing', kind: 'part', sev: 0.3, fixHours: 3, onlyTesting: false, hint: 'Keep copies in the part studio named "copy". Never duplicate in an assembly.' },
    draw(ctx, bad) {
      ctx.fillStyle = C.g2; ctx.fillRect(366, 36, 254, 138); ctx.strokeStyle = C.g4; ctx.strokeRect(366, 36, 254, 138);
      t(ctx, 'Assembly: Full Robot', 376, 54, C.gold, 12);
      const rows = bad ? ['Plate, Side', 'Plate, Side', 'Part 3 (1)', 'Gusset, Lower Front A-frame'] : ['Plate, Side', 'Plate, Side, copy (part studio)', 'Gusset, Lower Front A-frame', 'Bracket, Intake Mount'];
      rows.forEach((r, i) => t(ctx, r, 386, 78 + i * 24, bad && i < 3 ? C.red : C.white, 12));
      t(ctx, bad ? 'BOM count does not match' : 'BOM matches the part list', 376, 166, bad ? C.red : C.green, 11);
    } },
  { id: 'cg', rect: [360, 196, 266, 168], issue: 'A heavy mechanism sits high: the center of gravity is too tall and the robot can tip.', principle: 'weight-cg',
    flaw: { id: 'rev-cg', name: 'High center of gravity: the robot can tip', kind: 'tip', sev: 0.45, fixHours: 6, onlyTesting: false, hint: 'Keep heavy parts low and the CG of a pivot close to its pivot.' },
    draw(ctx, bad) {
      ctx.fillStyle = C.g2; ctx.fillRect(366, 202, 254, 156); ctx.strokeStyle = C.g4; ctx.strokeRect(366, 202, 254, 156);
      ctx.fillStyle = C.g4; ctx.fillRect(420, 310, 150, 24); ctx.strokeStyle = C.white; ctx.strokeRect(420, 310, 150, 24); ring(ctx, 438, 338, 8, C.white, C.g3); ring(ctx, 552, 338, 8, C.white, C.g3);
      const my = bad ? 232 : 290;
      ctx.fillStyle = C.gold; ctx.fillRect(480, my, 30, bad ? 78 : 20); ring(ctx, 495, bad ? 262 : 300, 6, C.black, C.white, 1);
      t(ctx, bad ? 'CG high' : 'CG low', 380, 222, bad ? C.red : C.green, 12);
    } },
];

const DECOYS = [
  { id: 'pockets', rect: [40, 222, 100, 50], draw(ctx) { ctx.fillStyle = C.g3; ctx.fillRect(48, 230, 84, 34); ctx.strokeStyle = C.white; ctx.strokeRect(48, 230, 84, 34); [[66, 247], [90, 247], [114, 247]].forEach(([x, y]) => ring(ctx, x, y, 7, C.g5, C.black, 1)); t(ctx, 'lightening, done last', 90, 278, C.g5, 10, 'center'); } },
];

export function mount(root, run, done) {
  const rng = rngFor(run.seed, 'review');
  const must = run.tutorial ? ['tolerance', 'adjust'] : [];
  const rest = rng.shuffle(DEFECTS.map((d) => d.id).filter((id) => !must.includes(id)));
  const badIds = new Set(must.concat(rest).slice(0, 5));
  const state = {}; // id -> 'found' | 'fine' | undefined
  let hover = null, selected = null, hours = 1, wrong = 0, falseAlarms = 0;
  const cv = h('canvas', { width: CW, height: CH, style: 'cursor:pointer' });
  const side = h('div', { class: 'col grow' });
  const log = h('div', { class: 'col small' });
  const spots = DEFECTS.map((d) => ({ id: d.id, rect: d.rect, def: d })).concat(DECOYS.map((d) => ({ id: d.id, rect: d.rect, decoy: d })));

  function draw() {
    const ctx = cv.getContext('2d');
    ctx.fillStyle = C.black; ctx.fillRect(0, 0, CW, CH);
    ctx.strokeStyle = C.white; ctx.lineWidth = 3; ctx.strokeRect(22, 26, 322, 326);
    t(ctx, 'ROBOT LAYOUT (top view)', 28, 20, C.g5, 11);
    DEFECTS.forEach((d) => d.draw(ctx, badIds.has(d.id)));
    DECOYS.forEach((d) => d.draw(ctx));
    spots.forEach((s) => {
      const [x, y, w, hh] = s.rect, st = state[s.id];
      if (st) { ctx.strokeStyle = st === 'found' ? C.green : C.g5; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, hh); t(ctx, st === 'found' ? 'found' : 'checked', x + 4, y + hh - 4, st === 'found' ? C.green : C.g5, 11); }
      else if (hover === s.id || selected === s.id) { ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(x, y, w, hh); ctx.setLineDash([]); }
    });
  }
  const spotAt = (p) => spots.find((s) => p.x >= s.rect[0] && p.x <= s.rect[0] + s.rect[2] && p.y >= s.rect[1] && p.y <= s.rect[1] + s.rect[3]);
  cv.addEventListener('mousemove', (e) => { const s = spotAt(canvasPos(cv, e)); const id = s ? s.id : null; if (id !== hover) { hover = id; draw(); } });
  cv.addEventListener('click', (e) => { const s = spotAt(canvasPos(cv, e)); if (s && !state[s.id]) { selected = s.id; sfx('pop'); draw(); renderSide(); } });

  function say(msg, cls) { log.prepend(h('div', { class: cls || '' }, msg)); }

  function renderSide() {
    clear(side);
    const found = DEFECTS.filter((d) => state[d.id] === 'found').length;
    side.append(h('div', { class: 'panel col' }, h('b', {}, 'Design review'), h('div', { class: 'small muted' }, 'Compare each area with our standards. Click an area, then say what is wrong, or that nothing is.'),
      h('div', { class: 'small' }, `Problems found: ${found}. Review time so far: ${hours.toFixed(1)} h.`)));
    if (selected) {
      const s = spots.find((x) => x.id === selected), isDef = !!s.def, real = isDef && badIds.has(s.id);
      const pool = DEFECTS.filter((d) => d.id !== s.id);
      const pick = (i) => pool[(d_hash(s.id) + i * 3) % pool.length].issue;
      const list = isDef ? [{ text: s.def.issue, right: real }, { text: pick(1), right: false }, { text: pick(2), right: false }, { text: 'Nothing wrong here.', right: !real }]
        : [{ text: pick(0), right: false }, { text: pick(2), right: false }, { text: 'Nothing wrong here.', right: true }];
      side.append(h('div', { class: 'panel col' }, h('b', {}, isDef ? 'What is wrong with this area?' : 'What about these pockets?'),
        ...list.sort((a, b) => a.text.localeCompare(b.text)).map((o) => h('div', { class: 'card', onclick: () => answer(s, o, real) }, h('div', { class: 'small' }, o.text)))));
    }
    side.append(h('div', { class: 'panel col' }, h('b', {}, 'Notes'), log));
    side.append(h('button', { class: 'btn primary', onclick: finish }, 'Submit review'));
  }

  function answer(s, o, real) {
    if (!s.def) { // decoy: it is fine
      if (o.right) { state[s.id] = 'fine'; sfx('click'); say('Correct: lightening patterns are fine, and they are done last.'); selected = null; }
      else { falseAlarms++; hours += 1; state[s.id] = 'fine'; sfx('deny'); say('That is a nitpick: wasted an hour on something that is fine (+1 h). Chasing details is how design hours disappear.', 'red'); selected = null; }
    } else if (real) {
      if (o.right) { state[s.id] = 'found'; sfx('coin'); say(`Found it: ${s.def.issue}`, 'green'); selected = null; }
      else { wrong++; hours += 0.5; sfx('deny'); say('Not quite. Look again (+0.5 h).', 'red'); }
    } else if (o.right) { state[s.id] = 'fine'; sfx('click'); say(`Correct: this follows the standard. (${PRINCIPLE_MAP[s.def.principle].title})`); selected = null; }
    else { falseAlarms++; hours += 1; state[s.id] = 'fine'; sfx('deny'); say('That area follows our standard. A false alarm costs an hour (+1 h).', 'red'); selected = null; }
    draw(); renderSide();
  }

  function finish() {
    const found = DEFECTS.filter((d) => state[d.id] === 'found');
    const missed = DEFECTS.filter((d) => badIds.has(d.id) && state[d.id] !== 'found');
    spend(Math.round(hours * 2) / 2); sfx('confirm');
    unlock('design-review');
    found.forEach((d) => unlock(d.principle));
    missed.forEach((d) => addFlaw(Object.assign({ found: false }, d.flaw)));
    run.results.review = { found: found.length, missed: missed.length, falseAlarms };
    save();
    clear(root);
    root.append(shell('Design review: results', null,
      h('div', { class: 'panel col' },
        h('h3', { class: missed.length ? 'gold' : 'green' }, `${found.length} of ${badIds.size} problems found`),
        found.length ? found.map((d) => h('div', { class: 'small' }, h('b', { class: 'green' }, 'Fixed on paper: '), d.issue, h('div', { class: 'gold' }, 'Principle: ' + PRINCIPLE_MAP[d.principle].title))) : null,
        missed.length ? missed.map((d) => h('div', { class: 'small' }, h('b', { class: 'red' }, 'Missed: '), d.issue, h('div', { class: 'muted' }, 'This will show up later as a hidden flaw.'))) : h('div', { class: 'small green' }, 'Nothing missed. Everything that would have broken was caught before metal was cut.'),
        falseAlarms ? h('div', { class: 'small muted' }, `${falseAlarms} false alarm${falseAlarms > 1 ? 's' : ''} cost extra time.`) : null),
      h('button', { class: 'btn primary', onclick: done }, 'Continue')));
  }

  draw();
  root.append(shell('Design review', 'Fresh eyes before metal is cut. Five things violate our standards; find them without nitpicking.',
    hint(run, 'Compare each area to the standard: tool access, rivet spacing, tolerances, electronics, adjustability, BOM, tipping.'),
    h('div', { class: 'row' }, h('div', { class: 'col' }, cv), side)));
  renderSide();
}

function d_hash(s) { let x = 7; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) % 997; return x; }
