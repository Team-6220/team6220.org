import { describe, expect, it } from "vitest";
import { Rng, type MatchEvent, type MatchResult } from "@goldsim/core";
import {
  aggregateByDesign,
  allianceObservations,
  bootstrapCI,
  calibrationReport,
  comparisonTable,
  contributions,
  coverageCounts,
  cycleMetrics,
  histogram,
  mean,
  meanCI,
  median,
  ols,
  parseCSV,
  parseMeasurements,
  proportionCI,
  quantile,
  responseCurve,
  rpRatesTable,
  sensitivity,
  std,
  summarizeMatch,
  toCSV,
  winProbability,
  CALIBRATION_CSV_TEMPLATE,
} from "../src/index.js";

describe("descriptive stats", () => {
  it("mean, std, median, quantiles", () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(xs)).toBe(5);
    expect(std(xs)).toBeCloseTo(2.138, 3);
    expect(median(xs)).toBe(4.5);
    expect(quantile(xs, 0)).toBe(2);
    expect(quantile(xs, 1)).toBe(9);
  });

  it("95% t-interval covers the true mean about 95% of the time", () => {
    const rng = new Rng(5);
    let covered = 0;
    for (let k = 0; k < 400; k++) {
      const xs = Array.from({ length: 10 }, () => 50 + 10 * rng.normal());
      const ci = meanCI(xs);
      if (ci.lo <= 50 && 50 <= ci.hi) covered++;
    }
    expect(covered / 400).toBeGreaterThan(0.9);
    expect(covered / 400).toBeLessThan(0.99);
  });

  it("bootstrap CI is deterministic for a seed and brackets the mean", () => {
    const xs = [3, 5, 8, 9, 10, 12, 15];
    const a = bootstrapCI(xs, mean, 500, 7);
    expect(bootstrapCI(xs, mean, 500, 7)).toEqual(a);
    expect(a.lo).toBeLessThan(a.mean);
    expect(a.hi).toBeGreaterThan(a.mean);
  });

  it("Wilson proportion interval", () => {
    const p = proportionCI(8, 10);
    expect(p.mean).toBe(0.8);
    expect(p.lo).toBeGreaterThan(0.4);
    expect(p.hi).toBeLessThan(1);
  });

  it("histogram counts every value and aligns integer data", () => {
    const xs = [1, 2, 2, 3, 3, 3, 10];
    const h = histogram(xs);
    expect(h.counts.reduce((s, c) => s + c, 0)).toBe(xs.length);
    expect(h.edges[0]).toBe(0.5);
  });
});

describe("regression", () => {
  it("OLS recovers known coefficients", () => {
    const rng = new Rng(1);
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 200; i++) {
      const a = rng.next() * 10;
      const b = rng.next() * 5;
      X.push([1, a, b]);
      y.push(3 + 2 * a - 1.5 * b + 0.1 * rng.normal());
    }
    const fit = ols(X, y);
    expect(fit.coefficients[0]).toBeCloseTo(3, 1);
    expect(fit.coefficients[1]).toBeCloseTo(2, 2);
    expect(fit.coefficients[2]).toBeCloseTo(-1.5, 2);
    expect(fit.r2).toBeGreaterThan(0.99);
    expect(fit.standardErrors[1]).toBeLessThan(0.01);
  });

  it("EPA-style contributions recover per-design points from random alliances", () => {
    const truth: Record<string, number> = { shooter: 40, turret: 30, climber: 15, defense: 5 };
    const names = Object.keys(truth);
    const rng = new Rng(2);
    const obs = Array.from({ length: 300 }, () => {
      const designs = [0, 1, 2].map(() => names[rng.int(names.length)]!);
      return { designs, score: designs.reduce((s, d) => s + truth[d]!, 0) + 5 * rng.normal() };
    });
    const c = contributions(obs);
    expect(c[0]!.design).toBe("shooter");
    for (const row of c) {
      expect(Math.abs(row.contribution - truth[row.design]!)).toBeLessThan(3 * row.standardError + 0.5);
      expect(row.standardError).toBeGreaterThan(0);
    }
  });
});

describe("sweeps", () => {
  const rng = new Rng(3);
  const samples = Array.from({ length: 120 }, (_, i) => {
    const bps = [4, 6, 8][i % 3]!;
    const width = 0.4 + (i % 5) * 0.05;
    return { params: { bps, width, noise: rng.next() }, outcome: 10 * bps + 2 * width + 3 * rng.normal() };
  });

  it("response curve: mean and CI per swept value", () => {
    const curve = responseCurve(samples, "bps");
    expect(curve.map((p) => p.value)).toEqual([4, 6, 8]);
    expect(curve[2]!.mean).toBeGreaterThan(curve[0]!.mean);
    expect(curve.every((p) => p.lo <= p.mean && p.mean <= p.hi && p.n === 40)).toBe(true);
  });

  it("sensitivity ranks the influential parameter first", () => {
    const s = sensitivity(samples);
    expect(s[0]!.param).toBe("bps");
    expect(s[0]!.slope).toBeCloseTo(10, 0);
    expect(s[0]!.varianceExplained).toBeGreaterThan(0.8);
  });
});

function fakeResult(seed: number, blue: number, red: number, names = ["A", "B", "C", "D", "E", "F"]): MatchResult {
  const bd = (total: number) => ({ total, auto: 10, teleop: total - 30, endgame: 20, foul: 0 });
  return {
    seed,
    profile: "regional",
    module: { id: "test", version: "0" },
    engineVersion: "0",
    score: { blue: bd(blue), red: bd(red) },
    rp: {
      blue: { total: blue > red ? 3 : 0, outcome: blue > red ? "win" : blue === red ? "tie" : "loss", bonus: { ENERGIZED: blue > 100 } },
      red: { total: red > blue ? 3 : 0, outcome: red > blue ? "win" : blue === red ? "tie" : "loss", bonus: { ENERGIZED: red > 100 } },
    },
    winner: blue > red ? "blue" : red > blue ? "red" : "tie",
    counters: { blue: { fuelActive: blue }, red: { fuelActive: red } },
    fouls: { blue: {}, red: {} },
    robots: names.map((name, index) => ({
      index,
      alliance: index < 3 ? "blue" : "red",
      name,
      points: (index < 3 ? blue : red) / 3,
      acquired: 20,
      shots: 18,
      scoredActive: 15,
      scoredInactive: 1,
      fouls: 0,
      climbLevel: index % 3,
    })),
    gameStats: { perRobot: { shots: [18, 18, 18, 18, 18, 18] }, perAlliance: { shots: { blue: 54, red: 54 } } },
    coverage: [
      { id: "G1", topic: "a", status: "implemented" },
      { id: "G2", topic: "b", status: "approximated", reason: "x" },
    ],
  };
}

describe("match summaries and aggregation", () => {
  const ev = (type: string, t: number, extra: Record<string, unknown> = {}) =>
    ({ type, t, tick: Math.round(t * 120), phase: "X", period: "teleop", robot: 0, alliance: "blue", ...extra }) as unknown as MatchEvent;

  it("cycle metrics: bursts, cycle times, pickup-to-score, first score", () => {
    const events = [
      ev("shot_launched", 2),
      ev("shot_launched", 2.2),
      ev("piece_scored", 2.8, { active: true }),
      ev("piece_acquired", 6),
      ev("piece_acquired", 7),
      ev("shot_launched", 10),
      ev("shot_launched", 10.4),
      ev("piece_acquired", 14),
      ev("shot_launched", 20),
      ev("piece_acquired", 1, { robot: 3 }),
    ];
    const c = cycleMetrics(events, 0);
    expect(c.cycles).toBe(3);
    expect(c.cycleTimes).toEqual([8, 10]);
    expect(c.pickupToScore).toEqual([4, 6]);
    expect(c.timeToFirstScore).toBe(2.8);
  });

  it("aggregates per design with CIs and exports CSV", () => {
    const results = [fakeResult(1, 120, 80), fakeResult(2, 90, 95), fakeResult(3, 130, 60)];
    const summaries = results.map((r) => summarizeMatch(r));
    const stats = aggregateByDesign(summaries);
    expect(stats.length).toBe(6);
    const a = stats.find((s) => s.key === "A")!;
    expect(a.matches).toBe(3);
    expect(a.winRate.mean).toBeCloseTo(2 / 3);
    const csv = toCSV(comparisonTable(stats));
    expect(csv.split("\n")[0]).toContain("Points contributed (pts)");
    expect(parseCSV(csv).length).toBe(6);

    const rp = rpRatesTable(summaries);
    const blue = rp.rows.find((r) => r.lineup === "A + B + C")!;
    expect(blue.n).toBe(3);
    expect(blue.bonus_ENERGIZED).toBeCloseTo(2 / 3);

    expect(winProbability(results, "blue").probability).toBeCloseTo(2 / 3);
    expect(coverageCounts(results[0]!)).toEqual({ implemented: 1, approximated: 1, not_implemented: 0 });
    expect(allianceObservations(results).length).toBe(6);
  });
});

describe("calibration", () => {
  it("parses the CSV template and reports sim-vs-real error", () => {
    const { measurements, errors } = parseMeasurements(CALIBRATION_CSV_TEMPLATE);
    expect(errors).toEqual([]);
    expect(measurements.length).toBe(4);
    const { rows, table } = calibrationReport(measurements, { "Comp bot:cycleTime": 13, topSpeed: 5.5 });
    expect(rows[0]!.withinTolerance).toBe(true);
    expect(rows[1]!.withinTolerance).toBe(false);
    expect(rows[2]!.sim).toBeNull();
    expect(table.rows.length).toBe(4);
  });

  it("accepts JSON and reports bad rows", () => {
    const { measurements, errors } = parseMeasurements(JSON.stringify([{ metric: "x", value: 1 }, { metric: "y", value: "n/a" }]));
    expect(measurements.length).toBe(1);
    expect(errors.length).toBe(1);
  });
});
