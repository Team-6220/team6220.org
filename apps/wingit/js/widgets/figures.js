// Figures from the team's source documents (cropped into assets/img) plus small drawn pictograms.
import { h, C } from '../ui.js';

const NASA = 'NASA RAP Design Guide', STD = '6220 Design Standards';
export const FIG = {
  'intake-toproller': ['Top-roller intake, Team 118 (2016)', `${NASA}, §5.5.1`],
  'intake-dustpan': ['Top roller and dustpan intake, Team 118 (2017)', `${NASA}, §5.5.1`],
  'intake-pincher': ['Pneumatic pincher with roller, Team 118 (2017)', `${NASA}, §5.5.1`],
  'intake-side': ['Side-roller intake, Team 118 (2015)', `${NASA}, §5.5.1`],
  'intake-clawroller': ['Roller claw on a pivoting arm, Team 118 (2018)', `${NASA}, §5.5.1`],
  'shooter-single': ['Single flywheel shooter with inertia wheel, Team 118 (2017)', `${NASA}, §5.6.1`],
  'shooter-dual': ['Dual flywheel shooter, Team 118', `${NASA}, §5.6.1`],
  'catapult-pneu': ['Pneumatic catapult, Team 118 (2016)', `${NASA}, §5.6.2`],
  'catapult-choo': ['Choo-choo catapult, Team JVN (2014)', `${NASA}, §5.6.2`],
  'turret-lazy': ['Lazy susan bearing turret base', `${NASA}, §5.7.1`],
  'elevator-2stage': ['Two-stage elevator, Team 118 (2019)', `${NASA}, §5.2.1`],
  'elevator-continuous': ['Continuous elevator rigging: one stage at a time', `${NASA}, §5.2.2`],
  'elevator-cascade': ['Cascade elevator rigging: all stages at once', `${NASA}, §5.2.2`],
  'elevator-box': ['Box-tube elevator, Team 254 (2018)', `${NASA}, §5.2.4`],
  'arm-single': ['Single-joint sheet-metal arm, Team 118 (2018)', `${NASA}, §5.3.1`],
  'arm-multi': ['Multi-joint arm, Team 971 (2018)', `${NASA}, §5.3.1`],
  fourbar: ['Double reverse four-bar linkage', `${NASA}, §5.4`],
  'dt-6wd': ['6-wheel drop-center drivetrain, Team 254 (2017)', `${NASA}, §5.1.3`],
  'dt-8wd': ['8-wheel drop-center drivetrain, Team 118 (2014)', `${NASA}, §5.1.3`],
  'dt-42': ['4+2 drivetrain, Team 118 (2017)', `${NASA}, §5.1.3`],
  'dt-h': ['H-drive, Team 118 (2019)', `${NASA}, §5.1.3`],
  'dt-swerve': ['Swerve drive, 221 Robotic Systems', `${NASA}, §5.1.3`],
  'light-isogrid': ['Isogrid lightening pattern, Team 118 (2017)', `${NASA}, §3.7`],
  'light-triangles': ['Triangle lightening pattern, Team 118 (2017)', `${NASA}, §3.7`],
  'rivet-joint': ['Riveted joint, Team 118 (2019)', `${NASA}, §2.3.6`],
  adjustability: ['Design for adjustability: slots and multiple spring points, Team 118 (2016)', `${NASA}, §1.1`],
  'std-rivet-guide': ['Mentor Bruce\'s rivet guide', `${STD}, Art. 4`],
  'std-limelight-mount': ['Limelight 3 mount: 0.015 in clearance to a known part', `${STD}, Art. 3`],
};

// Which picture shows each mechanism. 'fig:' is a source photo or diagram, 'pic:' is a drawn pictogram.
export const ART = {
  tank6: 'fig:dt-6wd', swerve: 'fig:dt-swerve', kit: 'fig:dt-8wd',
  // intakes
  roller: 'fig:intake-toproller', claw: 'fig:intake-pincher', dustpan: 'fig:intake-dustpan', underBumper: 'fig:intake-toproller', overBumper: 'fig:intake-toproller',
  floorGear: 'fig:intake-dustpan', stationCatch: 'pic:funnel', fuelRoller: 'fig:intake-toproller', cubeWheels: 'fig:intake-toproller', cubeClaw: 'fig:intake-pincher',
  cubeArm: 'fig:intake-clawroller', cargoRoller: 'fig:intake-toproller', hatchScoop: 'fig:intake-dustpan', comboClaw: 'fig:intake-pincher',
  wideRoller: 'fig:intake-toproller', hopperIntake: 'pic:hopper', funnelIntake: 'pic:funnel', cubeRoller: 'fig:intake-toproller', pneuClaw: 'fig:intake-pincher',
  coneTipper: 'fig:intake-side', stationFunnel: 'pic:funnel', floorCoral: 'fig:intake-side', algaeRoller: 'fig:intake-clawroller',
  slapdownHopper: 'pic:slapdown', slapdownPlain: 'pic:slapdown', fixedRoller: 'fig:intake-toproller', underFuel: 'fig:intake-side',
  // scorers
  flywheel: 'fig:shooter-single', lowGoal: 'pic:dumper', catapult: 'fig:catapult-pneu', fixedShooter: 'fig:shooter-dual', pivotShooter: 'fig:shooter-single', ampArm: 'fig:arm-single',
  gearPeg: 'fig:arm-single', fuelShooter: 'fig:shooter-single', gearFuel: 'fig:shooter-dual', switchDump: 'pic:dumper', elevatorArm: 'fig:elevator-box', scaleArm: 'fig:arm-multi',
  lowManip: 'fig:arm-single', elevManip: 'fig:elevator-2stage', shipDump: 'pic:dumper', bottomDump: 'pic:dumper', hoodShooter: 'fig:shooter-single', turretShooter: 'fig:turret-lazy',
  lowSpit: 'pic:dumper', telescopeArm: 'fig:arm-multi', pivotArm: 'fig:arm-single', troughRoller: 'pic:dumper', elevCoral: 'fig:elevator-box', coralAlgae: 'fig:elevator-2stage',
  rapidShooter: 'fig:shooter-dual', turretShooter2: 'fig:turret-lazy', singleShooter: 'fig:shooter-single', hubDumper: 'pic:dumper',
  // endgames
  lowRung: 'pic:hook', hookMidHigh: 'fig:elevator-continuous', traversal: 'fig:elevator-continuous', hookClimb: 'pic:hook', elevatorTrap: 'fig:elevator-cascade', ropeClimb: 'pic:winch', rungClimb: 'pic:hook', liftRamp: 'pic:ramp',
  lvl2Lift: 'pic:hook', lvl3Climb: 'pic:hook', hangHook: 'pic:hook', levelClimb: 'pic:hook', autoBalance: 'pic:balance', dockWedge: 'pic:wedge', shallowHook: 'pic:hook',
  deepWinch: 'pic:winch', towerHook: 'pic:hook', towerMid: 'pic:hook', towerClimb: 'fig:elevator-continuous',
};

export const imgSrc = (id) => `assets/img/${id}.jpg`;

export function figure(id, opts = {}) {
  const f = FIG[id];
  if (!f) return null;
  return h('figure', { class: 'fig' + (opts.small ? ' small' : '') },
    h('img', { src: imgSrc(id), alt: f[0], loading: 'lazy' }),
    h('figcaption', {}, f[0], h('span', { class: 'src' }, ' ' + f[1])));
}

// ---- Pictograms: simple side views in the team palette ----
function line(ctx, pts, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
}
const PICS = {
  hook(ctx) {
    ctx.fillStyle = C.g4; ctx.fillRect(10, 80, 130, 6); // bar
    line(ctx, [[75, 20], [75, 70]], C.white, 3);
    line(ctx, [[75, 20], [95, 20], [95, 32]], C.gold, 4);
    ctx.fillStyle = C.g4; ctx.fillRect(40, 70, 70, 20); ctx.strokeStyle = C.white; ctx.strokeRect(40, 70, 70, 20);
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(30, 40); ctx.lineTo(30, 20); ctx.lineTo(24, 28); ctx.moveTo(30, 20); ctx.lineTo(36, 28); ctx.stroke();
  },
  winch(ctx) {
    ctx.fillStyle = C.g4; ctx.fillRect(15, 10, 120, 8);
    line(ctx, [[75, 18], [75, 62]], C.gold, 2);
    ctx.fillStyle = C.g4; ctx.fillRect(45, 62, 60, 22); ctx.strokeStyle = C.white; ctx.strokeRect(45, 62, 60, 22);
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(75, 70, 7, 0, 7); ctx.fill();
    line(ctx, [[75, 54], [75, 38], [69, 46], [75, 38], [81, 46]], C.white, 2);
  },
  ramp(ctx) {
    ctx.fillStyle = C.g3; ctx.beginPath(); ctx.moveTo(15, 84); ctx.lineTo(135, 84); ctx.lineTo(135, 30); ctx.closePath(); ctx.fill(); ctx.strokeStyle = C.white; ctx.stroke();
    ctx.fillStyle = C.g4; ctx.fillRect(86, 38, 36, 18); ctx.strokeRect(86, 38, 36, 18);
    ctx.fillStyle = C.gold; ctx.fillRect(40, 62, 30, 16); ctx.strokeStyle = C.black; ctx.strokeRect(40, 62, 30, 16);
  },
  balance(ctx) {
    ctx.save(); ctx.translate(75, 56); ctx.rotate(-0.12);
    ctx.fillStyle = C.g4; ctx.fillRect(-60, -4, 120, 8); ctx.fillStyle = C.gold; ctx.fillRect(-18, -22, 36, 18);
    ctx.fillStyle = C.white; ctx.fillRect(-4, -18, 8, 8); ctx.restore();
    ctx.fillStyle = C.g5; ctx.beginPath(); ctx.moveTo(75, 60); ctx.lineTo(60, 84); ctx.lineTo(90, 84); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.white; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(75, 28, 14, -2.6, -0.5); ctx.stroke();
  },
  wedge(ctx) {
    ctx.fillStyle = C.g4; ctx.fillRect(10, 76, 130, 8);
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(52, 76); ctx.lineTo(98, 76); ctx.lineTo(98, 60); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.g3; ctx.fillRect(98, 44, 36, 32); ctx.strokeStyle = C.white; ctx.strokeRect(98, 44, 36, 32);
  },
  dumper(ctx) {
    ctx.save(); ctx.translate(55, 60); ctx.rotate(-0.5); ctx.fillStyle = C.g4; ctx.fillRect(-30, -12, 60, 24); ctx.strokeStyle = C.white; ctx.strokeRect(-30, -12, 60, 24); ctx.restore();
    ctx.fillStyle = C.gold; [[88, 40], [96, 52], [90, 62]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); });
    ctx.strokeStyle = C.white; ctx.strokeRect(108, 52, 28, 32);
  },
  hopper(ctx) {
    ctx.strokeStyle = C.white; ctx.lineWidth = 3; ctx.strokeRect(30, 30, 90, 50);
    ctx.fillStyle = C.gold; for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(42 + (i % 6) * 14, 44 + Math.floor(i / 6) * 18, 5, 0, 7); ctx.fill(); }
    line(ctx, [[125, 55], [143, 55], [137, 49], [143, 55], [137, 61]], C.gold, 2);
  },
  funnel(ctx) {
    ctx.fillStyle = C.g4; ctx.beginPath(); ctx.moveTo(15, 20); ctx.lineTo(135, 20); ctx.lineTo(95, 70); ctx.lineTo(55, 70); ctx.closePath(); ctx.fill(); ctx.strokeStyle = C.white; ctx.stroke();
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(75, 50, 8, 0, 7); ctx.fill();
  },
  slapdown(ctx) {
    ctx.strokeStyle = C.white; ctx.lineWidth = 3; ctx.strokeRect(55, 36, 64, 36);
    ctx.setLineDash([4, 4]); line(ctx, [[55, 54], [14, 54], [14, 76], [55, 76]], C.gold, 3); ctx.setLineDash([]);
    ctx.fillStyle = C.gold; ctx.fillRect(10, 76, 34, 8);
    line(ctx, [[48, 40], [22, 40], [28, 34], [22, 40], [28, 46]], C.white, 2);
  },
  generic(ctx) {
    ctx.strokeStyle = C.gold; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(75, 45, 22, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(75, 45, 8, 0, 7); ctx.stroke();
  },
};
export function pictogram(kind, w) {
  const cv = h('canvas', { width: 150, height: 90, class: 'pic', style: w ? `width:${w}px;height:${Math.round(w * 0.6)}px` : null });
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.black; ctx.fillRect(0, 0, 150, 90); ctx.lineWidth = 2; ctx.lineJoin = 'round';
  (PICS[kind] || PICS.generic)(ctx);
  return cv;
}

// A picture for a mechanism card: source photo when we have one, else a pictogram.
export function artFor(id) {
  const a = ART[id];
  if (!a) return null;
  if (a.startsWith('fig:')) {
    const fid = a.slice(4), f = FIG[fid];
    return h('div', { class: 'art' }, h('img', { src: imgSrc(fid), alt: f ? f[0] : '', loading: 'lazy' }), h('div', { class: 'cap' }, f ? f[0] : ''));
  }
  return h('div', { class: 'art' }, pictogram(a.slice(4)), h('div', { class: 'cap' }, 'Sketch'));
}
