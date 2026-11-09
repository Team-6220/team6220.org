# Sources — REBUILT (2026)

Built from the **2026 FIRST Robotics Competition Game Manual, REBUILT presented by Haas, version TU22** (supplied by the team). Section numbers refer to that manual. Fuel weight comes from AndyMark's listing. See also PRD §8.7.

Bonus-RP thresholds for District Championship and FIRST Championship events may change through Team Updates. When they do, update `game.json`, this file, and `manualVersion`.

## Values from the manual

| File                                               | Value                                                                                                                                                | Manual ref           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| game.json                                          | 3 robots per alliance on the field                                                                                                                   | §6, §5.9             |
| game.json                                          | AUTO 20 s; TRANSITION SHIFT 10 s; SHIFT 1–4 25 s each; END GAME 30 s (2:40 with robots enabled)                                                      | §6.4, Table 6-2      |
| game.json                                          | 3 s scoring delay between AUTO and TELEOP (`AUTO_GAP`)                                                                                               | §6.4, §6.5           |
| game.json                                          | Both Hubs active in AUTO, TRANSITION SHIFT, END GAME; one Hub active per shift, alternating                                                          | §6.4.1, Table 6-3    |
| game.json `groupsHook` / src/hooks.ts              | Alliance with more AUTO Fuel has its Hub inactive in SHIFT 1; tie → random                                                                           | §6.4.1, Table 6-3    |
| game.json `activationGrace`, `postMatchAssessment` | Fuel assessed up to 3 s after AUTO/TELEOP end and 3 s after a Hub deactivates                                                                        | §6.5, §6.5.1         |
| game.json `thresholdProfiles`                      | ENERGIZED / SUPERCHARGED / TRAVERSAL: Regional/District 100 / 360 / 50; District Championship 240 / 360 / 50; FIRST Championship 360 / 500 / 50      | Table 6-4, Table 6-5 |
| field.json                                         | Carpet 317.7 in × 651.2 in (8.07 m × 16.54 m); guardrails                                                                                            | §5.2                 |
| field.json `allianceZone`                          | 158.6 in deep × 317.7 in                                                                                                                             | §5.3                 |
| field.json `neutralZone`                           | 283 in deep × 317.7 in; Center Line bisects it (x = 8.27 m)                                                                                          | §5.3                 |
| field.json `outpostArea`                           | 71 in × 134 in                                                                                                                                       | §5.3                 |
| field.json `hub`                                   | 47 in × 47 in; hexagonal opening 41.7 in across (modeled as a 0.53 m radius circle); Fuel re-emitted into the Neutral Zone through one of four exits | §5.4                 |
| field.json `bump*`                                 | 73.0 in wide × 44.4 in deep × 6.513 in tall, 15° ramps                                                                                               | §5.5                 |
| field.json `trench*`                               | 65.65 in wide × 47.0 in deep; opening underneath 50.34 in wide × 22.25 in tall (`clearance` 0.565 m)                                                 | §5.6                 |
| field.json `depot`                                 | 42.0 in × 27.0 in along the Alliance Wall                                                                                                            | §5.7                 |
| field.json `tower`                                 | 49.25 in wide × 45.0 in deep; in the Alliance Wall between Driver Stations 2 and 3; rungs at 27 / 45 / 63 in                                         | §5.8                 |
| field.json `outpost`                               | Chute holds about 25 Fuel; opening 31.8 in wide                                                                                                      | §5.9.2               |
| pieces.json                                        | Fuel: 5.91 in (15.0 cm) foam ball (`radius` 0.0751 m)                                                                                                | §5.10                |
| pieces.json                                        | 504 Fuel per match; up to 8 preloaded per robot                                                                                                      | §6.3.4               |
| field.json / pieces.json                           | 24 Fuel in each Depot and each Outpost Chute; remainder (360–408) in the Neutral Zone block, about 206 in × 72 in with a 2 in divider removed        | §6.3.4, §6.3.4.1     |
| scoring.json `fuel-active`                         | 1 point per Fuel in an active Hub; 0 in an inactive Hub                                                                                              | §6.5.1, Table 6-4    |
| scoring.json `tower-*`                             | LEVEL 1: 15 in AUTO (max 2 robots), 10 in TELEOP; LEVEL 2: 20; LEVEL 3: 30 (TELEOP only); one level per robot per period                             | §6.5.2, Table 6-4    |
| game.json `assessClimbAtEnd`                       | AUTO Tower assessed when the AUTO timer reaches 0:00; TELEOP Tower 3 s after TELEOP ends                                                             | §6.5, §6.5.2         |
| scoring.json `rankingPoints`                       | Win 3, tie 1; bonus RPs as above                                                                                                                     | Table 6-4            |
| scoring.json `fouls`                               | MINOR 5, MAJOR 15 points to the opponent                                                                                                             | §6.6, Table 6-6      |
| rules.json                                         | G403, G405, G407, G408, G414–G420, G427 summaries and penalties                                                                                      | §7 (rule text)       |
| rules.json `G403` lineX                            | Center Line at x = 8.27 m                                                                                                                            | §5.3                 |

## Approximations to verify against field drawings

These values were estimated, not read from the manual. Check each one against the official field drawings.

**Positions along the field (x)**

- **Hub center x = 4.625 m** (182.1 in). Placed so its near face sits on the Alliance Zone line (158.6 in). The manual says the Hub is 158.6 in from the Alliance Wall; which face that refers to was not confirmed.
- Bumps and Trenches share the Hub's center line (x = 4.625 m).
- The 25.5 in strip between the Alliance Zone (158.6 in) and the Neutral Zone (starts at 184.1 in) is not a named zone in the module.

**Layout across the field (y)**

- The Hub line across y is modeled as Trench | Bump | Hub | Bump | Trench. The listed widths add up to 324.3 in, 6.6 in more than the 317.7 in field. The Trenches were shortened to 62.4 in to fit.
- Trench opening (50.34 in) is centered in each Trench span, with solid posts on both sides: 0.152 m (inner, next to the Bump) and 0.153 m (outer, at the guardrail). Posts are modeled full-depth (1.194 m).
- Bump centers at y = 2.511 m and 5.559 m (blue side).

**Alliance Wall elements**

- **Tower** center y = 4.6 m on the blue wall (rotationally mirrored for red). Engagement zone: 0.7 m deep × 1.3 m wide directly in front of the Tower.
- **Depot** center y = 6.8 m on the blue wall; its 1 in steel barriers are not colliders.
- **Outpost** at the blue wall corner (chute exit at y = 0.6 m); the Outpost Area is placed in that corner (x 0–1.803 m, y 0–3.404 m).
- Driver Station positions are not modeled.

**Behavior**

- **AUTO_GAP:** the 3 s delay between AUTO and TELEOP is modeled as a robots-disabled, scoring-only phase counted as AUTO. Whether robots are disabled during it was not confirmed.
- **Hub re-emission:** 1.5 s delay; four exits on the Neutral Zone face at x = 5.36 m, y = 3.65 / 3.90 / 4.17 / 4.42 m, 1.8 m/s, ±0.35 rad spread. Exit geometry and timing are guesses.
- **Outpost feeder:** delivers 3 Fuel/s while a robot of the same alliance is in the Outpost Area, stock 24, capacity 40, ±0.25 rad accuracy, 2.0 m/s. **Disabled in AUTO** (not confirmed). Fuel that lands outside the field returns to the shooter's alliance feeder. Human players scoring directly into the Hub is not modeled.
- **G407** counts one MAJOR FOUL per continuous launch sequence (shots less than 0.5 s apart), not per Fuel.
- **G405** counts one MINOR FOUL per Fuel that lands outside the field; escalation for repeats is not modeled.
- **Bump terrain:** 0.55 × top speed and 0.6 × acceleration while the robot's center is on a Bump. Fuel rolls over Bumps freely.
- **Fuel physics:** mass 0.215 kg (midpoint of AndyMark's 0.448–0.5 lb), restitution 0.4, friction 0.5, linear damping 1.2 1/s (rolling resistance on carpet). All guesses; calibrate against video.
- **Hub opening** is modeled as a circle of radius 0.53 m around the Hub center (the real opening is hexagonal, 41.7 in across).
- **Start positions:** x = 3.4 m, y = 1.2 / 4.035 / 6.9 m (blue), facing +x. The Robot Starting Line position was not confirmed.

## Shot model estimates (calibrate against real robots)

The sim launches pieces as projectiles (`packages/core/src/ballistics.ts`). The Hub opening height (1.829 m, the 72 in front edge) comes from manual §5.4; everything below is an estimate to calibrate with real shooter measurements (PRD §13.4):

- **Launch height** (`launchHeight`, default 0.5 m; presets 0.5–0.55 m): where balls leave the robot.
- **Speed consistency** (`speedError`, default 0.025 = 2.5%; presets 0.02–0.03): shot-to-shot speed variation. Landing distance is very sensitive to speed, so 4% would score only about 71% from 3 m; 2.5% scores about 91%.
- **Aim spread** (`spread`, default 0.04 rad, about 2 degrees).
- **Piece mass, damping, and restitution** are guesses (see above).
- The `hubShot` objective (2.8 m from the Hub center) was moved out from 2.2 m because top-entry shots from under about 1.7 m can't fall into the opening and accuracy falls off quickly below about 2.5 m.
