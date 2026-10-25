import { newRun, setRun, setSlot } from '../js/state.js';
import { derive } from '../js/sim/robotModel.js';
import { simulateEvent, eventScore } from '../js/sim/match.js';
import { applySkips } from '../js/sim/skips.js';
import { buildPlan } from '../js/plan.js';
import { SLICE_IDS } from '../js/data/principles.js';

// plan checks
for (const tutorial of [true, false]) for (let seed = 1; seed <= 50; seed++) {
  const plan = buildPlan(seed, tutorial);
  if (plan.length !== 6) throw new Error('plan length');
  const keys = plan.flatMap((p) => p.items.map((i) => i.key));
  if (new Set(keys).size !== keys.length) throw new Error('dup keys');
  if (!plan[1].items.some((i) => i.key === 'inspire-a' && i.required)) throw new Error('inspire required');
}
console.log('plans ok');

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
