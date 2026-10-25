// Event/match resolution. Pure logic (no DOM), seeded so runs reproduce.
import { SEASONS } from '../data/seasons.js';
import { rngFor } from '../rng.js';
import { derive } from './robotModel.js';

export const KINDS = {
  cycles: { loss: 0.25, repair: 1, title: 'Mechanism trouble', clip: 'jam', principle: 'consistency' },
  tip: { loss: 0.6, repair: 2, title: 'Robot tips over', clip: 'tip', principle: 'weight-cg' },
  brownout: { loss: 0.5, repair: 2, title: 'Brownout: electronics fail', clip: 'brownout', principle: 'electronics-place' },
  chain: { loss: 0.35, repair: 1.5, title: 'Chain jumps off the sprocket', clip: 'chain', principle: 'consistency' },
  auto: { loss: 0, autoLoss: true, repair: 0.5, title: 'Autonomous goes wrong', clip: 'auto', principle: 'auton' },
  endgame: { loss: 0, endLoss: true, repair: 1, title: 'Endgame fails', clip: 'endgame', principle: 'consistency' },
  dead: { loss: 0.8, repair: 3, title: 'Robot dies on the field', clip: 'brownout', principle: 'consistency' },
  part: { loss: 0.15, repair: 1.5, title: 'A missing part is found mid-event', clip: 'jam', principle: 'duplicates-bom' },
};
export const MATCHES_PER_EVENT = 6;
const PIT_BUDGET = 2.0;
const MATCH_SEC = 150, AUTO_SEC = 15;
const ROUND_NAMES = ['Quarterfinals', 'Semifinals', 'Finals'];
const PLAYOFF_BONUS = { Winner: 25, Finalist: 15, Semifinalist: 8, Quarterfinalist: 4, 'Not selected': 0 };

export function repairMult(run) {
  const k = run.results.krayon;
  let m = 1;
  if (k) { if (k.electronicsHard) m += 1.5; if (k.toolBad) m += 1; }
  if (run.results.cad && run.results.cad.organized < 0.5) m += 0.3;
  return m;
}

// Split `total` points into n increments (integers) placed at random times in [t0, t1].
function sprinkle(rng, total, n, t0, t1) {
  if (total <= 0 || n <= 0) return [];
  const out = [];
  let left = Math.round(total);
  for (let i = 0; i < n; i++) {
    const pts = i === n - 1 ? left : Math.max(1, Math.round(left / (n - i)));
    left -= pts;
    out.push({ t: rng.range(t0, t1), pts });
  }
  return out.filter((e) => e.pts > 0).sort((a, b) => a.t - b.t);
}

// A timeline lets the viewer replay a match that was already resolved.
function buildTimeline(rng, m, moments) {
  const kindOf = (mo) => KINDS[mo.kind] || null;
  const downs = [];
  for (const mo of moments) {
    const k = kindOf(mo);
    if (mo.kind === 'carry' || (k && k.loss > 0)) {
      const base = mo.kind === 'carry' ? 0.2 : k.loss;
      downs.push({ from: rng.range(AUTO_SEC + 8, MATCH_SEC - 40), len: base * 100, title: mo.title, kind: mo.kind, mo });
    } else mo.t = mo.kind === 'auto' ? 9 : mo.kind === 'endgame' ? 142 : rng.range(30, 120);
  }
  if (m.loss > 0 && downs.length) {
    const sum = downs.reduce((a, d) => a + d.len, 0), budget = m.loss * 105;
    downs.sort((a, b) => a.from - b.from);
    let cursor = AUTO_SEC;
    for (const d of downs) {
      d.len = Math.max(6, (d.len / sum) * budget);
      d.from = Math.max(d.from, cursor); d.to = Math.min(MATCH_SEC, d.from + d.len);
      cursor = d.to; d.mo.t = d.from;
    }
  }
  const windows = downs.map((d) => ({ from: d.from, to: d.to, title: d.title, kind: d.kind }));
  const downTotal = windows.reduce((a, w) => a + (w.to - w.from), 0);
  const active = Math.max(1, MATCH_SEC - AUTO_SEC - 18 - downTotal);
  const ourCycles = [];
  const per = m.cycles > 0 ? m.tele / m.cycles : 0;
  for (let i = 0; i < m.cycles; i++) {
    let t = AUTO_SEC + ((i + 0.6) / m.cycles) * active;
    for (const w of windows) if (t >= w.from) t += w.to - w.from;
    ourCycles.push({ t: Math.min(MATCH_SEC - 20, t), pts: per });
  }
  return {
    auto: { t: 9, pts: m.auto, ok: m.auto > 0 },
    end: { t: 142, pts: m.end, ok: m.end > 0 },
    ourCycles, down: windows,
    partner: sprinkle(rng, m.partners, Math.max(3, Math.round(m.partners / 5)), 6, MATCH_SEC - 4),
    opp: sprinkle(rng, m.opp, Math.max(3, Math.round(m.opp / 5)), 6, MATCH_SEC - 4),
  };
}

export function simulateEvent(run, evIdx) {
  const season = SEASONS[run.seasonId];
  const stats = derive(run);
  const rng = rngFor(run.seed, 'event' + evIdx);
  const tl = rngFor(run.seed, 'timeline' + evIdx);
  const open = run.flaws.filter((f) => !f.fixed);
  const rm = repairMult(run);
  const potential = Math.floor((season.teleopSec / stats.effCycle) * 0.62);
  let carry = 0;

  // One match. Random draws keep the order they always had so balance and seeds stay stable.
  function runMatch(n, stage, partnerMean, partnerSd, oppMean, oppSd) {
    const moments = [];
    let loss = 0, autoLost = false, endLost = false, repair = 0, dtFailed = false;
    const apply = (kind, text, flaw) => {
      const k = KINDS[kind] || KINDS.cycles;
      loss += k.loss; if (k.autoLoss) autoLost = true; if (k.endLoss) endLost = true;
      repair += k.repair * rm;
      moments.push({ kind, clip: k.clip, title: k.title, text, principle: flaw && flaw.onlyTesting && !flaw.found ? 'test-early' : k.principle, flaw: flaw ? flaw.id : null });
    };
    const inspect = open.find((f) => f.kind === 'inspect');
    if (n === 0 && inspect) { loss = 1; repair += 1; moments.push({ kind: 'inspect', clip: 'jam', title: 'Failed inspection', text: inspect.name + '. You spend the first match fixing it.', principle: 'packaging-tools' }); }
    for (const f of open) {
      if (f.kind === 'inspect') continue;
      if (rng.chance(f.sev * 0.4)) apply(f.kind, f.name + (f.found ? ' (a known issue you left unfixed)' : ' (never found before the event)'), f);
    }
    if (rng.chance(stats.complexity * 0.008)) apply('cycles', 'A complicated mechanism fails mid-match. The more parts, the more things break.', { onlyTesting: false, found: true });
    if (moments.length && moments[moments.length - 1].text.startsWith('A complicated')) moments[moments.length - 1].principle = 'simplicity';
    if (rng.chance((1 - stats.dtRel) * 0.4)) { dtFailed = true; loss += 0.5; repair += 1.5 * rm; moments.push({ kind: 'dead', clip: 'brownout', title: 'Drivetrain trouble', text: 'Without a working drivetrain, nothing else matters.', principle: 'drivetrain-king' }); }
    if (carry > 0) { loss += Math.min(0.4, carry * 0.2); moments.push({ kind: 'carry', clip: null, title: 'Rushed pit repair', text: 'The pit crew did not finish repairs last match.', principle: 'consistency' }); carry = 0; }
    loss = Math.min(1, loss);

    const cycles = Math.floor((season.teleopSec / stats.effCycle) * 0.62 * (1 - loss));
    const tele = cycles * stats.cycleSuccess * stats.ppc * stats.scorerPts * rng.range(0.9, 1.1);
    const autoPts = autoLost ? 0 : (rng.chance(stats.autoRel) ? stats.taxiPts + stats.ppc * stats.scorerPts * (stats.autoRel > 0.6 ? 1 : 0) : 0);
    const end = endLost ? 0 : (rng.chance(stats.endgameRel) ? stats.endgamePts : 0);
    const ours = Math.round(autoPts + tele + end);
    const partners = Math.max(0, Math.round(rng.normal(partnerMean, partnerSd)));
    const opp = Math.max(0, Math.round(rng.normal(oppMean, oppSd)));
    const alliance = ours + partners;
    const win = alliance > opp, tie = alliance === opp;
    const over = Math.max(0, repair - PIT_BUDGET); carry = over;
    const m = { n: n + 1, stage, ours, partners, alliance, opp, win, tie, moments, auto: Math.round(autoPts), tele: Math.round(tele), end, cycles, potential, repair, carryOver: over > 0, loss, autoPts, dtFailed };
    m.tl = buildTimeline(tl, m, moments);
    return m;
  }

  const matches = [];
  let rp = 0, wins = 0, total = 0, decisiveAuto = 0, dtFail = 0;
  for (let n = 0; n < MATCHES_PER_EVENT; n++) {
    const m = runMatch(n, `Qualification ${n + 1} of ${MATCHES_PER_EVENT}`, season.bench * 0.55, season.bench * 0.12, season.bench * (0.92 + 0.2 * (evIdx - 1)), season.bench * 0.15);
    rp += m.win ? 2 : m.tie ? 1 : 0; if (m.win) wins++;
    if (m.win && m.alliance - m.autoPts <= m.opp) decisiveAuto++;
    if (m.dtFailed) dtFail++;
    total += m.ours;
    matches.push(m);
  }
  // Field standings: same draws as before, plus a per-match path for the rank chart.
  const frng = rngFor(run.seed, 'field' + evIdx);
  const finals = [];
  let rank = 1;
  for (let t = 0; t < 23; t++) { const v = frng.normal(MATCHES_PER_EVENT * 1.0, 1.8); finals.push(v); if (v > rp) rank++; }
  const prng = rngFor(run.seed, 'fieldpath' + evIdx);
  const walks = finals.map((v) => {
    const pts = [];
    for (let k = 1; k <= MATCHES_PER_EVENT; k++) {
      const bridge = k === MATCHES_PER_EVENT ? 0 : prng.normal(0, 0.9) * Math.sqrt((k * (MATCHES_PER_EVENT - k)) / MATCHES_PER_EVENT) / 1.6;
      pts.push((v * k) / MATCHES_PER_EVENT + bridge);
    }
    return pts;
  });
  let acc = 0;
  const rankPath = matches.map((m, k) => {
    acc += m.win ? 2 : m.tie ? 1 : 0;
    if (k === MATCHES_PER_EVENT - 1) return rank;
    return 1 + walks.filter((w) => w[k] > acc).length;
  });
  const res = { evIdx, matches, rp, wins, rank, avg: total / MATCHES_PER_EVENT, decisiveAuto, dtFail, rankPath, potential };

  // ---- Alliance selection and playoffs ----
  const prog = rngFor(run.seed, 'playoffs' + evIdx);
  const strength = res.avg / season.bench;
  let role = 'captain', seed = rank;
  if (rank > 8) {
    const pickProb = Math.max(0.05, Math.min(0.97, 0.3 + (strength - 0.25) * 2.2)) * (rank > 18 ? 0.5 : 1);
    if (prog.chance(pickProb)) { role = 'picked'; seed = Math.min(8, Math.max(1, 9 - Math.ceil((rank - 8) / 3))); } else role = 'none';
  }
  const po = { role, seed: role === 'none' ? null : seed, rounds: [], result: 'Not selected', pickProb: null };
  if (role !== 'none') {
    const pMean = season.bench * (role === 'captain' ? 0.58 : 0.46);
    const oppBase = season.bench * (0.92 + 0.2 * (evIdx - 1));
    let oppSeed = 9 - seed, round = 0, result = 'Winner';
    const used = new Set([seed]);
    for (; round < 3; round++) {
      if (round > 0) {
        let s1 = (1 + prog.int(8)), s2 = (1 + prog.int(8)), tries = 0;
        let s = Math.min(s1, s2);
        while ((used.has(s) || s === seed) && tries++ < 20) { s1 = (1 + prog.int(8)); s2 = (1 + prog.int(8)); s = Math.min(s1, s2); }
        oppSeed = used.has(s) ? ((s % 8) + 1) : s;
      }
      used.add(oppSeed);
      const oppMean = oppBase * (1.55 - 0.1 * (oppSeed - 1));
      const rd = { name: ROUND_NAMES[round], oppSeed, matches: [], won: false };
      let w = 0, l = 0;
      while (w < 2 && l < 2) {
        const m = runMatch(rd.matches.length, `${ROUND_NAMES[round]}: match ${rd.matches.length + 1}`, pMean, season.bench * 0.1, oppMean, oppBase * 0.2);
        rd.matches.push(m);
        if (m.win) w++; else l++;
      }
      rd.won = w === 2; rd.score = `${w}-${l}`;
      po.rounds.push(rd);
      if (!rd.won) { result = ['Quarterfinalist', 'Semifinalist', 'Finalist'][round]; break; }
    }
    po.result = result;
  }
  po.bonus = PLAYOFF_BONUS[po.result];
  res.playoff = po;
  res.awards = computeAwards(run, stats, res);
  return res;
}

function computeAwards(run, stats, res) {
  const r = run.results, out = [];
  const trouble = res.matches.reduce((a, m) => a + m.moments.filter((x) => ['cycles', 'tip', 'brownout', 'chain', 'dead', 'part'].includes(x.kind)).length, 0);
  const quality = trouble <= 1;
  const industrial = !!(r.cad && r.cad.organized >= 0.5 && r.krayon && !r.krayon.electronicsHard && !r.krayon.toolBad);
  const control = stats.autoRel >= 0.75 && stats.missingSensors.length === 0 && stats.sensorsNeeded.length >= 2;
  const borrowed = ['drivetrain', 'intake', 'scorer', 'endgame'].filter((s) => run.design[s] && run.design[s].source === 'borrowed' && run.design[s].id !== 'none').length;
  const unfixed = run.flaws.filter((f) => !f.fixed && f.found).length;
  if (quality) out.push({ name: 'Quality Award', why: 'Almost nothing broke in qualification. Reliable, repairable, and well tested.' });
  if (industrial) out.push({ name: 'Industrial Design Award', why: 'Clean, organized CAD with serviceable electronics and tool access.' });
  if (control) out.push({ name: 'Innovation in Control Award', why: 'You planned your sensors up front, so autonomous and presets worked.' });
  if (borrowed >= 2) out.push({ name: 'Gracious Professionalism Award', why: 'You built on designs other teams shared, gave credit, and made the game better for everyone.' });
  if (quality && industrial && stats.complexity <= 20 && unfixed === 0 && !stats.over) out.push({ name: 'Excellence in Engineering Award', why: 'Simple, tested, organized and reliable: the design process worked end to end.' });
  return out;
}

export function eventScore(res) {
  const po = res.playoff ? res.playoff.bonus : 0, aw = res.awards ? res.awards.length * 3 : 0;
  return Math.round(res.avg * 0.5 + res.wins * 3 + Math.max(0, 25 - res.rank)) + po + aw;
}
