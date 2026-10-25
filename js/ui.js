// Small DOM helpers, achievement cards, HUD.
import { derive, TOTAL_HOURS, MAX_COMPLEXITY } from './sim/robotModel.js';
import { SEASONS } from './data/seasons.js';

export const C = { gold: '#ffa300', white: '#ffffff', black: '#000000', g1: '#111111', g2: '#1c1c1c', g3: '#2a2a2a', g4: '#444444', g5: '#8a8a8a', blue: '#4054e4', red: '#e0443a', green: '#52b86a' };

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export const $ = (sel) => document.querySelector(sel);

// ---- Achievement / notification cards: stay until dismissed ----
let audio = null;
export function chime() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    [[660, 0], [880, 0.12], [1320, 0.24]].forEach(([f, d]) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.15, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.32);
      o.connect(g); g.connect(audio.destination); o.start(t + d); o.stop(t + d + 0.34);
    });
  } catch (e) { /* audio unavailable */ }
}
function card(title, text, sub, sound) {
  const el = h('div', { class: 'ach' },
    h('div', { class: 'grow' }, h('b', {}, title), text ? h('div', { class: 'small' }, text) : null, sub ? h('div', { class: 'small', style: 'font-weight:700' }, sub) : null),
    h('button', { class: 'ach-x', title: 'Dismiss', onclick: () => el.remove() }, '×'));
  $('#toast').append(el);
  if (sound) chime();
}
export function achievement(p, count, total) { card('Principle unlocked: ' + p.title, p.text, `Principles ${count}/${total}`, true); }
export function notify(msg) { card(msg); }

export function canvasPos(canvas, e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
}
export function fit() {
  const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
  $('#app').style.transform = `translate(-50%, -50%) scale(${s})`;
}

function meter(label, value, max, text, bad) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return h('div', { class: 'meter' + (bad ? ' bad' : '') },
    h('div', { class: 'lbl' }, h('span', {}, label), h('span', {}, text)),
    h('div', { class: 'bar' }, h('div', { style: `width:${pct}%` })));
}

function goalText(run, s) {
  const v = run.req ? run.req.optVar : null;
  if (!v) return null;
  const have = s.picks.drivetrain && s.picks.intake && s.picks.scorer;
  switch (v) {
    case 'cycle': return 'Cycle time' + (have ? ` (now ${s.effCycle.toFixed(1)} s)` : '');
    case 'auto': return `Autonomous points (auto reliability ${Math.round(s.autoRel * 100)}%)`;
    case 'endgame': return `Endgame reliability (${s.picks.endgame && s.picks.endgame.id !== 'none' ? Math.round(s.endgameRel * 100) + '%' : 'no endgame mechanism yet'})`;
    default: return `Defense resilience (drivetrain reliability ${Math.round(s.dtRel * 100)}%, ${Math.round(s.weight)} lb)`;
  }
}

export function setHud(run) {
  const el = $('#hud');
  if (!run) { el.style.display = 'none'; return; }
  el.style.display = 'block'; clear(el);
  const s = derive(run);
  const b = s.budget;
  const pctOf = (x) => Math.max(0, (x / TOTAL_HOURS) * 100);
  const used = b.design + b.mfgNeed + b.progNeed;
  const over = used > TOTAL_HOURS;
  const clock = h('div', { class: 'clock' },
    h('div', { class: 'c-design', title: 'Design hours spent', style: `width:${pctOf(b.design)}%` }),
    h('div', { class: 'c-mfg', title: 'Manufacturing hours needed', style: `width:${pctOf(b.mfgNeed)}%` }),
    h('div', { class: 'c-prog', title: 'Programming hours needed', style: `width:${pctOf(b.progNeed)}%` }),
    h('div', { class: over ? 'c-over' : 'c-prac', style: 'flex:1', title: 'Driver practice hours left' }));
  const legend = h('div', { class: 'legend' },
    h('span', {}, h('i', { class: 'c-design' }), 'Design ', h('b', {}, Math.round(b.design))),
    h('span', {}, h('i', { class: 'c-mfg' }), 'Build ', h('b', {}, Math.round(b.mfgNeed))),
    h('span', {}, h('i', { class: 'c-prog' }), 'Code ', h('b', {}, Math.round(b.progNeed))),
    over ? h('span', { class: 'red' }, h('i', { class: 'c-over' }), 'Practice ', h('b', {}, 'none: over by ' + Math.round(used - TOTAL_HOURS)))
      : h('span', {}, h('i', { class: 'c-prac' }), 'Practice ', h('b', {}, Math.round(b.practice))));
  el.append(h('div', { class: 'hud-row' },
    h('div', { style: 'flex:1' }, h('div', { class: 'small muted' }, `SEASON CLOCK (${TOTAL_HOURS} hours)`), clock, legend),
    meter('Weight', s.weight, s.cap, `${Math.round(s.weight)} / ${s.cap} lb`, s.over),
    meter('Complexity', s.complexity, MAX_COMPLEXITY, `${s.complexity.toFixed(1)} / ${MAX_COMPLEXITY}`, s.complexity > 22),
    h('div', { class: 'meter' }, h('div', { class: 'lbl' }, h('span', {}, 'Cycle time')), h('div', { class: 'mono' }, s.picks.drivetrain && s.picks.intake && s.picks.scorer ? s.effCycle.toFixed(1) + ' s' : '--'))));
  const goal = goalText(run, s);
  if (goal) {
    const season = SEASONS[run.seasonId];
    const tasks = run.req.tasks.map((id) => season.tasks.find((t) => t.id === id).name).join(', ');
    el.append(h('div', { class: 'goal' }, h('b', { class: 'gold' }, 'GOAL '), 'Optimize: ', h('b', {}, goal), h('span', { class: 'muted' }, '   ·   Building for: ' + tasks)));
  }
}
