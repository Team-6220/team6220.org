import { describe, expect, it } from "vitest";
import type { MatchEvent } from "@goldsim/core";
import { DEFAULT_PROFILE, extractFitStats, fitLoss, fitProfile, type DriverProfile, type FitStat } from "../src/index.js";

const ev = (type: string, t: number, extra: Record<string, unknown> = {}) =>
  ({ type, t, tick: Math.round(t * 120), phase: "X", period: "teleop", robot: 0, alliance: "blue", ...extra }) as unknown as MatchEvent;

describe("fit stats", () => {
  it("extracts pickups, cycles, scoring rate and accuracy from events", () => {
    const events = [
      ev("piece_acquired", 1),
      ev("piece_acquired", 3),
      ev("piece_acquired", 5),
      ev("shot_launched", 10),
      ev("shot_launched", 10.5),
      ev("piece_scored", 11, { active: true }),
      ev("shot_launched", 20),
      ev("shot_launched", 20.4),
      ev("piece_scored", 21, { active: true }),
      ev("piece_scored", 21.2, { active: false }),
      ev("piece_acquired", 9, { robot: 1 }),
    ];
    const s = extractFitStats(events, 0, 60, 0.25);
    expect(s.secondsBetweenPickups).toBe(2);
    expect(s.shotsPerCycle).toBe(2);
    expect(s.cycleSeconds).toBe(10);
    expect(s.scoredPerMinute).toBe(2);
    expect(s.accuracy).toBe(0.5);
    expect(s.defenseTimeFraction).toBe(0.25);
  });
});

describe("fitProfile", () => {
  // Cheap stand-in for a simulation: stats are smooth functions of two knobs.
  const simulate = (p: DriverProfile): Record<FitStat, number> => ({
    secondsBetweenPickups: 3 / p.speedScale,
    shotsPerCycle: 4,
    cycleSeconds: 6 + 20 * p.reactionTime,
    scoredPerMinute: 30 * p.speedScale,
    accuracy: 1 - p.aimError * 3,
    defenseTimeFraction: 0,
  });

  it("recovers knob values that reproduce the target statistics", () => {
    const truth = { ...DEFAULT_PROFILE, speedScale: 0.6, reactionTime: 0.4, aimError: 0.05 };
    const target = simulate(truth);
    const fit = fitProfile(
      { secondsBetweenPickups: target.secondsBetweenPickups, cycleSeconds: target.cycleSeconds, accuracy: target.accuracy },
      simulate,
      { seed: 3, maxEvaluations: 200 },
    );
    expect(fit.loss).toBeLessThan(fitLoss({ cycleSeconds: target.cycleSeconds }, simulate(DEFAULT_PROFILE)));
    expect(fit.profile.speedScale).toBeCloseTo(0.6, 1);
    expect(fit.profile.reactionTime).toBeCloseTo(0.4, 1);
    expect(fit.profile.aimError).toBeCloseTo(0.05, 2);
    expect(fit.evaluations).toBeLessThanOrEqual(200);
  });

  it("is reproducible for the same seed", () => {
    const target = { cycleSeconds: 12 };
    const a = fitProfile(target, simulate, { seed: 9, maxEvaluations: 40 });
    const b = fitProfile(target, simulate, { seed: 9, maxEvaluations: 40 });
    expect(a).toEqual(b);
  });
});
