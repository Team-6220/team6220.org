# WingIt

An FRC build-season roguelite that teaches Team 6220's design principles (a Golden Griffins pun).
Each run is a season: read the game, steal the best ideas, design against the clock, and test early.
Every choice trades weight, complexity and hours.

Sources the principles come from: 6220 Design Standards, NASA RAP Robotics Design Guide,
6220 Design Resources, and frcdesign.org.

## Play
Deployed with GitHub Pages from the `main` branch root. Open the site and start with the tutorial season.
Add `?debug` to the URL to see which principles a run has not met yet.

## Layout
- `index.html`, `css/style.css`: 1280x720 shell, scaled to the window. Gold `#ffa300`, white, black, grays; square corners.
- `js/main.js`: screen router. `js/state.js`: run + meta state (localStorage). `js/rng.js`: seeded RNG.
- `js/data/`: seasons, mechanism archetypes, principles codex, mentor cards.
- `js/map/`: season map generation and view. `js/nodes/`: one module per node type. `js/widgets/`: sketch/gear/packaging widgets.
- `js/sim/`: derived robot stats, match resolution, cycle animation.
- `tests/`: headless logic checks (`node tests/smoke.mjs`, `node tests/balance.mjs`).

## Status
Milestone 1 (vertical slice): two seasons (2022 Rapid React, 2024 Crescendo). Season numbers are approximate:
the team should verify weight caps, limits and scoring against each game manual (see `js/data/seasons.js`).
