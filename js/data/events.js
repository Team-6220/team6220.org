// Mentor / random event cards. Resolved in nodes/mentor.js.
export const MENTOR_CARDS = {
  rivet: {
    title: 'Mentor Bruce: rivet layout',
    intro: 'You are riveting a 1/8" aluminum plate with 3/16" rivets (D = 0.1875"). Which layout follows our rivet guide?',
    // edge distance A = 2.5D = 0.47", pitch B = 4D..8D = 0.75"..1.5"
    options: [
      { text: 'Edge 0.47", pitch 1.0". Plenty of holes, but not too many.', good: true },
      { text: 'Edge 0.15", pitch 0.3". More rivets is always stronger.', good: false, why: 'Too close to the edge and too many holes: the part can shear like a zipper.' },
      { text: 'Edge 1.5", pitch 3.0". Keep holes far apart.', good: false, why: 'Too sparse: the joint is loose and the plate flexes between rivets.' },
    ],
    principle: 'rivets', hours: 2,
  },
  rule: {
    title: 'Rule update: frame size',
    intro: 'The Q&A system just changed the legal frame perimeter. Everything sized off the master sketch needs to be revised.',
    hours: 2,
  },
  stock: {
    title: 'Supplier out of stock',
    intro: 'The belts and swerve modules you planned are backordered for three weeks. The team has a similar substitute in stock.',
    hours: 2,
  },
};
