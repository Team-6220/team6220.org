// Skipping design steps has consequences, applied when the first event begins.
import { addFlaw, save } from '../state.js';

export function applySkips(run) {
  const r = run.results, msgs = [];
  if (!r.sketch) {
    addFlaw({ id: 'noMaster', name: 'No master sketch: mechanisms do not reach the targets', sev: 0.5, kind: 'cycles', fixHours: 6, onlyTesting: false, hint: 'Test to confirm, then redo the layout from a master sketch.', found: false });
    msgs.push('You skipped the master sketch: reach and layout were guesswork.');
  }
  if (!r.krayon) {
    addFlaw({ id: 'noLayout', name: 'No Krayon layout: electronics buried, nothing planned for access', sev: 0.5, kind: 'brownout', fixHours: 8, onlyTesting: false, hint: 'Do a Krayon layout, move the electronics out from under mechanisms, and keep them reachable.', found: false });
    msgs.push('You skipped Krayon CAD: packaging and electronics placement were never checked.');
  }
  if (!r.cad) {
    r.cad = { nameOk: 0, dupScore: 0, organized: 0 };
    addFlaw({ id: 'bomMissing', name: 'Messy CAD broke the BOM: parts missing at the event', sev: 0.45, kind: 'part', fixHours: 3, onlyTesting: false, hint: 'Tag duplicate parts and fix the automatic BOM.', found: false });
    msgs.push('You skipped organized CAD: unnamed parts and a broken BOM.');
  }
  if (!r.gears) {
    addFlaw({ id: 'noTensioner', name: 'No tensioner: belt or chain jumps under load', sev: 0.5, kind: 'chain', fixHours: 4, onlyTesting: true, hint: 'Add slotted holes or a tensioner so the belt or chain can be tightened.', found: false });
    msgs.push('You skipped gears and belts: speeds and belt tension were never checked.');
  }
  if (!r.dtGear) {
    addFlaw({ id: 'noGearing', name: 'Drivetrain gearing was a guess: slow, or easy to push around', sev: 0.4, kind: 'cycles', fixHours: 4, onlyTesting: true, hint: 'Pick the wheel, motors and ratio so you are fast enough but still hard to push.', found: false });
    msgs.push('You skipped drivetrain gearing: the ratio was a guess.');
  }
  if (!r.review) {
    const pool = [
      { id: 'rev-elec', name: 'Electronics buried under the arm pivot', kind: 'brownout', sev: 0.45, fixHours: 8, onlyTesting: false, hint: 'Move the RoboRIO and PDH out from under the mechanism.' },
      { id: 'rev-adj', name: 'Shooter cannot be tuned (no adjustability)', kind: 'cycles', sev: 0.35, fixHours: 5, onlyTesting: true, hint: 'Add slots and multiple mounting points where accuracy matters.' },
      { id: 'rev-chain', name: 'Chain run without a tensioner', kind: 'chain', sev: 0.4, fixHours: 5, onlyTesting: false, hint: 'Add a tensioner or make one side easy to detach.' },
      { id: 'rev-access', name: 'Fasteners that cannot be reached with a tool', kind: 'part', sev: 0.3, fixHours: 4, onlyTesting: false, hint: 'Leave room for the screwdriver and rivet gun.' },
    ];
    const pick = pool.slice().sort((a, b) => (a.id.charCodeAt(4) * 7 + run.seed) % 5 - (b.id.charCodeAt(4) * 7 + run.seed) % 5).slice(0, 2);
    pick.forEach((f) => addFlaw(Object.assign({ found: false }, f)));
    msgs.push('You skipped the design review: problems a fresh pair of eyes would have caught are still in the design.');
  }
  run.skipsApplied = true; save();
  return msgs;
}
