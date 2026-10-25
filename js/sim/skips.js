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
  run.skipsApplied = true; save();
  return msgs;
}
