# GoldSim — Implementation Plan

| | |
|---|---|
| **Status** | Draft v0.1 |
| **Source** | [PRD.md](PRD.md) v0.2 |
| **Repository** | `HossHarman/GoldSim` |

> **Stay Gold.** GoldSim should stay useful season after season, not just for REBUILT. Every design choice favors the next kickoff: year-specific logic lives only in a game module (data plus small reviewed hooks), the core is never edited at kickoff, a blank game-module template and the authoring guide make a new season a fill-in-the-blanks job, and tests and docs are written so a new student (or Claude) can pick it up cold. When a change would make next season harder, it doesn't ship.

This plan turns the PRD into ordered, buildable phases. Phases are ordered, not dated. Per PRD §5, Phases 0–5 must be usable before kickoff. Every phase ships something runnable. Section references (§) point to the PRD.

---

## 1. Repo and tooling setup (first task of Phase 0)

- **Monorepo:** npm workspaces with the package layout from §6.2: `packages/core`, `schema`, `game-rebuilt`, `agents`, `batch`, `analytics`, `pathplan`, `data-layer`, `web`, plus `docs/` and `examples/`. Packages are created only in the phase that needs them (§2a).
- **Language and build:** TypeScript in strict mode with project references (`tsconfig.base.json`). Vite builds `web` to static output.
- **Quality:** Vitest in every package, ESLint, and Prettier. `ajv` validates JSON Schemas.
- **Config constants:** `packages/web/src/config.ts` holds `APP_NAME = "GoldSim"` (the name lives in one place, §21) and `BASE_PATH` (default `/GoldSim/` for GitHub Pages project pages).
- **Routing:** hash routing, so the app works under the Pages sub-path and under a root custom domain (§18.1).
- **CI/CD (GitHub Actions):**
  - `ci.yml`: lint, typecheck, test, build on every PR and push.
  - `pages.yml`: build and deploy `main` to GitHub Pages.
- **Changelog:** `CHANGELOG.md` in Keep a Changelog format.
- **Decision records:** `docs/decisions/NNNN-title.md` for every recorded decision (engine choice, performance relaxations, and so on).

---

## 2. Phases

Each phase lists its goal, tasks, key files, and exit criteria. Section 2a has the architecture diagram for each phase.

### Phase 0 — Tech spike (§6.1, §17)

**Goal:** choose the physics engine with evidence.

- Build a spike harness in `packages/core/spike/`: 6 robot bodies, about 500 game pieces, and field walls, implemented in both **Rapier2D (WASM)** and **Planck.js**.
- Measure for each engine:
  - **Determinism:** same seed and inputs, 3 runs, hash the event stream and final state; hashes must match.
  - **Headless throughput:** physics steps per second at 120 Hz with no rendering, on a dev laptop and a Chromebook-class device.
  - **Render FPS:** Canvas 2D with 6 robots and all pieces on the Chromebook.
  - **Bundle cost:** gzipped size added by each engine.
- Write `docs/decisions/0001-physics-engine.md` with results and the choice.

**Exit criteria:** decision recorded. Batch reaches at least 10× real time per worker on a Chromebook-class device, or the relaxation is recorded (§17).

### Phase 1 — Core + REBUILT + human play, nothing saved (§7, §8, §10)

**Goal:** drive a full REBUILT match with an Xbox controller in a developer build.

**`packages/schema`**
- JSON Schemas with `description` fields written for LLM use: robot, game module (`game`, `field`, `pieces`, `scoring`, `rules`, `mechanisms`, `named-commands`, `stats`), replay.
- Generated TypeScript types and validator functions with error messages that explain the cause, not just a JSON path (§8.5).

**`packages/core`**
- SI units and the field coordinate frame (§7.1).
- Seeded PRNG owned by the match (for example xoshiro128**). All randomness goes through it (§6.3).
- Fixed-timestep match loop (120 Hz default), render interpolation, speed multiplier, and unlimited headless mode.
- Snapshot/restore of full match state.
- Robot model: footprint polygon, separate bumper collision layer, mass and auto moment of inertia, driving height, drivetrain models (swerve, tank, mecanum) with `maxSpeed`, `maxAccel`, `maxAngularSpeed`, and `traction` (§7.2).
- Mechanism framework: `{ id, type, mount, footprint, params, stateMachine }`, a declarative state-machine runner (states, transitions, guards, timers, effects), and moving geometry (collision shapes update with state).
- Core mechanism types (§7.4): `intake` (acquisition only through the roller region), `storage`, `transfer`, `shooter` (parametric ballistics, §7.6), `placer`, `climber`, `blocker`/`plow`, `custom`.
- Field element kinds (§7.3): `wall`, `zone`, `terrain`, `gate` (height clearance), `sink`/`emitter`, `feeder`, `climbStructure`, `pieceSource`.
- Game pieces as physics bodies when free and counted when stored (§7.5).
- Event bus and per-tick telemetry hooks.
- `DriverInput` and the limited `observation` view (§7.7).
- **Scoring/rules DSL interpreter (§8.3):** triggers, conditions, effects; phase and shift timelines; the results-dependent hook; assessment delays; threshold profiles; reviewed TypeScript hooks loaded only from the repo.

**`packages/game-rebuilt`**
- Full module built from the §8.7 facts: `game.json`, `field.json`, `pieces.json`, `scoring.json`, `rules.json`, `mechanisms.json`, `stats.json`, `visuals/`, `SOURCES.md` citing manual TU22 sections.
- `rules.json` with the coverage statuses proposed in §8.6.
- Conformance tests in `tests/`: Tower levels in AUTO and TELEOP, Hub activity alternation and random tiebreak, 3 s assessment windows, Hub consume-and-re-emit, Trench height gate, Bump terrain, G403 and G407 fouls, bonus-RP thresholds per profile.
- `npm run validate-game`: schema validity, referential integrity, timeline sums, obvious scoring errors (§8.4).

**`packages/web`**
- WingIt-style shell (§3): top bar, theme tokens, light/dark toggle.
- Canvas 2D field renderer that reads colors from theme tokens.
- Gamepad API input with WPILib `XboxController` names; default scheme from §10. Keyboard input for development only.
- HUD: match clock, phase/shift bar, Hub active state per alliance, score, RP progress.
- Match screen: pick robots from `examples/`, start a match, play against idle robots or other controllers.

**Docs:** `docs/AUTHORING.md` (manual → module guide and prompt), `docs/SCHEMAS.md`.

**Exit criteria:**
- A full REBUILT match is drivable to degradation level L3 (§8.4) with an Xbox controller.
- Determinism test green: same seed and inputs produce the same event stream.
- A robot taller than 22.25 in cannot pass under the Trench; a shorter one can.
- All REBUILT conformance tests pass.
- Deployed to GitHub Pages.

### Phase 2 — Accounts, team workspaces, cloud persistence (§14)

**Goal:** sign in, create a team, and save to the cloud.

- **First:** confirm the open questions on backend choice, ownership, and current Supabase free-tier limits (§14.8, §22.2 #3, #5, #6). Record the result in `docs/decisions/`.
- **`packages/data-layer`**
  - `DataLayer` TypeScript interface that the web app depends on, never Supabase directly.
  - Supabase implementation.
  - SQL migrations in `supabase/migrations/` for: users and settings, teams, memberships (roles `admin`/`member`), invites, designs plus versions, driver profiles, recordings, test runs, calibration records, imported files, published snapshots.
  - Row-level security policies: team data visible only to members; admin-only actions.
  - Quotas, per-user write rate limits, upload size caps, and schema validation on writes (§14.7).
- **Auth:** Google sign-in plus email magic link. Redirect allowlist entries for localhost and the Pages URL (§14.5).
- **`packages/web`**
  - Sign-in screen; team create, invite code/link, join with admin approval; team switcher for users on more than one team.
  - User settings (controller bindings, units, theme) saved to the account.
  - Save model (§14.9): explicit save and save on pause, an in-memory outbox that retries failed saves, version counters with a conflict dialog (keep mine, keep theirs, save as copy), and a warning before closing a tab with unsaved work.
  - Data export and delete for users and admins (§14.6).
  - Guest mode: run matches without saving. Assumed yes per the PRD recommendation (§22.2 #4); confirm before building.
- **Docs:** `docs/SELF-HOSTING.md` (Supabase setup, migrations, RLS, auth redirects).

**Exit criteria:**
- RLS tests prove non-members cannot read or write team data.
- A new team creates a workspace, invites a member, and both see the same saved data from different laptops.

### Phase 3 — Robot editor, presets, recording and replay (§9, §10)

**Goal:** design robots visually and record and replay matches.

- **Editor (`web/src/editor/`)**
  - Drag-and-drop chassis canvas: chassis size and shape, height, bumpers, drivetrain.
  - Mechanism palette; drag and rotate mounts; copy and paste.
  - Properties panel with sliders and units (inches displayed, SI stored).
  - Validation only for what the sim needs (finite numbers, positive mass, mechanisms on the chassis). No rules gating (§9.1).
  - State scrub preview for moving geometry.
  - Interaction overlay: derived intake contact regions, shooter exit vector, range window.
  - Clone for A/B comparison, version history, JSON import/export.
- **Presets (`game-rebuilt/presets/`):** over-the-bumper intake + fixed shooter, turreted shooter, climb-focused, defense/disruptor.
- **Recording (`core/src/replay/`):** seed, engine/module/robot versions, and a compact per-tick `DriverInput` log for every robot.
- **Replay (`web/src/replay/`):** re-simulates from the log; scrub (using snapshots), speed control, camera follow, event overlays; replay file import/export; saved to the workspace.
- **Examples:** sample robots and replays in `examples/`.

**Exit criteria:** two designs that differ only in shooter orientation show different cycle times in human play, and a replay reproduces the recorded match exactly on the same machine.

### Phase 4 — Agents, batch, analytics, calibration (§11, §12, §13)

**Goal:** rank archetypes with many simulated matches.

- **`packages/agents`**
  - Behavior library: cycle, offense, defense, endgame, positioning/feeding (§11.2).
  - Behavior selector (priority list or utility scores) per robot role, using game-module role hints and named objectives.
  - Driver-profile JSON with sweepable knobs (§11.3).
  - Knob fitting to recorded-match statistics (§11.4).
- **`packages/batch`**
  - Web Worker pool sized to logical cores minus one; core runs headless in each worker.
  - Seeded run enumeration; sweeps over grid and Latin hypercube designs with N matches per configuration.
  - Pause, cancel, resume from saved configuration, throttling for low-power devices.
  - Outputs: per-match summaries, optional per-tick telemetry (off by default), JSONL event streams.
  - Save on completion; if offline, keep the result in memory and save when the connection returns (§12).
- **`packages/analytics`**
  - Game-agnostic stats from the event stream (§13.1) and REBUILT stats from `stats.json` (§13.2).
  - EPA-style contribution estimate with uncertainty, win probability, RP rates.
  - Design sensitivity, alliance synergy, confidence intervals.
  - Rule-coverage report attached to every result (§8.6).
  - CSV/JSON export.
- **`web`:** batch setup and progress UI; dashboards with comparison tables, histograms, response curves, and per-match drill-down into replays.
- **Calibration (§13.4):** CSV/JSON import template, sim-versus-real error display, calibration records with provenance.

**Exit criteria:** a 500-match sweep over `ballsPerSecond` completes on a laptop and produces a response curve with confidence intervals, saved to the team workspace.

### Phase 5 — PathPlanner (§16)

**Goal:** run the team's real autos in the sim.

- **`packages/pathplan`**
  - `.path` import: sample the Bezier chain to a polyline at fixed arc-length spacing; read rotation targets, constraints (speed caps only), event markers (by progress), and goal end state.
  - `.auto` import: starting pose, reset odometry, and `wait`, `named`, `path`, `sequential`, `parallel`, `race`, `deadline`. Unsupported commands are reported to the user.
  - Follower: holonomic lookahead follower; speed capped by robot `maxSpeed`, path constraint, curvature limit, and acceleration limit; heading follows rotation targets within `maxAngularSpeed`; timeout abandons a blocked path. It is a `DriverInput` source like humans and agents.
  - Named-command executor driven by `named-commands.json`.
- **`game-rebuilt/named-commands.json`** with defaults.
- **`web`:** file picker and drag-and-drop import (files saved to the workspace); named-command mapping UI that lists detected names and prompts for unmapped ones.
- Tests use files from the team's own robot-code repositories.

**Exit criteria:** a team `.auto` runs with mapped named commands, and sampled geometry matches PathPlanner's Bezier output within tolerance.

### Kickoff rehearsal (after Phase 5)

Run the §19 runbook end to end on a prior game (for example 2025 REEFSCAPE): generate the module with Claude from its manual, validate, play, and time manual → L3. Fix gaps in `AUTHORING.md`, schemas, and validator messages.

### Phase 6 — Public data publishing (§15)

- "Publish this test" action creating an immutable snapshot, with selectable payload (stats, design JSON, replays), attribution or anonymous, and a license notice.
- Unpublish deletes the snapshot.
- Public site (`web/src/public/`): browse and search by game, archetype, tags, stats; download CSV/JSON; read API; "Remix" copies a design into the reader's workspace.
- Large replays and logs in object storage with size caps.

**Exit criteria:** publishing is opt-in and works end to end, and another signed-in team can remix a published design.

### Phase 7 — Async team-to-team sharing

Sharing tables and permissions in `data-layer`; share a design, profile, or test with another team.

### Phase 8 — Real-time multiplayer (later)

Lockstep `net/` layer on top of core snapshot/restore and input logs. The only work now is keeping the core deterministic and serializable.

---

## 2a. Repo architecture per phase

`+` marks what is new in that phase.

### Phase 0
```
GoldSim/
+ package.json            (npm workspaces)
+ tsconfig.base.json
+ CHANGELOG.md
+ .github/workflows/
+   ci.yml
+   pages.yml
  LICENSE
  docs/
    PRD.md
+   IMPLEMENTATION_PLAN.md
+   decisions/0001-physics-engine.md
+ packages/
+   core/spike/           (engine benchmark harness)
```
```
 spike harness ──► Rapier2D ──┐
                              ├──► metrics: determinism hash, steps/s, FPS, bundle size
 spike harness ──► Planck.js ─┘
```

### Phase 1
```
GoldSim/
  packages/
+   schema/        (JSON Schemas, TS types, validators)
    core/
+     src/ (loop, rng, robot, drivetrain, mechanisms, field, pieces,
+           ballistics, scoring-dsl, events, snapshot)
+   game-rebuilt/  (game/field/pieces/scoring/rules/mechanisms/stats .json,
+                   visuals/, tests/, SOURCES.md)
+   web/           (shell, styles/, renderer, input, hud, match screen)
+ examples/        (sample robots)
  docs/
+   AUTHORING.md
+   SCHEMAS.md
```
```
 ┌────────┐     ┌──────┐     ┌──────────────┐
 │ schema │◄────│ core │     │ game-rebuilt │──► schema
 └────────┘     └──────┘     └──────────────┘
      ▲            ▲                ▲
      └────────────┴──── web ───────┘

 Xbox controller ─► Gamepad API ─► DriverInput ─► core match loop ─► Canvas renderer
                                                          │
                                         game module rules (DSL) ─► score, HUD
```

### Phase 2
```
GoldSim/
+ supabase/
+   config.toml
+   migrations/    (tables + RLS policies)
+   tests/         (RLS tests)
  packages/
+   data-layer/    (DataLayer interface, Supabase implementation)
    web/
+     src/auth/, src/workspace/, src/settings/, src/sync/ (outbox, conflicts)
  docs/
+   SELF-HOSTING.md
```
```
 web ──► DataLayer interface ──► Supabase impl ──► Supabase: Auth │ Postgres + RLS │ Storage
  │
  └──► core (unchanged; no backend dependency)
```

### Phase 3
```
GoldSim/
  packages/
    core/
+     src/replay/   (input-log recorder, re-sim)
    game-rebuilt/
+     presets/      (archetype robot JSON)
    web/
+     src/editor/
+     src/replay/
  examples/
+   replays/
```
```
 editor ─► robot JSON ─► schema validate ─► DataLayer (design versions)
 match  ─► input log  ─► DataLayer (recordings) ─► replay ─► core re-sim ─► renderer
```

### Phase 4
```
GoldSim/
  packages/
+   agents/       (behaviors, selector, driver profiles, fitting)
+   batch/        (worker pool, sweeps, seeds)
+   analytics/    (stats, EPA-style, sensitivity, exports)
    web/
+     src/batch/, src/dashboards/, src/calibration/
```
```
 web ─► batch ─► Worker 1..N: [ core + agents + game module ] ─► event streams
                                                                   │
                     DataLayer (test runs) ◄── dashboards ◄── analytics
```

### Phase 5
```
GoldSim/
  packages/
+   pathplan/     (path/auto import, sampler, follower, named commands)
    game-rebuilt/
+     named-commands.json
    web/
+     src/paths/  (import, named-command mapping)
```
```
 .path / .auto ─► pathplan importer ─► follower ─► DriverInput ─► core
                                          ▲
                   human (Gamepad) ───────┤  same interface
                   agents ────────────────┘
```

### Phase 6
```
GoldSim/
+ supabase/migrations/  (published_snapshots, public read policies)
  packages/
    data-layer/
+     publish + public read API
    web/
+     src/public/  (browse, search, download, remix)
```
```
 test run ─► publish (select payload) ─► snapshot ─► public site / read API (no sign-in)
                                                         │
                                       remix ─► reader's team workspace (sign-in)
```

### Phases 7–8 (sketch)
```
  data-layer  + sharing tables and permissions          (Phase 7)
  packages/
+   net/       lockstep layer over snapshot + input logs (Phase 8)
```

### Full architecture (v1 complete)
```
GoldSim/
  packages/
    core/  schema/  game-rebuilt/  agents/  batch/
    analytics/  pathplan/  data-layer/  web/
  supabase/  examples/  docs/  .github/
```
```
                          ┌──────────── web ────────────┐
                          ▼      ▼      ▼      ▼        ▼
                       batch  analytics pathplan agents data-layer ──► Supabase
                         │       │        │       │
                         ├──► agents      │       │
                         ▼       ▼        ▼       ▼
                       ┌──────────── core ────────────┐
                       └──────────────┬───────────────┘
                                      ▼
                                   schema ◄── game-rebuilt (data + reviewed hooks)
```

---

## 3. Styling

GoldSim uses the design language of [`HossHarman/WingIt`](https://github.com/HossHarman/WingIt) (`css/style.css`): flat, high-contrast, black and gray panels with gold accents, square corners everywhere.

### 3.1 Files
`packages/web/src/styles/`
- `tokens.css`: color tokens for dark and light themes.
- `base.css`: reset, typography, layout shell.
- `components.css`: buttons, panels, cards, tags, meters, tables, forms, toast, modal.

Copy WingIt's rules nearly verbatim; rename only where GoldSim needs different components.

### 3.2 Color tokens (dark theme, the default; identical to WingIt)

| Token | Value | Use |
|---|---|---|
| `--gold` | `#ffa300` | Accents, primary buttons, selected borders, top-bar rule |
| `--gold-dark` | `#a86c00` | Hints, secondary accent |
| `--white` | `#ffffff` | Text |
| `--black` | `#000000` | Page background, top bar, canvas |
| `--gray-1` | `#111111` | App background |
| `--gray-2` | `#1c1c1c` | Panels, cards |
| `--gray-3` | `#2a2a2a` | Buttons, inputs, tags |
| `--gray-4` | `#444444` | Borders, rules |
| `--gray-5` | `#8a8a8a` | Muted text |
| `--blue` | `#4054e4` | Blue alliance |
| `--red` | `#e0443a` | Red alliance, errors |
| `--green` | `#52b86a` | Success |

### 3.3 Rules
- **Zero rounded corners:** `* { box-sizing: border-box; border-radius: 0; }`. This covers inputs, buttons, modals, tooltips, canvases, and chart bars. Never add a `border-radius`.
- **Borders:** 2px solid `--gray-4`. Hover and selected state turns the border `--gold`.
- **Typography:** titles (logo wordmark, h1, h2, screen titles) use **Karnivore**, the team font (`packages/web/public/fonts/Karnivore.ttf`, loaded with `@font-face` as `--font-title`). Body text uses `"Segoe UI", Arial, sans-serif` at 15px; monospace `Consolas, "Courier New", monospace`. h1 28px, h2 20px in gold, h3 16px.
- **"6220" is always written "6220"**, in Karnivore too (team branding rule; the old "622o" substitution is gone).
- **Top bar:** black, 44px tall, 2px gold bottom border. Gold 6220 griffin logo mark, then the wordmark in Karnivore: `GOLD` in gold + `SIM` in white, 2px letter spacing, matching WingIt's `WING`/`IT`. The wordmark text comes from `APP_NAME`.
- **Logos:** team assets in `packages/web/public/brand/`: the gold griffin circle (`6220-logo-gold.svg`, also the favicon) for the top bar, and the gold wings + logo (`6220-wings-gold.svg`) for the home/sign-in screen. Team logos and the font are not covered by the repo's MIT license (see `packages/web/public/brand/README.md`).
- **Buttons:** `.btn` is gray-3 with a gray-4 border and a gold border on hover. `.btn.primary` is a gold fill with black bold text that turns white on hover. `.btn.sel` marks selection. Disabled is 0.35 opacity.
- **Containers:** `.panel` and `.card` are gray-2 with a gray-4 border; `.sel` uses a gold border.
- **Tags:** `.tag` with `warn` (gold), `bad` (red), `good` (green) variants. Use these for rule-coverage status (`implemented` = good, `approximated` = warn, `not_implemented` = bad).
- **Meters:** thin bar with a gold fill (red when bad), for RP progress and quotas.
- **Toast:** gold card with black text and a square black close button.
- **Modal:** `rgba(0,0,0,0.88)` backdrop, gray-2 box with a gold border.
- **Forms:** gray-3 inputs with 2px gray-4 borders; `accent-color: var(--gold)` on range and checkbox.
- **Tables:** collapsed borders, 1px gray-4 row rules.
- **No** shadows, gradients, blur, or animations beyond simple color changes on hover.

### 3.4 Differences from WingIt
- **Layout:** WingIt scales a fixed 1280×720 `#app`. GoldSim is a tool with an editor and dashboards, so it uses a responsive full-viewport flex layout for laptop widths (minimum about 1024px). Mobile is out of scope (§2.2).
- **Canvas and charts follow the theme:** the field renderer and dashboard charts read colors from CSS variables (`getComputedStyle`) instead of hard-coding them. Alliance red and blue stay the same in both themes.

### 3.5 Light mode toggle
Low cost, because every color is already a token.

- `:root[data-theme="light"]` overrides:

  | Token | Light value |
  |---|---|
  | page background | `#f2f2f2` |
  | `--gray-1` | `#fafafa` |
  | `--gray-2` | `#ffffff` |
  | `--gray-3` | `#ececec` |
  | `--gray-4` | `#c4c4c4` |
  | `--gray-5` | `#5f5f5f` |
  | text | `#000000` |

- The top bar stays black with the gold rule in both themes, as a brand anchor.
- Gold stays `#ffa300` in both themes, for fills and text alike.
- Default theme follows `prefers-color-scheme`. A text button in the top bar ("Light" / "Dark", like WingIt's "Sound on" button) switches it.
- The choice is saved to the user's account settings (§14.2). A `localStorage` copy is kept only so the theme applies immediately on load and for guests. It is a UI preference, not project data.

---

## 4. Testing and CI

| Suite | Tool | Covers | Runs |
|---|---|---|---|
| Unit | Vitest | Physics invariants, state machines, DSL, RNG, determinism | Every PR |
| Golden conformance | Vitest + game-module `tests/` | REBUILT scoring, shifts, thresholds, Hub emission, Tower levels, Trench gate | Every PR |
| Schema | Vitest + ajv | Valid and invalid fixtures for robot, module, replay, path, stats | Every PR |
| PathPlanner | Vitest | Sampled geometry vs PathPlanner Bezier within tolerance; markers by progress | Every PR |
| Backend | Supabase local (`supabase start`) | RLS: non-members see nothing; public snapshots read-only | Every PR touching `supabase/` or `data-layer/` |
| Performance | Node headless benchmark | Matches per minute per core; fails on regression | Every PR (report), release (gate) |
| Manual | Checklist | Chromebook FPS and batch throughput; controller play | Each release |

**v1 acceptance checklist (§20):**
- [ ] A student generates a game module from the REBUILT manual and plays to L3 with Claude's help.
- [ ] Two designs differing only in shooter orientation show physically sensible, different cycle-time distributions.
- [ ] A robot taller than the Trench clearance cannot pass; a shorter one can.
- [ ] A 500-match `ballsPerSecond` sweep completes on a laptop and yields a response curve with confidence intervals, saved to the workspace.
- [ ] A PathPlanner `.auto` from the team's repo runs with mapped named commands.
- [ ] A new team creates a workspace, invites a member, and both see the same data from different laptops.
- [ ] Publishing is opt-in and works end to end; another signed-in team can remix a published design.

---

## 5. Milestone checklist

- [ ] **M0:** repo tooling, CI, Pages deploy; physics engine decision recorded.
- [ ] **M1:** REBUILT match drivable to L3 with an Xbox controller; conformance and determinism tests green.
- [ ] **M2:** sign-in, team workspaces, cloud saves; RLS tests green.
- [ ] **M3:** robot editor, REBUILT presets, recording and replay.
- [ ] **M4:** agents, batch sweeps, dashboards, calibration import.
- [ ] **M5:** PathPlanner autos run with named commands.
- [ ] **Rehearsal:** prior-game manual → L3 timed and gaps fixed.
- [ ] **M6:** public publishing and remix.
- [ ] **M7:** async team-to-team sharing.
- [ ] **M8:** real-time multiplayer.

---

## 6. Open decisions and the phase they block

| Decision (§22.2) | Blocks |
|---|---|
| #1 Physics engine | Phase 0 exit; everything after |
| #3 Account model (individual sign-ins vs shared team login) | Phase 2 schema |
| #4 Guest mode | Phase 2 web flows |
| #5 Sign-in providers | Phase 2 auth |
| #6 Backend choice, ownership, free-tier limits | Phase 2 start |
| #2 Calibration tolerance | Phase 4 acceptance |
| #7 Subdomain under team6220.org | Hosting move (any time after Phase 1) |
| #8 Public data license | Phase 6 |
| #10 Privacy policy and terms review | Opening sign-ups to other teams |
| #9 Team number verification | Later feature |
| #11 Copyright holder after repo transfer | Repo transfer (§18.2) |

---

## 7. Execution risks

- **One developer plus Claude before kickoff.** If behind, cut in this order: Phase 6 → calibration fitting → agent knob fitting → sweep designs beyond grid.
- **Never cut:** determinism, REBUILT conformance tests, accounts and RLS, the rule-coverage report.
- **Engine risk:** if Phase 0 fails the performance bar, record the relaxation (solver iterations, sleeping bodies, piece abstraction) before Phase 1 starts.
- **Scope creep:** anything not in the PRD goes to a backlog issue, not into the current phase.

---

## 8. Definition of done (every phase)

1. Exit criteria met and tests green in CI.
2. Checked from a user's perspective (play it, click it), not only by tests.
3. `CHANGELOG.md` entry added.
4. Affected docs updated (`AUTHORING.md`, `SCHEMAS.md`, `SELF-HOSTING.md`, decision records).
5. Deployed to GitHub Pages from `main`.
