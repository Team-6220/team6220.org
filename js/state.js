// Run + meta state, persistence, principle unlocks.
import { archetype } from './data/archetypes.js';
import { PRINCIPLE_MAP } from './data/principles.js';

const META_KEY = 'wingit_meta_v1';
const RUN_KEY = 'wingit_run_v1';
export const hooks = { toast: () => {}, hud: () => {} };

const store = (typeof localStorage !== 'undefined') ? localStorage : null;
function read(key, fallback) {
  try { const s = store && store.getItem(key); return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
}
function write(key, val) { try { if (store) store.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ } }

export const meta = Object.assign({ codex: {}, best: {}, runsDone: 0, tutorialDone: false }, read(META_KEY, {}));
export function saveMeta() { write(META_KEY, meta); }

let run = null;
export function getRun() { return run; }
export function setRun(r) { run = r; save(); }
export function loadSavedRun() { const r = read(RUN_KEY, null); if (r && r.v === 1 && !r.done) { run = r; return r; } return null; }
export function hasSavedRun() { const r = read(RUN_KEY, null); return !!(r && r.v === 1 && !r.done); }
export function save() { if (run) write(RUN_KEY, run); }
export function clearRun() { run = null; try { if (store) store.removeItem(RUN_KEY); } catch (e) { /* ignore */ } }

export function newRun(seasonId, seed, tutorial) {
  return {
    v: 1, seed, tutorial: !!tutorial, seasonId,
    hoursDesign: 0, req: null,
    design: { drivetrain: null, intake: null, scorer: null, endgame: null },
    results: {}, flaws: [], map: null, cur: null, path: [],
    triggered: [], log: [], events: [], done: false, score: null, counters: {},
  };
}

export function spend(hours) {
  if (!run) return;
  run.hoursDesign += hours;
  save(); hooks.hud();
}

export function unlock(id) {
  if (!run || !PRINCIPLE_MAP[id]) return false;
  const p = PRINCIPLE_MAP[id];
  if (!run.triggered.includes(id)) run.triggered.push(id);
  if (!meta.codex[id]) {
    meta.codex[id] = true; saveMeta();
    hooks.toast('Principle unlocked: ' + p.title);
  }
  save();
  return true;
}

export function bump(name) { run.counters[name] = (run.counters[name] || 0) + 1; return run.counters[name]; }

export function addFlaw(flaw) {
  if (run.flaws.some((f) => f.id === flaw.id)) return;
  run.flaws.push(Object.assign({ found: false, fixed: false, slot: null }, flaw));
  save();
}
export function removeFlaw(id) { run.flaws = run.flaws.filter((f) => f.id !== id); save(); }

// Choose a mechanism for a slot. source: 'borrowed' (known flaws, low risk) | 'scratch' (hidden flaws, innovation bonus)
export function setSlot(slot, id, source, rushed) {
  run.flaws = run.flaws.filter((f) => f.slot !== slot);
  run.design[slot] = { id, source, rushed: !!rushed };
  const a = archetype(run.seasonId, slot, id);
  for (const f of a.flaws) {
    addFlaw(Object.assign({}, f, { slot, found: source === 'borrowed' }));
  }
  if (source === 'scratch' && id !== 'none') {
    addFlaw({ id: 'integration-' + slot, name: 'Unforeseen interface problem (' + slot + ')', sev: 0.4, kind: 'cycles', fixHours: 5, onlyTesting: true,
      hint: 'Scratch designs hide integration problems that only show up when built and tested.', slot, found: false });
  }
  if (rushed) {
    addFlaw({ id: 'rushed-' + slot, name: 'Rush-built ' + slot + ' (never planned)', sev: 0.5, kind: 'dead', fixHours: 6, onlyTesting: false, hint: 'You skipped planning this mechanism.', slot, found: true });
  }
  if (run.results.proto && run.results.proto.tuned) removeFlaw('intakeJam');
  save(); hooks.hud();
}

export function currentSeasonId() { return run && run.seasonId; }
