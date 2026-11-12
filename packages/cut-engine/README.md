# @team6220/cut-engine

Works out where to cut parts from stock. Used by Production's **Cut planner** and **Cut optimizer**
(`apps/production`). Plain functions: no screens, no database, no Wix, so it is easy to test and to reuse.

| File | What it does |
| --- | --- |
| `geometry.ts` | Points and outlines: area, bounding box, rotate, "does this rectangle fit inside this outline", "do these overlap" |
| `sheets.ts` | 2D planning: places rectangles on stock pieces of any outline (rectangles or traced shapes) |
| `leftovers.ts` | What is left of a piece after cutting, as clean outlines; slivers are dropped |
| `linear.ts` | 1D planning for tube, shaft and extrusion: fits lengths into stock lengths, allowing for the saw blade |
| `rules.ts` | The team's extra-stock rules (how much bigger than the part to cut the stock) |

All sizes are **inches**. Coordinates are x to the right, y down (like the screen).

## Where it came from

`geometry.ts`, `sheets.ts` and `leftovers.ts` are a TypeScript port of the planner in Inventory
(`apps/inventory/ui/JsGeometry.html`, written for the Apps Script version). `test/parity.test.ts` runs the old code
and this port on the same inputs and checks they give the same answer, so the port can be trusted, and any later
improvement shows up there as a deliberate change.

How the 2D planner chooses, in short: biggest parts first; each part goes on a piece this plan already uses if it
fits (so cuts stay together), otherwise on the smallest piece it fits on, so big sheets stay whole for big parts. On a
piece it tries square to the piece and square to each of its edges, scanning from one corner so the leftover stays in
one usable block.

`linear.ts` is new: first-fit decreasing (longest parts first, each into the first stock length with room), which is
simple and within a few percent of the best possible for the handful of cuts a robot needs.

## Run the tests

```sh
pnpm --filter @team6220/cut-engine test
```
