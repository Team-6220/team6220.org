// Derives robot stats from the run's design choices and node results. No DOM access.
import { SEASONS } from '../data/seasons.js';
import { archetype } from '../data/archetypes.js';

export const SLOTS = ['drivetrain', 'intake', 'scorer', 'endgame'];
export const BASE_WEIGHT = 33; // battery + electronics + bumpers
export const TOTAL_HOURS = 200;
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

export function timeBudget(run, complexity, sensorCount, scratch) {
  const mfgNeed = 24 + 2.2 * complexity + 3 * scratch;
  const progNeed = 8 + 3.5 * sensorCount + (run.results.shop ? (run.results.shop.progExtra || 0) : 0);
  const practice = TOTAL_HOURS - run.hoursDesign - mfgNeed - progNeed;
  return {
    design: run.hoursDesign, mfgNeed, progNeed, practice,
    practiceFrac: clamp(practice / 50, 0, 1), shortfall: Math.max(0, -practice),
  };
}

export function derive(run) {
  const season = SEASONS[run.seasonId];
  const P = picks(run);
  const r = run.results;
  let weight = BASE_WEIGHT, complexity = 0, easeSum = 0, easeN = 0, scratch = 0;
  const needSensors = new Set(), tasks = new Set();
  for (const s of SLOTS) {
    const a = P[s];
    if (!a) continue;
    weight += a.wt; complexity += a.cx; easeSum += a.ease; easeN++;
    (a.sensors || []).forEach((x) => needSensors.add(x));
    (a.tasks || []).forEach((t) => tasks.add(t));
    if (run.design[s].source === 'scratch' && a.id !== 'none') scratch++;
  }
  weight += (r.sketch ? r.sketch.armMass || 0 : 0) + (r.shop ? r.shop.weightDelta || 0 : 0);

  const bought = new Set(r.shop && r.shop.sensors ? r.shop.sensors : needSensors);
  const extraSensors = r.shop && r.shop.sensors ? [...bought].filter((x) => !needSensors.has(x)).length : 0;
  const missingSensors = r.shop && r.shop.sensors ? [...needSensors].filter((x) => !bought.has(x)) : [];
  complexity += extraSensors * 0.5;

  const dt = P.drivetrain, it = P.intake, sc = P.scorer, eg = P.endgame;
  const sides = r.krayon ? { intake: r.krayon.intakeSide, scorer: r.krayon.scorerSide } : { intake: 'front', scorer: 'front' };
  const needsTurn = !!dt && !dt.swerve && (season.layout === 'opposed' ? sides.intake === sides.scorer : sides.intake !== sides.scorer);
  const turnT = needsTurn ? 1.6 : 0;
  const driveT = 4.2 * (dt ? dt.cycleMod : 1.2);
  let cycle = driveT + (it ? it.time : 2.5) + (sc ? sc.time : 2.5) + turnT + (r.sketch && r.sketch.motorAtEnd ? 0.4 : 0) - (r.sketch ? r.sketch.polish || 0 : 0);
  cycle *= 1 - 0.03 * scratch;

  const budget = timeBudget(run, complexity, needSensors.size, scratch);
  const easeAvg = easeN ? easeSum / easeN : 0.6;
  const gearsOk = !r.gears || r.gears.speedOk;
  const driverSkill = (0.8 + 0.2 * budget.practiceFrac) * (0.88 + 0.12 * easeAvg) * (gearsOk ? 1 : 0.96);
  const effCycle = cycle / driverSkill;

  const reachOk = !r.sketch || r.sketch.reachOk;
  const sensorPenalty = missingSensors.length;
  let cycleSuccess = (it ? it.rel : 0.8) * (sc ? sc.rel : 0.8) * (1 - 0.006 * complexity) * (reachOk ? 1 : 0.45) * (1 - 0.04 * sensorPenalty);
  const rushPenalty = Math.min(0.3, budget.shortfall * 0.01);
  cycleSuccess *= 1 - rushPenalty;

  const taskPts = (id) => { const t = season.tasks.find((x) => x.id === id); return t ? t.pts : 0; };
  const scorerPts = sc ? Math.max(0, ...(sc.tasks || []).map(taskPts)) : 0;
  const ppc = sc ? sc.ppc : 0;
  const endgamePts = eg ? (eg.tasks || []).reduce((s2, t) => s2 + taskPts(t), 0) : 0;
  const endgameRel = eg ? eg.rel * (1 - rushPenalty) : 0;
  const autoRel = clamp(0.9 - 0.2 * sensorPenalty - (budget.shortfall > 8 ? 0.25 : 0) - (dt && dt.swerve ? 0.05 : 0), 0.1, 0.95);

  return {
    weight, cap: season.weightCap, over: weight > season.weightCap, complexity, sensorsNeeded: [...needSensors], missingSensors,
    cycle, effCycle, cycleSuccess, driverSkill, ppc, scorerPts, endgamePts, endgameRel, autoRel, taxiPts: taskPts('taxi'),
    budget, needsTurn, sides, picks: P, tasksCovered: [...tasks], reachOk, dtRel: dt ? dt.rel : 0.8, scratch,
  };
}
