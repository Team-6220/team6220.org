// Brute-force every legal mechanism combination per season and print the best few, so the team can check
// that the "obvious" real-world design is also the highest scoring one in the game.
import { newRun, setRun, setSlot } from '../js/state.js';
import { derive } from '../js/sim/robotModel.js';
import { simulateEvent } from '../js/sim/match.js';
import { SEASONS, SEASON_IDS } from '../js/data/seasons.js';
import { archList } from '../js/data/archetypes.js';

function build(seed, sid, ids) {
  const run = newRun(sid, seed, false); setRun(run);
  ['drivetrain', 'intake', 'scorer', 'endgame'].forEach((s, i) => setSlot(s, ids[i], 'borrowed', false));
  run.req = { optVar: SEASONS[sid].opt.best, tasks: SEASONS[sid].defaultTasks };
  run.results.shop = { weightDelta: 0, sensors: derive(run).sensorsNeeded, applied: {} };
  run.results.krayon = { intakeSide: 'front', scorerSide: 'back' }; run.results.sketch = { reachOk: true, stowOk: true, armMass: 2, polish: 0 };
  run.results.gears = { speedOk: true }; run.results.cad = { organized: 1 };
  run.hoursDesign = 75;
  run.flaws.forEach((f) => { f.fixed = true; });
  return run;
}
const only = process.argv[2];
for (const sid of SEASON_IDS) {
  if (only && only !== sid) continue;
  const rows = [];
  for (const dt of archList(sid, 'drivetrain')) for (const it of archList(sid, 'intake')) for (const sc of archList(sid, 'scorer')) for (const eg of archList(sid, 'endgame')) {
    const ids = [dt.id, it.id, sc.id, eg.id];
    const w = derive(build(1, sid, ids)).weight;
    if (w > SEASONS[sid].weightCap + 6) continue; // allow a few pounds of shop trimming
    let ours = 0, n = 12;
    for (let seed = 1; seed <= n; seed++) ours += simulateEvent(build(seed, sid, ids), 1).avg;
    rows.push({ ids: ids.join(' / '), ours: ours / n, w });
  }
  rows.sort((a, b) => b.ours - a.ours);
  console.log(`== ${sid} (${rows.length} legal combos)`);
  rows.slice(0, 3).forEach((r) => console.log('  ', r.ours.toFixed(0).padStart(4), Math.round(r.w) + ' lb', r.ids));
}
