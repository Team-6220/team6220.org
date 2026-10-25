// Season definitions. Numbers are approximate gameplay values for teaching.
// TEAM TODO: verify weight caps, perimeters, height/extension limits and scoring against each game manual.
export const SEASONS = {
  rapidreact2022: {
    id: 'rapidreact2022', name: 'Rapid React', year: 2022,
    blurb: 'Collect 9.5" cargo balls and shoot them into the hub, then climb the hangar.',
    pieceName: 'cargo', weightCap: 125, perimeter: 120, heightLimit: 48, extension: 16,
    teleopSec: 135, autoSec: 15, layout: 'opposed', bench: 72,
    video: 'https://youtube.com/playlist?list=PLZT9pIgNOV6ZZ0Nlwte7ZaE-_DGoAFPQF',
    tasks: [
      { id: 'taxi', name: 'Taxi (autonomous)', pts: 2, note: 'Cheap points: drivetrain + programming.' },
      { id: 'low', name: 'Low hub', pts: 1, note: 'Easy to score, low value.' },
      { id: 'high', name: 'Upper hub', pts: 2, note: 'Needs a shooter and vision/aiming.' },
      { id: 'climbLow', name: 'Low rung climb', pts: 4, endgame: true, note: 'Light and simple.' },
      { id: 'climbTrav', name: 'Traversal climb', pts: 15, endgame: true, note: 'Huge points, huge complexity and weight.' },
    ],
    tip: 'Rapid React rewarded fast cycles; a reliable intake-to-shooter path beat fancy climbers for most teams.',
  },
  crescendo2024: {
    id: 'crescendo2024', name: 'Crescendo', year: 2024,
    blurb: 'Collect foam rings (notes) and score them in the speaker and amp, then climb and trap.',
    pieceName: 'note', weightCap: 125, perimeter: 120, heightLimit: 54, extension: 12,
    teleopSec: 135, autoSec: 15, layout: 'opposed', bench: 52,
    video: 'https://youtube.com/playlist?list=PLZT9pIgNOV6ai8nBeeLlC1PnDIhhVHV3k',
    tasks: [
      { id: 'taxi', name: 'Leave (autonomous)', pts: 2, note: 'Cheap points.' },
      { id: 'speaker', name: 'Speaker', pts: 3, note: 'The main scoring loop (amplified notes are worth more).' },
      { id: 'amp', name: 'Amp', pts: 1, note: 'Needs a slot-fitting scorer; low value.' },
      { id: 'climb', name: 'Stage climb', pts: 3, endgame: true, note: 'Simple hooks are plenty.' },
      { id: 'trap', name: 'Trap', pts: 5, endgame: true, note: 'High precision, high complexity.' },
    ],
    tip: "Crescendo's notes favored a fast under-bumper intake feeding a shooter, often shooting out the back.",
  },
};
export const SEASON_IDS = Object.keys(SEASONS);
