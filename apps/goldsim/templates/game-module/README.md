# Game module template

A blank, schema-valid game module. Create a new season's module from it with:

```
npm run new-game -- <year> <name>      # e.g. npm run new-game -- 2027 biocore
```

That copies this folder to `packages/game-<name>/`, fills in the id, name and year, and adds a `package.json`.

## Then, at kickoff

Follow [docs/AUTHORING.md](../../docs/AUTHORING.md). In short:

1. Give Claude the game manual (and field drawings) plus `docs/AUTHORING.md` and the REBUILT reference module (`packages/game-rebuilt/`) as an example.
2. Replace every `TODO` in the JSON files. Search: `grep -rn TODO packages/game-<name>`.
3. Run `npm run validate-game -- packages/game-<name>` until it passes.
4. Turn the manual's scoring examples into tests in `tests/` and run `npm test`.
5. Play a match, compare against the manual, fix, repeat. Climb the degradation ladder L0 → L3.

## What is here

| File | Purpose |
|---|---|
| `game.json` | Name, manual version, match timeline (phases), threshold profiles |
| `field.json` | Field size, elements (walls, zones, goals, ...), start positions, objectives |
| `pieces.json` | Game piece types, total count, preload limit |
| `scoring.json` | Event-driven scoring rules, fouls, ranking points |
| `rules.json` | Coverage status of every in-match rule, with objective foul detectors |
| `mechanisms.json` | Year-specific mechanism types built on core types |
| `named-commands.json` | PathPlanner named command → sim action |
| `stats.json` | Game-specific statistics |
| `src/hooks.ts` | Reviewed code hooks for logic JSON can't express (optional) |
| `src/index.ts` | Assembles the module for the app and tests |
| `presets/` | Archetype robot designs for this game |
| `tests/` | Conformance tests from the manual |
| `SOURCES.md` | Manual citation for every value, plus approximations to verify |

The template is deliberately minimal (guardrails, one zone, one goal, one piece source). Use `packages/game-rebuilt/field.json` as the example for terrain, height gates, feeders, climb structures and re-emitting goals.

The core is never edited at kickoff. If something can't be expressed with the schema or a small hook, note it in `SOURCES.md` and raise it as an issue so the core can grow between seasons (Stay Gold).
