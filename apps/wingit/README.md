# WingIt

An FRC build-season roguelite that teaches Team 6220's design principles (a Golden Griffins pun).
Each run is a season: read the game, steal the best ideas, design against the clock, and test early.
Every choice trades weight, complexity and hours.

Sources the principles come from: 6220 Design Standards, NASA RAP Robotics Design Guide,
6220 Design Resources, and frcdesign.org.

## Play
Served at `/apps/wingit/` on the team website (copied in by the site build, see `apps/README.md`). Open it and start with the tutorial season.
Add `?debug` to the URL to see which principles a run has not met yet.

## Layout
- `index.html`, `css/style.css`: 1280x720 shell, scaled to the window. Gold `#ffa300`, white, black, grays; square corners.
- `js/main.js`: screen router. `js/state.js`: run + meta state (localStorage). `js/rng.js`: seeded RNG.
- `js/data/`: seasons, mechanism archetypes, principles codex, mentor cards.
- `js/plan.js`: the season phase hub (Kickoff, Design, Build, Regional, Rework, Championship). `js/nodes/`: one module per step. `js/widgets/`: sketch/gear/packaging widgets.
- `js/sim/`: derived robot stats, match + playoff resolution (`match.js`), animated match replay (`matchView.js`), cycle animation.
- `tests/`: headless logic checks (`node tests/smoke.mjs`, `node tests/balance.mjs`).

## Status
Nine seasons: 2017 STEAMWORKS, 2018 POWER UP, 2019 Deep Space, 2020 INFINITE RECHARGE, 2022 Rapid React, 2023 CHARGED UP,
2024 Crescendo, 2025 REEFSCAPE and 2026 REBUILT (2020 and 2021 count once). Each kickoff embeds that season's official game animation.

**Core loop:** decide (inspiration, prototype, sketch, gearing, review) -> the HUD and a "last step" panel show what it did to the robot's numbers
-> test (scrimmages) -> watch it play (animated matches) -> scout, pick a match plan and repair in the pit between matches -> alliance selection,
playoffs and awards -> a debrief, team points, and upgrades to carry into the next season. Random encounters (Open Alliance posts, sponsors,
coopertition, outages) add choices with visible costs and risks.

**Per-season strategy:** each game defines what to optimize (cycle time in most games, fuel/cell throughput in REBUILT and INFINITE RECHARGE, climb
reliability in STEAMWORKS). Picking the right variable gives a focus bonus, and the result screen says what actually decided the game.

**Pictures:** `assets/img/` holds figures cropped from the NASA RAP Design Guide and the 6220 Design Standards (credited on screen);
`js/widgets/figures.js` maps every mechanism to a photo or a drawn pictogram, and `js/widgets/diagrams.js` draws the teaching diagrams.

Season numbers are approximate: the team should verify weight caps, limits and scoring against each game manual (see `js/data/seasons.js`).
REBUILT scoring and timing come from the official cheat sheet.

## Tests
- `node tests/smoke.mjs`: data consistency (tasks, sensors, reach, pictures) and a few reference builds.
- `node tests/balance.mjs [seasonId]`: a careful simple build should rank about 3-6 at the regional; skipping everything ranks far worse.
- `node tests/meta.mjs [seasonId]`: brute-forces every legal mechanism combination and prints the best three, so the real-world best design
  can be checked against the game's scoring.
