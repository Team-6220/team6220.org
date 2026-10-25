import { newRun, setRun, setSlot } from '../js/state.js';
import { derive } from '../js/sim/robotModel.js';
import { simulateEvent } from '../js/sim/match.js';
import { applySkips } from '../js/sim/skips.js';

function build(seed, sid, dt, it, sc, eg, src, mode) {
  const run = newRun(sid, seed, false); setRun(run);
  setSlot('drivetrain', dt, src, false); setSlot('intake', it, src, false); setSlot('scorer', sc, src, false); setSlot('endgame', eg, src, false);
  run.results.shop = { weightDelta: 0, sensors: derive(run).sensorsNeeded, applied: {} };
  if (mode === 'skip all') applySkips(run);
  else {
    run.results.krayon = { intakeSide: 'front', scorerSide: 'back' }; run.results.sketch = { reachOk: true, stowOk: true, armMass: 2, polish: 0 };
    run.results.gears = { speedOk: true }; run.results.cad = { organized: 1 };
  }
  run.hoursDesign = mode === 'skip all' ? 30 : 75;
  if (mode === 'flaws fixed') run.flaws.forEach((f) => { f.fixed = true; });
  return run;
}
const combos = {
  'simple good': ['rapidreact2022', 'tank6', 'roller', 'flywheel', 'lowRung'],
  'swerve+climber': ['rapidreact2022', 'swerve', 'dustpan', 'flywheel', 'traversal'],
  'minimal': ['rapidreact2022', 'kit', 'claw', 'lowGoal', 'none'],
  'crescendo simple': ['crescendo2024', 'tank6', 'underBumper', 'fixedShooter', 'hookClimb'],
  'crescendo big': ['crescendo2024', 'swerve', 'overBumper', 'pivotShooter', 'elevatorTrap'],
};
for (const [name, c] of Object.entries(combos)) for (const mode of ['untested', 'flaws fixed', 'skip all']) {
  let r1 = 0, r2 = 0, w = 0, n = 40;
  for (let seed = 1; seed <= n; seed++) { const run = build(seed, ...c, 'borrowed', mode); const a = simulateEvent(run, 1), b = simulateEvent(run, 2); r1 += a.rank; r2 += b.rank; w += a.wins; }
  console.log(name.padEnd(18), mode.padEnd(12), 'ev1 rank', (r1 / n).toFixed(1), 'wins', (w / n).toFixed(1), 'ev2 rank', (r2 / n).toFixed(1));
}
