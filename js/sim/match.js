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

export function repairMult(run) {
  const k = run.results.krayon;
  let m = 1;
  if (k) { if (k.electronicsHard) m += 1.5; if (k.toolBad) m += 1; }
  if (run.results.cad && run.results.cad.organized < 0.5) m += 0.3;
  return m;
}

export function simulateEvent(run, evIdx) {
  const season = SEASONS[run.seasonId];
  const stats = derive(run);
  const rng = rngFor(run.seed, 'event' + evIdx);
  const open = run.flaws.filter((f) => !f.fixed);
  const rm = repairMult(run);
  const matches = [];
  let carry = 0, rp = 0, wins = 0, total = 0, decisiveAuto = 0, dtFail = 0;

  for (let n = 0; n < MATCHES_PER_EVENT; n++) {
    const moments = [];
    let loss = 0, autoLost = false, endLost = false, repair = 0;
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
    if (moments.length && moments[moments.length - 1].text.startsWith('A complicated')) moments[moments.length - 1].principle = 'kiss';
    if (rng.chance((1 - stats.dtRel) * 0.4)) { dtFail++; loss += 0.5; repair += 1.5 * rm; moments.push({ kind: 'dead', clip: 'brownout', title: 'Drivetrain trouble', text: 'Without a working drivetrain, nothing else matters.', principle: 'drivetrain-king' }); }
    if (carry > 0) { loss += Math.min(0.4, carry * 0.2); moments.push({ kind: 'carry', clip: null, title: 'Rushed pit repair', text: 'The pit crew did not finish repairs last match.', principle: 'consistency' }); carry = 0; }
    loss = Math.min(1, loss);

    const cycles = Math.floor((season.teleopSec / stats.effCycle) * 0.62 * (1 - loss));
    const tele = cycles * stats.cycleSuccess * stats.ppc * stats.scorerPts * rng.range(0.9, 1.1);
    const autoPts = autoLost ? 0 : (rng.chance(stats.autoRel) ? stats.taxiPts + stats.ppc * stats.scorerPts * (stats.autoRel > 0.6 ? 1 : 0) : 0);
    const end = endLost ? 0 : (rng.chance(stats.endgameRel) ? stats.endgamePts : 0);
    const ours = Math.round(autoPts + tele + end);
    const partners = Math.max(0, Math.round(rng.normal(season.bench * 0.55, season.bench * 0.12)));
    const opp = Math.max(0, Math.round(rng.normal(season.bench * (0.92 + 0.2 * (evIdx - 1)), season.bench * 0.15)));
    const alliance = ours + partners;
    const win = alliance > opp, tie = alliance === opp;
    rp += win ? 2 : tie ? 1 : 0; if (win) wins++;
    if (win && alliance - autoPts <= opp) decisiveAuto++;
    total += ours;
    const over = Math.max(0, repair - PIT_BUDGET); carry = over;
    matches.push({ n: n + 1, ours, partners, alliance, opp, win, tie, moments, auto: Math.round(autoPts), tele: Math.round(tele), end, cycles, repair, carryOver: over > 0 });
  }
  const frng = rngFor(run.seed, 'field' + evIdx);
  let rank = 1;
  for (let t = 0; t < 23; t++) if (frng.normal(MATCHES_PER_EVENT * 1.0, 1.8) > rp) rank++;
  return { evIdx, matches, rp, wins, rank, avg: total / MATCHES_PER_EVENT, decisiveAuto, dtFail };
}

export function eventScore(res) { return Math.round(res.avg * 0.5 + res.wins * 3 + Math.max(0, 25 - res.rank)); }
