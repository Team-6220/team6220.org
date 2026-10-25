# 0001 — Physics engine: Rapier2D (deterministic build)

**Status:** Accepted, pending the Chromebook check below
**PRD:** §6.1, §6.4, §17, §22.2 #1

## Decision
Use **`@dimforge/rapier2d-deterministic-compat`** (Rapier2D WASM, enhanced-determinism build, WASM inlined so no extra loader setup). Planck.js is rejected.

## Evidence
Spike: [`packages/core/spike/run.ts`](../../packages/core/spike/run.ts) (`npm run spike`). Scene: REBUILT-sized walls, 6 robots (60 kg, 0.86 m square), N balls (0.075 m radius, 0.22 kg), zero gravity, robots driven by seeded random velocity targets through acceleration-capped impulses. A 160 s match, best of several runs, headless, one thread.

Machine: AMD Ryzen AI 9 HX 370 laptop, Node 22.

| Engine | Pieces | Hz | Same-seed deterministic | Steps/s | × real time |
|---|---|---|---|---|---|
| Rapier2D | 500 | 120 | yes | 2,488 | **20.7** |
| Planck.js | 500 | 120 | yes | 807 | 6.7 |
| Rapier2D | 500 | 60 | yes | 1,653 | 27.5 |
| Planck.js | 500 | 60 | yes | 262 | 4.4 |
| Rapier2D | 200 | 120 | yes | 6,183 | 51.5 |
| Planck.js | 200 | 120 | yes | 1,413 | 11.8 |

- Rapier is about 3× faster than Planck at REBUILT piece counts. Planck misses the 10× bar even on a fast laptop.
- Both are deterministic for the same seed on the same machine. Rapier's deterministic build also targets cross-platform bit-exactness, which helps the stretch goal in §6.4.
- Bundle: Rapier's inlined WASM module is about 1.3 MB gzipped, within the 5 MB budget (§17).

## Consequences
- Physics default stays 120 Hz (§6.3). The rate is configurable; 60 Hz is the first lever if low-end devices fall short.
- Piece count is the main cost. Resting pieces sleep; stored pieces are removed from the physics world (counted, §7.5).
- The engine is accessed only inside `packages/core/src/physics/`, so a swap stays contained.

## Still to do (needs a person)
- **Chromebook check:** run `npm run spike` (or the in-browser benchmark once the web app exists) on a Chromebook-class device. Chromebook CPUs are often 3–5× slower than this laptop, which would put Rapier at roughly 4–7× real time per worker at 500 pieces and 120 Hz, below the proposed 10× bar. If so, record which relaxation is used (60 Hz batch stepping, fewer solver iterations, or a lower bar) as a new decision.
