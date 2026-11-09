import { describe, expect, it } from "vitest";
import { Rng } from "@goldsim/core";
import { analyzeContributions, binnedResponse, effectHeadline, matrixRank, outcomeById, parameterEffect } from "../src/index.js";

describe("contribution safety check", () => {
  it("fixed alliances (the same designs every match) are unidentifiable, not absurd numbers", () => {
    const rng = new Rng(1);
    const obs = Array.from({ length: 60 }, (_, i) => ({
      designs: i % 2 ? ["A", "B", "C"] : ["D", "E", "F"],
      score: 100 + 20 * rng.normal(),
    }));
    const a = analyzeContributions(obs);
    expect(a.status).toBe("unidentifiable");
    expect(a.rows).toEqual([]);
    expect(a.message).toMatch(/not enough variety/i);
    expect(a.distinctLineups).toBe(2);
  });

  it("designs that always play together are unidentifiable even with several lineups", () => {
    const obs = Array.from({ length: 40 }, (_, i) => ({ designs: i % 2 ? ["A", "B", "X"] : ["A", "B", "Y"], score: 50 + i }));
    expect(analyzeContributions(obs).status).toBe("unidentifiable");
  });

  it("varied alliances give estimates with sane errors", () => {
    const truth: Record<string, number> = { A: 40, B: 30, C: 10 };
    const names = Object.keys(truth);
    const rng = new Rng(2);
    const obs = Array.from({ length: 200 }, () => {
      const designs = [0, 1, 2].map(() => names[rng.int(3)]!);
      return { designs, score: designs.reduce((s, d) => s + truth[d]!, 0) + 6 * rng.normal() };
    });
    const a = analyzeContributions(obs);
    expect(a.status).toBe("ok");
    expect(a.rows.every((r) => r.reliable)).toBe(true);
    expect(Math.abs(a.rows.find((r) => r.design === "A")!.contribution - 40)).toBeLessThan(4);
  });

  it("too few matches is reported as insufficient", () => {
    expect(analyzeContributions([{ designs: ["A", "B"], score: 1 }]).status).toBe("insufficient");
  });

  it("matrixRank", () => {
    expect(matrixRank([[1, 0], [0, 1]])).toBe(2);
    expect(matrixRank([[1, 2], [2, 4], [3, 6]])).toBe(1);
  });
});

describe("parameter effect", () => {
  const rng = new Rng(4);
  const mk = (slope: number, n = 80) =>
    Array.from({ length: n }, () => {
      const x = rng.range(4, 29);
      return { params: { speed: x }, outcome: 230 + slope * x + 30 * rng.normal() };
    });

  it("pure noise: no clear effect, and the headline says so", () => {
    const e = parameterEffect(mk(0), "speed")!;
    expect(e.clear).toBe(false);
    expect(e.lo).toBeLessThan(0);
    expect(e.hi).toBeGreaterThan(0);
    const text = effectHeadline(e, { paramLabel: "Exit speed", unit: "m/s", outcome: outcomeById("robotPoints"), subject: "Blue 1" });
    expect(text).toMatch(/^Raising Exit speed from 4\.\d* to 2\d(\.\d+)? m\/s changed Blue 1's points by/);
    expect(text).toContain("no clear effect");
  });

  it("a real slope is flagged as clear with the right sign", () => {
    const e = parameterEffect(mk(3), "speed")!;
    expect(e.clear).toBe(true);
    expect(e.change).toBeGreaterThan(40);
    expect(effectHeadline(e, { paramLabel: "Fire rate", outcome: outcomeById("scored", "Fuel") })).toContain("a clear increase");
  });

  it("needs variation and enough samples", () => {
    expect(parameterEffect([{ params: { x: 1 }, outcome: 1 }, { params: { x: 1 }, outcome: 2 }, { params: { x: 1 }, outcome: 3 }], "x")).toBeNull();
    expect(parameterEffect([{ params: { x: 1 }, outcome: 1 }], "x")).toBeNull();
  });

  it("binnedResponse groups continuous values and skips NaN outcomes", () => {
    const samples = [...mk(1, 120), { params: { speed: 10 }, outcome: NaN }];
    const pts = binnedResponse(samples, "speed", 6);
    expect(pts.length).toBeLessThanOrEqual(6);
    expect(pts.reduce((s, p) => s + p.n, 0)).toBe(120);
    const few = binnedResponse([{ params: { x: 1 }, outcome: 1 }, { params: { x: 2 }, outcome: 3 }], "x");
    expect(few.map((p) => p.value)).toEqual([1, 2]);
  });
});
