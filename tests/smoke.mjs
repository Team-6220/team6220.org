import { newRun, setRun, setSlot } from '../js/state.js';
import { derive } from '../js/sim/robotModel.js';
import { simulateEvent, eventScore } from '../js/sim/match.js';
import { applySkips } from '../js/sim/skips.js';
import { buildPlan } from '../js/plan.js';
import { SLICE_IDS } from '../js/data/principles.js';
import { SEASONS, SEASON_IDS } from '../js/data/seasons.js';
import { archList, ALL_SENSORS } from '../js/data/archetypes.js';

// plan checks
for (const tutorial of [true, false]) for (let seed = 1; seed <= 50; seed++) {
  const plan = buildPlan(seed, tutorial);
  if (plan.length !== 6) throw new Error('plan length');
  const keys = plan.flatMap((p) => p.items.map((i) => i.key));
  if (new Set(keys).size !== keys.length) throw new Error('dup keys');
  if (!plan[1].items.some((i) => i.key === 'inspire-a' && i.required)) throw new Error('inspire required');
}
console.log('plans ok');

// season data checks: every task id, sensor and reach used by a mechanism must exist and fit the sketch widget
for (const sid of SEASON_IDS) {
  const se = SEASONS[sid];
  if (!se.videoId || !se.bench || !se.defaultTasks.length) throw new Error(sid + ': missing videoId/bench/defaultTasks');
  const taskIds = se.tasks.map((t) => t.id);
  se.defaultTasks.forEach((t) => { if (!taskIds.includes(t)) throw new Error(sid + ': bad default task ' + t); });
  for (const slot of ['drivetrain', 'intake', 'scorer', 'endgame']) {
    const list = archList(sid, slot);
    if (list.length < 2) throw new Error(sid + ': too few ' + slot);
    for (const a of list) {
      (a.tasks || []).forEach((t) => { if (!taskIds.includes(t)) throw new Error(`${sid}/${a.id}: unknown task ${t}`); });
      (a.sensors || []).forEach((x) => { if (!ALL_SENSORS.includes(x)) throw new Error(`${sid}/${a.id}: unknown sensor ${x}`); });
      if (a.reach && (a.reach.h > 56 || a.reach.x + 28 > 76 || a.reach.x + 28 < 2)) throw new Error(`${sid}/${a.id}: reach outside sketch`);
    }
  }
}
// the master sketch must be solvable (reach the target AND stow inside the frame) for every scorer
for (const sid of SEASON_IDS) for (const a of archList(sid, 'scorer')) {
  const se = SEASONS[sid], tx = 28 + a.reach.x, ty = a.reach.h;
  let ok = false;
  for (let px = 0; px <= 60 && !ok; px += 0.5) for (let py = 4; py <= se.heightLimit - 2 && !ok; py += 0.5) for (let L = 8; L <= 44 && !ok; L++) {
    const d = Math.hypot(tx - px, ty - py), ang = (Math.atan2(ty - py, tx - px) * 180) / Math.PI;
    if (Math.abs(d - L) <= 3.5 && ang >= -30 && ang <= 180 && px - L >= 0) ok = true;
  }
  if (!ok) throw new Error(`${sid}/${a.id}: master sketch has no solution`);
}
console.log('season data ok:', SEASON_IDS.length, 'seasons');

function build(seed, sid, dt, it, sc, eg, src, skip) {
  const run = newRun(sid, seed, false); setRun(run);
  setSlot('drivetrain', dt, src, false); setSlot('intake', it, src, false); setSlot('scorer', sc, src, false); setSlot('endgame', eg, src, false);
  run.req = { optVar: 'cycle', tasks: [] };
  run.results.shop = { weightDelta: 0, sensors: derive(run).sensorsNeeded, applied: {} };
  if (!skip) {
    run.results.krayon = { intakeSide: 'front', scorerSide: 'back', cgHigh: false };
    run.results.sketch = { reachOk: true, stowOk: true, armMass: 2, polish: 0 };
    run.results.gears = { speedOk: true, beltOk: true, tension: true };
    run.results.cad = { organized: 1 };
  } else applySkips(run);
  run.hoursDesign = 70;
  return run;
}
const combos = [
  ['rapidreact2022', 'tank6', 'roller', 'flywheel', 'lowRung'],
  ['rapidreact2022', 'swerve', 'dustpan', 'flywheel', 'traversal'],
  ['rapidreact2022', 'kit', 'claw', 'lowGoal', 'none'],
  ['crescendo2024', 'tank6', 'underBumper', 'fixedShooter', 'hookClimb'],
  ['crescendo2024', 'swerve', 'overBumper', 'pivotShooter', 'elevatorTrap'],
];
for (const c of combos) {
  const run = build(6220, ...c, 'borrowed', false);
  const s = derive(run);
  const ev = simulateEvent(run, 1), ev2 = simulateEvent(run, 2);
  console.log(c.slice(1).join('/').padEnd(42), 'wt', s.weight.toFixed(0), 'cx', s.complexity.toFixed(1), 'cyc', s.effCycle.toFixed(1), 'practice', s.budget.practice.toFixed(0),
    '| ev1 rank', ev.rank, 'W', ev.wins, 'score', eventScore(ev), '| ev2 rank', ev2.rank);
}
const a = simulateEvent(build(6220, ...combos[0], 'borrowed', false), 1), b = simulateEvent(build(6220, ...combos[0], 'borrowed', false), 1);
if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('nondeterministic');
console.log('deterministic ok; slice principles', SLICE_IDS.length, SLICE_IDS.includes('kiss') ? 'KISS STILL PRESENT' : '(kiss merged)');
