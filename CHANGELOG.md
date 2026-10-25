# Changelog

All notable changes to GoldSim are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- PRD v0.2 and implementation plan in `docs/`, with the "Stay Gold" principle (works season after season).
- npm workspaces monorepo, TypeScript, Vitest, ESLint, Prettier, CI and GitHub Pages workflows.
- Phase 0 physics spike (`npm run spike`) and decision record 0001: Rapier2D (deterministic build).
- `schema`: JSON Schemas (TypeBox) for robots, game modules and replays; validators; `npm run validate-game`; `npm run export-schemas`.
- `core`: deterministic 120 Hz match loop, drivetrains, mechanisms, parametric ballistics, field elements (walls, zones, terrain, height gates, sinks, feeders, climb structures, piece sources), declarative scoring, foul detectors, replays, snapshot/restore.
- `game-rebuilt`: REBUILT (2026) module from manual TU22, shift-order hook, four archetype presets, `SOURCES.md` with approximations to verify.
- `agents`: parameterized simulated drivers (cycle, shoot from legal zone, collect, feed, climb, defend), grid A* navigation, driver profiles, knob fitting.
- `batch`: headless match runner, grid / Latin hypercube sweeps, pausable runner, Web Worker pool, reproducible results files.
- `analytics`: stats with confidence intervals, archetype comparison, response curves, sensitivity, EPA-style contribution, RP rates, calibration, CSV/JSON export.
- `pathplan`: PathPlanner `.path`/`.auto` import, Bezier sampling, path follower and auto executor with named commands.
- `data-layer`: `DataLayer` interface, in-memory and Supabase implementations, outbox; `supabase/` migrations, RLS policies, pgTAP tests; `docs/SELF-HOSTING.md`.
- `web`: WingIt-style UI (gold #ffa300, square corners, Karnivore titles, light/dark), Xbox controller play, match HUD and results, robot editor, replay viewer, browser benchmark, Lab (batch/sweeps, dashboard, calibration, PathPlanner).
- Stay Gold kit: `templates/game-module/`, `npm run new-game`, `docs/AUTHORING.md`, `docs/SCHEMAS.md`.
