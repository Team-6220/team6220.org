// Interactive rivet layout (6220 Design Standards, Art. 4: Mentor Bruce's rivet guide).
import { h, C } from '../ui.js';

// Rivet guide table (inches): edge distance A, spacing B range, sheet thickness range.
export const RIVETS = {
  '3/16': { D: 0.1875, A: 0.469, Amin: 0.375, B: [0.75, 1.5], sheet: [0.0625, 0.1875] },
  '1/4': { D: 0.25, A: 0.625, Amin: 0.5, B: [1.0, 2.0], sheet: [0.125, 0.25] },
};
const PX = 120; // pixels per inch
const PLATE_W = 3.6, PLATE_H = 1.5;

export function createRivetWidget(thickness, onChange) {
  const st = { size: '3/16', A: 0.2, B: 0.4 };
  const cv = h('canvas', { width: 560, height: 300 });

  function check() {
    const R = RIVETS[st.size];
    const sheetOk = thickness >= R.sheet[0] - 1e-6 && thickness <= R.sheet[1] + 1e-6;
    const edgeOk = Math.abs(st.A - 2.5 * R.D) <= 0.1;
    const edgeBad = st.A < R.Amin - 0.001;
    const pitchOk = st.B >= R.B[0] - 0.02 && st.B <= R.B[1] + 0.02;
    return { sheetOk, edgeOk, edgeBad, pitchOk, ok: sheetOk && edgeOk && pitchOk, R };
  }

  function draw() {
    const ctx = cv.getContext('2d'), r = check(), R = r.R;
    ctx.fillStyle = C.black; ctx.fillRect(0, 0, 560, 300);
    const ox = 30, oy = 62;
    ctx.fillStyle = C.g3; ctx.fillRect(ox, oy, PLATE_W * PX, PLATE_H * PX);
    ctx.strokeStyle = C.white; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, PLATE_W * PX, PLATE_H * PX);
    // rivets along the top edge
    const pts = [];
    for (let x = st.A; x <= PLATE_W - st.A + 1e-6; x += st.B) pts.push(x);
    const y = st.A;
    // zipper crack when the holes are too close, torn edge when the edge distance is too small
    if (!r.pitchOk && st.B < R.B[0]) { ctx.strokeStyle = C.red; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach((x, i) => { const px = ox + x * PX, py = oy + y * PX; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py + (i % 2 ? 6 : -6)); }); ctx.stroke(); }
    if (r.edgeBad) { ctx.strokeStyle = C.red; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach((x, i) => { const px = ox + x * PX; ctx.moveTo(px, oy); ctx.lineTo(px + (i % 2 ? 5 : -5), oy + y * PX - R.D * PX / 2); }); ctx.stroke(); }
    pts.forEach((x) => { ctx.beginPath(); ctx.arc(ox + x * PX, oy + y * PX, Math.max(3, R.D * PX / 2), 0, 7); ctx.fillStyle = C.gold; ctx.fill(); ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.stroke(); });
    // dimension lines
    const dim = (x0, y0, x1, y1, label, lx, ly) => {
      ctx.strokeStyle = C.white; ctx.fillStyle = C.white; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(label, lx, ly);
    };
    dim(ox, oy - 14, ox + st.A * PX, oy - 14, `A ${st.A.toFixed(2)}"`, ox, oy - 20);
    if (pts.length > 1) dim(ox + pts[0] * PX, oy + y * PX + 22, ox + pts[1] * PX, oy + y * PX + 22, `B ${st.B.toFixed(2)}"`, ox + pts[0] * PX, oy + y * PX + 38);
    ctx.fillStyle = C.gold; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`Rivet ${st.size}" (D = ${R.D}")   Sheet ${thickness}" thick`, ox, 24);
    ctx.fillStyle = C.g5; ctx.font = '12px sans-serif';
    ctx.fillText(`Guide: A about 2.5D = ${(2.5 * R.D).toFixed(2)}"   B ${R.B[0]}" to ${R.B[1]}" (4D to 8D)`, ox, oy + PLATE_H * PX + 24);
    ctx.fillText(`Sheet range for ${st.size}" rivets: ${R.sheet[0]}" to ${R.sheet[1]}"`, ox, oy + PLATE_H * PX + 42);
    onChange(r);
  }

  function slider(label, key, min, max, step, fmt) {
    const val = h('b', { class: 'gold' }, fmt(st[key]));
    return h('div', {}, h('div', { class: 'small' }, label, ' ', val),
      h('input', { type: 'range', min, max, step, value: st[key], oninput: (e) => { st[key] = +e.target.value; val.textContent = fmt(st[key]); draw(); } }));
  }
  const sizeBtns = h('div', { class: 'row' }, ...Object.keys(RIVETS).map((k) => h('button', { class: 'btn' + (st.size === k ? ' sel' : ''), onclick: (e) => { st.size = k; [...e.target.parentNode.children].forEach((b) => b.classList.toggle('sel', b === e.target)); draw(); } }, `${k}" rivet`)));
  const controls = h('div', { class: 'col' }, sizeBtns, slider('Edge distance A (inches)', 'A', 0.1, 1.2, 0.01, (v) => v.toFixed(2) + '"'), slider('Rivet spacing B (inches)', 'B', 0.3, 2.4, 0.01, (v) => v.toFixed(2) + '"'));
  draw();
  return { cv, controls, state: st, check, draw };
}
