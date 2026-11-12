# Contributing to GoldSim

Thanks for helping. GoldSim is maintained by FRC Team 6220 students with Claude's help, and it has to keep working for seasons to come — so the bar is "will the next person understand this at kickoff?"

## Stay Gold rules

1. **Year-specific code goes in a game module, never in `packages/core`.** If a game needs something the core can't express, propose a game-agnostic core feature (with a schema change, docs and tests) between seasons.
2. **Data over code.** Prefer extending a JSON schema over adding a hook. Hooks are small, reviewed, and live in the repo only.
3. **Determinism.** All randomness goes through the match's seeded RNG. Same seed + same inputs = same match. Never use `Math.random()` or wall-clock time in simulation code.
4. **No robot-rule enforcement.** Designs are never blocked for size, weight, extension or bumper rules (PRD §8.6).
5. **Docs follow code.** Schema changes → run `npm run export-schemas` and update `docs/AUTHORING.md` if authors are affected. Behavior changes → bump `ENGINE_VERSION` in `packages/core/src/version.ts` (replays record it).

## Workflow

```
npm ci
npm run check            # lint + typecheck + tests; must pass before a PR
npm run validate-game    # if you touched a game module
```

- Branch from `main`; open a PR. CI runs lint, typecheck and tests.
- Add tests with every change. Game rules need conformance tests from the manual (see `docs/AUTHORING.md` §8).
- Add a line to `CHANGELOG.md` under "Unreleased".
- Record significant decisions in `docs/decisions/NNNN-title.md`.

## Code style

- TypeScript strict mode, SI units, headings counter-clockwise from +x.
- Prettier formatting (`npm run format`), ESLint clean.
- Comments explain _why_ and point to PRD or manual sections where relevant. Keep them short.
- UI follows the WingIt design language: tokens in `packages/web/src/styles/tokens.css`, gold `#ffa300`, zero rounded corners, Karnivore for titles (write "6220" as "6220", never "622o").

## Adding a new season

See [`docs/AUTHORING.md`](docs/AUTHORING.md). Short version: `npm run new-game -- <year> <name>`, fill in the TODOs with Claude, validate, test, play.
