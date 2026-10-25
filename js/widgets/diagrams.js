// Drawn teaching diagrams (canvas) for principles from the team documents.
import { h, C } from '../ui.js';

const W = 380, H = 210;
function base() {
  const cv = h('canvas', { width: W, height: H, class: 'diagram' });
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  return { cv, ctx };
}
function text(ctx, s, x, y, color = C.white, size = 12, align = 'left', bold = false) {
  ctx.fillStyle = color; ctx.font = `${bold ? 'bold ' : ''}${size}px sans-serif`; ctx.textAlign = align; ctx.fillText(s, x, y);
}
function arrow(ctx, x0, y0, x1, y1, color = C.gold, w = 1.5) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0);
  [[x1, y1, a], [x0, y0, a + Math.PI]].forEach(([x, y, an]) => {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 7 * Math.cos(an - 0.4), y - 7 * Math.sin(an - 0.4)); ctx.lineTo(x - 7 * Math.cos(an + 0.4), y - 7 * Math.sin(an + 0.4)); ctx.closePath(); ctx.fill();
  });
}
function circle(ctx, x, y, r, stroke, fill) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

const D = {
  // Center of gravity and tipping
  cg() {
    const { cv, ctx } = base();
    const robot = (x, cgH, label, color, tip) => {
      ctx.fillStyle = C.g4; ctx.fillRect(x, 140 - 30, 90, 30); ctx.strokeStyle = C.white; ctx.lineWidth = 2; ctx.strokeRect(x, 110, 90, 30);
      circle(ctx, x + 14, 146, 8, C.white, C.g3); circle(ctx, x + 76, 146, 8, C.white, C.g3);
      ctx.fillStyle = C.g3; ctx.fillRect(x + 38, 140 - 30 - cgH * 0.9, 14, cgH * 0.9); ctx.strokeStyle = C.white; ctx.strokeRect(x + 38, 140 - 30 - cgH * 0.9, 14, cgH * 0.9);
      const cy = 140 - cgH; circle(ctx, x + 45, cy, 6, C.black, color);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(x + 45, cy); ctx.lineTo(x + 90, 154); ctx.stroke(); ctx.setLineDash([]);
      text(ctx, label, x + 45, 22, color, 13, 'center', true);
      text(ctx, `tips at ${tip}°`, x + 45, 186, C.white, 12, 'center');
    };
    robot(40, 28, 'Low CG', C.green, Math.round((Math.atan(45 / 28) * 180) / Math.PI));
    robot(230, 80, 'High CG', C.red, Math.round((Math.atan(45 / 80) * 180) / Math.PI));
    text(ctx, 'Keep heavy parts low; keep a pivot\'s CG near its pivot.', W / 2, 205, C.g5, 11, 'center');
    return cv;
  },
  // Gear center distance C = (N1 + N2) / (2 DP)
  gearCenter() {
    const { cv, ctx } = base();
    const r1 = 38, r2 = 66, cx1 = 100, cy = 100, cx2 = cx1 + r1 + r2;
    circle(ctx, cx1, cy, r1, C.white, C.g3); circle(ctx, cx2, cy, r2, C.white, C.g3);
    for (const [cx, r, n] of [[cx1, r1, 20], [cx2, r2, 36]]) for (let i = 0; i < n; i++) { const a = (i / n) * 6.283; ctx.strokeStyle = C.g5; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + (r - 4) * Math.cos(a), cy + (r - 4) * Math.sin(a)); ctx.lineTo(cx + (r + 3) * Math.cos(a), cy + (r + 3) * Math.sin(a)); ctx.stroke(); }
    circle(ctx, cx1, cy, 4, null, C.gold); circle(ctx, cx2, cy, 4, null, C.gold);
    arrow(ctx, cx1, cy + 80, cx2, cy + 80, C.gold); ctx.setLineDash([3, 3]); ctx.strokeStyle = C.gold; ctx.beginPath(); ctx.moveTo(cx1, cy + 6); ctx.lineTo(cx1, cy + 84); ctx.moveTo(cx2, cy + 6); ctx.lineTo(cx2, cy + 84); ctx.stroke(); ctx.setLineDash([]);
    text(ctx, 'C', (cx1 + cx2) / 2, cy + 74, C.gold, 14, 'center', true);
    text(ctx, 'C = (N1 + N2) / (2 × DP)', W / 2, 24, C.white, 15, 'center', true);
    text(ctx, 'Example: 20T + 36T at DP 20 → C = 1.400 in', W / 2, 44, C.g5, 12, 'center');
    text(ctx, 'N1 = 20', cx1, cy + 4 - r1 - 8, C.white, 11, 'center'); text(ctx, 'N2 = 36', cx2, cy - r2 - 8, C.white, 11, 'center');
    return cv;
  },
  // Belt length = teeth x 5 mm (HTD5M)
  beltLength() {
    const { cv, ctx } = base();
    const x1 = 110, x2 = 270, y = 105, r1 = 28, r2 = 44;
    ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(x1, y - r1); ctx.lineTo(x2, y - r2); ctx.arc(x2, y, r2, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x1, y + r1); ctx.arc(x1, y, r1, Math.PI / 2, -Math.PI / 2); ctx.stroke();
    circle(ctx, x1, y, r1, C.white, C.g3); circle(ctx, x2, y, r2, C.white, C.g3);
    circle(ctx, x1, y, 4, null, C.gold); circle(ctx, x2, y, 4, null, C.gold);
    text(ctx, 'Belt length = teeth × 5 mm', W / 2, 24, C.white, 15, 'center', true);
    text(ctx, 'HTD 5M: 5 mm pitch. A 120-tooth belt is 600 mm.', W / 2, 44, C.g5, 12, 'center');
    text(ctx, 'Use reca.lc to pick pulleys and center distance.', W / 2, 186, C.g5, 12, 'center');
    text(ctx, 'Not the CAD belt FeatureScript', W / 2, 203, C.red, 11, 'center');
    return cv;
  },
  // Rivet layout (6220 Design Standards Art. 4)
  rivet() {
    const { cv, ctx } = base();
    const Dm = 14, A = 2.5 * Dm, B = 6 * Dm, ox = 70, oy = 50;
    ctx.fillStyle = C.g3; ctx.fillRect(ox, oy, 250, 130); ctx.strokeStyle = C.white; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, 250, 130);
    const pts = [];
    for (let i = 0; i < 4; i++) pts.push([ox + A + i * B, oy + A]);
    for (let i = 0; i < 4; i++) pts.push([ox + A + i * B, oy + A + 30]);
    pts.forEach(([x, y]) => { circle(ctx, x, y, Dm / 2, C.black, C.gold); });
    arrow(ctx, ox, oy + A, ox + A, oy + A, C.white); text(ctx, 'A = 2.5 D', ox + 4, oy + A - 14, C.white, 12);
    arrow(ctx, ox + A, oy + A - 12, ox + A + B, oy + A - 12, C.white); text(ctx, 'B = 4 D to 8 D', ox + A + 8, oy + A - 22, C.white, 12);
    arrow(ctx, ox + A + 3 * B + 22, oy + A, ox + A + 3 * B + 22, oy + A + 30, C.white); text(ctx, 'C', ox + A + 3 * B + 30, oy + A + 19, C.white, 12);
    text(ctx, 'D = rivet diameter. 3/16 in: A ≈ 0.47 in, B 0.75 to 1.5 in.', W / 2, 22, C.gold, 13, 'center', true);
    text(ctx, 'Too many holes shear like a zipper.', W / 2, 198, C.g5, 12, 'center');
    return cv;
  },
  // Naming and organization (6220 Design Standards Art. 1 §4)
  naming() {
    const { cv, ctx } = base();
    ctx.strokeStyle = C.g4; ctx.beginPath(); ctx.moveTo(W / 2, 14); ctx.lineTo(W / 2, 196); ctx.stroke();
    text(ctx, 'Bad', 95, 22, C.red, 14, 'center', true); text(ctx, 'Good', 285, 22, C.green, 14, 'center', true);
    ['Part Studio 1', 'Part 3 (1)', 'Sketch 7', 'plate final v2', 'Assembly 2'].forEach((s, i) => text(ctx, s, 24, 54 + i * 30, C.g5, 13));
    ['Folder: Intake', '  Gusset, Lower Front A-frame', '  Sketch: Intake Side Front', '  Plate, Roller Mount, copy', 'Assembly: Full Robot'].forEach((s, i) => text(ctx, s, 204, 54 + i * 30, C.white, 12));
    text(ctx, 'Noun first, modifiers after commas. Rename every sketch.', W / 2, 205, C.g5, 11, 'center');
    return cv;
  },
  // Progression of CAD: master sketch -> Krayon -> organized
  progression() {
    const { cv, ctx } = base();
    const box = (x, title, draw) => { ctx.strokeStyle = C.g4; ctx.lineWidth = 2; ctx.strokeRect(x, 40, 110, 130); text(ctx, title, x + 55, 30, C.gold, 13, 'center', true); draw(x); };
    box(10, '1 Master sketch', (x) => { ctx.strokeStyle = C.white; ctx.lineWidth = 2; ctx.strokeRect(x + 15, 110, 80, 30); ctx.beginPath(); ctx.moveTo(x + 40, 110); ctx.lineTo(x + 90, 60); ctx.stroke(); circle(ctx, x + 40, 110, 4, null, C.gold); });
    box(135, '2 Krayon CAD', (x) => { [[C.gold, 15, 110, 40, 30], [C.blue, 60, 110, 35, 30], [C.green, 22, 70, 30, 30], [C.red, 62, 70, 30, 30]].forEach(([c, dx, dy, w, hh]) => { ctx.fillStyle = c; ctx.fillRect(x + dx, dy, w, hh); }); });
    box(260, '3 Organized CAD', (x) => { ['Folder: Intake', '  Plate, Side', '  Roller, Top', 'Folder: Shooter', '  Hood, Main'].forEach((s, i) => text(ctx, s, x + 8, 70 + i * 20, C.white, 11)); });
    arrow(ctx, 122, 105, 134, 105); arrow(ctx, 247, 105, 259, 105);
    text(ctx, 'Rough layout first, polish last.', W / 2, 196, C.g5, 12, 'center');
    return cv;
  },
  // Season clock
  timeBudget() {
    const { cv, ctx } = base();
    const segs = [['Design', 70, C.gold], ['Build', 100, C.white], ['Code', 40, C.g5], ['Practice', 110, C.blue]];
    let x = 20; const tot = 320;
    segs.forEach(([n, hrs, c]) => { const w = (hrs / tot) * 340; ctx.fillStyle = c; ctx.fillRect(x, 70, w, 40); text(ctx, n, x + w / 2, 94, c === C.white || c === C.gold ? C.black : C.white, 12, 'center', true); x += w; });
    text(ctx, 'One season clock: 320 hours', W / 2, 40, C.white, 15, 'center', true);
    arrow(ctx, 20 + (70 / tot) * 340, 140, 20 + (70 / tot) * 340 + 60, 140, C.red);
    text(ctx, 'every extra design hour comes out of build, code or practice', W / 2, 170, C.g5, 12, 'center');
    return cv;
  },
  // 3D print tolerance (6220 Design Standards Art. 3)
  tolerance() {
    const { cv, ctx } = base();
    circle(ctx, 190, 105, 62, C.white, C.g3); circle(ctx, 190, 105, 52, C.g5, C.black); circle(ctx, 190, 105, 50, C.gold, null);
    text(ctx, '1.125 in bearing OD', 190, 108, C.gold, 12, 'center');
    text(ctx, 'Cut the hole 1.127 in', 190, 22, C.white, 14, 'center', true);
    text(ctx, '3D print to known part: 0.015 in    print to print: 0.03 in', W / 2, 190, C.g5, 11, 'center');
    text(ctx, 'Space beside chain sprockets: 0.25 in', W / 2, 205, C.g5, 11, 'center');
    return cv;
  },
};
export const DIAGRAMS = Object.keys(D);
export function diagram(name) { return D[name] ? D[name]() : null; }
