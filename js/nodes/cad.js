// Organized CAD: rename features (Noun, Modifier), and find duplicate parts that break the BOM.
import { h, clear } from '../ui.js';
import { rngFor } from '../rng.js';
import { spend, unlock, addFlaw, save } from '../state.js';
import { shell, hint } from './common.js';

const POOL = [
  { ctx: 'Sketch for the front face of the Limelight 3 mount', good: 'Limelight 3 Mount Front', bad: ['sketch_final_v2', 'Sketch 14'] },
  { ctx: 'Gusset joining the lower front A-frame to the chassis', good: 'Gusset, Lower Front A-frame to Chassis', bad: ['gusset', 'Gusset For The Robot'] },
  { ctx: 'Part studio holding the shooter plates', good: 'Shooter Plates', bad: ['Part Studio 3', 'stuff for shooter'] },
  { ctx: 'Mount for the camera on the climber', good: 'Limelight 3 Mount, Climber', bad: ['limelight mount 2 NEW', 'Mount'] },
  { ctx: 'Plane through the shooter pivot axis', good: 'Plane, Shooter Pivot Axis', bad: ['Plane 7', 'pivotplane'] },
  { ctx: 'Folder for all the intake parts', good: 'Intake', bad: ['Folder 1', 'intake stuff'] },
  { ctx: 'Sketch of the belt run with the 65T HTD5M belt', good: 'Belt Run, Intake Roller', bad: ['Sketch 22', 'belts'] },
];
const BOM = [
  { name: 'Plate, Intake Side', dup: false }, { name: 'Plate, Intake Side', dup: true },
  { name: 'Spacer, 0.5" Hex x 1.0"', dup: false }, { name: 'Spacer, 0.5" Hex x 1.0"', dup: true },
  { name: 'Bracket, Limelight 3 Mount', dup: false },
  { name: 'Gusset, Lower Front A-frame to Chassis', dup: false }, { name: 'Gusset, Lower Front A-frame to Chassis', dup: true },
  { name: 'Standoff, 8-32 x 2.0"', dup: false },
];

export function mount(root, run, done) {
  const rng = rngFor(run.seed, 'cad');
  const items = rng.shuffle(POOL).slice(0, 5).map((p) => ({ ctx: p.ctx, opts: rng.shuffle([p.good, ...p.bad]), good: p.good, pick: null }));
  const dupPick = new Set();

  function render() {
    clear(root);
    const names = items.map((it, i) => h('div', { class: 'panel' },
      h('div', { class: 'small muted' }, it.ctx), h('div', {}, ...it.opts.map((o) => h('button', { class: 'btn' + (it.pick === o ? ' sel' : ''), style: 'margin:2px', onclick: () => { it.pick = o; render(); } }, o)))));
    const bom = h('table', {}, h('tr', {}, h('th', {}, 'Full assembly BOM'), h('th', {}, 'Duplicate part?')),
      ...BOM.map((b, i) => h('tr', {}, h('td', {}, b.name), h('td', {}, h('input', { type: 'checkbox', checked: dupPick.has(i) ? true : null, onchange: (e) => { e.target.checked ? dupPick.add(i) : dupPick.delete(i); } })))));
    const ready = items.every((it) => it.pick);
    root.append(shell('Organized CAD', 'Keep everything organized and consistent so the whole team (and manufacturing) can understand it.',
      hint(run, 'Names: noun first, modifiers after commas, Title Case, descriptive but not overly detailed. Tick the parts that are really duplicates of another part: copies belong in part studios, never twice in an assembly.'),
      h('div', { class: 'row' },
        h('div', { class: 'col grow' }, h('h3', {}, '1. Rename features'), ...names),
        h('div', { class: 'col', style: 'width:480px' }, h('h3', {}, '2. Duplicate parts in the BOM'), h('div', { class: 'panel' }, bom))),
      h('button', { class: 'btn primary', disabled: ready ? null : true, onclick: finish }, 'Commit organized CAD (6 h)')));
  }

  function finish() {
    const nameOk = items.filter((it) => it.pick === it.good).length / items.length;
    let right = 0, wrong = 0, dupTotal = 0;
    BOM.forEach((b, i) => { if (b.dup) dupTotal++; if (dupPick.has(i)) { b.dup ? right++ : wrong++; } });
    const dupScore = Math.max(0, (right - wrong) / dupTotal);
    const organized = nameOk * 0.6 + dupScore * 0.4;
    run.results.cad = { nameOk, dupScore, organized };
    spend(6);
    if (dupScore < 1) addFlaw({ id: 'bomMissing', name: 'Duplicate parts broke the BOM: parts missing at the event', sev: 0.45, kind: 'part', fixHours: 3, onlyTesting: false, hint: 'Tag copies and fix the automatic BOM.', found: false });
    unlock('naming'); unlock('duplicates-bom');
    save(); done();
  }
  render();
}
