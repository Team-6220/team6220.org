// Season plan: phases of work. Within a phase you choose which steps to do (and in what order).
// Skipping a step saves hours but has a real cost later.
import { rngFor } from './rng.js';

const item = (key, type, params, required, label, hours, blurb, skip) => ({ key, type, params: params || {}, required, label, hours, blurb, skip });

export function buildPlan(seed, tutorial) {
  const rng = rngFor(seed, 'plan');
  const mentors = tutorial ? ['rivet', 'rule'] : rng.shuffle(['rivet', 'rule', 'stock']).slice(0, 2);
  const mentorItem = (card, i) => item('mentor-' + card, 'mentor', { card }, true,
    { rivet: 'Mentor: rivet layout', rule: 'Rule update', stock: 'Supplier out of stock' }[card], '2 h or more', 'A random event. It happens whether you are ready or not.', null);
  return [
    { id: 'kickoff', name: 'Kickoff', auto: true, items: [
      item('kickoff', 'kickoff', {}, true, 'Kickoff: analyze the game', '4 h', 'Read the game, decide what to build for and what to optimize.', null)] },
    { id: 'design', name: 'Design', advance: 'Finish design and start building', items: [
      item('inspire-a', 'inspire', { slots: ['drivetrain', 'intake'] }, true, 'Inspiration: drivetrain + intake', '2 to 6 h each', 'Adopt a published design (cheap, known flaws) or build from scratch (slow, hidden flaws, a chance of a breakthrough).', null),
      item('inspire-b', 'inspire', { slots: ['scorer', 'endgame'] }, true, 'Inspiration: scorer + endgame', '2 to 6 h each', 'Same choice for your scoring mechanism and endgame. "No endgame" is the lightest option.', null),
      item('prototype', 'prototype', {}, false, 'Prototype the intake', '1 to 3 h per test', 'Cheap wood tests vs. accurate high-fidelity tests to tune your rollers.', 'Skip: the intake stays untuned and may jam.'),
      item('sketch', 'sketch', {}, false, 'Master sketch', '6 h', 'Size the scoring mechanism against the game targets and the frame limits before anything else.', 'Skip: the mechanism may not reach its target, and later layout is guesswork.'),
      item('gears', 'gears', {}, false, 'Gears and belts', '5 h', 'Ratios, center distances, belt length, and how you tension the drive.', 'Skip: speeds are unchecked and belts or chains may jump.'),
      item('scrim-early', 'scrimmage', { early: true }, false, 'Early test: rough build', '4 to 10 h', 'Build something rough and test it. Fixes cost half as many hours before the design is frozen.', 'Skip: hidden flaws stay hidden until the event.'),
      item('krayon', 'krayon', {}, false, 'Krayon CAD', '8 h', 'Rough colorful layout: packaging, electronics, tool access and center of gravity.', 'Skip: electronics may end up buried and the layout unchecked.'),
      item('cad', 'cad', {}, false, 'Organized CAD', '6 h', 'Names, folders, and no duplicate parts so the whole team (and the BOM) works.', 'Skip: unnamed parts and a broken BOM mean missing parts later.'),
    ] },
    { id: 'build', name: 'Build', advance: 'Go to the regional event', items: [
      item('shop', 'shop', {}, true, 'Shop: parts, sensors, weight', '3+ h', 'Order COTS parts, choose your sensors for programming, and trim weight.', null),
      ...mentors.map(mentorItem),
      item('scrim-build', 'scrimmage', {}, false, 'Scrimmage', '4 to 10 h', 'Drive the built robot and see what breaks before the event.', 'Skip: unknown issues will find you during a match.'),
    ] },
    { id: 'event1', name: 'Regional', auto: true, items: [item('event1', 'event', { idx: 1 }, true, 'Regional event', '', 'Weigh-in, pit, then six qualification matches.', null)] },
    { id: 'rework', name: 'Rework', advance: 'Go to the Championship', items: [
      item('shop-rework', 'shop', { rework: true }, false, 'Shop: rework between events', '3+ h', 'Fix weight, sensors or parts based on what the event showed you.', null),
      item('scrim-rework', 'scrimmage', {}, false, 'Scrimmage', '4 to 10 h', 'Find and fix the issues before the Championship.', null),
    ] },
    { id: 'event2', name: 'Championship', auto: true, items: [item('event2', 'event', { idx: 2 }, true, 'Championship', '', 'The same robot against stronger opponents.', null)] },
  ];
}
