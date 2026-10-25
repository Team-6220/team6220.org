// Balance check across every season: prints average own score and event ranks for three robot styles.
// Target: a careful simple build ranks around 2-6 at the regional; skipping everything ranks far worse.
import { newRun, setRun, setSlot } from '../js/state.js';
import { derive } from '../js/sim/robotModel.js';
import { simulateEvent } from '../js/sim/match.js';
import { applySkips } from '../js/sim/skips.js';
import { SEASONS } from '../js/data/seasons.js';

const combos = {
  steamworks2017: { simple: ['tank6', 'floorGear', 'gearPeg', 'ropeClimb'], big: ['swerve', 'fuelRoller', 'gearFuel', 'ropeClimb'], minimal: ['kit', 'stationCatch', 'gearPeg', 'none'] },
  powerup2018: { simple: ['tank6', 'cubeWheels', 'switchDump', 'rungClimb'], big: ['swerve', 'cubeArm', 'elevatorArm', 'liftRamp'], minimal: ['kit', 'cubeClaw', 'switchDump', 'none'] },
  deepspace2019: { simple: ['tank6', 'cargoRoller', 'lowManip', 'lvl2Lift'], big: ['swerve', 'comboClaw', 'elevManip', 'lvl3Climb'], minimal: ['kit', 'hatchScoop', 'shipDump', 'none'] },
  infiniterecharge2020: { simple: ['tank6', 'wideRoller', 'hoodShooter', 'hangHook'], big: ['swerve', 'hopperIntake', 'turretShooter', 'levelClimb'], minimal: ['kit', 'funnelIntake', 'bottomDump', 'none'] },
  rapidreact2022: { simple: ['tank6', 'roller', 'flywheel', 'lowRung'], big: ['swerve', 'dustpan', 'flywheel', 'traversal'], minimal: ['kit', 'claw', 'lowGoal', 'none'] },
  chargedup2023: { simple: ['tank6', 'cubeRoller', 'pivotArm', 'autoBalance'], big: ['swerve', 'pneuClaw', 'telescopeArm', 'dockWedge'], minimal: ['kit', 'cubeRoller', 'lowSpit', 'none'] },
  crescendo2024: { simple: ['tank6', 'underBumper', 'fixedShooter', 'hookClimb'], big: ['swerve', 'overBumper', 'pivotShooter', 'elevatorTrap'], minimal: ['kit', 'claw', 'ampArm', 'none'] },
  reefscape2025: { simple: ['tank6', 'stationFunnel', 'elevCoral', 'shallowHook'], big: ['swerve', 'floorCoral', 'coralAlgae', 'deepWinch'], minimal: ['kit', 'stationFunnel', 'troughRoller', 'none'] },
  rebuilt2026: { simple: ['tank6', 'fixedRoller', 'singleShooter', 'towerHook'], meta: ['tank6', 'slapdownHopper', 'rapidShooter', 'towerHook'], big: ['swerve', 'slapdownHopper', 'turretShooter2', 'towerClimb'], minimal: ['kit', 'underFuel', 'hubDumper', 'none'] },
};

function build(seed, sid, c, mode) {
  const run = newRun(sid, seed, false); setRun(run);
  const [dt, it, sc, eg] = c;
  setSlot('drivetrain', dt, 'borrowed', false); setSlot('intake', it, 'borrowed', false); setSlot('scorer', sc, 'borrowed', false); setSlot('endgame', eg, 'borrowed', false);
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
const only = process.argv[2];
for (const [sid, styles] of Object.entries(combos)) {
  if (only && only !== sid) continue;
  if (!SEASONS[sid]) throw new Error('missing season ' + sid);
  for (const [style, c] of Object.entries(styles)) for (const mode of ['untested', 'flaws fixed', 'skip all']) {
    if (mode === 'skip all' && style !== 'simple') continue;
    let r1 = 0, r2 = 0, w = 0, ours = 0, n = 40, over = 0;
    for (let seed = 1; seed <= n; seed++) {
      const run = build(seed, sid, c, mode);
      if (derive(run).over) over++;
      const a = simulateEvent(run, 1), b = simulateEvent(run, 2);
      r1 += a.rank; r2 += b.rank; w += a.wins; ours += a.avg;
    }
    console.log(sid.padEnd(22), style.padEnd(8), mode.padEnd(12), 'ours', (ours / n).toFixed(0).padStart(3), 'ev1 rank', (r1 / n).toFixed(1).padStart(4), 'wins', (w / n).toFixed(1), 'ev2 rank', (r2 / n).toFixed(1).padStart(4), over ? ' OVERWEIGHT x' + over : '');
  }
}
