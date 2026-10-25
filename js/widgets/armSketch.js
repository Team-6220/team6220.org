// Simplified master sketch: drag the pivot, set the arm length so the tip path passes through the scoring target.
import { h, C, canvasPos } from '../ui.js';

const SX = 6, X0 = 20, CW = 640, CH = 380; // world x range -20..80 in, y 0..60 in
const sx = (x) => (x + X0) * SX;
const sy = (y) => 372 - y * SX;

export function createArmSketch(season, reach) {
  const target = { x: 28 + reach.x, y: reach.h };
  const st = { px: 14, py: 20, L: 20, motorAtEnd: false, parametric: false, polish: 0, polishSteps: 0 };
  const TOL = 3.5;
  const cv = h('canvas', { width: CW, height: CH });
  const listeners = [];

  function check() {
    const dx = target.x - st.px, dy = target.y - st.py;
    const d = Math.hypot(dx, dy), ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const reachOk = Math.abs(d - st.L) <= TOL && ang >= -30 && ang <= 180;
    const stowOk = st.px - st.L >= -season.extension && st.py <= season.heightLimit;
    return { reachOk, stowOk, d, ang, dims: st.parametric ? 3 : 4 };
  }

  function draw() {
    const ctx = cv.getContext('2d'), r = check();
    ctx.fillStyle = C.black; ctx.fillRect(0, 0, CW, CH);
    ctx.strokeStyle = C.g4; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, sy(0)); ctx.lineTo(CW, sy(0)); ctx.stroke();
    ctx.fillStyle = C.g4; ctx.fillRect(sx(0), sy(6), 28 * SX, 6 * SX);
    ctx.strokeStyle = C.white; ctx.strokeRect(sx(0), sy(6), 28 * SX, 6 * SX);
    ctx.setLineDash([6, 5]); ctx.strokeStyle = C.gold;
    ctx.beginPath(); ctx.moveTo(0, sy(season.heightLimit)); ctx.lineTo(CW, sy(season.heightLimit)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx(28 + season.extension), 0); ctx.lineTo(sx(28 + season.extension), CH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx(-season.extension), 0); ctx.lineTo(sx(-season.extension), CH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.gold; ctx.font = '11px sans-serif';
    ctx.fillText(`height limit ${season.heightLimit}"`, 6, sy(season.heightLimit) - 4);
    ctx.fillText('extension limit', sx(28 + season.extension) + 4, 14);
    ctx.fillText('rear limit', sx(-season.extension) + 4, 14);
    // tip path (circle)
    ctx.setLineDash([3, 4]); ctx.strokeStyle = C.g5;
    ctx.beginPath(); ctx.arc(sx(st.px), sy(st.py), st.L * SX, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // target
    ctx.strokeStyle = r.reachOk ? C.green : C.red; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx(target.x), sy(target.y), TOL * SX, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = r.reachOk ? C.green : C.red; ctx.beginPath(); ctx.arc(sx(target.x), sy(target.y), 4, 0, 7); ctx.fill();
    ctx.fillStyle = C.white; ctx.fillText('scoring target', sx(target.x) + 12, sy(target.y) + 4);
    // arm in scoring pose and stow pose
    const ang = Math.atan2(target.y - st.py, target.x - st.px);
    ctx.strokeStyle = C.gold; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(sx(st.px), sy(st.py));
    ctx.lineTo(sx(st.px + Math.cos(ang) * st.L), sy(st.py + Math.sin(ang) * st.L)); ctx.stroke();
    ctx.strokeStyle = r.stowOk ? C.g5 : C.red; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx(st.px), sy(st.py));
    ctx.lineTo(sx(st.px - st.L), sy(st.py)); ctx.stroke();
    ctx.fillStyle = C.white; ctx.fillText('stowed', sx(st.px - st.L) - 4, sy(st.py) - 6);
    // motor marker
    const mx = st.motorAtEnd ? st.px + Math.cos(ang) * st.L : st.px, my = st.motorAtEnd ? st.py + Math.sin(ang) * st.L : st.py;
    ctx.fillStyle = C.blue; ctx.fillRect(sx(mx) - 8, sy(my) - 8, 16, 16);
    ctx.fillStyle = C.white; ctx.beginPath(); ctx.arc(sx(st.px), sy(st.py), 7, 0, 7); ctx.fill();
    ctx.fillStyle = C.black; ctx.fillText('P', sx(st.px) - 3, sy(st.py) + 4);
  }

  let drag = false;
  cv.addEventListener('pointerdown', (e) => {
    const p = canvasPos(cv, e);
    if (Math.hypot(p.x - sx(st.px), p.y - sy(st.py)) < 18) { drag = true; cv.setPointerCapture(e.pointerId); }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = canvasPos(cv, e);
    st.px = Math.round(Math.max(2, Math.min(26, p.x / SX - X0)) * 2) / 2;
    st.py = Math.round(Math.max(4, Math.min(season.heightLimit - 2, (372 - p.y) / SX)) * 2) / 2;
    if (st.parametric) st.py = Math.round(season.heightLimit * 0.4);
    update();
  });
  cv.addEventListener('pointerup', () => { drag = false; });

  function update() { draw(); listeners.forEach((f) => f(check(), st)); }
  return { canvas: cv, state: st, check, update, onChange: (f) => listeners.push(f) };
}
