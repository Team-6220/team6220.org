// Event/match resolution. Pure logic (no DOM), seeded so runs reproduce.
// createEvent() resolves one match at a time so the player can scout, pick a plan and repair between matches.
// simulateEvent() plays a whole event with default choices (used by the balance tests).
import { SEASONS } from '../data/seasons.js';
import { rngFor } from '../rng.js';
import { derive, hasPerk } from './robotModel.js';

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

// Match plans the player chooses before each match.
export const PLANS = {
  balanced: { name: 'Balanced', text: 'Play your normal game.', cyc: 1, risk: 1, endBonus: 0, oppMul: 1 },
  push: { name: 'Push the pace', text: 'About 12% more cycles, but things are more likely to break.', cyc: 1.12, risk: 1.5, endBonus: 0, oppMul: 1 },
  safe: { name: 'Play it safe', text: 'About 8% fewer cycles, and far less likely to break.', cyc: 0.92, risk: 0.5, endBonus: 0, oppMul: 1 },
  endgame: { name: 'Prioritize the endgame', text: 'Fewer cycles, but your endgame is more reliable.', cyc: 0.93, risk: 1, endBonus: 0.15, oppMul: 1 },
  defense: { name: 'Play defense', text: 'Slow the opponents down, but score less yourself.', cyc: 0.7, risk: 1, endBonus: 0, oppMul: 0.82 },
};
// What the opposing alliance is like (scouting report).
export const STYLES = {
  balanced: { name: 'Balanced alliance', text: 'No clear strength or weakness.', oppMul: 1 },
  cycler: { name: 'Fast cyclers', text: 'They score a lot, quickly. Defense slows them down the most.', oppMul: 1.12, defenseMul: 0.72 },
  endgame: { name: 'Endgame specialists', text: 'Strong climbers: their last 30 seconds are huge.', oppMul: 1.06, defenseMul: 0.9 },
  defender: { name: 'Defensive alliance', text: 'They will play defense on you. Playing safe protects your cycles.', oppMul: 0.95, defenseMul: 0.98 },
};

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

export function createEvent(run, evIdx) {
  const season = SEASONS[run.seasonId];
  const stats = derive(run);
  const rng = rngFor(run.seed, 'event' + evIdx);
  const tl = rngFor(run.seed, 'timeline' + evIdx);
  const rm = repairMult(run);
  const RP_WIN = season.rpWin || 2;
  const pitBudget = PIT_BUDGET + (hasPerk(run, 'spare-parts') ? 1.5 : 0) + ((run.bonus && run.bonus.pit) || 0);
  const potential = Math.floor((season.teleopSec / stats.effCycle) * (season.activeFrac || 1) * 0.62);
  let carry = 0;
  const matches = [];
  const exactScout = hasPerk(run, 'scouting-team') || ((run.bonus && run.bonus.scout) || 0) > 0;

  // Scouting: the opposing alliance's style for a given match is fixed by the seed, so the player can plan for it.
  function scout(label) {
    const r = rngFor(run.seed, 'style' + evIdx + label);
    const w = evIdx === 1 ? [['balanced', 40], ['cycler', 25], ['endgame', 15], ['defender', 20]] : [['balanced', 20], ['cycler', 30], ['endgame', 15], ['defender', 35]];
    let x = r.range(0, 100), id = 'balanced';
    for (const [k, p] of w) { if (x < p) { id = k; break; } x -= p; }
    const st = STYLES[id];
    return { id, name: st.name, text: st.text, detail: exactScout ? `Expect them to score about ${Math.round(season.bench * (0.92 + 0.2 * (evIdx - 1)) * st.oppMul)} points.` : null };
  }

  // One match. Random draws keep the order they always had so balance and seeds stay stable.
  function runMatch(n, stage, partnerMean, partnerSd, oppMean, oppSd, planId, styleId) {
    const plan = PLANS[planId] || PLANS.balanced, style = STYLES[styleId] || STYLES.balanced;
    const open = run.flaws.filter((f) => !f.fixed);
    const moments = [];
    let loss = 0, autoLost = false, endLost = false, repair = 0, dtFailed = false;
    const apply = (kind, text, flaw) => {
      const k = KINDS[kind] || KINDS.cycles;
      loss += k.loss; if (k.autoLoss) autoLost = true; if (k.endLoss) endLost = true;
      repair += k.repair * rm;
      moments.push({ kind, clip: k.clip, title: k.title, text, principle: flaw && flaw.onlyTesting && !flaw.found ? 'test-early' : k.principle, flaw: flaw ? flaw.id : null });
    };
    const inspect = open.find((f) => f.kind === 'inspect');
    if (n === 0 && stage.startsWith('Qualification') && inspect) { loss = 1; repair += 1; moments.push({ kind: 'inspect', clip: 'jam', title: 'Failed inspection', text: inspect.name + '. You spend the first match fixing it.', principle: 'packaging-tools' }); }
    for (const f of open) {
      if (f.kind === 'inspect') continue;
      if (rng.chance(f.sev * 0.4 * plan.risk)) apply(f.kind, f.name + (f.found ? ' (a known issue you left unfixed)' : ' (never found before the event)'), f);
    }
    if (rng.chance(stats.complexity * 0.008 * plan.risk)) apply('cycles', 'A complicated mechanism fails mid-match. The more parts, the more things break.', { onlyTesting: false, found: true });
    if (moments.length && moments[moments.length - 1].text.startsWith('A complicated')) moments[moments.length - 1].principle = 'simplicity';
    if (rng.chance((1 - stats.dtRel) * 0.4 * plan.risk)) { dtFailed = true; loss += 0.5; repair += 1.5 * rm; moments.push({ kind: 'dead', clip: 'brownout', title: 'Drivetrain trouble', text: 'Without a working drivetrain, nothing else matters.', principle: 'drivetrain-king' }); }
    if (carry > 0) { loss += Math.min(0.4, carry * 0.2); moments.push({ kind: 'carry', clip: null, title: 'Rushed pit repair', text: 'The pit crew did not finish repairs last match.', principle: 'consistency' }); carry = 0; }
    loss = Math.min(1, loss);

    // Opponent defense hurts your cycles unless you play it safe or defend back.
    let cycMul = plan.cyc;
    if (styleId === 'defender' && planId !== 'defense') cycMul *= planId === 'safe' ? 0.96 : 0.88;
    const cycles = Math.floor((season.teleopSec / stats.effCycle) * (season.activeFrac || 1) * 0.62 * (1 - loss) * cycMul);
    const tele = cycles * stats.cycleSuccess * stats.ppc * stats.scorerPts * rng.range(0.9, 1.1);
    const autoPts = autoLost ? 0 : (rng.chance(stats.autoRel) ? stats.taxiPts + Math.min(stats.ppc, stats.autoCap) * stats.scorerPts * (stats.autoRel > 0.6 ? 1 : 0) : 0);
    const end = endLost ? 0 : (rng.chance(Math.min(0.98, stats.endgameRel + plan.endBonus)) ? stats.endgamePts : 0);
    const ours = Math.round(autoPts + tele + end);
    const partners = Math.max(0, Math.round(rng.normal(partnerMean, partnerSd)));
    let opp = Math.max(0, Math.round(rng.normal(oppMean, oppSd)));
    opp = Math.round(opp * style.oppMul * (planId === 'defense' ? (style.defenseMul || 0.82) : plan.oppMul));
    const alliance = ours + partners;
    const win = alliance > opp, tie = alliance === opp;
    const over = Math.max(0, repair - pitBudget); carry = over;
    const m = { n: n + 1, stage, ours, partners, alliance, opp, win, tie, moments, auto: Math.round(autoPts), tele: Math.round(tele), end, cycles, potential, repair, carryOver: over > 0, loss, autoPts, dtFailed, plan: planId, style: styleId, hubShifts: !!(season.activeFrac && season.activeFrac < 1) };
    m.tl = buildTimeline(tl, m, moments);
    return m;
  }

  // Field standings: the other teams' season totals are fixed up front, so rank can be shown after every match.
  const frng = rngFor(run.seed, 'field' + evIdx);
  const finals = [];
  for (let t = 0; t < 23; t++) finals.push(frng.normal(MATCHES_PER_EVENT * (RP_WIN / 2), 1.8 * (RP_WIN / 2)));
  const prng = rngFor(run.seed, 'fieldpath' + evIdx);
  const walks = finals.map((v) => {
    const pts = [];
    for (let k = 1; k <= MATCHES_PER_EVENT; k++) {
      const bridge = k === MATCHES_PER_EVENT ? 0 : prng.normal(0, 0.9) * Math.sqrt((k * (MATCHES_PER_EVENT - k)) / MATCHES_PER_EVENT) / 1.6;
      pts.push((v * k) / MATCHES_PER_EVENT + bridge);
    }
    return pts;
  });
  const rpAfter = (k) => matches.slice(0, k + 1).reduce((a, m) => a + (m.win ? RP_WIN : m.tie ? 1 : 0), 0);
  const rankAfter = (k) => 1 + walks.filter((w) => w[k] > rpAfter(k)).length;

  const ev = {
    evIdx, season, stats, matches, pitBudget, scout, rankAfter,
    carry: () => carry,
    clearCarry() { carry = 0; },
    playQual(k, planId, styleId) {
      const base = season.bench;
      const m = runMatch(k, `Qualification ${k + 1} of ${MATCHES_PER_EVENT}`, base * 0.55, base * 0.12, base * (0.92 + 0.2 * (evIdx - 1)), base * 0.15, planId, styleId || scout('q' + k).id);
      matches[k] = m;
      return m;
    },
  };

  // ---- Alliance selection and playoffs ----
  const po = { role: 'none', seed: null, rounds: [], result: 'Not selected', bonus: 0 };
  const prog = rngFor(run.seed, 'playoffs' + evIdx);
  let curRound = null;
  ev.finishQuals = () => {
    const rp = rpAfter(MATCHES_PER_EVENT - 1), wins = matches.filter((m) => m.win).length;
    const rank = rankAfter(MATCHES_PER_EVENT - 1);
    const total = matches.reduce((a, m) => a + m.ours, 0);
    const res = { evIdx, matches, rp, wins, rank, avg: total / MATCHES_PER_EVENT, decisiveAuto: matches.filter((m) => m.win && m.alliance - m.autoPts <= m.opp).length, dtFail: matches.filter((m) => m.dtFailed).length, rankPath: matches.map((_, k) => rankAfter(k)), potential };
    ev.res = res;
    const strength = res.avg / season.bench;
    let role = 'captain', seed = rank;
    if (rank > 8) {
      const pickProb = Math.max(0.05, Math.min(0.97, 0.3 + (strength - 0.25) * 2.2)) * (rank > 18 ? 0.5 : 1);
      if (prog.chance(pickProb)) { role = 'picked'; seed = Math.min(8, Math.max(1, 9 - Math.ceil((rank - 8) / 3))); } else role = 'none';
    }
    po.role = role; po.seed = role === 'none' ? null : seed;
    res.playoff = po;
    if (role === 'none') { po.result = 'Not selected'; ev.playoffOver = true; ev.finalize(); } else ev.playoffOver = false;
    return res;
  };
  const used = new Set();
  ev.nextPlayoff = (planId) => {
    const base = season.bench;
    let firstOfRound = false;
    if (!curRound || curRound.done) {
      const round = po.rounds.length;
      let oppSeed = 9 - po.seed;
      used.add(po.seed);
      if (round > 0) {
        let s1 = (1 + prog.int(8)), s2 = (1 + prog.int(8)), tries = 0;
        let s = Math.min(s1, s2);
        while ((used.has(s) || s === po.seed) && tries++ < 20) { s1 = (1 + prog.int(8)); s2 = (1 + prog.int(8)); s = Math.min(s1, s2); }
        oppSeed = used.has(s) ? ((s % 8) + 1) : s;
      }
      used.add(oppSeed);
      curRound = { rd: { name: ROUND_NAMES[round], oppSeed, matches: [], won: false, score: '0-0' }, w: 0, l: 0, done: false, round };
      po.rounds.push(curRound.rd); firstOfRound = true;
    }
    const rd = curRound.rd;
    const oppBase = base * (0.92 + 0.2 * (evIdx - 1)), oppMean = oppBase * (1.55 - 0.1 * (rd.oppSeed - 1));
    const pMean = base * (po.role === 'captain' ? 0.58 : 0.46);
    const m = runMatch(rd.matches.length, `${rd.name}: match ${rd.matches.length + 1}`, pMean, base * 0.1, oppMean, oppBase * 0.2, planId, scout(`p${curRound.round}${rd.matches.length}`).id);
    rd.matches.push(m);
    if (m.win) curRound.w++; else curRound.l++;
    rd.score = `${curRound.w}-${curRound.l}`;
    let roundEnds = false;
    if (curRound.w === 2 || curRound.l === 2) {
      roundEnds = true; curRound.done = true; rd.won = curRound.w === 2;
      if (!rd.won) { po.result = ['Quarterfinalist', 'Semifinalist', 'Finalist'][curRound.round]; ev.playoffOver = true; } else if (curRound.round === 2) { po.result = 'Winner'; ev.playoffOver = true; }
    }
    if (ev.playoffOver) ev.finalize();
    return { match: m, rd, firstOfRound, roundEnds, eventOver: !!ev.playoffOver };
  };
  ev.peekPlayoff = () => {
    const fresh = !curRound || curRound.done;
    const r = fresh ? po.rounds.length : curRound.round, i = fresh ? 0 : curRound.rd.matches.length;
    return { round: r, idx: i, name: ROUND_NAMES[r], fresh, scout: scout(`p${r}${i}`) };
  };
  ev.finalize = () => {
    po.bonus = PLAYOFF_BONUS[po.result];
    ev.res.awards = computeAwards(run, stats, ev.res);
  };
  ev.result = () => ev.res;
  return ev;
}

// Plays a whole event with default choices (balance tests and quick previews).
export function simulateEvent(run, evIdx) {
  const ev = createEvent(run, evIdx);
  for (let k = 0; k < MATCHES_PER_EVENT; k++) ev.playQual(k, 'balanced');
  const res = ev.finishQuals();
  while (!ev.playoffOver) ev.nextPlayoff('balanced');
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
