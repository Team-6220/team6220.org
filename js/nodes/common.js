// Shared node UI helpers.
import { h } from '../ui.js';

export function shell(title, sub, ...body) {
  return h('div', { class: 'col' },
    h('div', {}, h('h2', {}, title), sub ? h('p', { class: 'muted' }, sub) : null),
    ...body);
}
export function hint(run, text) {
  if (!run.tutorial) return null;
  return h('div', { class: 'panel', style: 'border-color:#4054e4' }, h('span', { class: 'blue' }, 'Tutorial: '), text);
}
export function tags(list, cls) { return list.map((t) => h('span', { class: 'tag ' + (cls || '') }, t)); }
export function pct(x) { return Math.round(x * 100) + '%'; }
