// Animated top-down vignette of one scoring cycle (watch only).
import { C } from '../ui.js';

export function playCycle(canvas, stats, opts = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const dtp = stats.picks.drivetrain, it = stats.picks.intake, sc = stats.picks.scorer;
  const swerve = !!(dtp && dtp.swerve);
  const dT = (4.2 * (dtp ? dtp.cycleMod : 1.2)) / 2, iT = it ? it.time : 2.5, tT = stats.needsTurn ? 1.6 : 0, sT = sc ? sc.time : 2.5;
  const phases = [{ n: 'Drive to loading zone', d: dT }, { n: 'Intake', d: iT }];
  if (tT > 0) phases.push({ n: 'Turn around', d: tT });
  phases.push({ n: 'Drive to scoring', d: dT }, { n: 'Score', d: sT });
  const total = phases.reduce((a, p) => a + p.d, 0);
  const xStart = W / 2, xStation = 110, xGoal = W - 110, y = H / 2;
  const intakeFront = stats.sides.intake === 'front', scorerFront = stats.sides.scorer === 'front';
  const stationHeading = swerve ? 0 : (intakeFront ? Math.PI : 0);
  const goalHeading = swerve ? 0 : (scorerFront ? 0 : Math.PI);
  const speed = opts.speed || 2.5;
  let t = 0, last = null, raf = 0, stopped = false, finished = false;

  function state() {
    let acc = 0, pi = 0;
    for (; pi < phases.length; pi++) { if (t < acc + phases[pi].d) break; acc += phases[pi].d; }
    if (pi >= phases.length) return { x: xGoal, heading: goalHeading, phase: 'Done', holding: false, scored: true };
    const f = (t - acc) / phases[pi].d, name = phases[pi].n;
    let x = xStart, heading = stationHeading, holding = false;
    if (name === 'Drive to loading zone') x = xStart + (xStation - xStart) * f;
    else if (name === 'Intake') { x = xStation; holding = f > 0.6; }
    else if (name === 'Turn around') { x = xStation; holding = true; heading = stationHeading + (goalHeading - stationHeading) * f; }
    else if (name === 'Drive to scoring') { x = xStation + (xGoal - xStation) * f; heading = goalHeading; holding = true; }
    else if (name === 'Score') { x = xGoal; heading = goalHeading; holding = f < 0.6; }
    if (swerve) heading = 0;
    return { x, heading, phase: name, holding, scored: name === 'Score' && f > 0.6 };
  }

  function draw() {
    const s = state();
    ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.g4; ctx.lineWidth = 2; ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.fillStyle = C.g3; ctx.fillRect(xStation - 50, y - 50, 40, 100); ctx.fillRect(xGoal + 10, y - 50, 40, 100);
    ctx.fillStyle = C.g5; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('LOADING', xStation - 30, y + 66); ctx.fillText('GOAL', xGoal + 30, y + 66);
    if (s.phase === 'Drive to loading zone' || (s.phase === 'Intake' && !s.holding)) { ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(xStation - 22, y, 8, 0, 7); ctx.fill(); }
    ctx.save(); ctx.translate(s.x, y); ctx.rotate(s.heading);
    ctx.fillStyle = C.g4; ctx.fillRect(-30, -28, 60, 56);
    ctx.strokeStyle = C.white; ctx.lineWidth = 2; ctx.strokeRect(-30, -28, 60, 56);
    ctx.fillStyle = C.white; ctx.beginPath(); ctx.moveTo(30, -10); ctx.lineTo(42, 0); ctx.lineTo(30, 10); ctx.fill(); // front arrow
    const ix = intakeFront ? 30 : -30, sx = scorerFront ? 30 : -30;
    ctx.fillStyle = C.gold; ctx.fillRect(ix - (intakeFront ? 8 : 0), -22, 8, 44);
    ctx.fillStyle = C.blue; ctx.fillRect(sx - (scorerFront ? 14 : 0), -12, 14, 24);
    if (s.holding) { ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.rect(14, 14, 10, 10); ctx.fill();
    ctx.fillStyle = C.white; ctx.textAlign = 'left'; ctx.font = '13px sans-serif';
    ctx.fillText('Intake (gold)   Scorer (blue)   Arrow = front', 30, 24);
    ctx.font = '16px sans-serif'; ctx.fillText(s.phase + (s.scored ? '  - scored!' : ''), 14, H - 14);
    ctx.textAlign = 'right'; ctx.fillText(Math.min(t, total).toFixed(1) + ' s / ' + total.toFixed(1) + ' s', W - 14, H - 14);
  }

  function frame(now) {
    if (stopped || !canvas.isConnected) return;
    if (last === null) last = now;
    t += ((now - last) / 1000) * speed; last = now;
    if (t >= total + 0.8) {
      if (!finished) { finished = true; if (opts.onDone) opts.onDone(total); }
      if (opts.loop) { t = 0; finished = false; }
      else { t = total; draw(); return; }
    }
    draw(); raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return { stop() { stopped = true; cancelAnimationFrame(raf); }, total };
}

// Very small clip animations for key match moments.
export function playClip(canvas, kind, onDone) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let t = 0, last = null, raf = 0, stopped = false;
  function draw() {
    ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.g4; ctx.lineWidth = 2; ctx.strokeRect(2, 2, W - 4, H - 4);
    const f = Math.min(t / 3, 1), cx = 60 + (W - 200) * Math.min(f * 1.3, 1) * (kind === 'auto' ? 0 : 1), cy = H / 2;
    ctx.save(); ctx.translate(cx + 70, cy);
    let color = C.white;
    if (kind === 'tip') { ctx.rotate(Math.max(0, f - 0.4) * 1.9); color = C.red; }
    if (kind === 'brownout') { color = f > 0.5 ? C.g5 : C.white; }
    ctx.fillStyle = C.g4; ctx.fillRect(-35, -25, 70, 50); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(-35, -25, 70, 50);
    if (kind === 'chain') { ctx.strokeStyle = C.red; ctx.beginPath(); ctx.moveTo(-35, 25); ctx.lineTo(-10 + f * 30, 48); ctx.stroke(); }
    if (kind === 'jam') { ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(40, 0, 9, 0, 7); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = C.white; ctx.font = '14px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(({ tip: 'The robot tips over...', chain: 'The chain jumps...', brownout: 'Power cuts out...', jam: 'The mechanism stalls...', auto: 'Auto: the robot never moves...', endgame: 'Climb attempt fails...' })[kind] || '...', 12, 22);
  }
  function frame(now) {
    if (stopped || !canvas.isConnected) return;
    if (last === null) last = now;
    t += (now - last) / 1000; last = now; draw();
    if (t > 3.6) { if (onDone) onDone(); return; }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return { stop() { stopped = true; cancelAnimationFrame(raf); } };
}
