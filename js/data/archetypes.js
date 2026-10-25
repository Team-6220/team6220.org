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

for (const s of Object.values(ARCH)) for (const [slot, list] of Object.entries(s)) for (const a of list) a.slot = slot;

export function archList(seasonId, slot) { return ARCH[seasonId][slot]; }
export function archetype(seasonId, slot, id) { return ARCH[seasonId][slot].find((a) => a.id === id); }
export const SLOT_NAMES = { drivetrain: 'Drivetrain', intake: 'Intake', scorer: 'Scoring mechanism', endgame: 'Endgame' };
export const ALL_SENSORS = ['gyro', 'drive encoders', 'absolute encoders', 'beam break', 'limit switch', 'vision', 'flywheel encoder', 'arm encoder'];
