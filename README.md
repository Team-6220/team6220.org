# GoldSim

An open-source, browser-based 2D FRC strategy and design simulator by **FRC Team 6220**.

A team defines real 2D robot designs, drops them into a game-specific field, drives them with Xbox-type controllers, the keyboard, or simulated drivers, and runs hundreds of matches to rank robot archetypes. Robot geometry actually matters: where the intake and shooter sit changes cycle times through physics, not through hand-tuned numbers.

## Stay Gold

GoldSim is built to stay useful **season after season**, not just for one game.

- **Year-specific logic lives only in a game module** — JSON files plus, rarely, a small reviewed hook. The 2026 game, REBUILT, is the reference module in [`packages/game-rebuilt/`](packages/game-rebuilt/).
- **The core is never edited at kickoff.** It is game-agnostic: physics, robots, mechanisms, scoring rules interpreter, match loop.
- **A new season is fill-in-the-blanks:** `npm run new-game -- 2027 <name>` copies a blank, valid module from [`templates/game-module/`](templates/game-module/), and [`docs/AUTHORING.md`](docs/AUTHORING.md) walks a student and Claude from the game manual to a playable field in about an hour.
- **Tests and docs are written for someone picking it up cold.** If a change would make next season harder, it doesn't ship.

## Quick start

Requires Node.js 20 or newer.

```
npm ci                    # install
npm run dev               # run the app at http://localhost:5173
npm test                  # unit, conformance and determinism tests
npm run validate-game     # check the REBUILT game module (or: npm run validate-game -- <folder>)
npm run spike             # physics engine benchmark (Phase 0)
```

Other commands: `npm run check` (lint + typecheck + test), `npm run build`, `npm run export-schemas` (regenerates `docs/schemas/` and `docs/SCHEMAS.md`), `npm run new-game -- <year> <name>`.

## Repository layout

```
packages/
  core/          game-agnostic physics (Rapier2D), robots, mechanisms, scoring rules, match loop, replay
  schema/        JSON Schemas + TypeScript types + validators; validate-game CLI
  game-rebuilt/  REBUILT (2026) game module: JSON, hooks, presets, conformance tests, SOURCES.md
  agents/        simulated drivers (parameterized policies)
  batch/         headless batch runs and parameter sweeps
  analytics/     statistics, EPA-style contribution, sensitivity, exports
  pathplan/      PathPlanner path/auto import and path follower
  data-layer/    accounts, team workspaces, cloud storage (Supabase behind an interface)
  web/           the app
templates/
  game-module/   blank game module for the next season
docs/            PRD, implementation plan, authoring guide, schemas, decision records
scripts/         repo tooling (new-game)
```

## Documentation

- [Product requirements (PRD)](docs/PRD.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Authoring a game module](docs/AUTHORING.md) — manual → module, for students and Claude
- [Schemas](docs/SCHEMAS.md) — every data format, generated from the code
- [Decision records](docs/decisions/)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## License

Code is [MIT](LICENSE). **Not covered by the MIT license:** the Team 6220 logos and the Karnivore font in `packages/web/public/` — see [`packages/web/public/brand/README.md`](packages/web/public/brand/README.md). Forks should use their own logos.

GoldSim is independent work inspired by publicly available descriptions of HighTide's TideSim; it uses none of their code, data or assets.
