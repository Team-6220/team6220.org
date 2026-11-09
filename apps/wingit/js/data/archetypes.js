// Mechanism archetypes per season. `flaws` are hidden until found (borrowed designs show them up front).
// kind: cycles | tip | brownout | chain | auto | endgame | dead | part | inspect
const none = { id: 'none', name: 'No endgame mechanism', wt: 0, cx: 0, rel: 1, ease: 1, time: 0, tasks: [], ppc: 0, sensors: [], flaws: [], note: 'Build less robot: the lightest mechanism is the one you skip.' };

const DRIVETRAINS = [
  { id: 'tank6', name: '6-wheel West Coast tank', wt: 40, cx: 3, rel: 0.95, ease: 0.7, cycleMod: 1.0, sensors: ['gyro', 'drive encoders'], flaws: [],
    note: 'Drivetrain is king: boring, reliable, easy to repair. Must turn around to switch directions.' },
  { id: 'swerve', name: 'Swerve drive', wt: 46, cx: 8, rel: 0.86, ease: 1.0, cycleMod: 0.8, swerve: true, sensors: ['gyro', 'absolute encoders', 'drive encoders'],
    flaws: [{ id: 'swerveCalib', name: 'Module zeroing drifts after hard hits', sev: 0.45, kind: 'auto', fixHours: 6, onlyTesting: true, hint: 'Add a re-zero routine from the absolute encoders.' }],
    note: 'Drives any direction without turning, but complex and heavy on programming hours.' },
  { id: 'kit', name: 'Kit-of-parts chassis', wt: 48, cx: 2, rel: 0.97, ease: 0.55, cycleMod: 1.15, sensors: ['gyro'], flaws: [],
    note: 'Fast to build, heavy, slow to turn.' },
];

const intakeFlaw = { id: 'intakeJam', name: 'Intake jams or skips game pieces', sev: 0.5, kind: 'cycles', fixHours: 5, onlyTesting: true, hint: 'Tune compression and keep roller speed above drive speed (touch it, own it).' };
const pneumLeak = { id: 'pneumLeak', name: 'Slow air leak weakens the claw', sev: 0.35, kind: 'cycles', fixHours: 4, onlyTesting: true, hint: 'Check fittings and add a regulator.' };

const ARCH = {
  rapidreact2022: {
    drivetrain: DRIVETRAINS,
    intake: [
      { id: 'roller', name: 'Over-bumper roller', wt: 9, cx: 3, rel: 0.93, ease: 0.9, time: 1.2, sensors: ['beam break'], flaws: [intakeFlaw], tunable: true,
        note: 'Touch it, own it: rollers are almost always the answer.' },
      { id: 'claw', name: 'Pneumatic claw', wt: 14, cx: 6, rel: 0.85, ease: 0.6, time: 2.2, sensors: ['limit switch'], flaws: [pneumLeak],
        note: 'Not a touch-it-own-it intake; slow and finicky.' },
      { id: 'dustpan', name: 'Dustpan + top roller', wt: 11, cx: 4, rel: 0.9, ease: 0.8, time: 1.5, sensors: ['beam break'], flaws: [intakeFlaw], tunable: true,
        note: 'Positive grip on balls, a little more to build.' },
    ],
    scorer: [
      { id: 'flywheel', name: 'Single flywheel + hood', wt: 24, cx: 6, rel: 0.88, ease: 0.8, time: 1.8, tasks: ['low', 'high'], ppc: 2, sensors: ['flywheel encoder', 'vision'],
        reach: { x: 0, h: 36 },
        flaws: [{ id: 'flywheelDip', name: 'Wheel slows after each shot; shots land short', sev: 0.4, kind: 'cycles', fixHours: 6, onlyTesting: true, hint: 'Add inertia and velocity PID.' }],
        note: 'The standard high-goal solution. Needs vision for aiming.' },
      { id: 'lowGoal', name: 'Low-goal dumper', wt: 8, cx: 2, rel: 0.95, ease: 0.9, time: 1.0, tasks: ['low'], ppc: 2, sensors: [], reach: { x: 6, h: 22 }, flaws: [],
        note: 'Simple, light, reliable. Only low points.' },
      { id: 'catapult', name: 'Pneumatic catapult', wt: 20, cx: 5, rel: 0.84, ease: 0.7, time: 2.4, tasks: ['high'], ppc: 1, sensors: ['limit switch'], reach: { x: 4, h: 40 },
        flaws: [{ id: 'pressureDrift', name: 'Shot distance changes with air pressure', sev: 0.35, kind: 'cycles', fixHours: 4, onlyTesting: true, hint: 'Regulate pressure; keep tuning slots.' }],
        note: 'One ball at a time; accuracy depends on pressure.' },
    ],
    endgame: [
      none,
      { id: 'lowRung', name: 'Hook climber (low rung)', wt: 10, cx: 3, rel: 0.92, ease: 0.9, time: 0, tasks: ['climbLow'], ppc: 0, sensors: ['limit switch'], flaws: [],
        note: 'Light and dependable endgame points.' },
      { id: 'hookMidHigh', name: 'Telescoping hook climber (mid and high rung)', wt: 18, cx: 6, rel: 0.78, ease: 0.8, time: 0, tasks: ['climbHigh'], ppc: 0, sensors: ['limit switch', 'arm encoder'],
        flaws: [{ id: 'climbSync', name: 'Hooks catch the rung unevenly', sev: 0.4, kind: 'endgame', fixHours: 6, onlyTesting: true, hint: 'Mechanical sync and a tuned climb sequence.' }],
        note: 'The climber most strong teams built: ten points from the high rung.' },
      { id: 'traversal', name: 'Telescoping traversal climber', wt: 34, cx: 9, rel: 0.62, ease: 0.5, time: 0, tasks: ['climbTrav'], ppc: 0, sensors: ['arm encoder', 'limit switch'],
        flaws: [{ id: 'climbSync', name: 'Hooks desync and the robot swings', sev: 0.55, kind: 'endgame', fixHours: 8, onlyTesting: true, hint: 'Mechanical sync and a tuned climb sequence.' }],
        note: '15 points if it works. Heavy, tall, and complicated.' },
    ],
  },
  crescendo2024: {
    drivetrain: DRIVETRAINS,
    intake: [
      { id: 'underBumper', name: 'Under-bumper roller', wt: 8, cx: 4, rel: 0.9, ease: 0.95, time: 1.0, sensors: ['beam break'], flaws: [intakeFlaw], tunable: true,
        note: 'Fast pickup, protected by the bumper, but tight packaging.' },
      { id: 'overBumper', name: 'Over-bumper roller', wt: 10, cx: 3, rel: 0.93, ease: 0.9, time: 1.2, sensors: ['beam break'], flaws: [intakeFlaw], tunable: true,
        note: 'Simple and forgiving.' },
      { id: 'claw', name: 'Pneumatic claw', wt: 13, cx: 6, rel: 0.85, ease: 0.6, time: 2.2, sensors: ['limit switch'], flaws: [pneumLeak],
        note: 'Not touch-it-own-it.' },
    ],
    scorer: [
      { id: 'fixedShooter', name: 'Fixed-angle shooter', wt: 18, cx: 4, rel: 0.9, ease: 0.85, time: 1.6, tasks: ['speaker'], ppc: 1, sensors: ['flywheel encoder'], reach: { x: -4, h: 22 },
        flaws: [{ id: 'flywheelDip', name: 'Wheel slows after each shot; shots land short', sev: 0.35, kind: 'cycles', fixHours: 5, onlyTesting: true, hint: 'Add velocity PID.' }],
        note: 'Simple and reliable; must be positioned precisely.' },
      { id: 'pivotShooter', name: 'Pivoting shooter', wt: 24, cx: 7, rel: 0.84, ease: 0.85, time: 1.4, tasks: ['speaker', 'amp'], ppc: 1, sensors: ['arm encoder', 'vision'], reach: { x: 0, h: 26 },
        flaws: [{ id: 'pivotBacklash', name: 'Pivot backlash makes shots inconsistent', sev: 0.45, kind: 'cycles', fixHours: 6, onlyTesting: true, hint: 'Reduce backlash; mount the sensor near the pivot.' }],
        note: 'Shoots from anywhere and can do the amp. More mechanism, more programming.' },
      { id: 'ampArm', name: 'Amp scoring arm', wt: 15, cx: 5, rel: 0.88, ease: 0.8, time: 2.0, tasks: ['amp'], ppc: 1, sensors: ['limit switch'], reach: { x: 8, h: 30 }, flaws: [],
        note: 'Light, but amp points are small.' },
    ],
    endgame: [
      none,
      { id: 'hookClimb', name: 'Hook climber', wt: 14, cx: 4, rel: 0.9, ease: 0.9, time: 0, tasks: ['climb'], ppc: 0, sensors: ['limit switch'], flaws: [],
        note: 'A simple, dependable climb.' },
      { id: 'elevatorTrap', name: 'Elevator + trap', wt: 28, cx: 9, rel: 0.6, ease: 0.5, time: 0, tasks: ['climb', 'trap'], ppc: 0, sensors: ['arm encoder', 'limit switch'],
        flaws: [{ id: 'elevatorBind', name: 'Elevator binds under side load', sev: 0.5, kind: 'endgame', fixHours: 8, onlyTesting: true, hint: 'Widen the bearing spread.' }],
        note: 'Climb and trap, but tall, heavy and hard to tune.' },
    ],
  },
};

// ---- More seasons (compact helpers). Numbers are approximate teaching values. ----
const F = (id, name, sev, kind, fixHours, hint) => ({ id, name, sev, kind, fixHours, onlyTesting: true, hint });
const I = (id, name, wt, cx, rel, ease, time, sensors, note, extra) => Object.assign({ id, name, wt, cx, rel, ease, time, sensors, flaws: [], note }, extra);
const S = (id, name, wt, cx, rel, ease, time, tasks, ppc, reach, sensors, note, extra) => Object.assign({ id, name, wt, cx, rel, ease, time, tasks, ppc, reach, sensors, flaws: [], note }, extra);
const E = (id, name, wt, cx, rel, tasks, sensors, note, extra) => Object.assign({ id, name, wt, cx, rel, ease: 0.9, time: 0, tasks, ppc: 0, sensors, flaws: [], note }, extra);
const dips = (sev) => F('flywheelDip', 'Wheel slows after each shot; shots land short', sev, 'cycles', 5, 'Add inertia and velocity PID.');
const elevBind = F('elevatorBind', 'Elevator binds under side load', 0.45, 'cycles', 7, 'Widen the bearing spread and keep the carriage square.');
const climbFail = (n) => F('climbSync', n, 0.5, 'endgame', 8, 'Mechanical sync and a tuned climb sequence.');
const turretWobble = F('turretBacklash', 'Turret wobble hurts accuracy', 0.45, 'cycles', 7, 'Use a larger bearing and tighten the sensor mount.');

Object.assign(ARCH, {
  steamworks2017: {
    drivetrain: DRIVETRAINS,
    intake: [
      I('floorGear', 'Floor gear intake', 11, 5, 0.88, 0.85, 1.6, ['beam break'], 'Pick gears off the floor. Tight tolerances: gears jam if misaligned.', { flaws: [F('gearJam', 'Gear jams entering the lift', 0.45, 'cycles', 5, 'Add a funnel and tune compression (touch it, own it).')], tunable: true }),
      I('stationCatch', 'Loading-station gear catcher', 6, 2, 0.95, 0.8, 2.2, [], 'Simple and light, but you only get gears from the human player at the station.'),
      I('fuelRoller', 'Fuel hopper roller', 9, 3, 0.9, 0.9, 1.1, ['beam break'], 'Fast fuel pickup from the floor.', { flaws: [intakeFlaw], tunable: true }),
    ],
    scorer: [
      S('gearPeg', 'Gear lift to the peg', 12, 4, 0.92, 0.85, 1.8, ['gear'], 1, { x: 6, h: 14 }, ['limit switch'], 'Gears are the big points. Reliable placement beats speed.'),
      S('fuelShooter', 'Boiler shooter', 22, 6, 0.85, 0.8, 1.8, ['fuel'], 6, { x: 0, h: 36 }, ['flywheel encoder', 'vision'], 'Fuel is worth little each, but you shoot many.', { flaws: [dips(0.4)] }),
      S('gearFuel', 'Gear lift plus boiler shooter', 32, 9, 0.75, 0.7, 2.6, ['gear', 'fuel'], 1.4, { x: 4, h: 30 }, ['limit switch', 'flywheel encoder'], 'Does both, but doubles the mechanism count.', { flaws: [F('comboInterfere', 'Shooter and lift interfere with each other', 0.45, 'cycles', 7, 'Separate the mechanisms in the master sketch.')] }),
    ],
    endgame: [none, E('ropeClimb', 'Rope climber', 6, 2, 0.92, ['climb'], [], 'Light and simple: 50 points for a rope and a ratchet. A classic build-less-robot choice.')],
  },
  powerup2018: {
    drivetrain: DRIVETRAINS,
    intake: [
      I('cubeWheels', 'Wheeled cube intake', 10, 3, 0.93, 0.9, 1.1, ['beam break'], 'Touch it, own it: compliant wheels grab cubes from any angle.', { flaws: [intakeFlaw], tunable: true }),
      I('cubeClaw', 'Pneumatic cube claw', 12, 5, 0.88, 0.6, 1.5, ['limit switch'], 'Precise, but you must line up exactly.', { flaws: [pneumLeak] }),
      I('cubeArm', 'Pivoting arm intake', 14, 6, 0.85, 0.75, 1.4, ['arm encoder'], 'Reaches over the cube pile, more to build and tune.'),
    ],
    scorer: [
      S('switchDump', 'Switch and exchange dumper', 9, 2, 0.95, 0.9, 1.0, ['switch', 'vault'], 1, { x: 6, h: 20 }, [], 'Light and simple. Only low scoring targets.'),
      S('elevatorArm', 'Elevator plus cube arm', 30, 8, 0.78, 0.8, 1.6, ['switch', 'scale', 'vault'], 1, { x: 6, h: 54 }, ['arm encoder', 'limit switch'], 'Scores everywhere, including the scale. Tall and heavy.', { flaws: [elevBind] }),
      S('scaleArm', 'Over-the-back scale arm', 22, 6, 0.82, 0.8, 1.7, ['scale'], 1, { x: -6, h: 50 }, ['arm encoder'], 'Dedicated scale scorer. Shoots out the back, so the intake faces front.'),
    ],
    endgame: [none,
      E('rungClimb', 'Winch hook climber', 12, 4, 0.85, ['climb'], ['limit switch'], 'Hook the rung and winch up. Dependable endgame points.'),
      E('liftRamp', 'Partner-lift ramp', 34, 9, 0.62, ['climb', 'lift'], ['limit switch'], 'Carries a partner up too. Huge points when it works.', { flaws: [climbFail('Ramp deploys late or lands crooked')] })],
  },
  deepspace2019: {
    drivetrain: DRIVETRAINS,
    intake: [
      I('cargoRoller', 'Floor cargo roller', 9, 3, 0.93, 0.9, 1.1, ['beam break'], 'Cargo balls pick up easily with rollers.', { flaws: [intakeFlaw], tunable: true }),
      I('hatchScoop', 'Hatch panel scoop', 8, 4, 0.85, 0.7, 1.6, ['limit switch'], 'Gets hatch panels from the station; needs precise alignment.', { flaws: [F('hatchDrop', 'Hatch panel pops off the velcro', 0.45, 'cycles', 4, 'Redesign the grip and check the geometry in the master sketch.')] }),
      I('comboClaw', 'Hatch and cargo combo claw', 15, 7, 0.82, 0.75, 1.5, ['limit switch', 'beam break'], 'Handles both pieces with one mechanism. Clever, but a lot of mechanism.'),
    ],
    scorer: [
      S('lowManip', 'Low-level manipulator', 14, 4, 0.92, 0.85, 1.3, ['hatch', 'cargo'], 1, { x: 8, h: 22 }, ['limit switch'], 'Cargo ship and low rocket only. Simple and fast.'),
      S('elevManip', 'Elevator plus manipulator', 30, 8, 0.78, 0.8, 1.7, ['hatch', 'cargo', 'high'], 1, { x: 8, h: 52 }, ['arm encoder', 'limit switch'], 'Scores the upper rocket levels. More points per cycle, taller and heavier.', { flaws: [elevBind] }),
      S('shipDump', 'Cargo-only ship dumper', 10, 3, 0.94, 0.9, 1.0, ['cargo'], 1.1, { x: 10, h: 24 }, [], 'Ignores hatch panels entirely: build less robot.'),
    ],
    endgame: [none,
      E('lvl2Lift', 'HAB level 2 lift', 12, 3, 0.9, ['climbL2'], ['limit switch'], 'Simple pistons and a lift. Plenty of points.'),
      E('lvl3Climb', 'HAB level 3 climber', 32, 9, 0.6, ['climbL3'], ['arm encoder', 'limit switch'], 'Twelve points but complicated and heavy.', { flaws: [climbFail('Climber binds halfway up')] })],
  },
  infiniterecharge2020: {
    drivetrain: DRIVETRAINS,
    intake: [
      I('wideRoller', 'Wide over-bumper roller (3 cells)', 9, 3, 0.93, 0.9, 0, ['beam break'], 'Wide and forgiving, but only holds three cells. Touch it, own it.', { cap: 3, rate: 5, flaws: [intakeFlaw], tunable: true }),
      I('hopperIntake', 'Wide intake plus 5-cell hopper', 13, 6, 0.88, 0.85, 0, ['beam break'], 'Holds the full five cells so each trip scores more. More parts to jam.', { cap: 5, rate: 5, flaws: [intakeFlaw, F('hopperJam', 'Cells jam in the hopper corners', 0.35, 'cycles', 5, 'Smooth the path and add compliant guides.')], tunable: true }),
      I('funnelIntake', 'Funnel intake (4 cells)', 11, 4, 0.9, 0.85, 0, ['beam break'], 'A funnel centers cells into a narrow path.', { cap: 4, rate: 5.5, flaws: [intakeFlaw], tunable: true }),
    ],
    scorer: [
      S('bottomDump', 'Bottom-port dumper', 8, 2, 0.95, 0.9, 0, ['low'], 0, { x: 8, h: 16 }, [], 'Simple and reliable, but one point per cell.', { rate: 3, cap: 999 }),
      S('hoodShooter', 'Flywheel shooter with hood', 24, 6, 0.88, 0.8, 0, ['low', 'outer'], 0, { x: 0, h: 34 }, ['flywheel encoder', 'vision'], 'The standard solution. Needs vision for aiming.', { rate: 3, cap: 999, flaws: [dips(0.4)] }),
      S('turretShooter', 'Turret shooter', 26, 8, 0.82, 0.9, 0, ['low', 'outer', 'inner'], 0, { x: 0, h: 38 }, ['flywheel encoder', 'vision', 'arm encoder'], 'Aims while driving and hits the inner port. Heavy and complex.', { rate: 3.3, cap: 999, flaws: [turretWobble] }),
    ],
    endgame: [none,
      E('hangHook', 'Winch hook climber', 11, 4, 0.9, ['climb'], ['limit switch'], 'Hang from the generator switch. Dependable.'),
      E('levelClimb', 'Climber with leveling', 22, 7, 0.65, ['climb', 'climbLevel'], ['arm encoder', 'limit switch'], 'Bonus for leveling the switch. Hard to tune.', { flaws: [climbFail('Climber swings and will not level')] })],
  },
  chargedup2023: {
    drivetrain: DRIVETRAINS,
    intake: [
      I('cubeRoller', 'Cube roller', 8, 3, 0.94, 0.9, 1.1, ['beam break'], 'Cubes are forgiving; a roller handles them every time.', { flaws: [intakeFlaw], tunable: true }),
      I('pneuClaw', 'Cone and cube claw', 12, 5, 0.86, 0.65, 1.5, ['limit switch'], 'Handles both pieces but needs careful alignment.', { flaws: [pneumLeak] }),
      I('coneTipper', 'Cone tipper plus roller', 13, 5, 0.85, 0.8, 1.4, ['beam break'], 'Tips floor cones upright so the roller can grab them.', { flaws: [intakeFlaw], tunable: true }),
    ],
    scorer: [
      S('lowSpit', 'Low-node spitter', 8, 2, 0.95, 0.9, 1.0, ['low'], 1, { x: 10, h: 18 }, [], 'Cheap and fast, only the lowest points.'),
      S('telescopeArm', 'Telescoping arm plus claw', 28, 8, 0.8, 0.85, 1.7, ['low', 'mid', 'high'], 1, { x: 18, h: 46 }, ['arm encoder', 'limit switch'], 'Reaches the high nodes. Heavy and extends past the perimeter.', { flaws: [F('armSag', 'Arm sags and tips the robot when extended', 0.45, 'tip', 6, 'Stiffen the tubes, keep the CG low, and shorten the extension.')] }),
      S('pivotArm', 'Pivoting arm with wrist', 22, 6, 0.84, 0.85, 1.5, ['low', 'mid', 'high'], 1, { x: 14, h: 44 }, ['arm encoder'], 'Simpler than telescoping, a little shorter.'),
    ],
    endgame: [none,
      E('autoBalance', 'Auto-balance routine', 2, 2, 0.82, ['dock', 'engage'], ['gyro'], 'Mostly software: a gyro and a tuned routine. Light for what it earns.', { flaws: [F('balanceOvershoot', 'Robot overshoots and tips the charge station', 0.45, 'endgame', 4, 'Tune the PID slowly and use the gyro pitch rate.')] }),
      E('dockWedge', 'Mechanical dock brake', 6, 3, 0.9, ['dock', 'engage'], [], 'A wedge holds the robot still on the ramp. A mechanical backup to software.')],
  },
  reefscape2025: {
    drivetrain: DRIVETRAINS,
    intake: [
      I('stationFunnel', 'Coral station funnel intake', 8, 3, 0.92, 0.9, 1.0, ['beam break'], 'Coral arrives through the station funnel quickly.', { flaws: [intakeFlaw], tunable: true }),
      I('floorCoral', 'Floor coral intake', 12, 5, 0.86, 0.85, 1.2, ['beam break'], 'Pick coral up anywhere on the field for more flexibility.', { flaws: [intakeFlaw], tunable: true }),
      I('algaeRoller', 'Algae roller claw', 11, 4, 0.88, 0.8, 1.3, ['beam break'], 'Handles algae for the processor and net.'),
    ],
    scorer: [
      S('troughRoller', 'Trough roller (L1)', 8, 2, 0.95, 0.9, 1.0, ['l1'], 1, { x: 8, h: 18 }, [], 'Lowest level, lowest points, simplest build.'),
      S('elevCoral', 'Elevator coral scorer', 30, 8, 0.8, 0.85, 1.7, ['l1', 'l23', 'l4'], 1, { x: 6, h: 52 }, ['arm encoder', 'limit switch'], 'Reaches every branch level. Tall and complicated.', { flaws: [elevBind] }),
      S('coralAlgae', 'Elevator plus algae claw', 36, 10, 0.74, 0.75, 2.0, ['l1', 'l23', 'l4', 'algae'], 1, { x: 6, h: 52 }, ['arm encoder', 'limit switch', 'vision'], 'Does coral and algae. A lot of mechanism for the weight limit.', { flaws: [F('clawInterfere', 'Algae claw blocks the coral path', 0.45, 'cycles', 7, 'Sketch the two paths separately before building.')] }),
    ],
    endgame: [none,
      E('shallowHook', 'Shallow-cage hook', 12, 4, 0.88, ['climbS'], ['limit switch'], 'A hook and a winch. Dependable.'),
      E('deepWinch', 'Deep-cage winch climber', 20, 6, 0.72, ['climbD'], ['arm encoder', 'limit switch'], 'Bigger points; needs precise alignment with the cage.', { flaws: [climbFail('Cage hook misses and the robot dangles')] })],
  },
  rebuilt2026: {
    drivetrain: DRIVETRAINS,
    intake: [
      I('slapdownHopper', 'Wide slapdown intake + expanding hopper', 15, 6, 0.9, 0.95, 0, ['beam break'], 'The meta design: a full-width intake drops outside the frame to scoop Fuel from the neutral zone, and the hopper expands outside the stowed frame to hold a huge load. Everything stows inside the perimeter.', { cap: 45, rate: 12, tunable: true, flaws: [intakeFlaw, F('slapdownDeploy', 'Slapdown deploys late or fails to stow before the trench', 0.35, 'cycles', 5, 'Add a hard stop, a stow sensor and a retry in code.')] }),
      I('slapdownPlain', 'Wide slapdown intake + fixed hopper', 13, 5, 0.92, 0.95, 0, ['beam break'], 'Fast pickup, but the hopper is limited to what fits inside the frame.', { cap: 22, rate: 12, tunable: true, flaws: [intakeFlaw] }),
      I('fixedRoller', 'Fixed over-bumper roller + small hopper', 9, 3, 0.93, 0.9, 0, ['beam break'], 'Simple and reliable, but slow to fill and small. Touch it, own it still holds.', { cap: 12, rate: 6, tunable: true, flaws: [intakeFlaw] }),
      I('underFuel', 'Narrow under-bumper intake, no hopper', 8, 4, 0.9, 0.9, 0, ['beam break'], 'Trench-friendly but narrow and tiny. Fine for a defense bot.', { cap: 5, rate: 4.5, tunable: true, flaws: [intakeFlaw] }),
    ],
    scorer: [
      S('rapidShooter', 'Dual-flywheel rapid-fire shooter', 24, 7, 0.88, 0.8, 0, ['fuel'], 0, { x: 0, h: 20 }, ['flywheel encoder', 'vision'], 'Empties a full hopper in seconds. Needs vision and tuning, and must clear the low trench when stowed.', { rate: 11, cap: 999, flaws: [dips(0.4)] }),
      S('turretShooter2', 'Turret shooter', 32, 9, 0.88, 0.9, 0, ['fuel'], 0, { x: 0, h: 20 }, ['flywheel encoder', 'vision', 'arm encoder'], 'Aims while driving, but heavier, more complex, and a bit slower to empty the hopper.', { rate: 9, cap: 999, flaws: [turretWobble] }),
      S('singleShooter', 'Single-flywheel shooter', 20, 5, 0.9, 0.85, 0, ['fuel'], 0, { x: 0, h: 20 }, ['flywheel encoder', 'vision'], 'Light and simple, but slow to unload a big hopper.', { rate: 5, cap: 999, flaws: [dips(0.35)] }),
      S('hubDumper', 'Hub dumper', 10, 3, 0.94, 0.9, 0, ['fuel'], 0, { x: 6, h: 20 }, [], 'Very simple, but you have to drive up to the hub, and it is slow.', { rate: 6, cap: 999 }),
    ],
    endgame: [none,
      E('towerHook', 'Level 1 hook', 8, 3, 0.9, ['climb1'], ['limit switch'], 'A hook and a winch for the first rung. Also worth 15 points in autonomous.', { autoBonus: 15 }),
      E('towerMid', 'Level 2 climber', 15, 5, 0.8, ['climb2'], ['limit switch', 'arm encoder'], 'Twenty points, a real climbing mechanism.', { flaws: [climbFail('Climber catches the rung unevenly')] }),
      E('towerClimb', 'Level 3 climber', 24, 8, 0.62, ['climb3'], ['arm encoder', 'limit switch'], 'Thirty points when it works. Tall, heavy, hard to tune.', { flaws: [climbFail('Climber binds between rungs')] })],
  },
});


// Games with more than one kind of game piece: an intake only helps with the pieces it can pick up.
const PIECES = {
  floorGear: ['gear'], stationCatch: ['gear'], fuelRoller: ['fuel'], gearPeg: ['gear'], fuelShooter: ['fuel'], gearFuel: ['gear', 'fuel'],
  cargoRoller: ['cargo'], hatchScoop: ['hatch'], comboClaw: ['hatch', 'cargo'], lowManip: ['hatch', 'cargo'], elevManip: ['hatch', 'cargo'], shipDump: ['cargo'],
  cubeRoller: ['cube'], pneuClaw: ['cone', 'cube'], coneTipper: ['cone'], lowSpit: ['cone', 'cube'], telescopeArm: ['cone', 'cube'], pivotArm: ['cone', 'cube'],
  stationFunnel: ['coral'], floorCoral: ['coral'], algaeRoller: ['algae'], troughRoller: ['coral'], elevCoral: ['coral'], coralAlgae: ['coral', 'algae'],
};
// Scorers that shoot from further away or on the move spend less time driving each cycle.
const DRIVE_FACTOR = { pivotShooter: 0.82, turretShooter: 0.9, turretShooter2: 0.9, rapidShooter: 0.95, fuelShooter: 0.95, flywheel: 0.95, hoodShooter: 0.95 };
for (const sId of Object.keys(ARCH)) for (const list of Object.values(ARCH[sId])) for (const a of list) {
  if (PIECES[a.id] && ['steamworks2017', 'deepspace2019', 'chargedup2023', 'reefscape2025'].includes(sId)) a.pieces = PIECES[a.id];
  if (DRIVE_FACTOR[a.id]) a.driveFactor = DRIVE_FACTOR[a.id];
}

for (const s of Object.values(ARCH)) for (const [slot, list] of Object.entries(s)) for (const a of list) a.slot = slot;

export function archList(seasonId, slot) { return ARCH[seasonId][slot]; }
export function archetype(seasonId, slot, id) { return ARCH[seasonId][slot].find((a) => a.id === id); }
export const SLOT_NAMES = { drivetrain: 'Drivetrain', intake: 'Intake', scorer: 'Scoring mechanism', endgame: 'Endgame' };
export const ALL_SENSORS = ['gyro', 'drive encoders', 'absolute encoders', 'beam break', 'limit switch', 'vision', 'flywheel encoder', 'arm encoder'];
