// How often does a reasonable build win? Prints playoff outcome distribution per event for simple builds.
import { newRun, setRun, setSlot } from '../js/state.js';
import { derive } from '../js/sim/robotModel.js';
import { simulateEvent } from '../js/sim/match.js';
import { SEASONS, SEASON_IDS } from '../js/data/seasons.js';
const BEST = {
  steamworks2017: ['tank6', 'floorGear', 'gearPeg', 'ropeClimb'], powerup2018: ['tank6', 'cubeWheels', 'scaleArm', 'rungClimb'], deepspace2019: ['tank6', 'cargoRoller', 'elevManip', 'lvl2Lift'],
  infiniterecharge2020: ['tank6', 'hopperIntake', 'turretShooter', 'hangHook'], rapidreact2022: ['tank6', 'roller', 'flywheel', 'lowRung'], chargedup2023: ['tank6', 'cubeRoller', 'pivotArm', 'autoBalance'],
  crescendo2024: ['tank6', 'underBumper', 'fixedShooter', 'hookClimb'], reefscape2025: ['tank6', 'stationFunnel', 'elevCoral', 'shallowHook'], rebuilt2026: ['tank6', 'slapdownHopper', 'rapidShooter', 'towerHook'],
};
function build(seed, sid, ids, fixed) {
  const run = newRun(sid, seed, false); setRun(run);
  ['drivetrain', 'intake', 'scorer', 'endgame'].forEach((s, i) => setSlot(s, ids[i], 'borrowed', false));
  run.req = { optVar: SEASONS[sid].opt.best, tasks: SEASONS[sid].defaultTasks };
  run.results.shop = { weightDelta: 0, sensors: derive(run).sensorsNeeded, applied: {} };
  run.results.krayon = { intakeSide: 'front', scorerSide: 'back' }; run.results.sketch = { reachOk: true, stowOk: true, armMass: 2, polish: 0 };
  run.results.gears = { speedOk: true }; run.results.cad = { organized: 1 };
  run.hoursDesign = 75;
  if (fixed) run.flaws.forEach((f) => { f.fixed = true; });
  return run;
}
const agg = { 1: {}, 2: {} };
for (const sid of SEASON_IDS) for (let seed = 1; seed <= 30; seed++) for (const ev of [1, 2]) {
  const r = simulateEvent(build(seed, sid, BEST[sid], process.argv[2] !== 'untested'), ev);
  const k = r.playoff.result; agg[ev][k] = (agg[ev][k] || 0) + 1;
}
const n = SEASON_IDS.length * 30;
for (const ev of [1, 2]) console.log('event', ev, Object.entries(agg[ev]).map(([k, v]) => `${k} ${Math.round(100 * v / n)}%`).join(', '));
