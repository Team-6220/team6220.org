import { newRun, setRun, setSlot, addFlaw } from '../js/state.js';
import { derive } from '../js/sim/robotModel.js';
import { simulateEvent, eventScore } from '../js/sim/match.js';
import { tutorialMap, randomMap } from '../js/map/mapGen.js';
import { rngFor } from '../js/rng.js';
import { SEASON_IDS } from '../js/data/seasons.js';
import { SLICE_IDS } from '../js/data/principles.js';

// map checks
for (let seed = 1; seed <= 200; seed++) {
  const m = randomMap(rngFor(seed, 'map'));
  const L = m.layers;
  if (L[0].length !== 1 || L[L.length - 1].length !== 1) throw new Error('bad ends ' + seed);
  for (let l = 0; l + 1 < L.length; l++) {
    const inc = new Set();
    L[l].forEach((n) => { if (!n.next.length) throw new Error(`dead end seed ${seed} layer ${l}`); n.next.forEach((i) => { if (!L[l + 1][i]) throw new Error('bad edge'); inc.add(i); }); });
    L[l + 1].forEach((_, i) => { if (!inc.has(i)) throw new Error(`unreachable seed ${seed} layer ${l + 1}`); });
  }
}
console.log('maps ok; tutorial layers', tutorialMap().layers.length);

function build(sid, dt, it, sc, eg, src) {
  const run = newRun(sid, 6220, false); setRun(run);
  setSlot('drivetrain', dt, src, false); setSlot('intake', it, src, false); setSlot('scorer', sc, src, false); setSlot('endgame', eg, src, false);
  run.req = { optVar: 'cycle', tasks: [] };
  run.results.krayon = { intakeSide: 'front', scorerSide: 'back', cgHigh: false };
  run.results.sketch = { reachOk: true, stowOk: true, armMass: 2, polish: 0 };
  run.results.shop = { weightDelta: 0, sensors: null, applied: {} };
  run.hoursDesign = 60;
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
  const run = build(...c, 'borrowed');
  const s = derive(run);
  const ev = simulateEvent(run, 1), ev2 = simulateEvent(run, 2);
  console.log(c.slice(1).join('/').padEnd(42), 'wt', s.weight.toFixed(0), 'cx', s.complexity.toFixed(1), 'cyc', s.effCycle.toFixed(1), 'practice', s.budget.practice.toFixed(0),
    '| ev1 avg', ev.avg.toFixed(0), 'rank', ev.rank, 'W', ev.wins, 'score', eventScore(ev), '| ev2 rank', ev2.rank, 'avg', ev2.avg.toFixed(0));
}
// determinism
const a = simulateEvent(build(...combos[0], 'borrowed'), 1), b = simulateEvent(build(...combos[0], 'borrowed'), 1);
if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('nondeterministic');
console.log('deterministic ok; slice principles', SLICE_IDS.length);
