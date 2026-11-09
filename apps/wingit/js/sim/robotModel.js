// Derives robot stats from the run's design choices and node results. No DOM access.
import { SEASONS } from '../data/seasons.js';
import { archetype } from '../data/archetypes.js';
import { BREAKTHROUGH_GAIN } from '../state.js';

export const SLOTS = ['drivetrain', 'intake', 'scorer', 'endgame'];
export const BASE_WEIGHT = 33; // battery + electronics + bumpers
export const TOTAL_HOURS = 320;
export const MAX_COMPLEXITY = 30;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function picks(run) {
  const out = {};
  for (const s of SLOTS) {
    const d = run.design[s];
    if (d) out[s] = archetype(run.seasonId, s, d.id);
  }
  return out;
}

export const hasPerk = (run, id) => !!(run.perks && run.perks.includes(id));

export function timeBudget(run, complexity, sensorCount, scratch) {
  const b = run.bonus || {};
  const mfgNeed = Math.max(20, (50 + 4 * complexity + 6 * scratch) * (hasPerk(run, 'machine-shop') ? 0.88 : 1) - (b.mfg || 0));
  const progNeed = Math.max(10, 20 + 5 * sensorCount + (run.results.shop ? (run.results.shop.progExtra || 0) : 0) - (b.prog || 0));
  const practice = TOTAL_HOURS - run.hoursDesign - mfgNeed - progNeed + (b.practice || 0) + (hasPerk(run, 'practice-field') ? 12 : 0);
  return {
    design: run.hoursDesign, mfgNeed, progNeed, practice,
    practiceFrac: clamp(practice / 80, 0, 1), shortfall: Math.max(0, -practice),
  };
}

export function derive(run) {
  const season = SEASONS[run.seasonId];
  const P = picks(run);
  const r = run.results;
  let weight = BASE_WEIGHT, complexity = 0, easeSum = 0, easeN = 0, scratch = 0, breakthroughs = 0;
  const needSensors = new Set(), tasks = new Set();
  for (const s of SLOTS) {
    const a = P[s];
    if (!a) continue;
    weight += a.wt; complexity += a.cx; easeSum += a.ease; easeN++;
    (a.sensors || []).forEach((x) => needSensors.add(x));
    (a.tasks || []).forEach((t) => tasks.add(t));
    if (run.design[s].source === 'scratch' && a.id !== 'none') scratch++;
    if (run.design[s].breakthrough) breakthroughs++;
  }
  weight += (r.sketch ? r.sketch.armMass || 0 : 0) + (r.shop ? r.shop.weightDelta || 0 : 0) + (r.dtGear && r.dtGear.motors === 6 ? 3 : 0);

  const decided = !!(r.shop && r.shop.sensors);
  const bought = new Set(decided ? r.shop.sensors : []);
  const extraSensors = decided ? [...bought].filter((x) => !needSensors.has(x)).length : 0;
  const missingSensors = decided ? [...needSensors].filter((x) => !bought.has(x)) : [...needSensors];
  complexity += extraSensors * 0.5;

  const dt = P.drivetrain, it = P.intake, sc = P.scorer, eg = P.endgame;
  const sides = r.krayon ? { intake: r.krayon.intakeSide, scorer: r.krayon.scorerSide } : { intake: 'front', scorer: 'front' };
  const needsTurn = !!dt && !dt.swerve && (season.layout === 'opposed' ? sides.intake === sides.scorer : sides.intake !== sides.scorer);
  const turnT = needsTurn ? 1.6 : 0;
  const gear = r.dtGear;
  const driveT = 4.2 * (dt ? dt.cycleMod : 1.2) * (sc && sc.driveFactor ? sc.driveFactor : 1) * (gear ? Math.max(0.85, Math.min(1.25, Math.pow(13 / gear.speed, 0.6))) : 1);
  // Bulk games (many balls per trip): hopper volume and intake/shooter rates set the cycle; otherwise fixed mechanism times.
  const bulk = !!season.bulk;
  const carried = bulk && it && sc ? Math.max(1, Math.min(it.cap || 1, sc.cap || 999)) : (sc ? sc.ppc : 0);
  const fillT = bulk && it ? 0.6 * carried / (it.rate || 4) : 0, shootT = bulk && sc ? carried / (sc.rate || 4) : 0;
  const mechT = bulk ? fillT + shootT + 0.8 : (it ? it.time : 2.5) + (sc ? sc.time : 2.5);
  let cycle = driveT + mechT + turnT + (r.sketch && r.sketch.motorAtEnd ? 0.4 : 0) - (r.sketch ? r.sketch.polish || 0 : 0);
  const aligned = !!(run.req && season.opt && run.req.optVar === season.opt.best);
  cycle *= (season.cycleMul || 1) * (1 - BREAKTHROUGH_GAIN * breakthroughs) * (aligned ? 0.95 : 1) * (1 - ((run.bonus && run.bonus.cycle) || 0));

  const budget = timeBudget(run, complexity, needSensors.size, scratch);
  const easeAvg = easeN ? easeSum / easeN : 0.6;
  const gearsOk = !!(r.gears && r.gears.speedOk);
  const driverSkill = (0.8 + 0.2 * budget.practiceFrac) * (0.88 + 0.12 * easeAvg) * (gearsOk ? 1 : 0.96);
  const effCycle = cycle / driverSkill;

  const reachOk = !!(r.sketch && r.sketch.reachOk);
  const sensorPenalty = missingSensors.length;
  // Two-piece games: an intake that cannot pick up what the scorer scores wastes the scorer.
  let pieceMult = 1;
  if (it && sc && it.pieces && sc.pieces) { const cover = sc.pieces.filter((x) => it.pieces.includes(x)).length / sc.pieces.length; pieceMult = cover === 0 ? 0.35 : 0.75 + 0.25 * cover; }
  let cycleSuccess = pieceMult * (it ? it.rel : 0.8) * (sc ? sc.rel : 0.8) * (1 - 0.006 * complexity) * (reachOk ? 1 : (r.sketch ? 0.45 : 0.6)) * (1 - 0.04 * sensorPenalty);
  const rushPenalty = Math.min(0.3, budget.shortfall * 0.01);
  cycleSuccess *= 1 - rushPenalty;

  const taskPts = (id) => { const t = season.tasks.find((x) => x.id === id); return t ? t.pts : 0; };
  const scorerPts = sc ? Math.max(0, ...(sc.tasks || []).map(taskPts)) : 0;
  const ppc = bulk ? (it && sc ? carried : 0) : (sc ? sc.ppc : 0);
  const endgamePts = eg ? (eg.tasks || []).reduce((s2, t) => s2 + taskPts(t), 0) : 0;
  const endgameRel = eg ? eg.rel * (1 - rushPenalty) : 0;
  const autoRel = clamp(0.9 - 0.2 * sensorPenalty - (budget.shortfall > 8 ? 0.25 : 0) - (dt && dt.swerve ? 0.05 : 0), 0.1, 0.95);

  return {
    weight, cap: season.weightCap, over: weight > season.weightCap, complexity, sensorsNeeded: [...needSensors], missingSensors,
    cycle, effCycle, cycleSuccess, driverSkill, ppc, scorerPts, endgamePts, endgameRel, autoRel, bulk, carried: bulk ? carried : null, aligned,
    autoCap: season.autoCap || ppc, taxiPts: taskPts('taxi') + (eg && eg.autoBonus ? eg.autoBonus : 0),
    throughput: effCycle > 0 ? (ppc * scorerPts * cycleSuccess) / effCycle : 0,
    budget, needsTurn, sides, picks: P, tasksCovered: [...tasks], reachOk, pieceMult, dtRel: (dt ? dt.rel : 0.8) - (gear && !gear.pushOk ? 0.03 : 0), scratch, breakthroughs,
  };
}
