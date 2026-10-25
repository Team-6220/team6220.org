// Small DOM helpers, toast, HUD.
import { derive, TOTAL_HOURS, MAX_COMPLEXITY } from './sim/robotModel.js';

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

let toastTimer = null;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.display = 'none'; }, 3200);
}

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

export function setHud(run) {
  const el = $('#hud');
  if (!run) { el.style.display = 'none'; return; }
  el.style.display = 'block'; clear(el);
  const s = derive(run);
  const b = s.budget;
  const pctOf = (x) => Math.max(0, (x / TOTAL_HOURS) * 100);
  const used = b.design + b.mfgNeed + b.progNeed;
  const over = used > TOTAL_HOURS;
  const clock = h('div', { class: 'clock', title: 'Season hours: design / manufacture / program / driver practice' },
    h('div', { class: 'c-design', style: `width:${pctOf(b.design)}%` }, 'Design ' + Math.round(b.design)),
    h('div', { class: 'c-mfg', style: `width:${pctOf(b.mfgNeed)}%` }, 'Build ' + Math.round(b.mfgNeed)),
    h('div', { class: 'c-prog', style: `width:${pctOf(b.progNeed)}%` }, 'Code ' + Math.round(b.progNeed)),
    over ? h('div', { class: 'c-over', style: 'flex:1' }, 'OVER by ' + Math.round(used - TOTAL_HOURS) + ' (no practice)')
      : h('div', { class: 'c-prac', style: 'flex:1' }, 'Practice ' + Math.round(b.practice)));
  el.append(h('div', { class: 'hud-row' },
    h('div', { style: 'flex:1' }, h('div', { class: 'small muted' }, 'SEASON CLOCK (' + TOTAL_HOURS + ' hours)'), clock),
    meter('Weight', s.weight, s.cap, `${Math.round(s.weight)} / ${s.cap} lb`, s.over),
    meter('Complexity', s.complexity, MAX_COMPLEXITY, `${s.complexity.toFixed(1)} / ${MAX_COMPLEXITY}`, s.complexity > 22),
    h('div', { class: 'meter' }, h('div', { class: 'lbl' }, h('span', {}, 'Cycle time')), h('div', { class: 'mono' }, s.picks.drivetrain && s.picks.intake && s.picks.scorer ? s.effCycle.toFixed(1) + ' s' : '--'))));
}
