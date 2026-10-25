// Random season encounters (like event rooms): each offers a visible choice with a cost, a benefit and sometimes a risk.
import { addFlaw, spend, unlock } from '../state.js';

const hiddenFlaws = (run) => run.flaws.filter((f) => !f.found && !f.fixed);
function revealOne(run, rng) {
  const list = hiddenFlaws(run);
  if (!list.length) return 'There was nothing hidden left to find. A good sign.';
  const f = rng.pick(list); f.found = true;
  return `They found a hidden problem before it cost you a match: ${f.name}.`;
}

export const ENCOUNTERS = [
  { id: 'open-alliance', title: 'An Open Alliance thread goes up', intro: 'A top team posts their mechanism geometry and build thread for this game.',
    options: [
      { label: 'Adopt their geometry', detail: 'Costs 2 h. Cycle time improves about 3%. A 30% chance it does not fit your frame and hides an integration flaw.',
        apply(run, rng) { spend(2); unlock('steal-innovate'); run.bonus.cycle += 0.03; if (rng.chance(0.3)) { addFlaw({ id: 'oa-fit', name: 'Borrowed geometry does not quite fit your frame', sev: 0.3, kind: 'cycles', fixHours: 4, onlyTesting: true, hint: 'Check borrowed geometry against your own master sketch.', found: false }); return 'It almost fit. You will find out where when you test it.'; } return 'It dropped right in. Steal from the best, then adapt.'; } },
      { label: 'Read it for ideas only', detail: 'Free. You learn a few shortcuts: about 3 build hours saved.', apply(run) { unlock('steal-innovate'); run.bonus.mfg += 3; return 'You picked up some shortcuts without copying anything.'; } },
    ] },
  { id: 'sponsor', title: 'A sponsor visits the shop', intro: 'Your sponsor offers help. What do you ask for?',
    options: [
      { label: 'Machining time', detail: 'Free. Saves about 8 build hours.', apply(run) { run.bonus.mfg += 8; return 'Their machinists cut your plates. That is a week back on the clock.'; } },
      { label: 'Money for lighter COTS parts', detail: 'Free. Takes about 4 lb off the robot.', apply(run) { run.results.shop = run.results.shop || { weightDelta: 0, sensors: null, applied: {}, progExtra: 0 }; run.results.shop.weightDelta -= 4; return 'Lighter gearboxes and fasteners: four pounds gone.'; } },
    ] },
  { id: 'coopertition', title: 'A rival team needs help', intro: 'A team in your region has broken a part you stock. They ask to borrow your time and your spare.',
    options: [
      { label: 'Help them (4 h)', detail: 'Costs 4 h. They share their scouting and you gain goodwill: scouting reports show expected scores.', apply(run) { spend(4); unlock('steal-innovate'); run.bonus.scout += 1; return 'Gracious professionalism pays off: they will share their scouting with you at events.'; } },
      { label: 'Decline politely', detail: 'Free. You keep your hours.', apply() { return 'You keep your focus. Nothing changes.'; } },
    ] },
  { id: 'workshop', title: 'A mentor offers a workshop', intro: 'A mentor has one free afternoon. Where should it go?',
    options: [
      { label: 'Driver practice day (3 h)', detail: 'Costs 3 h. About 10 hours of driver practice value: a net gain.', apply(run) { spend(3); run.bonus.practice += 10; return 'Your drivers get extra reps on a practice field.'; } },
      { label: 'CAD and layout review (3 h)', detail: 'Costs 3 h. Reveals a hidden flaw before it costs you a match.', apply(run, rng) { spend(3); return revealOne(run, rng); } },
    ] },
  { id: 'outage', title: 'The shop loses power', intro: 'A storm knocks out the shop for a day. Your build schedule slips.',
    options: [
      { label: 'Work through the night (6 h)', detail: 'Costs 6 h, no risk.', apply() { spend(6); return 'Tired, but the schedule holds.'; } },
      { label: 'Reschedule and rush later', detail: 'Costs 3 h now, but a 40% chance a rushed part adds 2 lb.', apply(run, rng) { spend(3); if (rng.chance(0.4)) { run.results.shop = run.results.shop || { weightDelta: 0, sensors: null, applied: {}, progExtra: 0 }; run.results.shop.weightDelta += 2; return 'The rush bit you: a hurried part came out 2 lb heavy.'; } return 'It all worked out.'; } },
    ] },
  { id: 'practice-invite', title: 'A practice match invitation', intro: 'A nearby team invites you to a scrimmage day.',
    options: [
      { label: 'Go (3 h)', detail: 'Costs 3 h. Builds driver skill and reveals a hidden flaw by testing.', apply(run, rng) { spend(3); run.bonus.practice += 6; unlock('test-early'); return 'You drove the robot against other robots. ' + revealOne(run, rng); } },
      { label: 'Stay and keep building', detail: 'Free. You save hours but learn nothing new.', apply() { return 'You keep building. Nothing changes.'; } },
    ] },
  { id: 'battery', title: 'A new batch of batteries', intro: 'Your supplier ships new batteries and a better power distribution kit.',
    options: [
      { label: 'Use the new kit (2 h)', detail: 'Costs 2 h. Gives your pit crew extra repair time at events.', apply(run) { spend(2); run.bonus.pit += 1; return 'Cleaner wiring and fresh batteries: repairs are faster at events.'; } },
      { label: 'Keep the old kit', detail: 'Free.', apply() { return 'Same as before.'; } },
    ] },
];
