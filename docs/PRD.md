# GoldSim — Product Requirements Document

| | |
|---|---|
| **Status** | Draft v0.2 |
| **Date** | 2026-10-25 |
| **Owner** | FRC Team 6220 |
| **License** | MIT |
| **Repository** | `HossHarman/GoldSim` (personal repo for now; will be transferred to the Team 6220 GitHub organization) |
| **Name** | GoldSim (working name; may change later, so the name lives in one config constant) |

> GoldSim is an open-source, browser-based 2D FRC strategy and design simulator. A team signs in, defines real 2D robot designs, drops them into a game-specific field, drives them with Xbox-type controllers or simulated drivers, and runs hundreds of matches to rank robot archetypes. A new season's game can be brought up within about an hour of kickoff, and archetype conclusions can be reached within about 48 hours.

GoldSim is independent work inspired by publicly available descriptions of HighTide's internal TideSim. It does not reproduce any HighTide code, data, or assets, and is not affiliated with HighTide (Team 4414).

## What changed from v0.1

- **Accounts are now required.** All private data (designs, recordings, test results, settings) lives in a team account in the cloud, not on the local device. Accounts are per team; non-team groups (for example a Ri3D group) can create one too. See §14.
- **Repository:** `HossHarman/GoldSim`, to be transferred to the Team 6220 organization. See §18.
- **REBUILT facts are verified** against the 2026 Game Manual (version TU22). Tower Level 1 is 15 points in AUTO and 10 in TELEOP. RP thresholds, shift timings, fouls, and field dimensions are confirmed. See §8.7.
- **No rules enforcement on designs.** Robot designs are never blocked or altered because of robot-construction rules. Rules implementation is best-effort, with a published coverage report. See §8.6 and §9.
- **PathPlanner support is simplified.** The sim uses path geometry only (no time-parameterized trajectories) and a simple follower. See §16.
- **Controllers:** Xbox-type controllers only for this version, using WPILib-style bindings. See §10.
- **Open questions resolved or reclassified.** See §22.
- **New core requirements found in the manual:** robot height versus Trench clearance, terrain zones (Bump), a Hub that consumes and re-emits pieces, and a human-player model. See §7.3.

---

## 1. Problem and opportunity

In the first days after kickoff, teams must choose a robot archetype, and the evidence is usually spreadsheets, intuition, and a few hand-rolled prototypes. The best-resourced teams reportedly use internal simulators to evaluate designs quickly. Most teams cannot build one.

Existing public tools each miss part of the need:

| Tool | What it is | Gap for this use case |
|---|---|---|
| xRC Simulator | Free, game-like 3D simulator | Closed source; 3D; slow to adapt to custom designs |
| First Robotics Simulator (FRS) | Browser 3D match sim with real team robots | Closed source; 3D; fixed robots, not user designs |
| XploreSim (Chief Delphi, Oct 2026) | Browser match sim: enter six robots, run a match with a physics engine, scrub replays, run batches, search for plans per alliance | Treats robots as stat blocks per its post summary; mounted-mechanism geometry not confirmed; open-source status unconfirmed |
| StrategyEngine-2026 (Team 1690) | Open-source FRC2026 strategy simulation (Flutter client, Go server) | REBUILT-specific; not an agnostic core |
| WPILib / maple-sim style code sims | Robot code simulation | Needs real robot code; not a design-exploration tool |
| Statbotics / scouting tools | Post-hoc performance statistics | Describes what happened; cannot evaluate a design not yet built |

**Opportunity:** a game-agnostic, open 2D core where *robot geometry actually matters* (for example, shooter orientation relative to the intake changes cycle time through physics, not through a hand-tuned number), plus a per-year game module that can be generated from the game manual, plus team accounts so findings accumulate in one place.

## 2. Goals, non-goals, success criteria

### 2.1 Goals
1. **Real 2D design drives behavior.** Chassis, bumpers, and mounted mechanisms (position, angle, parameters) determine intake reach, pickup side, shot direction, and cycle times through simulation.
2. **Game-agnostic core + thin yearly module.** Everything year-specific lives in data (JSON plus small, reviewed code hooks). The core is not edited at kickoff.
3. **Kickoff speed.** A playable field with full rules (including endgame) in about 1 hour, using Claude to generate the game module from the uploaded manual. Archetype comparisons within 48 hours.
4. **Two ways to test.** Humans drive with Xbox-type controllers in real time. Simulated drivers (agents) run headless, sped-up batches and produce distributions.
5. **Rich analytics.** Cycle times, scoring, EPA-style contribution, sensitivity to design parameters (for example balls per second), exportable.
6. **Team accounts and cloud persistence.** Private work (designs, recordings, results, settings) is saved to a team account, not to the device.
7. **Open data, by choice.** Any test can optionally be published (stats, design JSON, replay) to a public site. Opt-in per test.
8. **Lightweight web.** All simulation runs in the browser on mixed laptops including Chromebooks. GitHub Pages first, then a team6220.org subdomain.
9. **PathPlanner integration.** Follow PathPlanner paths and autos from files, with a small set of customizable named commands mapped to sim actions.

### 2.2 Non-goals (v1)
- Mobile support (laptop only).
- DXF/CAD import (drag-and-drop editor only).
- 3D visualization or true 3D ballistics (ballistics is parametric).
- Replacing WPILib code simulation or running real robot code.
- **Enforcing robot-construction rules.** Designs are never blocked or modified because of size, extension, weight, or bumper rules (§9).
- **Joystick and button-board input.** Xbox-type controllers only in v1 (§10).
- **Server-side simulation.** The backend stores data only. All simulation and batch compute is client-side.
- **Time-parameterized trajectory generation** and in-app auto planning (§16).
- Real-time multiplayer (async sharing first; design for it later).
- Moderation tooling or content review (§15.3).
- Cards, disqualifications, and other event-level administration (not relevant to archetype performance).

### 2.3 Success criteria
- **Primary (team-level):** "We ranked 5 archetypes within 48 hours of kickoff and the results matched our later real-world testing."
- **Kickoff bar:** from manual upload to a drivable field with full rules (scoring, shift/phase logic, RPs, endgame, and the fouls the sim can detect) in about 60 minutes, with a defined degradation ladder if the full bar is not met (§8.4).
- **Fidelity bar:** simulated cycle time for a calibrated design is within a target tolerance of measured real-robot cycle time (provisional ±15%; to be set after the first real calibration).
- **Workspace bar:** a new team can create a workspace, invite members, and see the same saved designs and results from any laptop.
- **Performance bar:** see §17.

## 3. Users

| User | Needs |
|---|---|
| **Student developer / maintainer (primary, 1 person + Claude)** | Stand up a new game module fast; extend agents and stats; keep the core stable |
| **Strategy lead / drivers** | Drive designs with an Xbox-type controller; compare archetypes; see why one wins |
| **Design leads (mechanical)** | Place mechanisms on a chassis, change angles/offsets, see cycle-time effects |
| **Team admin (mentor or lead)** | Create the team workspace, invite members, manage what is published |
| **Other FRC teams and non-team groups (for example Ri3D)** | Create their own workspace, load their own game module or robots, optionally contribute public data |
| **Scouts/analysts** | Browse public archetype data and export it |

## 4. Product principles
1. **Geometry is the source of truth.** Behavior derives from placement and parameters, not from hand-typed outcomes.
2. **Determinism first.** Same seed + same inputs = same match, so sweeps are reproducible and replays are tiny.
3. **One driver interface.** Humans, agents, and path followers all produce the same `DriverInput` per tick through the same code path.
4. **Data over code.** Game modules, robots, and stats are declarative JSON validated by schema. Code hooks are the exception, reviewed, and never shipped through user or public data.
5. **LLM-authorable.** Schemas, docs, examples, and validators are designed so Claude can generate a correct game module from a manual reliably.
6. **Static front end, minimal backend.** All simulation runs in the browser. The backend only handles sign-in, team data, and published data.
7. **Imperfect rules are expected.** The sim reports which rules it implements; users are assumed to be testing in good faith to get useful information, not to be policed.

## 5. Scope summary and phases

| Phase | Deliverable | Target |
|---|---|---|
| **0** | Tech spike: physics engine choice, determinism check, Chromebook benchmark | Today (Oct 25) |
| **1** | Core + REBUILT game module, human play with a gamepad, basic renderer (developer build; nothing is saved) | Today / first build sprint |
| **2** | Accounts, team workspaces, cloud persistence, per-user settings | Before kickoff |
| **3** | Robot editor, archetype presets, driver recording/replay | Before kickoff |
| **4** | Agents (parameterized), headless batch + sweeps, stats/analytics, calibration import | Before kickoff |
| **5** | PathPlanner import and named commands | Before kickoff |
| **6** | Public data publishing (opt-in per test), public browse/export site | Before or soon after kickoff |
| **7** | Team-to-team sharing and collaboration (async) | Post-kickoff |
| **8** | Real-time multiplayer (lockstep) | Later; core must not preclude it |

FIRST's 2027 kickoff is **Saturday, January 9, 2027, 12:00 p.m. ET (9:00 a.m. PT)**, about 11 weeks from this draft (source: the FIRST game-and-season page, which names the 2027 game BIOCORE). The core is built and tested against REBUILT now. Everything through Phase 5 should be usable before kickoff.

## 6. System architecture

### 6.1 Technology (recommendations)
| Concern | Recommendation | Notes |
|---|---|---|
| Language | TypeScript | Runs everywhere, fast iteration, good LLM support |
| Build | Vite, static output | Deploys to GitHub Pages unchanged |
| Physics | Rapier2D (WASM), pending the Phase 0 spike | Chosen for batch speed; must pass the determinism and Chromebook benchmark. Fallback: Planck.js (Box2D port), simpler but slower. The team is not committed to an engine yet |
| Rendering | Canvas 2D (or PixiJS if profiling demands) | 2D top-down; no 3D deps |
| Workers | Web Worker pool for batch | Core runs headless inside workers |
| Input | Browser Gamepad API, standard mapping (Xbox-type controllers) | No install |
| Backend | Supabase (Postgres with row-level security, Auth, Storage) recommended | Behind a data-layer interface so another backend can be swapped in; see §14.8 |
| Sign-in | Google sign-in plus email magic link (proposed) | See §14.5 |
| Persistence | The cloud account is the source of truth; no durable local project storage | JSON import/export for portability only |
| Hosting | GitHub Pages, then a team6220.org subdomain | See §18 |

**Decision recorded:** robot-to-robot contact uses full rigid-body physics in all modes (no reduced-fidelity batch mode). Batch speed is achieved through fixed-timestep stepping without rendering, worker parallelism, and sensible solver settings. The Phase 0 spike must confirm throughput on a Chromebook-class device; if it fails the bar in §17, revisit this decision explicitly.

### 6.2 Package layout
```
GoldSim/
  packages/
    core/          # agnostic physics, robot model, mechanisms, driver interface, match loop
    schema/        # JSON Schemas + TS types + validators (robot, game module, stats, replay)
    game-rebuilt/  # 2026 game module (reference example)
    agents/        # parameterized policies, behavior library
    batch/         # headless runner, worker pool, sweep engine, seeded RNG
    analytics/     # stat computation, EPA-style estimation, sensitivity, exports
    pathplan/      # PathPlanner import, path sampling, follower, named-command map
    data-layer/    # backend interface + Supabase implementation, migrations, RLS policies
    web/           # app UI: sign-in, team workspace, field view, editor, play, dashboards, replay
  docs/
    AUTHORING.md   # manual → game module guide (LLM- and student-facing)
    SCHEMAS.md
    SELF-HOSTING.md
  examples/        # sample robots, archetypes, replays
  LICENSE          # MIT
```

### 6.3 Match loop (core)
- Fixed timestep (default 120 Hz physics, configurable). Rendering interpolates.
- Per tick: read `DriverInput` for each robot → apply mechanism/state-machine updates → step physics → resolve game events (piece pickup, shot launch, scoring zone entry, piece emission) → update game-module state (phase, shifts, scoring) → emit events/telemetry.
- All randomness goes through a seeded PRNG owned by the match.
- Time control: speed multiplier for real-time play; unlimited for headless.
- State is serializable (snapshot/restore) to support replay scrubbing and rollback netcode later.

### 6.4 Determinism contract
- Same build + same seed + same input log ⇒ identical event stream and stats on the same machine.
- Cross-machine bit-exactness is a stretch goal (WASM float behavior and engine builds permitting), not a v1 requirement. Replays record the engine version and seed and store inputs, not full state.

## 7. Game-agnostic core

### 7.1 Coordinate system and units
SI units throughout (meters, seconds, kilograms, radians). Field origin at a defined corner; +x along the field length, +y across; heading counter-clockwise from +x. The editor displays inches as a user preference but stores SI.

### 7.2 Robot model
A robot is a JSON document:

```json
{
  "schemaVersion": 1,
  "name": "Swerve + OTB intake + fixed shooter",
  "chassis": {
    "frame": { "type": "rect", "length": 0.686, "width": 0.686 },
    "height": 0.55,
    "bumpers": { "thickness": 0.0889, "mass": 4.5 },
    "mass": 52.0,
    "momentOfInertia": "auto",
    "drivetrain": {
      "type": "swerve",
      "maxSpeed": 4.5,
      "maxAccel": 8.0,
      "maxAngularSpeed": 9.0,
      "traction": 1.1
    }
  },
  "mechanisms": [
    {
      "id": "intake1",
      "type": "intake",
      "mount": { "x": 0.45, "y": 0.0, "theta": 0.0 },
      "params": { "width": 0.6, "rollerDepth": 0.05, "deployTime": 0.4 },
      "stateMachine": "intake.default"
    },
    {
      "id": "hopper1",
      "type": "storage",
      "mount": { "x": 0.0, "y": 0.0, "theta": 0.0 },
      "params": { "capacity": 40 }
    },
    {
      "id": "shooter1",
      "type": "shooter",
      "mount": { "x": -0.1, "y": 0.0, "theta": 3.14159 },
      "params": { "exitSpeed": 9.0, "ballsPerSecond": 8.0, "spread": 0.05, "spinUpTime": 0.8, "rangeMin": 1.0, "rangeMax": 5.5 }
    }
  ]
}
```

Core requirements:
- **Chassis footprint:** polygon (rect default; arbitrary convex/compound supported) with bumpers as a distinct collision layer. Mass and moment of inertia drive pushing and defense.
- **Robot height:** every robot has a driving height. Moving-geometry mechanisms may change it per state. Height is needed so the sim can decide whether a robot fits under a height-gated passage (§7.3).
- **Drivetrain models:** at least swerve (holonomic), tank/differential, and mecanum as selectable types with parameters; traction coefficient affects pushing and acceleration. Motor and gearbox limits are expressed as `maxSpeed`, `maxAccel`, and similar; current-limit-style options are later work.
- **Mechanism abstraction:** every mechanism has `{ id, type, mount (x, y, θ in the chassis frame), footprint, params, state machine }`. Mounts are freely placeable and rotatable.
- **Interaction geometry is derived, not typed.** The core computes, from mounts and footprints, what each mechanism can touch (which piece contacts which roller, where a shot exits and in which direction in the field frame). Cycle-time effects such as "the shooter faces away from the intake, so the chassis must rotate before shooting" emerge from physics plus the driver or agent policy, not from a coded penalty.
- **Moving geometry:** mechanisms may change their footprint or position over time per state (deploying intakes, extending arms, elevators, climbers). Collision shapes update with state.
- **No legality gating.** The core accepts any physically runnable design (see §9).

### 7.3 Field model
The game module declares the field from a small set of element kinds. REBUILT shows why each one is needed.

| Element kind | Behavior | REBUILT example |
|---|---|---|
| `wall` | Static collider | Guardrails, Alliance Wall |
| `zone` | Named region with optional alliance tag; used by rules and agents | Alliance Zone, Neutral Zone, Outpost Area, start lines |
| `terrain` | Region that modifies robot speed, acceleration, or traction, or adds a crossing cost | Bump (ramps 6.5 in tall at 15°) |
| `gate` | Passage with a clearance height; a robot taller than the clearance cannot pass | Trench (22.25 in clearance, 50.34 in wide opening) |
| `sink` / `emitter` | Consumes pieces entering an opening and re-emits them after a delay through one of several exits, chosen with the seeded RNG | Hub: Fuel scored is distributed into the Neutral Zone via one of four exits |
| `feeder` | Introduces pieces on a schedule or on demand, with rate, capacity, and accuracy knobs (the human-player model) | Outpost Chute and Corral, human-player throws over the wall |
| `climbStructure` | Engagement zone plus levels defined by lift thresholds, matched against a robot's `climber` mechanism | Tower with rungs at 27, 45, and 63 in |
| `pieceSource` | Initial placement layouts, including randomized layouts and preload rules | Depots (24 each), Neutral Zone block (about 206 × 72 in) |

### 7.4 Mechanism types (core set)
| Type | Behavior |
|---|---|
| `intake` | Contact region (roller) on the robot; when a game piece overlaps the roller region while the intake is active and the robot has capacity, the piece is acquired. Requires deployed state if configured. Pickup only occurs through the roller geometry (semi-real: correct side, touching the roller's 2D region) |
| `storage` | Holds N pieces; configurable ordering (FIFO/LIFO) and transfer latency |
| `transfer` | Moves pieces between mechanisms with rate and delay |
| `shooter` | Launches pieces from the mount pose along the mount heading with `exitSpeed`, `ballsPerSecond`, `spread`, spin-up, and a min/max range window; trajectory resolved by a parametric time-of-flight model (no true 3D) |
| `placer` | Places or drops a piece at a pose or zone (for non-shooting games) |
| `climber` | Engages a game-defined `climbStructure`; reach and climb time determine the level achieved |
| `blocker` / `plow` | Fixed or deployable geometry used for defense and pushing |
| `custom` | Declared by a game module using primitives (see §8) |

Mechanism state machines are declarative: named states, transitions, guards (conditions), timers, and effects (for example spawn or launch a piece, set a flag). Presets are provided (for example `intake.default`: stowed → deploying → ready → intaking).

### 7.5 Game pieces
- Piece types are declared by the game module: shape (circle/box/polygon), size, mass, restitution, friction, drag.
- Pieces are physics bodies when free and abstracted (counted) when stored inside a robot.
- The game module can declare caps (per-robot limits, field counts) and spawn/feed rules (human-player feeds, preloads).

### 7.6 Ballistics and shooting model
Top-down 2D cannot model elevation. Shots use a parametric model: exit speed, nominal angle, drag/air time, and a valid target window (min/max distance, optional tolerance by distance). Output is a time of flight and a landing point or hit probability resolved against game-defined targets. Spread is sampled from the match's seeded RNG. The model is explicit about its limits: it supports "does this shooter orientation and rate make sense," not exact trajectory optimization.

### 7.7 Driver interface (shared by humans, agents, and path followers)
```ts
interface DriverInput {
  vx: number; vy: number; omega: number;       // field- or robot-relative, per config
  actions: Record<string, boolean | number>;   // named mechanism/game actions (e.g., "intake", "shoot", "climb")
}
```
Humans, agents, and path followers all implement `getInput(tick, observation): DriverInput`. The `observation` is a limited, documented view of state so agent code cannot cheat in ways humans cannot.

## 8. Game modules (per-season layer)

### 8.1 Concept
A game module is the only thing authored at kickoff. It declares everything year-specific and contains no physics code. It is designed to be **generated by Claude from the uploaded game manual**, then validated and corrected by a student.

### 8.2 Module contents
```
game-<year>/
  game.json          # metadata, match timeline (phases/shifts), alliance sizes, threshold profiles
  field.json         # field size and elements (§7.3), start positions
  pieces.json        # piece types and initial placements
  scoring.json       # scoring rules, thresholds, RPs, penalties (declarative)
  rules.json         # per-rule coverage status (§8.6)
  mechanisms.json    # year-specific mechanism types composed from core primitives
  named-commands.json# mapping of PathPlanner named commands → sim actions
  stats.json         # game-specific stat definitions (game-agnostic stats come free)
  visuals/           # SVGs / colors / labels for field elements and pieces
  tests/             # conformance scenarios with expected scores and events
  SOURCES.md         # manual version and section references for each rule
```

### 8.3 Scoring/rules DSL (declarative)
Rules are event/condition driven and JSON-expressed:
- **Triggers:** `piece_enters_zone`, `piece_scored_by`, `robot_in_zone_at_time`, `robot_bumpers_across_line`, `timer`, `phase_start/end`.
- **Conditions:** zone/robot/alliance state, phase, "hub active," counters, thresholds.
- **Effects:** add points, increment counters, award ranking points, toggle element state (for example activate or deactivate a goal), mark penalties, spawn or emit a piece.
- **Phase and shift timelines:** an explicit list of phases with durations and per-phase flags, plus a hook for results-dependent logic (for example "the alliance that scored more Fuel in AUTO gets its Hub deactivated in SHIFT 1; ties are resolved randomly with the seeded RNG").
- **Assessment delays:** scoring windows that stay open for a set time after a phase ends or a goal deactivates (REBUILT uses 3 seconds).
- **Threshold profiles:** named sets of bonus-RP thresholds (for example regional/district, district championship, FIRST Championship).
- **Escape hatch:** small, reviewed TypeScript hooks for logic the DSL cannot express. Hooks ship only inside the repo, are code-reviewed, and are never loaded from user or public data.

### 8.4 Authoring pipeline (manual → module)
1. A student uploads the game manual (and field drawings if available) to Claude.
2. Claude follows `docs/AUTHORING.md` and the JSON Schemas to produce the module files, citing manual sections in `SOURCES.md`.
3. `npm run validate-game` checks schema validity, referential integrity (zones and pieces referenced exist), timeline sums, and obvious scoring errors.
4. Claude also generates `tests/` scenarios directly from manual examples (for example "robot reaches Tower level 2 in TELEOP ⇒ 20 points") and runs them via a scripted harness.
5. A student plays one match and spot-checks against the manual. Corrections go back to Claude with the failing test or scenario.

**Graceful-degradation ladder** (what "playable" means if the hour runs out):
- **L0:** Field, pieces, and collisions drivable.
- **L1:** Basic scoring and match timeline.
- **L2:** Phase/shift logic, thresholds, RPs.
- **L3:** Endgame objects and detectable fouls modeled.

Each level is usable for archetype exploration; the goal is L3 in about an hour.

### 8.5 Deliverables to make authoring reliable
- Versioned JSON Schemas with descriptions written for LLM consumption.
- A complete, annotated **REBUILT reference module** used as a few-shot example.
- A reusable **authoring prompt** and checklist (manual sections to read, in order).
- Validator error messages that point to the manual-level cause, not just a JSON path.

### 8.6 Rule coverage policy
Rules implementation will never be perfect, and users are assumed to be testing in good faith. The sim therefore:
- **Never blocks or modifies a design** for violating construction rules (size, extension, weight, bumper rules). These rules are not part of the module's executable rules in v1. They appear only as reference values (§8.7).
- Implements **in-match rules the sim can detect objectively** (for example crossing a line, scoring from the wrong zone).
- **Marks each rule's status** in `rules.json` as `implemented`, `approximated`, or `not_implemented`, with a short reason.
- **Prints a coverage report** with every test result, so analysts know which rules the numbers do and do not reflect.
- Treats referee-judgment rules (intent, recklessness, collusion) as `not_implemented`. Defense is still simulated physically.

Proposed initial coverage for REBUILT (to be tuned):

| Rule | Topic | Proposed status |
|---|---|---|
| G403 | Do not completely cross the Center Line in AUTO (MAJOR FOUL, plus one more per contact with an opponent) | implemented |
| G407 | Launch Fuel into your Hub only while bumpers are at least partly in your Alliance Zone (MAJOR FOUL) | implemented |
| G405 | Do not eject Fuel from the field (MINOR FOUL; MAJOR if repeated) | approximated |
| G418 | 3-second pin count (MINOR FOUL, then MAJOR FOUL every 3 seconds) | approximated (stretch) |
| G420 | Tower protection in the last 30 seconds (MAJOR FOUL) | approximated (stretch) |
| G427 | Outpost storage limit | approximated |
| G408 | Do not catch Fuel released by the Hub | not_implemented in v1 |
| G414 | No climbing on alliance partners | not_implemented in v1 |
| G415, G416, G417, G419 | Opponent damage, intent, tipping, collusion | not_implemented (referee judgment) |

### 8.7 REBUILT (2026) reference facts
Verified against the **2026 FIRST Robotics Competition Game Manual, version TU22**, which the team supplied. Section numbers refer to that manual. Bonus-RP thresholds for district championship and FIRST Championship events may be changed through Team Updates; the module cites the manual version it was built from.

| Item | Value | Manual ref |
|---|---|---|
| Alliances | 2 alliances, each up to 4 teams; 3 robots per alliance on the field (3 driver stations) | §6, §5.9 |
| Match length | AUTO 20 s + TELEOP 2:20 (2 min 40 s total); 3-second delay between AUTO and TELEOP for scoring purposes | §6.4, §6.5 |
| Field | About 317.7 in × 651.2 in (8.07 m × 16.54 m) carpeted area; guardrails 20 in tall | §5.2 |
| Zones | Alliance Zone 158.6 in deep × 317.7 in; Neutral Zone 283 in deep × 317.7 in; Center Line bisects the Neutral Zone; Robot Starting Line; Human Starting Line; Outpost Area 71 in × 134 in | §5.3 |
| Field elements | Per alliance: 1 Hub, 1 Tower, 1 Outpost. On the field: 2 Depots, 4 Bumps, 4 Trenches | §5.2 |
| Hub | 47 in × 47 in prism, centered between two Bumps, 158.6 in from the Alliance Wall. Hexagonal opening 41.7 in across, front edge 72 in above the carpet. Fuel processed through the Hub is distributed into the Neutral Zone via one of four exits | §5.4 |
| Bump | 73.0 in wide × 44.4 in deep × 6.513 in tall; HDPE ramps at 15° | §5.5 |
| Trench | 65.65 in wide × 47.0 in deep × 40.25 in tall; the space underneath is 50.34 in wide × 22.25 in tall; locked horizontal during the match | §5.6 |
| Depot | 42.0 in × 27.0 in along the Alliance Wall; 1.0 in tall steel barriers | §5.7 |
| Tower | 49.25 in wide × 45.0 in deep × 78.25 in tall; uprights 32.25 in apart; rungs (1.66 in OD pipe) with centers at 27 in (Low), 45 in (Mid), 63 in (High); integrated into the Alliance Wall between Driver Stations 2 and 3 | §5.8 |
| Outpost | Chute: 15° sloped tunnel, holds about 25 Fuel, opening 31.8 in × 7.0 in with its bottom 28.1 in off the floor. Corral: opening 32.0 in × 7.0 in at the base, area 35.8 in × 37.6 in | §5.9.2 |
| Fuel | 5.91 in (15.0 cm) high-density foam ball; robots may CONTROL any number of Fuel. AndyMark lists weight as 0.448–0.5 lb (not stated in the manual pages read) | §5.10, AndyMark |
| Fuel staging | 504 Fuel per match: 24 in each Depot (×2), 24 in each Outpost Chute (×2), up to 8 preloaded per robot (up to 48 total), and the remainder in the Neutral Zone (360 to 408), varying about ±24. District Championship and FIRST Championship matches may use up to 600. Neutral Zone block is about 206 in × 72 in with a 2 in divider removed before the match | §6.3.4, §6.3.4.1 |
| Timeline | AUTO 20 s; TRANSITION SHIFT 10 s; SHIFT 1, 2, 3, 4 at 25 s each; END GAME 30 s | §6.4, Table 6-2 |
| Hub status | Both Hubs active in AUTO, TRANSITION SHIFT, and END GAME. During shifts only one Hub is active. The alliance that scored more Fuel in AUTO has its Hub inactive in SHIFT 1; status then alternates each shift. If AUTO Fuel is tied, the field system randomly selects an alliance and uses its order | §6.4.1, Table 6-3 |
| Fuel scoring | 1 point per Fuel in an active Hub (AUTO and TELEOP); Fuel in an inactive Hub scores nothing. Counted once it passes through the top opening and the sensor array. Assessment continues up to 3 s after AUTO and TELEOP end and for 3 s after a Hub deactivates | §6.5, §6.5.1, Table 6-4 |
| Tower points | **LEVEL 1: 15 in AUTO (max 2 robots in AUTO), 10 in TELEOP.** LEVEL 2: 20 (TELEOP only). LEVEL 3: 30 (TELEOP only). A robot may earn only LEVEL 1 in AUTO and a single level in TELEOP, and AUTO points do not prevent TELEOP points | §6.5.2, Table 6-4 |
| Tower criteria | LEVEL 1: no longer touching the carpet or Tower base. LEVEL 2: bumpers completely above the Low rung. LEVEL 3: bumpers completely above the Mid rung. The robot must contact a rung or upright and may otherwise contact only the Tower wall, support structure, Fuel, or another robot. AUTO Tower points are assessed after the AUTO timer reaches 0:00; TELEOP Tower points 3 s after TELEOP ends or when all robots are at rest | §6.5, §6.5.2 |
| Ranking points | Win 3, tie 1 | Table 6-4 |
| Bonus RPs | ENERGIZED (Fuel scored in an active Hub at or above the threshold), SUPERCHARGED (same measure, higher threshold), TRAVERSAL (Tower points at or above the threshold). Regional/District events: **100 / 360 / 50**. District Championships: **240 / 360 / 50**. FIRST Championship: **360 / 500 / 50** | Table 6-4, Table 6-5 |
| Fouls | MINOR FOUL = 5 points to the opponent; MAJOR FOUL = 15 points to the opponent. YELLOW/RED CARDS and DQs exist but are out of scope | §6.6, Table 6-6 |
| Human player | Delivers Fuel through the Chute, the bottom opening of the Outpost, or by throwing over the Alliance Wall from the Outpost Area; can also score Fuel into their Hub (manual §6.1). Off-field storage limited to the Chute and Corral (G425, G427) | Manual §6.1, §7.4.5 |
| Reference robot limits (informational, not enforced) | Frame perimeter at most 110 in and height at most 30 in at start (R104); weight at most 115 lb without bumpers and 135 lb with bumpers (R103, R408); horizontal extension at most 12 in and in one direction at a time (R105, R106); height at most 30 in (R107); bumpers extend at most 4 in from the perimeter (R403) and occupy the 2.5–5.75 in bumper zone (R405) | §8.1, §8.4 |

**Implications the module must handle:** robot height versus Trench clearance (22.25 in), Bump terrain effects, the Hub's consume-and-re-emit behavior, alternating Hub activity with a random tiebreak, assessment grace periods, and a human-player feeder.

## 9. Robot and archetype editor

### 9.1 Requirements
- **Drag-and-drop 2D canvas** to define a robot: set chassis size and shape, height, bumpers, drivetrain type and stats; add mechanisms from a palette and drag or rotate them on the chassis.
- **Properties panel** for mechanism parameters, with sliders and units. Validation covers only what the sim needs to run (finite numbers, positive mass, mechanisms on the chassis).
- **No rules gating.** The editor never blocks, warns about, or alters a design because of size, extension, weight, or bumper rules. Funky designs are allowed on purpose. Optional informational reference values from the module (§8.7) may be shown but are never enforced.
- **Moving geometry preview:** scrub through a mechanism's states to see footprint changes (deploy, retract, extend).
- **Interaction preview:** show derived intake contact regions and shooter exit vector and range window overlaid on the robot.
- **Presets:** an archetype library per game (starter designs students can duplicate and tweak) plus a blank slate. REBUILT presets (for example over-the-bumper intake + fixed shooter, turreted shooter, climb-focused, defense/disruptor) are part of the reference module.
- **Saving:** designs are saved to the team workspace with version history (§14). JSON import and export remain for portability.
- **Clone designs** for A/B comparison; copy and paste mechanisms.
- **Custom mechanism types** are defined in the game module JSON (with visuals), not in editor code.
- **Out of scope for v1:** DXF import.

### 9.2 Visuals
Each mechanism type and game element supplies SVG or primitive visuals (colors, labels) in the module. Simple primitives are sufficient for v1; images are optional.

## 10. Human play and recording

- **Controllers:** Xbox-type controllers through the browser Gamepad API's standard mapping. Bindings use WPILib `XboxController` naming (left and right stick axes, triggers, A/B/X/Y, bumpers, back/start, stick buttons, POV) so they are familiar to students. Default scheme: left stick translate, right stick rotate, triggers and buttons for intake, shoot, and climb. Bindings are rebindable and **saved to the user's account**.
- **Not in v1:** joysticks and button boards. The binding layer is built so they can be added later. PlayStation-style pads usually expose the same standard mapping but are not a supported target.
- **Keyboard input** exists for development and debugging only and is not a supported driver input.
- **Real-time mode:** play full matches against agents or other human-driven robots on the same machine. The number of human players per machine is limited by connected controllers.
- **Recording:** every match records the seed, engine/module/robot versions, and per-tick `DriverInput` for all robots (compact encoding). A replay is the input log and re-simulates deterministically. Recordings are saved to the team workspace.
- **Replay:** scrub, speed control, camera follow, overlays (intake, shoot, and zone events). Export and import replay files.
- **Use of recordings:** recorded driver behavior is the data source for tuning agent policies (§11).

## 11. Agents (simulated drivers)

### 11.1 Approach (v1)
**Parameterized policies:** scripted behaviors with tunable knobs, built so new behaviors can be added later. Policies consume the same `observation` as humans and output `DriverInput`.

### 11.2 Behavior library (v1)
| Behavior | Description |
|---|---|
| Cycle | Acquire pieces → travel → orient → score, with aim and orientation handled using the robot's actual mechanism geometry |
| Offense | Choose scoring locations and targets by game state (for example which goal is active) |
| Defense | Block, shadow, or contest opponents; configurable aggressiveness |
| Endgame | Time-based decision to stop cycling and go for endgame objectives |
| Positioning/feeding | Use human-player and feed locations when relevant |

Policies are composed by a small **behavior selector** (priority list or utility scores) per robot role. Game modules supply role hints and named objectives (for example "go to Hub scoring pose," "go to Depot") but not agent code.

### 11.3 Knobs
Examples: scoring-priority weights, defense aggression, risk tolerance for crossing obstacles, reaction latency, aim error, endgame start time, preferred pickup zones. Knobs are part of a "driver profile" JSON saved to the team workspace and are sweepable.

### 11.4 Fitting to human behavior
Record human matches (§10) and fit driver-profile knobs so agents match observed statistics (for example time between pickups, scoring location distribution, defense ratio). v1 is statistic-matching on knobs, not learned behavior cloning. Learned policies are explicitly later work.

### 11.5 Known limitation
Agent quality caps the validity of conclusions: a poor agent can make all archetypes look alike. Agent comparisons must report agent settings with results and support "human vs agent" validation runs.

### 11.6 XploreSim-inspired option (later)
Per its description, XploreSim has each alliance search for a plan. The team agreed to study its repository if it is public. A plan-search layer over the behavior selector is a candidate later enhancement and is not required for v1.

## 12. Batch simulation and sweeps

- **Headless runner:** the same core, no rendering, in a Web Worker pool sized to the device's logical cores minus one. All compute is client-side.
- **Seeded runs:** each run takes `(gameModule, robots/alliances, driverProfiles, seed)`; seeds are enumerated for reproducibility.
- **Sweeps:** vary design parameters (for example shooter `ballsPerSecond`, intake width, mount pose or orientation, drivetrain speed) over grid or random/Latin hypercube designs, with N seeded matches per configuration.
- **Outputs:** per-match summaries, optional per-tick telemetry (off by default), event streams (JSONL), aggregate tables with confidence intervals, and response curves ("how does score change as balls/sec changes").
- **Saving:** each test is saved to the team workspace as a test run (configuration, versions, seeds, summary tables, and optional detailed logs within quota). The result is saved when the run completes; if the connection drops mid-run, the run continues and the result is saved when connectivity returns.
- **Progress and control:** pause and cancel; resume from saved configuration; throttling for low-power devices.
- **Analytic shortcut (later):** a closed-form cycle-time model derived from the same geometry for instant response surfaces, with sim validation of top candidates. Not required for v1.
- **Reproducibility:** result files include versions, seeds, and settings so runs can be re-created.

## 13. Analytics and statistics

Principle: **most stats are game-agnostic**, computed from the generic event stream; game modules add game-specific stats via `stats.json`.

### 13.1 Game-agnostic stats
- **Scoring:** total points; auto, teleop, and endgame split; points per second; scoring by source.
- **Cycle metrics:** cycle time (mean, median, distribution); pickup-to-score time decomposed into drive, align/rotate, intake, transfer, shoot; time to first score; cycles per match.
- **Time use:** time-in-state breakdown (scoring, collecting, traveling, defending, stuck or contested, endgame, idle); utilization %.
- **Game piece flow:** pieces acquired, scored, dropped, lost; acquisition success rate; scoring accuracy and efficiency.
- **Defense and interaction:** time defending, time defended, contact and pushing events, points-denied estimates, penalties incurred.
- **Reliability and robustness:** stuck events, penalties, failures (if modeled).
- **Rating and contribution:** an **EPA-style contribution estimate** from simulated matches (for example regression or marginal contribution of a robot across randomized alliance combinations), reported with uncertainty; win probability and ranking-point rates.
- **Design sensitivity:** partial effect of each swept parameter on score and cycle time; ranking of parameters by influence.
- **Alliance synergy:** pair and triple effects (for example two shooters competing for a feeding location).
- **Rule coverage:** which rules were implemented, approximated, or not implemented for the run (§8.6).

### 13.2 Game-specific stats (REBUILT examples)
- Fuel scored per second and per match; Fuel scored while the Hub is active versus wasted shots into an inactive Hub; Fuel stolen or denied; shift-by-shift scoring; AUTO Fuel (it decides the shift order); Tower level reached and climb time; Energized, Supercharged, and Traversal RP rates against the selected threshold profile; shots by field position; Bump and Trench crossing times.
- These are informed by 2026 scouting forms (for example Scoutradioz forms that track active-Hub scoring, stolen Fuel, inactive-Hub behavior, and shooting positions).

### 13.3 Presentation
Dashboards for archetype comparison tables, distributions (histograms or violin-style), response curves, per-match drill-down linked to replays, and CSV/JSON exports. All visualizations render client-side.

### 13.4 Calibration with real data
- Import real measurements per robot (for example cycle time, top speed, shooter rate, accuracy by distance, climb time) from a CSV or JSON template.
- Fit and adjust design parameters and agent knobs; display sim-versus-real error.
- Maintain a calibration record with provenance (test date, source) in the team workspace, supporting the success criterion that sim results match later real-world testing.

## 14. Accounts, teams, and cloud persistence

### 14.1 Principles
- **Sign-in is required to save anything.** Private stats and all other user data are saved to an account, not to the device.
- **Accounts are per team.** Data belongs to a team workspace. A non-team group (for example a Ri3D group) can create a workspace the same way.
- **No durable local project storage.** The device holds only the open session and the sign-in token. JSON files can be exported and imported, but they are not an alternate store.
- **Simulation stays client-side.** The backend never runs simulations.

### 14.2 Entities
| Entity | Description | Default visibility |
|---|---|---|
| User | Sign-in identity, display name, settings (controller bindings, units, UI preferences) | Self |
| Team workspace | Name, optional FRC team number (self-declared, unverified), type (`frc_team` or `group`) | Members |
| Membership | User ↔ team with a role (`admin` or `member`) | Members |
| Design | Robot JSON with version history | Team |
| Driver profile | Agent knobs, fitted from recordings | Team |
| Recording / replay | Seed, versions, input logs | Team |
| Test run | Configuration, seeds, summaries, optional logs, coverage report | Team |
| Calibration record | Real measurements with provenance | Team |
| Imported files | PathPlanner paths and autos stored for the team | Team |
| Published snapshot | Public copy of chosen parts of a test (§15) | Public |

### 14.3 Teams and roles
- Any signed-in user can create a team workspace and becomes its admin.
- A user can belong to more than one team (for example an FRC team and a Ri3D group).
- Members join by invite link or code approved by an admin.
- Admins can invite and remove members, rename the team, publish and unpublish, and delete the workspace. Members can create and edit team data.
- Team numbers are self-declared and shown as unverified. Verification against an external source (for example The Blue Alliance) is a possible later feature.

### 14.4 Visibility
- **Team (default):** visible and editable by team members only, enforced by row-level security in the backend.
- **Public (opt-in per test):** only through publishing, which creates a snapshot (§15). Editing or deleting the original does not silently change the public snapshot; unpublishing removes it.

### 14.5 Authentication
- No passwords stored by GoldSim. Sign-in is delegated to the backend's auth providers.
- Proposed providers: Google sign-in (works with Team 6220's Google Workspace accounts and any other Google account) plus email magic link as a fallback. GitHub sign-in is optional for developers.
- Every origin that serves the app (the GitHub Pages URL, the future team6220.org subdomain, and local development) must be on the auth redirect allowlist (§18).

### 14.6 Data minimization and privacy
Most users are high-school students, so the data collected is kept to the minimum needed:
- Collected: email (needed for sign-in), display name, team membership, settings, and user content.
- Not required: real names, dates of birth, ages, photos, or school information.
- No advertising or behavioral tracking. Analytics, if any, are privacy-respecting and aggregate.
- A privacy policy and terms of use are published before sign-ups are opened to other teams. Mentors or the school should review them; this PRD is not legal advice.
- Users can export and delete their data; admins can export and delete the team's data.
- "Anonymous" publishing hides the team publicly, but the backend still knows the owning account. The publish screen says so.

### 14.7 Quotas and abuse protection
- Per-team storage and test-run quotas, per-user write rate limits, size caps on uploads, and schema validation on every write. These keep a free-tier backend within its limits.
- The project owner can disable accounts and remove content directly in the backend console. There is no in-app moderation tooling (§15.3).

### 14.8 Backend
- **Recommended:** Supabase (Postgres with row-level security, Auth, Storage). Reasons: relational data suits teams and memberships, policies are expressed as SQL in the repo, the platform is open source and self-hostable, and data can be exported as SQL.
- The front end talks to a `data-layer` interface. Supabase is the first implementation, so another backend can be swapped in.
- Schema, migrations, and RLS policies live in the repo and are documented in `docs/SELF-HOSTING.md`.
- The default deployment is a hosted instance operated by Team 6220 for all teams. Forks can run their own.
- **Verify before committing:** current free-tier limits and behaviors (for example inactivity pausing, storage caps, monthly active user caps), who owns and administers the project, and what happens if usage outgrows the free tier.

### 14.9 Sync behavior
- Open documents (a design being edited, a running test) live in memory.
- Designs and settings save explicitly and on pause; test runs save on completion. The app warns before a tab closes with unsaved work.
- A small in-memory outbox retries failed saves while the tab is open; there is no durable local queue.
- Concurrent edits use version counters. On conflict, the user chooses to keep theirs, keep the other version, or save as a copy.
- If the backend is unreachable, a user can still run matches and batches, and export results to a file.

## 15. Public data (opt-in)

### 15.1 Requirements
- **Optional per test.** Nothing is published without an explicit "Publish this test" action on that test. Publishing requires a signed-in account (§14).
- **Shareable payload (selectable):** aggregate stats; robot design JSON; replays and match logs. Each part can be included or excluded.
- **Attribution optional:** publish under the team name and number (labeled unverified) or as anonymous.
- **Snapshots:** publishing creates an immutable public copy. Unpublishing deletes it.
- **Public site:** browse and search by game, archetype, tags, and stats; view and download data; no account needed to read. "Remix" copies a published design into the reader's team workspace (requires sign-in).
- **Export:** CSV and JSON downloads and a simple read API for analysis tools.

### 15.2 Storage
- Published payloads are stored as JSON with metadata (game and year, schema and engine versions, seed, settings, optional attribution, created timestamp).
- Large replays and logs go to object storage with size caps.
- Public reads are open; writes go through authenticated, validated, rate-limited paths only.

### 15.3 Moderation decision and protections
**Decision (owner):** open posting with no moderation and no moderation tooling. Accounts make rate limits and quotas stronger than they were in v0.1, and the owner can remove content or disable accounts from the backend console. There is no content review.

Accepted risks: junk or abusive data appearing publicly, and the free tier being exhausted. Revisit if abuse occurs.

### 15.4 Safety constraints
- Public data never contains executable code. Game modules come from the repo only.
- Robot, replay, and path JSON is validated against schemas before load; imported and downloaded files are treated as untrusted data.
- Published data carries a license notice at publish time. The license is an open question (proposal: CC BY 4.0).

## 16. PathPlanner integration

### 16.1 Approach: path geometry, not trajectories
PathPlanner's trajectory generation produces time-parameterized trajectories from waypoints and constraints. GoldSim does not. The format and generation code are MIT-licensed and could be reused, but a simpler approach fits the sim better: the robot is driven along the path geometry by a simple follower, using the *simulated robot's own* speed and acceleration limits. This means:
- Path timing reflects the design being tested, not the planner's idealized timing. That is the point of archetype comparison.
- Event markers fire by **path progress**, not by clock time.
- Collisions and blocking naturally slow or stop the robot, because the follower outputs a normal `DriverInput`.

### 16.2 Import
- Load **PathPlanner `.path` and `.auto`** files (JSON) through a file picker or drag and drop. Imported files are stored in the team workspace so teammates can use them.
- **`.path`:** sample the Bezier waypoint chain into a polyline at fixed arc-length spacing. Read rotation targets (heading targets along the path), constraint values (used only as speed caps), event markers (progress positions with commands), and the goal end state (speed used as the final target speed).
- **`.auto`:** support starting pose and reset-odometry behavior and these command types: `wait`, `named`, `path`, `sequential`, `parallel`, `race`, `deadline`. Unsupported command types are reported to the user, not silently ignored.
- The exact field names and format version come from the team's real files; the importer is tested against files from the team's repositories.
- Choreo `.traj` import is optional and treated as path geometry only by default.

### 16.3 Follower
- A simple holonomic follower steers toward a lookahead point on the sampled path.
- Speed is capped by the minimum of the robot's `maxSpeed`, the path's constraint cap, a curvature-based limit, and the robot's acceleration limit.
- Heading follows the path's rotation targets, limited by the robot's `maxAngularSpeed`.
- If the robot is blocked or pushed, the follower keeps trying; a configurable timeout abandons the path and moves to the next command.
- The follower is an input source, so it uses the same `DriverInput` interface as humans and agents (§7.7).

### 16.4 Named commands
A **limited, customizable set** of named commands, defined in the game module and extendable by the user, maps PathPlanner names to sim actions. Example:

```json
{
  "namedCommands": {
    "Shoot":      { "action": "shoot",   "mechanism": "shooter1", "durationSeconds": 3.0 },
    "IntakeOn":   { "action": "intake",  "mechanism": "intake1",  "state": "on" },
    "IntakeOff":  { "action": "intake",  "mechanism": "intake1",  "state": "off" },
    "ClimbL1":    { "action": "climb",   "level": 1 }
  }
}
```
Event markers trigger these actions at the right progress point. An editor UI lists detected names and prompts to map any that are unmapped. Mappings are saved to the team workspace.

### 16.5 Licensing note
If any PathPlanner source code is copied rather than reimplemented, the MIT copyright and license notice must be kept with it.

## 17. Performance and compatibility

| Metric | Target (to be validated in Phase 0) |
|---|---|
| Browsers | Current Chrome, Edge, Firefox, and Safari on laptops; Chromebook supported |
| Human play | Stable 60 FPS, 6 robots, hundreds of pieces on a mid-range Chromebook-class device |
| Batch throughput | Report matches per minute per core; set the minimum bar from the Phase 0 spike (proposal: at least 10× real time per worker on a Chromebook-class device) |
| Bundle | Initial load under about 5 MB gzipped; engine WASM loaded once |
| Network | Sign-in and saving need connectivity. A running match or batch does not stop if the connection drops; results are saved when it returns |
| Memory | Bounded telemetry; per-tick logs off by default |

If the physics engine cannot meet the bar with full rigid-body contact, the options are: reduce solver iterations, limit sleeping or idle bodies, cap piece counts through abstraction, or reconsider the engine. Any relaxation is a recorded decision.

## 18. Hosting, deployment, and repo transfer

### 18.1 Hosting plan
1. **Now:** deploy the static build to GitHub Pages from `HossHarman/GoldSim` through GitHub Actions. Project pages are served under `/GoldSim/`, so the build's base path must be configurable and client-side routing must work under both a sub-path and a root (hash routing or a 404 fallback).
2. **Later:** serve from a subdomain of team6220.org. Wix controls the DNS for the domain, and adding a subdomain record there is expected to work. Add a CNAME for the chosen subdomain pointing at the GitHub Pages host, set the custom domain in the repository's Pages settings, and enforce HTTPS. Verify the domain with GitHub to prevent subdomain takeover.
3. **Backend:** the hosted Supabase project (or equivalent) is separate from the static host (§14.8).
4. **Google Workspace** is not required for hosting. It is useful as a sign-in route for Team 6220 accounts (§14.5).
5. **Environments:** `main` deploys to production Pages; PR previews for testing. Local development has its own auth redirect entry.
6. **Versioning:** semantic versions; game modules and robot, replay, and path schemas carry their own versions with migration notes.

### 18.2 Repo transfer checklist (personal repo → Team 6220 organization)
- Move the repository to the organization; update local git remotes.
- The GitHub Pages URL changes with the owner. Update the custom-domain setting, the CNAME target, and every auth redirect allowlist entry.
- Re-create or move Actions secrets and environment settings.
- Update the `LICENSE` copyright line (personal owner → team or contributors).
- Update README links and badges.
- Confirm branch protections, collaborators, and CODEOWNERS in the organization.

## 19. Kickoff-day runbook (target: first hour)
1. Create `game-<year>` from the template; upload the manual and field drawings to Claude.
2. Claude generates the module files per `AUTHORING.md`; run `validate-game` and the conformance tests.
3. Load the preset archetypes (or adjust a few); play a match with a controller.
4. Correct rule errors found in play; promote from L0 to L3 and review the rule coverage report.
5. Over the next 48 hours: create archetype variants in the editor, record human matches, tune agents, run sweeps, and rank archetypes with confidence intervals. Everything saves to the team workspace.
6. Optionally publish selected results.

## 20. Quality, testing, and release criteria

- **Unit tests:** physics invariants, mechanism state machines, seeded determinism (same seed ⇒ same event stream).
- **Golden tests:** REBUILT conformance scenarios from the manual (scoring, shifts, thresholds, Hub emission, tower levels, height-gated Trench).
- **Schema tests:** valid and invalid fixtures for robots, modules, replays, paths, and stats.
- **PathPlanner tests:** sampled path geometry matches PathPlanner's own Bezier output within a small tolerance (timing is not compared); event markers fire at the right progress.
- **Backend tests:** row-level security tests proving that team data is invisible to non-members and that public snapshots are read-only.
- **Performance tests:** CI benchmarks for headless throughput; manual Chromebook checks per release.
- **Acceptance (v1):**
  - A student can generate a game module from the REBUILT manual and play to L3 with Claude's help.
  - Two robot designs differing only in shooter orientation show different cycle-time distributions that make physical sense.
  - A robot taller than the Trench clearance cannot pass through it, and a shorter one can.
  - A 500-match sweep over `ballsPerSecond` completes on a laptop and yields a response curve with confidence intervals, saved to the team workspace.
  - A PathPlanner `.auto` from the team's repo runs with mapped named commands.
  - A new team can create a workspace, invite a member, and both see the same saved designs and results from different laptops.
  - Publishing a test is opt-in, works end to end, and a published design can be remixed by another signed-in team.

## 21. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Full rigid-body physics too slow for batches on low-end devices | Fails the performance bar | Phase 0 spike; solver tuning; piece abstraction; documented fallback decision |
| Cross-machine nondeterminism | Replays differ across devices | Same-machine determinism required only; store versions with replays; stretch goal for exactness |
| LLM-generated game modules contain subtle rule errors | Wrong conclusions | Conformance tests from the manual; `SOURCES.md` citations; student spot-checks; validator; rule coverage report |
| Agents too weak to differentiate archetypes | Misleading rankings | Human validation runs; report agent settings; calibrate to recorded drivers |
| 2D approximations misrepresent shooters, intakes, or climbing | Fidelity gap | Explicit scope in docs; calibration with real measurements; parametric ballistics only |
| Rules coverage is incomplete by design | Results omit some rule effects | Published coverage report with every result; users assumed to be testing in good faith |
| Backend is now a core dependency (sign-in and saving) | Outage or free-tier limit blocks saving | Data-layer interface; file export fallback; quotas; verify free-tier terms before launch; documented self-hosting |
| Accounts for minors | Privacy and compliance exposure | Data minimization; no real-name collection; privacy policy and terms reviewed by mentors; export and delete |
| Open posting with no moderation | Junk or abuse; quota exhaustion | Account-based rate limits, size caps, schema validation, owner removal; revisit later |
| Team numbers are self-declared | Impersonation in public attribution | "Unverified" label; optional later verification |
| Auth redirect and domain changes (Pages URL, subdomain, org transfer) | Sign-in breaks after a move | Transfer checklist (§18.2); keep allowlists current |
| One-student bus factor | Project stalls | Strong docs, schemas, tests; Claude-assisted workflow documented |
| "Full rules in an hour" is ambitious | Late or incomplete rules at kickoff | Degradation ladder (L0 to L3); rehearse with REBUILT and a prior game |
| Name may change later | Rename churn | Name kept in one config constant; no conflict check required for now |

## 22. Open questions and resolved decisions

### 22.1 Resolved
| # | Topic | Resolution |
|---|---|---|
| 1 | REBUILT facts | Verified against Game Manual TU22 (§8.7). Tower L1 is 15 in AUTO and 10 in TELEOP. Re-verify when Team Updates change thresholds |
| 3 | DNS | Wix controls the DNS; a subdomain record is expected to work (§18) |
| 4 | XploreSim | Study its repository if it is public (§11.6) |
| 5 | Trajectory generation | MIT license allows reuse, but a simpler path-geometry follower is preferred (§16) |
| 6 | Mechanical limits | Not enforced; funky designs allowed (§8.6, §9) |
| 7 | Controllers | Xbox-type controllers only for v1, WPILib-style bindings (§10) |
| 9 | Real-time multiplayer | Later decision on transport and lockstep versus rollback; core must not preclude it |
| 10 | Name | GoldSim is fine for now; no conflict check; may change later |

### 22.2 Still open
1. **Physics engine** (team is not sure): Rapier2D versus Planck.js, decided by the Phase 0 spike on determinism and Chromebook performance (§6.1).
2. **Calibration tolerance** (team is not sure): ±15% stays provisional until the first real calibration (§2.3).
3. **Account model:** this draft assumes individual sign-ins inside a team workspace. If the intent is one shared login per team, the data model and roles in §14 change.
4. **Guest mode:** may signed-out visitors run matches and batches without saving? Recommendation: yes, with nothing persisted, to lower the barrier for other teams to try it.
5. **Sign-in providers:** confirm Google plus email magic link (§14.5).
6. **Backend choice and ownership:** confirm Supabase, who administers it, and the verified free-tier limits (§14.8).
7. **Subdomain name** under team6220.org.
8. **Public data license** shown at publish time (proposal: CC BY 4.0) (§15.4).
9. **Team number verification** (for example against The Blue Alliance) as a later feature (§14.3).
10. **Privacy policy and terms** review by mentors or the school before other teams can sign up (§14.6).
11. **License copyright holder** after the repo transfer (§18.2).

## Appendix A — Stats taxonomy (summary table)

| Category | Stats | Scope |
|---|---|---|
| Scoring | points total, auto, teleop, endgame; points per second | Agnostic |
| Cycles | cycle time distribution, cycles per match, time to first score, cycle decomposition | Agnostic |
| Time use | state time breakdown, utilization, idle and stuck | Agnostic |
| Pieces | acquired, scored, dropped; success rate; accuracy | Agnostic |
| Interaction | defense time, defended time, contact events, penalties | Agnostic |
| Rating | EPA-style contribution, win probability, RP rates | Agnostic |
| Sensitivity | parameter effects, ranking of parameter influence | Agnostic |
| Synergy | alliance pair and triple effects | Agnostic |
| Rule coverage | implemented, approximated, not implemented | Agnostic |
| Game-specific | for REBUILT: active versus wasted shots, shift scoring, climb level and time, RP threshold rates, Bump and Trench crossings | Module |

## Appendix B — Prior art and sources referenced
- 2026 FIRST Robotics Competition Game Manual, REBUILT presented by Haas, version TU22 (supplied by the team); source for §8.7.
- FIRST game-and-season page: 2027 kickoff date (January 9, 2027) and game name (BIOCORE).
- HighTide TideSim: inspiration, as publicly described; internal tool; no code or data used.
- XploreSim (Chief Delphi, Oct 2026): browser match sim and strategy planner; also inspired by a project referred to as frc2026sim.
- StrategyEngine-2026 (Team 1690, GitHub): REBUILT-specific open-source strategy simulation.
- Statbotics: open-source EPA analytics; reference for contribution estimation concepts.
- Scoutradioz and team scouting forms (for example the Team 102 2026 form): reference for 2026-relevant stats.
- PathPlanner: MIT-licensed; file formats and semantics reference.
- xRC Simulator and First Robotics Simulator: 3D game-like simulators; referenced for scope comparison only.

## Appendix C — Items from the earlier chat that must not be taken as fact
The earlier Kimi conversation made several claims that were not verified here and should not be relied on without checking: the existence and exact features of certain WPILib simulation classes (for example an "IntakeSim"), details attributed to maple-sim and fieldcore, and Fx2D's maturity and API. The PRD's architecture does not depend on any of them.
