// Season definitions. Numbers are approximate gameplay values for teaching.
// TEAM TODO: verify weight caps, perimeters, height/extension limits and scoring against each game manual.
// videoId is the official FIRST game animation on YouTube (embedded at kickoff).
// cycleMul scales cycle time for games where one scoring cycle is naturally slower (gears, climbing hatches, etc).
// bench is the typical alliance score in that game; opponents scale from it (see sim/match.js).
const yt = (id) => 'https://www.youtube.com/watch?v=' + id;
const common = { weightCap: 125, perimeter: 120, teleopSec: 135, autoSec: 15, layout: 'opposed', cycleMul: 1 };

export const SEASONS = {
  steamworks2017: Object.assign({}, common, {
    id: 'steamworks2017', name: 'STEAMWORKS', year: 2017, weightCap: 120, heightLimit: 48, extension: 12, cycleMul: 1.6, bench: 220,
    blurb: 'Deliver gears to the airship pegs, shoot fuel into the boiler, then climb the rope before the match ends.',
    pieceName: 'gear', videoId: 'EMiNmJW7enI', video: yt('EMiNmJW7enI'),
    defaultTasks: ['taxi', 'gear', 'climb'],
    tasks: [
      { id: 'taxi', name: 'Cross the baseline (autonomous)', pts: 5, note: 'Cheap points: drivetrain and a little code.' },
      { id: 'gear', name: 'Gear on an airship peg', pts: 13, note: 'Rotor points add up. Precision and reliability matter.' },
      { id: 'fuel', name: 'Fuel in the boiler', pts: 1, note: 'Low value each; you need to shoot many.' },
      { id: 'climb', name: 'Rope climb', pts: 50, endgame: true, note: 'Huge for a rope, a motor, and a ratchet.' },
    ],
    tip: 'STEAMWORKS rewarded a simple, reliable gear mechanism plus a rope climber. A famous example of build less robot.',
  }),
  powerup2018: Object.assign({}, common, {
    id: 'powerup2018', name: 'POWER UP', year: 2018, weightCap: 120, heightLimit: 58, extension: 16, cycleMul: 1.1, bench: 125,
    blurb: 'Stack power cubes on the switches and scale, feed the vault, then climb the scale rung.',
    pieceName: 'power cube', videoId: 'HZbdwYiCY74', video: yt('HZbdwYiCY74'),
    defaultTasks: ['taxi', 'switch', 'scale', 'climb'],
    tasks: [
      { id: 'taxi', name: 'Cross the auto line (autonomous)', pts: 5, note: 'Cheap points.' },
      { id: 'switch', name: 'Switch', pts: 2, note: 'Low target; control it for ownership points.' },
      { id: 'scale', name: 'Scale', pts: 3, note: 'Tall target; needs an elevator or a high arm.' },
      { id: 'vault', name: 'Vault (power-ups)', pts: 4, note: 'Low and easy, but only a few cubes.' },
      { id: 'climb', name: 'Hang from the rung', pts: 30, endgame: true, note: 'Worth a lot; a winch and a hook.' },
      { id: 'lift', name: 'Lift a partner with a ramp', pts: 30, endgame: true, note: 'Needs a very heavy mechanism.' },
    ],
    tip: 'Most winning POWER UP robots were fast and reliable at the switch and scale, with a simple intake that touched every cube.',
  }),
  deepspace2019: Object.assign({}, common, {
    id: 'deepspace2019', name: 'Destination: Deep Space', year: 2019, heightLimit: 52, extension: 30, cycleMul: 1.15, bench: 62,
    blurb: 'Place hatch panels and cargo on the rocket and cargo ship, then climb the HAB platform.',
    pieceName: 'cargo', videoId: 'Mew6G_og-PI', video: yt('Mew6G_og-PI'),
    defaultTasks: ['taxi', 'hatch', 'cargo', 'climbL2'],
    tasks: [
      { id: 'taxi', name: 'Leave the HAB (sandstorm)', pts: 3, note: 'Cheap points.' },
      { id: 'hatch', name: 'Hatch panels', pts: 2, note: 'Small points, but every cargo needs a hatch first.' },
      { id: 'cargo', name: 'Cargo', pts: 3, note: 'Bigger points, easy to intake.' },
      { id: 'high', name: 'Upper rocket levels', pts: 4, note: 'Needs reach and a tall mechanism.' },
      { id: 'climbL2', name: 'HAB level 2', pts: 6, endgame: true, note: 'Simple lift.' },
      { id: 'climbL3', name: 'HAB level 3 climb', pts: 12, endgame: true, note: 'More points, heavy and complicated.' },
    ],
    tip: 'Deep Space rewarded cycle speed on the low rocket and ship. Many top robots skipped the highest levels.',
  }),
  infiniterecharge2020: Object.assign({}, common, {
    id: 'infiniterecharge2020', name: 'INFINITE RECHARGE', year: 2020, heightLimit: 45, extension: 12, bench: 140,
    blurb: 'Collect power cells and shoot them at the power port, then hang from the generator switch.',
    pieceName: 'power cell', videoId: 'gmiYWTmFRVE', video: yt('gmiYWTmFRVE'),
    defaultTasks: ['taxi', 'low', 'outer', 'climb'],
    tasks: [
      { id: 'taxi', name: 'Cross the initiation line (autonomous)', pts: 5, note: 'Cheap points.' },
      { id: 'low', name: 'Bottom port', pts: 1, note: 'Easy to score, low value.' },
      { id: 'outer', name: 'Outer port', pts: 2, note: 'Needs a shooter.' },
      { id: 'inner', name: 'Inner port', pts: 3, note: 'Needs a very accurate shooter and aiming.' },
      { id: 'climb', name: 'Hang from the generator switch', pts: 25, endgame: true, note: 'Strong endgame points.' },
      { id: 'climbLevel', name: 'Level the switch', pts: 15, endgame: true, note: 'Extra points, a lot harder.' },
    ],
    tip: 'INFINITE RECHARGE rewarded accurate shooters and a hang. A five-ball hopper mattered more than a fancy turret for many teams.',
  }),
  rapidreact2022: Object.assign({}, common, {
    id: 'rapidreact2022', name: 'Rapid React', year: 2022, heightLimit: 48, extension: 16, bench: 72,
    blurb: 'Collect 9.5" cargo balls and shoot them into the hub, then climb the hangar.',
    pieceName: 'cargo', videoId: 'LgniEjI9cCM', video: yt('LgniEjI9cCM'),
    defaultTasks: ['taxi', 'low', 'high', 'climbLow'],
    tasks: [
      { id: 'taxi', name: 'Taxi (autonomous)', pts: 2, note: 'Cheap points: drivetrain + programming.' },
      { id: 'low', name: 'Low hub', pts: 1, note: 'Easy to score, low value.' },
      { id: 'high', name: 'Upper hub', pts: 2, note: 'Needs a shooter and vision/aiming.' },
      { id: 'climbLow', name: 'Low rung climb', pts: 4, endgame: true, note: 'Light and simple.' },
      { id: 'climbTrav', name: 'Traversal climb', pts: 15, endgame: true, note: 'Huge points, huge complexity and weight.' },
    ],
    tip: 'Rapid React rewarded fast cycles; a reliable intake-to-shooter path beat fancy climbers for most teams.',
  }),
  chargedup2023: Object.assign({}, common, {
    id: 'chargedup2023', name: 'CHARGED UP', year: 2023, heightLimit: 58, extension: 24, cycleMul: 1.1, bench: 95,
    blurb: 'Place cones and cubes on the grid nodes, then dock and balance on the charge station.',
    pieceName: 'cube', videoId: '0zpflsYc4PA', video: yt('0zpflsYc4PA'),
    defaultTasks: ['taxi', 'low', 'mid', 'dock'],
    tasks: [
      { id: 'taxi', name: 'Mobility (autonomous)', pts: 3, note: 'Cheap points.' },
      { id: 'low', name: 'Low (hybrid) node', pts: 2, note: 'Easy but small.' },
      { id: 'mid', name: 'Mid node', pts: 3, note: 'Needs an arm that reaches.' },
      { id: 'high', name: 'High node', pts: 5, note: 'Needs a long arm. Tall, heavy and prone to tipping.' },
      { id: 'dock', name: 'Dock on the charge station', pts: 8, endgame: true, note: 'A gyro and good code do most of the work.' },
      { id: 'engage', name: 'Engage (balanced)', pts: 4, endgame: true, note: 'Extra points if the station is level.' },
    ],
    tip: 'CHARGED UP rewarded teams who made the charge station reliable, often with software, before building tall arms.',
  }),
  crescendo2024: Object.assign({}, common, {
    id: 'crescendo2024', name: 'Crescendo', year: 2024, heightLimit: 54, extension: 12, bench: 52,
    blurb: 'Collect foam rings (notes) and score them in the speaker and amp, then climb and trap.',
    pieceName: 'note', videoId: '9keeDyFxzY4', video: yt('9keeDyFxzY4'),
    defaultTasks: ['taxi', 'speaker', 'climb'],
    tasks: [
      { id: 'taxi', name: 'Leave (autonomous)', pts: 2, note: 'Cheap points.' },
      { id: 'speaker', name: 'Speaker', pts: 3, note: 'The main scoring loop (amplified notes are worth more).' },
      { id: 'amp', name: 'Amp', pts: 1, note: 'Needs a slot-fitting scorer; low value.' },
      { id: 'climb', name: 'Stage climb', pts: 3, endgame: true, note: 'Simple hooks are plenty.' },
      { id: 'trap', name: 'Trap', pts: 5, endgame: true, note: 'High precision, high complexity.' },
    ],
    tip: "Crescendo's notes favored a fast under-bumper intake feeding a shooter, often shooting out the back.",
  }),
  reefscape2025: Object.assign({}, common, {
    id: 'reefscape2025', name: 'REEFSCAPE', year: 2025, heightLimit: 58, extension: 20, cycleMul: 1.1, bench: 80,
    blurb: 'Score coral on the reef branches and algae in the processor and net, then climb the barge cage.',
    pieceName: 'coral', videoId: 'YWbxcjlY9JY', video: yt('YWbxcjlY9JY'),
    defaultTasks: ['taxi', 'l1', 'l23', 'climbS'],
    tasks: [
      { id: 'taxi', name: 'Leave (autonomous)', pts: 3, note: 'Cheap points.' },
      { id: 'l1', name: 'Coral: trough (L1)', pts: 2, note: 'Lowest level, simplest.' },
      { id: 'l23', name: 'Coral: branches L2 and L3', pts: 4, note: 'Needs an elevator or an arm.' },
      { id: 'l4', name: 'Coral: top branch (L4)', pts: 5, note: 'Tall. Highest points per coral.' },
      { id: 'algae', name: 'Algae (processor / net)', pts: 6, note: 'A second game piece with a second mechanism.' },
      { id: 'climbS', name: 'Shallow cage climb', pts: 6, endgame: true, note: 'Simple.' },
      { id: 'climbD', name: 'Deep cage climb', pts: 12, endgame: true, note: 'More points, more risk.' },
    ],
    tip: 'REEFSCAPE rewarded a fast, reliable coral scorer. Elevator reliability and fast intake mattered more than doing everything.',
  }),
  rebuilt2026: Object.assign({}, common, {
    id: 'rebuilt2026', name: 'REBUILT', year: 2026, heightLimit: 40, extension: 12, bench: 140,
    blurb: 'Collect Fuel and shoot it into the hub while it is active, then climb the tower.',
    pieceName: 'fuel', videoId: '_fybREErgyM', video: yt('_fybREErgyM'),
    defaultTasks: ['taxi', 'fuel', 'climb1'],
    tasks: [
      { id: 'taxi', name: 'Leave the starting line (autonomous)', pts: 3, note: 'Cheap points.' },
      { id: 'fuel', name: 'Fuel in the active hub', pts: 1, note: 'The main loop: many Fuel per cycle.' },
      { id: 'climb1', name: 'Tower level 1', pts: 10, endgame: true, note: 'A simple hook.' },
      { id: 'climb3', name: 'Tower level 3', pts: 30, endgame: true, note: 'Big points, big mechanism.' },
    ],
    tip: 'In REBUILT the trench is low, so a low-profile robot with a fast Fuel loop is a safe, strong choice.',
  }),
};
// Newest first looks nicer in lists, but keep chronological here.
export const SEASON_IDS = Object.keys(SEASONS);
