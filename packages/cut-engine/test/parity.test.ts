// The port must give exactly the same answers as Inventory's original planner (apps/inventory/ui/JsGeometry.html).
// The old file is loaded as it is (its <script> tag removed) and both are run on the same inputs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { leftovers, placementPoly, planSheets, rect, type Polygon, type SheetPart, type Stock } from "../src/index";

const html = readFileSync(fileURLToPath(new URL("../../../apps/inventory/ui/JsGeometry.html", import.meta.url)), "utf8");
// Our own file, not untrusted HTML: just take what is between its one <script> and </script>.
const source = html.slice(html.indexOf("<script>") + "<script>".length, html.lastIndexOf("</script>"));
const context: { module: { exports: unknown } } = { module: { exports: {} } };
vm.createContext(context);
vm.runInContext(source, context);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Old = context.module.exports as any;

/** A small random number generator with a seed, so every run tests the same cases. */
function random(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

const L: Polygon = [[0, 0], [30, 0], [30, 10], [12, 10], [12, 24], [0, 24]]; // an L-shaped offcut
const angled: Polygon = [[0, 0], [20, 0], [26, 14], [0, 14]]; // a piece with one slanted edge

function cases() {
  const rand = random(6220);
  const out: { stocks: Stock[]; parts: SheetPart[] }[] = [];
  for (let n = 0; n < 10; n++) {
    const stocks: Stock[] = [
      { id: "sheet", copy: 0, points: rect(0, 0, 48, 24) },
      { id: "sheet", copy: 1, points: rect(0, 0, 48, 24), taken: n % 3 === 0 ? [rect(0, 0, 10, 10)] : [] },
      { id: "L", copy: 0, points: L },
      { id: "angled", copy: 0, points: angled },
      { id: "strip", copy: 0, points: rect(0, 0, 40, 4) },
    ];
    const parts: SheetPart[] = Array.from({ length: 2 + Math.floor(rand() * 6) }, (_, i) => ({
      key: String(i),
      name: `Part ${i}`,
      w: Math.round((2 + rand() * 20) * 8) / 8,
      h: Math.round((1 + rand() * 9) * 8) / 8,
    }));
    out.push({ stocks, parts });
  }
  return out;
}

describe("the port matches Inventory's planner", () => {
  it("places the same parts in the same spots", () => {
    for (const { stocks, parts } of cases()) {
      const mine = planSheets(stocks, parts);
      const theirs = Old.plan(JSON.parse(JSON.stringify(stocks)), JSON.parse(JSON.stringify(parts)));
      const summary = (p: { placed: { part: SheetPart; stock: Stock; placement: unknown }[]; unplaced: SheetPart[] }) => ({
        placed: p.placed.map((x) => [x.part.key, x.stock.id, x.stock.copy, x.placement]),
        unplaced: p.unplaced.map((x) => x.key),
      });
      expect(summary(mine)).toEqual(summary(theirs));
    }
  }, 60_000); // both planners together take a few seconds

  it("works out the same leftovers", () => {
    for (const { stocks, parts } of cases().slice(0, 5)) {
      const plan = planSheets(stocks, parts);
      for (const stock of stocks) {
        const cuts = plan.placed.filter((p) => p.stock === stock).map((p) => placementPoly(p.placement));
        if (!cuts.length) continue;
        expect(leftovers(stock.points, cuts)).toEqual(Old.leftovers(stock.points, cuts));
      }
    }
  }, 60_000);
});
