// Renders the season map and routes clicks to available nodes.
import { h } from '../ui.js';
import { NODE_INFO, nodeLabel } from './mapGen.js';

export function availableNodes(run) {
  const layers = run.map.layers;
  if (!run.cur) return layers[0].map((_, i) => ({ l: 0, i }));
  const { l, i } = run.cur;
  if (l + 1 >= layers.length) return [];
  return layers[l][i].next.map((j) => ({ l: l + 1, i: j }));
}

export function renderMap(run, onPick) {
  const layers = run.map.layers, N = layers.length;
  const W = 1230, H = 320;
  const step = Math.min(120, (W - 80) / Math.max(1, N - 1));
  const pos = (l, i) => {
    const k = layers[l].length;
    return { x: 20 + l * step, y: H / 2 - 50 + (i - (k - 1) / 2) * 90 };
  };
  const avail = availableNodes(run);
  const isAvail = (l, i) => avail.some((a) => a.l === l && a.i === i);
  const wrap = h('div', { class: 'map', style: `width:${W}px` });
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  layers.forEach((layer, l) => layer.forEach((nd, i) => nd.next.forEach((j) => {
    const a = pos(l, i), b = pos(l + 1, j);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', a.x + 60); line.setAttribute('y1', a.y + 30);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y + 30);
    const live = run.cur && run.cur.l === l && run.cur.i === i;
    line.setAttribute('stroke', live ? '#ffa300' : '#444444'); line.setAttribute('stroke-width', live ? 3 : 2);
    svg.appendChild(line);
  })));
  wrap.appendChild(svg);
  layers.forEach((layer, l) => layer.forEach((nd, i) => {
    const p = pos(l, i);
    const onPath = run.path.some((q) => q.l === l && q.i === i);
    const av = isAvail(l, i);
    const cls = 'node' + (av ? ' avail' : '') + (onPath ? ' done' : '') + (!av && !onPath ? ' locked' : '');
    const el = h('div', { class: cls, style: `left:${p.x}px;top:${p.y}px`, title: nodeLabel(nd), onclick: av ? () => onPick(nd, l, i) : null }, NODE_INFO[nd.type].letter);
    wrap.appendChild(el);
    const lw = Math.min(step - 2, 104);
    wrap.appendChild(h('div', { class: 'node-label', style: `width:${lw}px;left:${p.x + 30 - lw / 2}px;top:${p.y + 64}px` }, nodeLabel(nd)));
  }));
  return wrap;
}
