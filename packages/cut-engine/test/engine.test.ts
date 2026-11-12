import { describe, expect, it } from "vitest";
import { area, formatInches, leftovers, planLinear, planSheets, rect, stockSize } from "../src/index";

describe("cut rules", () => {
  it("adds the team's extra stock and rounds up to 1/8 inch", () => {
    expect(stockSize(10, 4, "handmade", 0.25)).toEqual({ w: 10.25, h: 4.25 });
    expect(stockSize(4, 10.1, "shapeoko", 0.125)).toEqual({ w: 11.125, h: 5 }); // thin stock: 1" extra
    expect(stockSize(10, 4, "shapeoko", 0.25)).toEqual({ w: 10.75, h: 4.75 }); // thick stock: 3/4" extra
  });

  it("writes inches the way the shop does", () => {
    expect(formatInches(12.5)).toBe('12 1/2"');
    expect(formatInches(0.375)).toBe('3/8"');
    expect(formatInches(7)).toBe('7"');
  });
});

describe("sheets", () => {
  it("keeps cuts together on one piece and leaves the big sheet whole when a small one is enough", () => {
    const plan = planSheets(
      [
        { id: "big", copy: 0, points: rect(0, 0, 48, 24) },
        { id: "offcut", copy: 0, points: rect(0, 0, 12, 12) },
      ],
      [
        { key: "a", name: "A", w: 5, h: 5 },
        { key: "b", name: "B", w: 5, h: 5 },
      ],
    );
    expect(plan.placed.map((p) => p.stock.id)).toEqual(["offcut", "offcut"]);
    expect(plan.unplaced).toEqual([]);
  });

  it("reports parts that fit nowhere", () => {
    const plan = planSheets([{ id: "s", copy: 0, points: rect(0, 0, 10, 10) }], [{ key: "x", name: "Too big", w: 12, h: 2 }]);
    expect(plan.unplaced.map((p) => p.name)).toEqual(["Too big"]);
  });

  it("leaves one usable leftover after cutting a corner, and drops slivers", () => {
    const left = leftovers(rect(0, 0, 24, 12), [rect(0, 0, 12, 12)]);
    expect(left).toHaveLength(1);
    expect(area(left[0])).toBeCloseTo(144, 0);
    expect(leftovers(rect(0, 0, 12, 12.5), [rect(0, 0, 12, 12)])).toEqual([]); // a 1/2" strip is a sliver
  });
});

describe("tube and shaft (1D)", () => {
  it("fits cuts into stock lengths, allowing for the saw blade", () => {
    const plan = planLinear(
      [{ id: "tube", length: 48, quantity: 2 }],
      [
        { key: "1", name: "Upright", length: 30 },
        { key: "2", name: "Upright", length: 30 },
        { key: "3", name: "Cross", length: 17.75 },
      ],
      { kerf: 0.125 },
    );
    expect(plan.bars).toHaveLength(2);
    expect(plan.bars[0].cuts.map((c) => [c.part.name, c.at])).toEqual([["Upright", 0], ["Cross", 30.125]]);
    // 48 - 30 - 1/8 - 17.75 - 1/8 = 0
    expect(plan.bars[0].leftover).toBe(0);
    expect(plan.bars[1].leftover).toBe(17.875);
    expect(plan).toMatchObject({ used: 96, parts: 77.75, unplaced: [] });
  });

  it("uses short offcuts before starting a full length", () => {
    const plan = planLinear(
      [
        { id: "full", length: 72, quantity: 1 },
        { id: "offcut", length: 14, quantity: 1 },
      ],
      [{ key: "1", name: "Spacer", length: 12 }],
    );
    expect(plan.bars.map((b) => b.stock.id)).toEqual(["offcut"]);
  });

  it("reports cuts longer than any stock", () => {
    const plan = planLinear([{ id: "t", length: 24, quantity: 3 }], [{ key: "1", name: "Too long", length: 30 }]);
    expect(plan.unplaced.map((p) => p.name)).toEqual(["Too long"]);
    expect(plan.bars).toEqual([]);
  });
});
