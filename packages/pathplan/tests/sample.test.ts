import { describe, expect, it } from "vitest";
import { pointAtPosition, rotationAt, samplePath, speedCapAt } from "../src/index.js";
import { loadPath } from "./helpers.js";

const bez = (p: number[][], t: number) => {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return { x: w.reduce((s, wi, i) => s + wi * p[i]![0]!, 0), y: w.reduce((s, wi, i) => s + wi * p[i]![1]!, 0) };
};

describe("Bezier sampling", () => {
  it("a straight path has the right length and fixed spacing", () => {
    const s = samplePath(loadPath("Straight"), 0.02);
    expect(s.length).toBeCloseTo(4, 6);
    expect(s.points[1]!.s - s.points[0]!.s).toBeCloseTo(0.02, 9);
    expect(s.points.at(-1)!.x).toBeCloseTo(4, 6);
    expect(s.waypointS).toEqual([0, s.length]);
  });

  it("points match the analytic cubic Bezier at waypoint-relative positions", () => {
    const p = loadPath("Curve");
    const seg0 = [[1, 1], [2.5, 1], [3, 2], [3, 3]];
    const seg1 = [[3, 3], [3, 4], [4, 4.5], [5, 4.5]];
    for (const t of [0, 0.1, 0.33, 0.5, 0.8, 1]) {
      const a = pointAtPosition(p, t);
      const e = bez(seg0, t);
      expect(a.x).toBeCloseTo(e.x, 9);
      expect(a.y).toBeCloseTo(e.y, 9);
      const b = pointAtPosition(p, 1 + t);
      const f = bez(seg1, t);
      expect(b.x).toBeCloseTo(f.x, 9);
      expect(b.y).toBeCloseTo(f.y, 9);
    }
  });

  it("every resampled point lies on the curve (within 1 mm) and the length matches a fine numeric integral", () => {
    const p = loadPath("Curve");
    const s = samplePath(p, 0.02);
    const fine: { x: number; y: number }[] = [];
    for (let i = 0; i <= 20000; i++) fine.push(pointAtPosition(p, (i / 20000) * 2));
    let len = 0;
    for (let i = 1; i < fine.length; i++) len += Math.hypot(fine[i]!.x - fine[i - 1]!.x, fine[i]!.y - fine[i - 1]!.y);
    expect(s.length).toBeCloseTo(len, 3);
    for (const q of s.points.filter((_, i) => i % 7 === 0)) {
      const d = Math.min(...fine.map((f) => Math.hypot(f.x - q.x, f.y - q.y)));
      expect(d).toBeLessThan(1e-3);
    }
  });

  it("maps markers, rotation targets, and constraint zones to arc length", () => {
    const s = samplePath(loadPath("Straight"));
    expect(s.markers[0]!.s).toBeCloseTo(2, 6); // symmetric controls: t = 0.5 is the midpoint
    expect(rotationAt(s, 0)!).toBeCloseTo(0, 6);
    expect(rotationAt(s, 2)!).toBeCloseTo(Math.PI / 2, 6);
    expect(rotationAt(s, 1)!).toBeCloseTo(Math.PI / 4, 6);
    expect(Math.abs(rotationAt(s, 4)!)).toBeCloseTo(Math.PI, 6);
    expect(speedCapAt(s, 0.2)).toBe(3);
    expect(speedCapAt(s, 2)).toBe(1);
  });

  it("curvature is near zero on straights and positive on curves", () => {
    const straight = samplePath(loadPath("Straight"));
    expect(Math.max(...straight.points.map((p) => p.curvature))).toBeLessThan(1e-6);
    const curve = samplePath(loadPath("Curve"));
    expect(Math.max(...curve.points.map((p) => p.curvature))).toBeGreaterThan(0.3);
  });
});
