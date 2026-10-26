import { describe, expect, it } from "vitest";
import { getRotation, rotateView, screenToField } from "./render/view-rotation.js";

/** How the renderer maps a field vector to the screen for a view turned `turns` quarter turns counter-clockwise. */
function fieldToScreen(x: number, y: number, turns: number): { right: number; up: number } {
  switch (turns) {
    case 1:
      return { right: -y, up: x };
    case 2:
      return { right: -x, up: -y };
    case 3:
      return { right: y, up: -x };
    default:
      return { right: x, up: y };
  }
}

describe("field view rotation", () => {
  it("screenToField is the inverse of the renderer's field-to-screen mapping for every rotation", () => {
    for (let turns = 0; turns < 4; turns++) {
      for (const [right, up] of [
        [1, 0],
        [0, 1],
        [0.6, -0.3],
      ] as const) {
        const f = screenToField(right, up, turns);
        const s = fieldToScreen(f.vx, f.vy, turns);
        expect(s.right).toBeCloseTo(right);
        expect(s.up).toBeCloseTo(up);
      }
    }
  });

  it("stick up is field +y with no rotation and field +x after a quarter turn", () => {
    expect(screenToField(0, 1, 0)).toEqual({ vx: 0, vy: 1 });
    expect(screenToField(0, 1, 1)).toEqual({ vx: 1, vy: -0 });
  });

  it("rotateView cycles through 0, 90, 180, 270 degrees", () => {
    const start = getRotation();
    const seen = new Set<number>();
    for (let i = 0; i < 4; i++) seen.add(rotateView(1));
    expect(seen.size).toBe(4);
    expect(getRotation()).toBe(start);
    rotateView(-1);
    rotateView(1);
    expect(getRotation()).toBe(start);
  });
});
