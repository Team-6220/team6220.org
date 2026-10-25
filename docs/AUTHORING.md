# Authoring a game module

How to turn a new season's game manual into a GoldSim game module. Written for students and for Claude; the two work together (PRD §8.4).

**Stay Gold:** the module is the only thing written at kickoff. The core (`packages/core`) is not edited. If the game needs something the schema can't express, write a small reviewed hook (§7 below) and open an issue so the core can grow between seasons.

**Goal:** a drivable field with full rules in about an hour (level L3 below), then archetype comparisons within 48 hours.

---

## 1. Kickoff steps

```
npm run new-game -- 2027 biocore            # copies templates/game-module to packages/game-biocore
```

1. Give Claude: the game manual (and field drawings), this file, [`docs/SCHEMAS.md`](SCHEMAS.md), and the REBUILT module (`packages/game-rebuilt/`) as a worked example. Use the prompt in §9.
2. Claude fills in the JSON files and `SOURCES.md`, citing manual sections.
3. Validate: `npm run validate-game -- packages/game-biocore`. Fix until it prints `✓ Valid`.
4. Claude writes conformance tests from the manual's examples (§8). Run `npm test`.
5. Add the module to the app (alias in `tsconfig.base.json`, `vitest.config.ts`, `packages/web/vite.config.ts`), play one match with a controller, compare against the manual.
6. Send failures back to Claude with the failing test or a description of what happened in play. Repeat.

## 2. Degradation ladder

If the hour runs out, ship the highest level reached. Each level is useful on its own.

| Level  | What works                                                 | Files that must be right                                                   |
| ------ | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| **L0** | Field, pieces, collisions; robots drive and pick up pieces | `field.json` (walls, zones, piece sources, start positions), `pieces.json` |
| **L1** | Basic scoring and the match timeline                       | + `game.json` timeline, `scoring.json` main rules, goal `sink` elements    |
| **L2** | Phase/shift logic, thresholds, ranking points              | + `elementActive`, `groupsHook`, `thresholdProfiles`, bonus RPs            |
| **L3** | Endgame and detectable fouls                               | + `climbStructure`, climb scoring, `rules.json` detectors and coverage     |

## 3. Read the manual in this order

1. **Game overview / match summary** — what scores, match phases, alliance size.
2. **Arena / field chapter** — field size, zones, every field element with dimensions. Field drawings if available.
3. **Game pieces** — size, count, staging, preload limits.
4. **Match play / timeline** — phase durations, phase-dependent element states (e.g. goals turning on and off), what happens between phases.
5. **Scoring** — the points table, assessment timing, ranking points and their thresholds (often a separate table per event type).
6. **Fouls and violations** — foul point values; then each rule in the game rules chapter (G-rules).
7. **Human player** — how pieces enter the field during the match.
8. **Robot rules** (R-rules) — only for reference values (size, weight, height). They are **never enforced** (PRD §8.6).

## 4. Conventions

- **Units are SI:** meters, seconds, kilograms, radians. Convert inches with × 0.0254.
- **Coordinates:** origin at the blue Alliance Wall's near corner; +x along the field toward red, +y across; headings counter-clockwise from +x.
- **Author from the blue side.** Give an element `"mirror": true` and the red copy is generated using the field's `mirror` rule (`"rotational"` for 180° symmetric fields, `"reflective"` for mirror-image fields). Mirrored ids become `<id>.blue` and `<id>.red`; rules and phases refer to the base id.
- **Ids** are camelCase and describe the element (`hub`, `trenchLeft`, `allianceZone`). Rule ids in `rules.json` are the manual's rule numbers (`G403`).
- **Objective names the built-in agents look for** (objectives are in `field.json`, mirrored):

  | Objective id                      | Used for                                                                                                     |
  | --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
  | `towerClimb`                      | Pose in front of the climb structure, facing it. Agents climb from here (they offset sideways for partners). |
  | `outpost`                         | Pose in front of a human-player feeder, facing it. Feeder-role agents wait here.                             |
  | `hubShot`, `depot`, `neutralFuel` | Informational (scoring pose, pickup spots). Agents compute their own shooting pose from the goal's target.   |

  Use the same names for the equivalent places in a new game so agents work without changes. Agents also look for: a `zone` tagged `"alliance"` (where they may shoot from), a `pieceSource` with base id `depot` (pickup preference), and `sink` elements with `scoresFor` (their goal).

- **Cite everything** in `SOURCES.md`. List every estimated value under "Approximations to verify".

## 5. File by file

Field names below are the real schema fields. Full tables: [`docs/SCHEMAS.md`](SCHEMAS.md).

### game.json — metadata and timeline

- `id` (`<name>-<year>`), `name`, `year`, `version` (module semver), `manualVersion` (e.g. `TU22`), `robotsPerAlliance`.
- `timeline.phases[]`: one entry per manual phase, in order. Each has `id`, `label`, `duration` (s), `period` (`"auto"` or `"teleop"` — which scoring period it counts toward), `robotsEnabled` (false for scoring-only gaps), optional `elementActive` and `assessClimbAtEnd`.
  - `elementActive` maps a goal's base id to `"both"`, `"none"`, `"groupA"` or `"groupB"`. Goals not listed are active.
  - `groupA`/`groupB` are decided at runtime by the hook named in `groupsHook` (e.g. REBUILT: the alliance that scored less Fuel in AUTO is `groupA`).
  - `assessClimbAtEnd: true` on the phases after which climbs are scored (REBUILT: AUTO and END_GAME).
- `timeline.postMatchAssessment`: seconds after the last phase during which in-flight pieces still score.
- `activationGrace`: seconds a goal keeps scoring after it deactivates (assessment delay).
- `thresholdProfiles`: named sets of bonus-RP thresholds, e.g. `{ "regional": { "energized": 100 } }`; `defaultProfile` names one.

### field.json — the field

- `length`, `width`, `mirror`, `centerLineX`.
- `startPositions[]`: blue start poses, one per driver station (red is mirrored).
- `objectives[]`: named poses (see §4).
- `elements[]`, each with `id`, `kind`, `shape`, optional `label`, `alliance`, `mirror`. Shapes are `rect` (center `x`, `y`, `length` along x, `width` along y, optional `theta`), `circle`, or convex `polygon`.

| `kind`           | Use for                                             | Extra fields                                                                                                                                                   |
| ---------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wall`           | Guardrails, structure that blocks robots and pieces | —                                                                                                                                                              |
| `zone`           | Named areas used by rules and agents                | `tags` (use `"alliance"` for alliance zones)                                                                                                                   |
| `terrain`        | Ramps, bumps: slow robots                           | `speedFactor`, `accelFactor` (0–1), `blocksPieces`                                                                                                             |
| `gate`           | Passages with a height limit                        | `clearance` (m) — taller robots are blocked                                                                                                                    |
| `sink`           | Goals                                               | `solid`, `target.shape` (the opening a shot must pass through), `scoresFor`, optional `emit` (`delay`, `exits[]`, `spread`) to send pieces back onto the field |
| `feeder`         | Human-player stations                               | `exit` pose, `speed`, `stock`, `capacity`, `rate`, `accuracy`, `mode` (`onDemand` needs a robot in `triggerZone`), `enabledInAuto`, optional `absorbZone`      |
| `climbStructure` | Endgame structures                                  | `solid`, `engageZone` (robot bumpers must overlap it), `levels[]`                                                                                              |
| `pieceSource`    | Initial piece staging                               | `piece`, `count` (number or `"remainder"`), `layout` (`grid`/`random`), `gapAlongX`                                                                            |

Use `count: "remainder"` for the one staging area whose count depends on preloads (total minus everything else); `validate-game` prints the number.

### pieces.json

- `types[]`: `id`, `label`, `shape: "circle"`, `radius`, `mass`, `restitution`, `friction`, `linearDamping` (rolling resistance).
- `totalCount`: pieces staged per match. `preload`: `{ piece, max }` per robot.

### scoring.json — declarative rules

Each rule: `id`, `label`, `on` (event type), optional `when` (conditions, all must hold), `effects[]`, optional `limitPerAlliance`, `source` (manual section).

- **Events** the core emits: `piece_scored` (fields: `target`, `targetBase`, `active`, `alliance`, `robot`, `period`, `phase`), `climb_assessed` (`level`, `period`), `foul`, `piece_acquired`, `shot_launched`, `phase_start`, `phase_end`.
- **Conditions:** `{ "field": "targetBase", "op": "eq", "value": "hub" }`; ops `eq`, `neq`, `in`, `gte`, `lte`.
- **Effects:** `points`, `counter` (+ `by`), `to` (`"event"` alliance or `"opponent"`), `category` (`auto`, `teleop`, `endgame`, `foul`; default is the event's period).
- `fouls`: severity → points awarded to the opponent (applied automatically to `foul` events).
- `rankingPoints`: `win`, `tie`, and `bonus[]` (`counter` compared against `thresholdKey` in the selected profile). Every bonus counter must be incremented by some rule.

Example (REBUILT): a Tower Level 1 in AUTO is 15 points, max two robots:

```json
{
  "id": "tower-auto-l1",
  "label": "Tower Level 1 in AUTO",
  "on": "climb_assessed",
  "when": [
    { "field": "period", "op": "eq", "value": "auto" },
    { "field": "level", "op": "gte", "value": 1 }
  ],
  "effects": [{ "points": 15, "counter": "towerPoints", "by": 15 }],
  "limitPerAlliance": 2
}
```

### rules.json — coverage and foul detectors

One entry per in-match rule: `id` (rule number), `topic`, `status`, `reason`, optional `penalty` (key in `fouls`) and `detector`.

- **Statuses:** `implemented` (the sim checks it as written), `approximated` (checked, with a stated simplification), `not_implemented` (not checked; always give a reason). Referee-judgment rules (intent, damage, collusion) are `not_implemented`. Robot-construction rules are not listed here at all.
- **Detectors** (objective checks the core runs):
  - `crossLine` — `lineX` (blue-relative), `periods`, `completely`.
  - `launchOutsideZone` — `zone` and `target` base ids: launching at your own goal while bumpers aren't at least partly in the zone.
  - `pieceOutOfField` — a launched piece lands outside the field.
- Every result shows this coverage report, so analysts know which rules the numbers reflect.

### mechanisms.json, named-commands.json, stats.json

- `mechanisms.json` `types[]`: year-specific mechanism types built on a core type (`base`: `intake`, `storage`, `transfer`, `shooter`, `placer`, `climber`, `blocker`) with `defaults`.
- `named-commands.json`: PathPlanner named command → sim action (`action`, optional `mechanism`, `state`, `durationSeconds`, `level`).
- `stats.json` `stats[]`: game-specific statistics counted from events (`event`, `when`, optional `sumField`, `per`).

## 6. Robot presets

Add 3–5 archetype designs in `presets/` (robot schema, see [`docs/SCHEMAS.md`](SCHEMAS.md)) and export them from `src/index.ts`. Copy from `packages/game-rebuilt/presets/` and adjust. Designs are never checked against robot rules.

## 7. Hooks (only when JSON can't express it)

`src/hooks.ts` holds small, reviewed TypeScript functions. Today the core supports one hook type: **`groupsHook`**, which decides which alliance is `groupA` for phases using `groupA`/`groupB`. It receives the alliances' counters and the match's seeded RNG (use it for random tiebreaks so matches stay reproducible). Register it in `src/index.ts` under `hooks.groups["<id>"]` and name it in `game.json` `groupsHook`.

Hooks are code: they ship only from the repo, are code-reviewed, and are never loaded from user or public data.

## 8. Conformance tests

Turn every worked example in the manual into a test in `tests/`. `packages/game-rebuilt/tests/` shows each kind:

| What                                                         | Example in REBUILT                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Module validates                                             | `module.test.ts` → "match their schemas and pass cross-file checks"  |
| Totals from the manual (piece staging, match length)         | `module.test.ts` → "stage 504 Fuel…", "2:40 match"                   |
| Scoring table rows (feed synthetic events to `applyScoring`) | `module.test.ts` → "Tower: L1 15 in AUTO…"                           |
| Ranking points per threshold profile                         | `module.test.ts` → "bonus RP thresholds follow the selected profile" |
| Phase/goal activity and tiebreaks (run a real match)         | `match.test.ts` → "AUTO Fuel scores… Hub is inactive in SHIFT 1"     |
| Height gates                                                 | `match.test.ts` → "Trench height gate"                               |
| Endgame climbs                                               | `match.test.ts` → "a Level 3 climb in END GAME scores 30"            |
| Foul detectors                                               | `match.test.ts` → "G403", "G407"                                     |
| Determinism and replay                                       | `match.test.ts` → "determinism (PRD §6.4)"                           |

`tests/helpers.ts` there has a scripted driver (`script`, `goTo`, `near`) for driving a robot through a scenario.

## 9. Prompt for Claude

Copy this, attach the manual, and replace the bracketed parts.

```
You are writing a GoldSim game module for the [YEAR] FRC game [NAME] from the attached game manual
(version [VERSION]). The module skeleton is in packages/game-[name]/ (created by npm run new-game).

Read docs/AUTHORING.md and docs/SCHEMAS.md first, then study packages/game-rebuilt/ as the worked
example (its JSON files, src/hooks.ts, presets/, tests/ and SOURCES.md).

Rules:
- Only edit files in packages/game-[name]/. Never edit packages/core.
- SI units. Author the field from the blue side and use "mirror": true for alliance elements.
- Replace every TODO. Cite a manual section for every value in SOURCES.md; list every estimate
  under "Approximations to verify against field drawings".
- Do not encode robot-construction rules. In rules.json, give every in-match rule a status and a
  reason; use detectors only for objective checks.
- Use the standard objective ids (towerClimb, outpost, hubShot, ...) for equivalent places.
- If something can't be expressed in the schema, use a groupsHook if it fits; otherwise
  approximate, mark it "approximated", and tell me.

Work in this order and stop after each level to run
  npm run validate-game -- packages/game-[name]
and fix every error:
  L0 field, pieces, start positions -> L1 timeline and main scoring -> L2 phase logic, thresholds,
  RPs -> L3 endgame and fouls.
Then write conformance tests in packages/game-[name]/tests/ from every scoring example in the
manual, run npm test, and add 3-5 archetype presets. Report what is approximated or missing.
```

## 10. Checklist

- [ ] `npm run new-game -- <year> <name>` done; no `TODO` left (`grep -rn TODO packages/game-<name>`).
- [ ] `manualVersion` set; `SOURCES.md` cites every value and lists approximations.
- [ ] Field size, zones, every field element, start positions, objectives.
- [ ] Piece types, total count, staging, preload limit; `validate-game` remainder matches the manual.
- [ ] Every phase with the right duration, `period`, `robotsEnabled`; total matches the manual.
- [ ] Goal activity per phase; `groupsHook` if activity depends on results.
- [ ] Every row of the scoring table is a rule; assessment delays set.
- [ ] Ranking points and every threshold profile.
- [ ] Endgame structure and climb scoring.
- [ ] `rules.json`: every in-match rule with status and reason; detectors where objective.
- [ ] 3–5 presets.
- [ ] Conformance tests pass; one match played with a controller and spot-checked against the manual.
