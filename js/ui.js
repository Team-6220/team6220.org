// Small DOM helpers, achievement cards, HUD.
import { derive, TOTAL_HOURS, MAX_COMPLEXITY } from './sim/robotModel.js';
import { SEASONS } from './data/seasons.js';
import { meta, saveMeta } from './state.js';

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

// ---- Sound (small synthesized effects; can be muted) ----
let audio = null;
const SFX = {
  chime: [[660, 0, 0.3, 'triangle', 0.15], [880, 0.12, 0.3, 'triangle', 0.15], [1320, 0.24, 0.3, 'triangle', 0.15]],
  blip: [[880, 0, 0.07, 'triangle', 0.07]],
  buzz: [[110, 0, 0.4, 'sawtooth', 0.09], [90, 0.15, 0.3, 'sawtooth', 0.09]],
  start: [[440, 0, 0.18, 'square', 0.06], [440, 0.45, 0.18, 'square', 0.06], [880, 0.9, 0.4, 'square', 0.06]],
  end: [[220, 0, 0.9, 'square', 0.07]],
  win: [[523, 0, 0.25, 'triangle', 0.14], [659, 0.14, 0.25, 'triangle', 0.14], [784, 0.28, 0.25, 'triangle', 0.14], [1047, 0.44, 0.5, 'triangle', 0.14]],
  lose: [[330, 0, 0.3, 'sawtooth', 0.07], [262, 0.22, 0.3, 'sawtooth', 0.07], [196, 0.44, 0.5, 'sawtooth', 0.07]],
  click: [[600, 0, 0.05, 'triangle', 0.05]],
};
export function soundOn() { return !meta.mute; }
export function setSound(on) { meta.mute = !on; saveMeta(); }
export function sfx(kind) {
  if (meta.mute || !SFX[kind]) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime;
    SFX[kind].forEach(([f, d, len, type, vol]) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(vol, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + len + 0.02);
      o.connect(g); g.connect(audio.destination); o.start(t + d); o.stop(t + d + len + 0.04);
    });
  } catch (e) { /* audio unavailable */ }
}
export const chime = () => sfx('chime');

// ---- Embedded YouTube player in an overlay ----
export function openVideo(videoId, title) {
  const m = $('#modal');
  const close = () => { clear(m); m.style.display = 'none'; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  clear(m); m.style.display = 'flex';
  m.append(h('div', { class: 'modal-box' },
    h('div', { class: 'row', style: 'align-items:center;margin-bottom:6px' }, h('b', { class: 'grow' }, title), h('button', { class: 'ach-x', title: 'Close', onclick: close }, '×')),
    h('iframe', { width: 854, height: 480, src: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`, title, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin', style: 'border:2px solid #444;display:block;background:#000' }),
    h('div', { class: 'small muted', style: 'margin-top:6px' }, 'Press Esc or × to close.')));
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
