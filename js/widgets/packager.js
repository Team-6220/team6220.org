// Krayon CAD packaging widget (top-down). Drag colored blocks inside the 28"x28" frame.
import { h, C, canvasPos, sfx } from '../ui.js';
import { picks } from '../sim/robotModel.js';

const OX = 56, OY = 44, S = 12, FRAME = 28;
export const CG_LIMIT = 12;

export function createPackager(run) {
  const P = picks(run);
  const hasEnd = P.endgame && P.endgame.id !== 'none';
  const skz = run.results.sketch ? run.results.sketch.pivotY * 0.8 : 18;
  const tallEnd = hasEnd && ['traversal', 'elevatorTrap'].includes(P.endgame.id);

  const blocks = [
    { id: 'driveT', name: 'Drive L', w: 8, h: 4, x: 10, y: 1, color: C.g5, solid: true, wt: (P.drivetrain ? P.drivetrain.wt : 40) / 2, z: 3 },
    { id: 'driveB', name: 'Drive R', w: 8, h: 4, x: 10, y: 23, color: C.g5, solid: true, wt: (P.drivetrain ? P.drivetrain.wt : 40) / 2, z: 3 },
    { id: 'battery', name: 'Battery', w: 7, h: 3, x: 0.5, y: 12, color: C.white, solid: true, elec: true, wt: 13, z: 2 },
    { id: 'rio', name: 'roboRIO', w: 6, h: 5, x: 0.5, y: 2, color: C.white, solid: true, elec: true, wt: 3, z: 4 },
    { id: 'pdh', name: 'PDH', w: 6, h: 5, x: 0.5, y: 20, color: C.white, solid: true, elec: true, wt: 5, z: 4 },
    { id: 'intake', name: 'Intake', w: 6, h: 24, x: 22, y: 2, color: C.gold, solid: true, wt: P.intake ? P.intake.wt : 9, z: 8 },
    { id: 'scorer', name: 'Scorer', w: 12, h: 12, x: 8, y: 8, color: C.blue, solid: true, zone: 5, wt: (P.scorer ? P.scorer.wt : 20) + (run.results.sketch ? run.results.sketch.armMass : 0), z: skz },
  ];
  if (hasEnd) blocks.push({ id: 'endgame', name: 'Endgame', w: 8, h: 8, x: 10, y: 10, color: C.g4, solid: true, zone: 3, wt: P.endgame.wt, z: tallEnd ? 24 : 12 });
  const st = { batteryHigh: false };
  const listeners = [];
  const cv = h('canvas', { width: 460, height: 420 });

  const ov = (a, b) => a.x < b.x + b.w - 1e-6 && a.x + a.w > b.x + 1e-6 && a.y < b.y + b.h - 1e-6 && a.y + a.h > b.y + 1e-6;
  const zoneOf = (b) => ({ x: b.x - b.zone, y: b.y - b.zone, w: b.w + 2 * b.zone, h: b.h + 2 * b.zone });
  const clip = (r) => ({ x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.max(0, Math.min(FRAME, r.x + r.w) - Math.max(0, r.x)), h: Math.max(0, Math.min(FRAME, r.y + r.h) - Math.max(0, r.y)) });

  function accessible(b) {
    const others = blocks.filter((o) => o !== b);
    const corr = [
      { x: 0, y: b.y, w: b.x, h: b.h }, { x: b.x + b.w, y: b.y, w: FRAME - b.x - b.w, h: b.h },
      { x: b.x, y: 0, w: b.w, h: b.y }, { x: b.x, y: b.y + b.h, w: b.w, h: FRAME - b.y - b.h },
    ];
    return corr.some((c) => c.w <= 0.01 || c.h <= 0.01 || !others.some((o) => ov(c, o)));
  }

  function check() {
    const overlaps = new Set();
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) if (ov(blocks[i], blocks[j])) { overlaps.add(blocks[i].id); overlaps.add(blocks[j].id); }
    const access = {};
    for (const id of ['battery', 'rio', 'pdh']) access[id] = accessible(blocks.find((b) => b.id === id));
    const zones = blocks.filter((b) => b.zone).map((b) => zoneOf(b));
    const underSweep = ['rio', 'pdh'].filter((id) => zones.some((z) => ov(blocks.find((b) => b.id === id), z)));
    const battZone = zones.some((z) => ov(blocks.find((b) => b.id === 'battery'), z));
    let wsum = 12 + 8 /* bumpers, misc */, zsum = 12 * 5 + 8 * 4;
    for (const b of blocks) { const z = b.id === 'battery' && st.batteryHigh ? 14 : b.z; wsum += b.wt; zsum += b.wt * z; }
    const cg = zsum / wsum;
    const cx = (id) => { const b = blocks.find((q) => q.id === id); return b.x + b.w / 2; };
    return {
      overlaps: [...overlaps], access, toolBad: !access.battery || !access.rio || !access.pdh || battZone,
      electronicsHard: underSweep.length > 0, underSweep, cg, cgHigh: cg > CG_LIMIT,
      sides: { intake: cx('intake') > FRAME / 2 ? 'front' : 'back', scorer: cx('scorer') > FRAME / 2 ? 'front' : 'back' },
      valid: overlaps.size === 0,
    };
  }

  function draw() {
    const ctx = cv.getContext('2d'), r = check();
    ctx.fillStyle = C.black; ctx.fillRect(0, 0, 460, 420);
    ctx.strokeStyle = C.g3; ctx.lineWidth = 1;
    for (let i = 0; i <= FRAME; i += 4) { ctx.beginPath(); ctx.moveTo(OX + i * S, OY); ctx.lineTo(OX + i * S, OY + FRAME * S); ctx.moveTo(OX, OY + i * S); ctx.lineTo(OX + FRAME * S, OY + i * S); ctx.stroke(); }
    ctx.strokeStyle = C.white; ctx.lineWidth = 3; ctx.strokeRect(OX, OY, FRAME * S, FRAME * S);
    ctx.fillStyle = C.g5; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('FRONT →', OX + FRAME * S - 40, OY - 10); ctx.fillText('← BACK', OX + 40, OY - 10);
    ctx.fillText('28" x 28" frame (top view)', OX + (FRAME * S) / 2, OY + FRAME * S + 20);
    for (const b of blocks.filter((q) => q.zone)) {
      const z = clip(zoneOf(b));
      ctx.setLineDash([5, 4]); ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
      ctx.strokeRect(OX + z.x * S, OY + z.y * S, z.w * S, z.h * S); ctx.setLineDash([]);
    }
    for (const b of blocks) {
      const bad = r.overlaps.includes(b.id) || (b.elec && b.id !== 'battery' && r.underSweep.includes(b.id));
      ctx.fillStyle = b.color; ctx.fillRect(OX + b.x * S, OY + b.y * S, b.w * S, b.h * S);
      ctx.lineWidth = 3; ctx.strokeStyle = bad ? C.red : C.black; ctx.strokeRect(OX + b.x * S, OY + b.y * S, b.w * S, b.h * S);
      ctx.fillStyle = b.color === C.white || b.color === C.gold || b.color === C.g5 ? C.black : C.white;
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      const lbl = b.w * S < 60 ? b.name.split(' ')[0] : b.name;
      ctx.fillText(lbl, OX + (b.x + b.w / 2) * S, OY + (b.y + b.h / 2) * S + 4);
    }
    ctx.textAlign = 'left';
  }

  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    const p = canvasPos(cv, e), x = (p.x - OX) / S, y = (p.y - OY) / S;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { drag = { b, dx: x - b.x, dy: y - b.y }; blocks.push(blocks.splice(i, 1)[0]); cv.setPointerCapture(e.pointerId); break; }
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = canvasPos(cv, e), x = (p.x - OX) / S - drag.dx, y = (p.y - OY) / S - drag.dy;
    drag.b.x = Math.round(Math.max(0, Math.min(FRAME - drag.b.w, x)) * 2) / 2;
    drag.b.y = Math.round(Math.max(0, Math.min(FRAME - drag.b.h, y)) * 2) / 2;
    update();
  });
  cv.addEventListener('pointerup', () => { if (drag) sfx('snap'); drag = null; });

  function update() { draw(); listeners.forEach((f) => f(check())); }
  return { canvas: cv, state: st, check, update, onChange: (f) => listeners.push(f) };
}
