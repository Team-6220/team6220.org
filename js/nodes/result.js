// Season result: verdict, robot yearbook, per-event story, debrief and next-time advice.
import { h, C, sfx } from '../ui.js';
import { SEASONS } from '../data/seasons.js';
import { PRINCIPLES, PRINCIPLE_MAP, SLICE_IDS } from '../data/principles.js';
import { derive } from '../sim/robotModel.js';
import { archetype, SLOT_NAMES } from '../data/archetypes.js';
import { meta, saveMeta, clearRun } from '../state.js';
import { rankChart } from './event.js';

const VERDICT = {
  Winner: 'Championship winners!', Finalist: 'Championship finalists', Semifinalist: 'Championship semifinalists',
  Quarterfinalist: 'Championship quarterfinalists', 'Not selected': 'Missed the playoffs at the Championship',
};

function yearbook(run, s) {
  const cv = h('canvas', { width: 380, height: 250 });
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.black; ctx.fillRect(0, 0, 380, 250);
  const S = 5.2, fx = 20, fy = 40, fw = 28 * S, fh = 28 * S;
  const sides = s.sides;
  // frame and bumpers
  ctx.fillStyle = C.g3; ctx.fillRect(fx, fy, fw, fh);
  ctx.strokeStyle = C.white; ctx.lineWidth = 4; ctx.strokeRect(fx, fy, fw, fh);
  ctx.fillStyle = C.g4;
  [[8, 8], [fw - 24, 8], [8, fh - 24], [fw - 24, fh - 24]].forEach(([x, y]) => ctx.fillRect(fx + x, fy + y, 16, 16));
  ctx.fillStyle = C.gold; ctx.fillRect(sides.intake === 'front' ? fx + fw - 12 : fx, fy + 16, 12, fh - 32);
  ctx.fillStyle = C.blue; ctx.fillRect(sides.scorer === 'front' ? fx + fw - 40 : fx + 8, fy + fh / 2 - 22, 32, 44);
  const eg = s.picks.endgame && s.picks.endgame.id !== 'none';
  if (eg) { ctx.fillStyle = C.white; ctx.fillRect(fx + fw / 2 - 12, fy + 10, 24, 20); }
  ctx.fillStyle = C.g5; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('front', fx + fw / 2, fy - 8); ctx.fillText('6220', fx + fw / 2, fy + fh / 2 + 4);
  ctx.textAlign = 'left'; ctx.font = '13px sans-serif';
  let y = 50;
  const line = (label, text, color) => { ctx.fillStyle = C.g5; ctx.fillText(label, 190, y); ctx.fillStyle = color || C.white; ctx.fillText(text, 190, y + 15); y += 36; };
  ctx.fillStyle = C.gold; ctx.font = 'bold 14px sans-serif'; ctx.fillText('ROBOT YEARBOOK', 190, 18); ctx.font = '13px sans-serif';
  for (const slot of ['drivetrain', 'intake', 'scorer', 'endgame']) {
    const d = run.design[slot];
    const a = d ? archetype(run.seasonId, slot, d.id) : null;
    line(SLOT_NAMES[slot], a ? a.name : 'none', a ? C.white : C.g5);
  }
  ctx.fillStyle = C.g5; ctx.fillText(`${Math.round(s.weight)} lb · complexity ${s.complexity.toFixed(1)}`, 20, 220);
  ctx.fillText(`cycle ${s.effCycle.toFixed(1)} s`, 20, 238);
  return cv;
}

function advice(run, s, season) {
  const out = [];
  const optionalSkipped = run.plan.flatMap((p) => p.items).filter((i) => !i.required && i.skip && !run.completed[i.key]);
  optionalSkipped.slice(0, 2).forEach((i) => out.push(`You skipped "${i.label}". ${i.skip.replace(/^Skip: /, '')}`));
  if (s.budget.practice < 30) out.push(`Driver practice was only ${Math.max(0, Math.round(s.budget.practice))} hours. Design and build ate the clock, so your drivers were rusty. Get a working idea out sooner.`);
  const scratch = ['drivetrain', 'intake', 'scorer', 'endgame'].filter((sl) => run.design[sl] && run.design[sl].source === 'scratch' && run.design[sl].id !== 'none').length;
  if (scratch >= 3) out.push('You built almost everything from scratch. Steal from the best: adopting published designs leaves hours for testing and practice.');
  if (scratch === 0) out.push('You never built a mechanism from scratch. Innovating on one part gives a chance of a breakthrough.');
  if (s.complexity > 22) out.push(`Complexity ${s.complexity.toFixed(0)} is high. Every extra mechanism costs weight, hours and reliability. Try building less robot.`);
  if (s.over) out.push('You were over the weight limit. Track weight from the master sketch onward.');
  if (!run.events.length || run.events.every((e) => e.playoff.result === 'Not selected')) out.push('Rank high in qualifications to get picked. Cycle speed and reliability are what captains look for.');
  if (out.length === 0) out.push('A solid season. Try a different game or a more ambitious design and see how the tradeoffs change.');
  return out.slice(0, 4);
}

export function mount(root, run, onNew, onMenu) {
  const season = SEASONS[run.seasonId];
  const s = derive(run);
  const total = run.events.reduce((t, e) => t + e.score, 0);
  const hit = SLICE_IDS.filter((id) => run.triggered.includes(id));
  if (!run.done) {
    run.done = true; run.score = total;
    meta.runsDone++; if (run.tutorial) meta.tutorialDone = true;
    if (!meta.best[run.seasonId] || total > meta.best[run.seasonId]) meta.best[run.seasonId] = total;
    run.earned = Math.round(total * 0.4) + (run.events.some((e) => e.playoff.result === 'Winner') ? 20 : 0) + run.events.reduce((a, e) => a + (e.awards ? e.awards.length * 3 : 0), 0);
    meta.points = (meta.points || 0) + run.earned;
    saveMeta(); clearRun();
  }
  const best = meta.best[run.seasonId];
  const champ = run.events.find((e) => e.idx === 2), regional = run.events.find((e) => e.idx === 1);
  const verdict = champ ? VERDICT[champ.playoff.result] : 'Season complete';
  const regionalLine = regional ? (regional.playoff.result === 'Winner' ? 'Regional winners' : regional.playoff.result === 'Not selected' ? 'Not picked at the Regional' : `Regional ${regional.playoff.result.toLowerCase()}`) : '';
  const optNames = { cycle: 'cycle time ' + s.effCycle.toFixed(1) + ' s', throughput: s.throughput.toFixed(1) + ' points per second of throughput', auto: 'autonomous', endgame: 'endgame reliability', defense: 'defense' };
  const opt = optNames[run.req ? run.req.optVar : 'cycle'];
  const lab = (id) => { const l = season.opt && season.opt.labels && season.opt.labels[id]; return l ? l[0] : optNames[id]; };
  const optRight = run.req && season.opt && run.req.optVar === season.opt.best;

  // What went wrong most often
  const counts = {};
  run.events.forEach((e) => (e.incidents || []).forEach((i) => { counts[i.principle] = counts[i.principle] || { n: 0, title: i.title }; counts[i.principle].n++; }));
  const top = Object.entries(counts).sort((a, b) => b[1].n - a[1].n).slice(0, 3);
  const shareText = `WingIt: ${season.year} ${season.name}, seed ${run.seed}: ${total} points, ${verdict}. ${hit.length}/${SLICE_IDS.length} principles.`;
  const copyBtn = h('button', { class: 'btn', onclick: () => { try { navigator.clipboard.writeText(shareText); copyBtn.textContent = 'Copied'; } catch (e) { copyBtn.textContent = shareText; } } }, 'Copy result and seed');
  if (champ && champ.playoff.result === 'Winner') sfx('win'); else sfx('chime');

  const eventCard = (e) => h('div', { class: 'panel col grow' },
    h('h3', {}, e.idx === 1 ? 'Regional' : 'Championship'),
    h('div', { class: e.playoff.result === 'Winner' ? 'gold' : '', style: 'font-size:20px' }, e.playoff.result === 'Winner' ? 'Event winners!' : e.playoff.result === 'Not selected' ? 'Qualifications only' : e.playoff.result),
    h('div', { class: 'small' }, `Rank ${e.rank} · ${e.wins}-${6 - e.wins} · avg ${e.avg.toFixed(0)} pts · +${e.score} points`),
    rankChart(e.rankPath, 300, 100),
    e.awards && e.awards.length ? h('div', {}, ...e.awards.map((a) => h('span', { class: 'tag warn' }, a))) : h('div', { class: 'small muted' }, 'No awards'));

  root.append(h('div', { class: 'col' },
    h('div', { class: 'row' },
      h('div', { class: 'panel col grow' },
        h('div', { class: 'small muted' }, `${season.year} ${season.name} · seed ${run.seed}`),
        h('h1', { class: champ && champ.playoff.result === 'Winner' ? 'gold' : '' }, verdict),
        regionalLine ? h('div', { class: 'small' }, regionalLine) : null,
        h('div', { style: 'font-size:34px', class: 'gold mono' }, total + ' pts'),
        h('div', { class: 'small muted' }, 'Best on this season: ' + best + (total >= best ? ' (new best)' : '')),
        h('div', { class: 'small gold' }, `Team points earned: +${run.earned || 0} (you now have ${meta.points}). Spend them on upgrades from the menu.`),
        h('div', { class: 'small' }, `Optimized for ${opt}. Hours: design ${Math.round(s.budget.design)}, build ${Math.round(s.budget.mfgNeed)}, code ${Math.round(s.budget.progNeed)}, practice ${Math.max(0, Math.round(s.budget.practice))}.`),
        h('div', { class: 'row', style: 'margin-top:6px' }, copyBtn)),
      yearbook(run, s)),
    h('div', { class: 'row' }, ...run.events.map(eventCard)),
    season.opt ? h('div', { class: 'panel col' }, h('h3', {}, 'What decided this game'),
      h('div', { class: 'small' }, `The variable that mattered most in ${season.year}: `, h('b', { class: 'gold' }, lab(season.opt.best)), '. You chose ', h('b', {}, run.req ? lab(run.req.optVar) : 'nothing'), optRight ? ' (right call: your robot got a focus bonus).' : '.'),
      h('div', { class: 'small muted' }, season.opt.why),
      season.real ? h('div', { class: 'small' }, h('b', {}, 'In the real season: '), season.real, h('span', { class: 'muted' }, ' (from our notes; the team should verify)')) : null) : null,
    h('div', { class: 'row' },
      h('div', { class: 'panel col grow' }, h('h3', {}, 'What cost you the most'),
        top.length ? top.map(([id, c]) => h('div', { class: 'small' }, h('b', { class: 'red' }, `${c.n}x ${c.title}`), PRINCIPLE_MAP[id] ? h('div', { class: 'gold' }, 'Lesson: ' + PRINCIPLE_MAP[id].title + '. ' + PRINCIPLE_MAP[id].text) : null))
          : h('div', { class: 'small muted' }, 'Almost nothing went wrong in a match. That is the result of testing and simple design.')),
      h('div', { class: 'panel col grow' }, h('h3', {}, 'Try next time'), ...advice(run, s, season).map((t) => h('div', { class: 'small' }, '• ' + t)))),
    h('div', { class: 'panel' }, h('h3', {}, `Principles you met this season: ${hit.length} of ${SLICE_IDS.length}`),
      h('div', { class: 'grid3' }, ...PRINCIPLES.filter((p) => p.slice).map((p) => h('div', { class: 'principle' + (run.triggered.includes(p.id) ? '' : ' locked') }, h('b', {}, p.title), h('div', { class: 'small' }, run.triggered.includes(p.id) ? p.src : 'Not met this run'))))),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: onNew }, 'New random season'), h('button', { class: 'btn', onclick: onMenu }, 'Main menu'))));
}
