// Animated top-down replay of one resolved match (watch only). Reads match.tl built in sim/match.js.
import { C, sfx } from '../ui.js';

const W = 760, H = 330, TOP = 38;
const LANES = [92, 178, 264];
const GOLD_GOAL = 56, GOLD_LOAD = 316, BLUE_GOAL = W - 56, BLUE_LOAD = W - 316;
const MATCH_SEC = 150;
const clock = (t) => { const left = Math.max(0, Math.ceil(MATCH_SEC - t)); return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; };
const phaseName = (t) => (t < 15 ? 'AUTO' : t < 120 ? 'TELEOP' : 'ENDGAME');

// Remove down windows from the time axis so a robot freezes while disabled.
function squeeze(t, windows) {
  let cut = 0;
  for (const w of windows) { if (t > w.from) cut += Math.min(t, w.to) - w.from; }
  return t - cut;
}

// Position along goal -> load -> goal for a robot that scores at the times `ts` (already squeezed).
function cyclePos(te, ts, goalX, loadX, startX) {
  let a = 0, i = 0;
  while (i < ts.length && te > ts[i]) { a = ts[i]; i++; }
  if (i >= ts.length) return { x: goalX, carrying: false, intaking: false };
  const b = ts[i], f = (te - a) / Math.max(0.5, b - a);
  const from = a === 0 ? startX : goalX;
  if (f < 0.35) return { x: from + (loadX - from) * (f / 0.35), carrying: false, intaking: false };
  if (f < 0.5) return { x: loadX, carrying: f > 0.44, intaking: true };
  return { x: loadX + (goalX - loadX) * ((f - 0.5) / 0.5), carrying: true, intaking: false };
}

export function playMatchView(canvas, match, opts = {}) {
  const ctx = canvas.getContext('2d');
  const tl = match.tl;
  let speed = opts.speed || 10, t = 0, last = null, raf = 0, stopped = false, done = false, started = false;
  const popups = [];
  let goldScore = 0, blueScore = 0, lead = 0;

  // Per-robot scoring times in squeezed time.
  const ourTs = [];
  if (tl.auto.ok) ourTs.push(squeeze(tl.auto.t, tl.down));
  tl.ourCycles.forEach((c) => ourTs.push(squeeze(c.t, tl.down)));
  const split = (list, k) => list.filter((_, i) => i % 2 === k).map((e) => e.t);
  const pTs = [split(tl.partner, 0), split(tl.partner, 1)];
  const oTs = [split(tl.opp, 0), split(tl.opp, 1), split(tl.opp, 2)];

  // Merged score events (match clock) and notable commentary.
  const evs = [];
  if (tl.auto.ok) evs.push({ t: tl.auto.t, side: 'us', pts: tl.auto.pts, who: 0 });
  tl.ourCycles.forEach((c) => evs.push({ t: c.t, side: 'us', pts: c.pts, who: 0 }));
  if (tl.end.ok) evs.push({ t: tl.end.t, side: 'us', pts: tl.end.pts, who: 0, text: `Endgame succeeds: +${Math.round(tl.end.pts)}`, cls: 'green' });
  tl.partner.forEach((e, i) => evs.push({ t: e.t, side: 'gold', pts: e.pts, who: 1 + (i % 2) }));
  tl.opp.forEach((e, i) => evs.push({ t: e.t, side: 'blue', pts: e.pts, who: i % 3 }));
  if (!tl.auto.ok) evs.push({ t: tl.auto.t, side: 'none', pts: 0, text: 'Auto: your robot scores nothing.', cls: 'red' });
  else evs.push({ t: tl.auto.t + 0.01, side: 'none', pts: 0, text: `Auto: your robot scores ${Math.round(tl.auto.pts)}.`, cls: 'green' });
  for (const mo of match.moments) if (mo.t !== undefined && mo.kind !== 'auto' && mo.kind !== 'endgame') evs.push({ t: mo.t, side: 'none', pts: 0, text: `${mo.title}: your robot is out of action.`, cls: 'red', sound: mo.kind === 'tip' ? 'thud' : mo.kind === 'brownout' || mo.kind === 'dead' ? 'zap' : 'buzz' });
  for (const mo of match.moments) if (mo.kind === 'auto') evs.push({ t: 10, side: 'none', pts: 0, text: mo.title, cls: 'red' });
  for (const mo of match.moments) if (mo.kind === 'endgame') evs.push({ t: 142, side: 'none', pts: 0, text: mo.title + ': no endgame points.', cls: 'red', sound: 'buzz' });
  for (const w of tl.down) evs.push({ t: w.to, side: 'none', pts: 0, text: 'Your robot is back in the match.', cls: 'muted' });
  evs.sort((a, b) => a.t - b.t);
  let ei = 0;

  const downNow = (tt) => tl.down.find((w) => tt >= w.from && tt <= w.to);

  function robots(tt) {
    const out = [];
    const te = squeeze(tt, tl.down);
    // Ours
    const sp = tt < 15 && tl.auto.ok ? 1 : 1;
    const o = cyclePos(te, ourTs, GOLD_GOAL, GOLD_LOAD, 200 * sp);
    let ox = o.x, state = 'drive';
    const dn = downNow(tt);
    if (dn) state = 'down';
    if (tl.end.ok || (match.moments.some((m) => m.kind === 'endgame'))) {
      if (tt >= 128) { const f = Math.min(1, (tt - 128) / 12); ox = ox + (150 - ox) * f; if (tt >= 142) state = tl.end.ok ? 'climb' : 'failclimb'; }
    }
    out.push({ x: ox, y: LANES[1], team: 'us', carrying: o.carrying && state === 'drive', state, lbl: '6220', kind: dn ? dn.kind : null });
    for (let k = 0; k < 2; k++) {
      const p = cyclePos(tt, pTs[k], GOLD_GOAL, GOLD_LOAD - 30 * (k + 1), 180 - 20 * k);
      out.push({ x: p.x, y: LANES[k === 0 ? 0 : 2], team: 'gold', carrying: p.carrying, state: 'drive', lbl: '' });
    }
    for (let k = 0; k < 3; k++) {
      const p = cyclePos(tt, oTs[k], BLUE_GOAL, BLUE_LOAD + 20 * k, W - 190 + 20 * k);
      out.push({ x: p.x, y: LANES[k], team: 'blue', carrying: p.carrying, state: 'drive', lbl: '' });
    }
    return out;
  }

  function draw() {
    const tt = Math.min(t, MATCH_SEC);
    ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);
    // scoreboard
    ctx.fillStyle = C.g2; ctx.fillRect(0, 0, W, TOP);
    ctx.fillStyle = C.gold; ctx.fillRect(0, 0, W / 2 - 70, TOP); ctx.fillStyle = C.blue; ctx.fillRect(W / 2 + 70, 0, W / 2 - 70, TOP);
    ctx.font = 'bold 22px Consolas, monospace'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.black; ctx.textAlign = 'left'; ctx.fillText('GOLD  ' + Math.round(goldScore), 12, TOP / 2);
    ctx.fillStyle = C.white; ctx.textAlign = 'right'; ctx.fillText(Math.round(blueScore) + '  BLUE', W - 12, TOP / 2);
    ctx.textAlign = 'center'; ctx.fillStyle = C.white; ctx.fillText(clock(tt), W / 2, TOP / 2 - 5);
    ctx.font = '11px sans-serif'; ctx.fillStyle = tt < 15 ? C.gold : C.g5; ctx.fillText(phaseName(tt), W / 2, TOP / 2 + 12);
    // field
    ctx.strokeStyle = C.g4; ctx.lineWidth = 2; ctx.strokeRect(4, TOP + 2, W - 8, H - TOP - 6);
    ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(W / 2, TOP + 4); ctx.lineTo(W / 2, H - 6); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.g3;
    ctx.fillRect(10, TOP + 30, 28, H - TOP - 70); ctx.fillRect(W - 38, TOP + 30, 28, H - TOP - 70);
    ctx.strokeStyle = C.gold; ctx.strokeRect(10, TOP + 30, 28, H - TOP - 70); ctx.strokeStyle = C.blue; ctx.strokeRect(W - 38, TOP + 30, 28, H - TOP - 70);
    ctx.fillStyle = C.g3; ctx.fillRect(GOLD_LOAD + 22, TOP + 60, 14, H - TOP - 130); ctx.fillRect(BLUE_LOAD - 36, TOP + 60, 14, H - TOP - 130);
    ctx.strokeStyle = C.g4; ctx.strokeRect(GOLD_LOAD + 22, TOP + 60, 14, H - TOP - 130); ctx.strokeRect(BLUE_LOAD - 36, TOP + 60, 14, H - TOP - 130);
    if (match.hubShifts && tt >= 15) { // alternating hub shifts: only one hub is active at a time
      const ourActive = Math.floor((tt - 15) / 25) % 2 === 0 && tt < 120;
      const lit = (x, on, col) => { ctx.fillStyle = on ? col : C.g2; ctx.fillRect(x, TOP + 30, 28, H - TOP - 70); ctx.fillStyle = on ? C.black : C.g5; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(on ? 'ON' : 'OFF', x + 14, TOP + 46); };
      const endAll = tt >= 120;
      lit(10, endAll || ourActive, C.gold); lit(W - 38, endAll || !ourActive, C.blue);
    }
    ctx.fillStyle = C.g4; ctx.font = '11px sans-serif';
    ctx.fillText('GOAL', 24, H - 20); ctx.fillText('GOAL', W - 24, H - 20); ctx.fillText('LOADING', GOLD_LOAD + 29, H - 20); ctx.fillText('LOADING', BLUE_LOAD - 29, H - 20);
    // endgame structure
    ctx.strokeStyle = C.gold; ctx.setLineDash([4, 4]); ctx.strokeRect(112, TOP + 40, 78, 190); ctx.setLineDash([]);
    ctx.fillStyle = C.g4; ctx.fillText('ENDGAME', 151, TOP + 52);

    // robots
    for (const r of robots(tt)) {
      ctx.save(); ctx.translate(r.x, r.y);
      const down = r.state === 'down';
      if (down && r.kind === 'tip') ctx.rotate(0.6);
      const fill = down ? C.g4 : r.team === 'blue' ? C.blue : C.gold;
      const size = 34;
      ctx.fillStyle = fill; ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.lineWidth = r.team === 'us' ? 4 : 2; ctx.strokeStyle = r.team === 'us' ? C.white : C.black; ctx.strokeRect(-size / 2, -size / 2, size, size);
      if (r.state === 'climb') { ctx.strokeStyle = C.green; ctx.lineWidth = 3; ctx.strokeRect(-size / 2 - 5, -size / 2 - 5, size + 10, size + 10); }
      if (r.carrying) { ctx.fillStyle = C.white; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill(); }
      ctx.restore();
      if (r.team === 'us') {
        ctx.fillStyle = C.white; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('6220', r.x, r.y - 28);
        if (down) { ctx.strokeStyle = C.red; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(r.x - 12, r.y - 12); ctx.lineTo(r.x + 12, r.y + 12); ctx.moveTo(r.x + 12, r.y - 12); ctx.lineTo(r.x - 12, r.y + 12); ctx.stroke(); }
        if (r.state === 'failclimb') { ctx.fillStyle = C.red; ctx.fillText('missed!', r.x, r.y + 32); }
        if (r.state === 'climb') { ctx.fillStyle = C.green; ctx.fillText('climbed', r.x, r.y + 32); }
      }
    }
    // popups
    popups.forEach((p) => { ctx.globalAlpha = Math.max(0, 1 - p.age); ctx.fillStyle = p.color; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.text, p.x, p.y - p.age * 30); });
    ctx.globalAlpha = 1;
    if (done) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, H / 2 - 36, W, 72);
      ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = match.win ? C.gold : match.tie ? C.white : C.red;
      ctx.fillText((match.win ? 'WIN  ' : match.tie ? 'TIE  ' : 'LOSS  ') + match.alliance + ' to ' + match.opp, W / 2, H / 2);
    }
  }

  function process() {
    const tt = Math.min(t, MATCH_SEC);
    while (ei < evs.length && evs[ei].t <= tt) {
      const e = evs[ei++];
      if (e.side === 'us') { goldScore += e.pts; popups.push({ x: GOLD_GOAL + 20, y: LANES[1] - 20, text: '+' + Math.round(e.pts), color: C.gold, age: 0 }); if (!e.text) sfx('blip'); }
      else if (e.side === 'gold') goldScore += e.pts;
      else if (e.side === 'blue') blueScore += e.pts;
      if (e.text && opts.onEvent) opts.onEvent(e.t, e.text, e.cls);
      if (e.sound) sfx(e.sound);
      const l = Math.sign(Math.round(goldScore) - Math.round(blueScore));
      if (l !== 0 && l !== lead && e.t > 15 && opts.onEvent) opts.onEvent(e.t, l > 0 ? 'Gold takes the lead.' : 'Blue takes the lead.', l > 0 ? 'gold' : 'blue');
      if (l !== 0) lead = l;
    }
  }

  function finish() {
    if (done) return;
    t = MATCH_SEC; goldScore = match.alliance; blueScore = match.opp; ei = evs.length; done = true; popups.length = 0;
    draw(); sfx('end');
    setTimeout(() => sfx(match.win ? 'win' : match.tie ? 'click' : 'lose'), 700);
    if (match.win) setTimeout(() => sfx('cheer'), 900);
    if (opts.onDone) opts.onDone();
  }

  function frame(now) {
    if (stopped || !canvas.isConnected) return;
    if (last === null) last = now;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!started) { started = true; sfx('start'); }
    t += dt * speed;
    popups.forEach((p) => { p.age += dt; });
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i].age > 1) popups.splice(i, 1);
    process();
    if (t >= MATCH_SEC) { finish(); return; }
    draw(); raf = requestAnimationFrame(frame);
  }
  draw();
  raf = requestAnimationFrame(frame);
  return {
    stop() { stopped = true; cancelAnimationFrame(raf); },
    setSpeed(s) { speed = s; },
    skip() { if (stopped || done) return; t = MATCH_SEC; process(); finish(); },
  };
}

export const MATCH_VIEW_SIZE = { W, H };
