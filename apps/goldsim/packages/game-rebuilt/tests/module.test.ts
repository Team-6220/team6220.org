import { describe, expect, it } from "vitest";
import { checkModule, RobotDesign, validate, validateModuleFiles } from "@goldsim/schema";
import { applyScoring, checkDesignRunnable, newScoringState, rankingPoints, type MatchEvent } from "@goldsim/core";
import { rebuilt, rebuiltFiles, rebuiltPresets } from "../src/index.js";
import { OTB, design } from "./helpers.js";

describe("REBUILT module files", () => {
  it("match their schemas and pass cross-file checks", () => {
    const { module, errors } = validateModuleFiles(rebuiltFiles);
    expect(errors).toEqual([]);
    const report = checkModule(module!);
    expect(report.errors).toEqual([]);
  });

  it("stage 504 Fuel with 360 in the Neutral Zone when every robot preloads 8 (§6.3.4)", () => {
    const report = checkModule(validateModuleFiles(rebuiltFiles).module!);
    expect(report.summary.join("\n")).toContain("remainder 360");
  });

  it("have a 2:40 match with robots enabled (§6.4)", () => {
    const enabled = rebuilt.game.timeline.phases.filter((p) => p.robotsEnabled).reduce((s, p) => s + p.duration, 0);
    expect(enabled).toBe(160);
  });
});

describe("robot designs", () => {
  it("presets are valid and runnable", () => {
    for (const d of rebuiltPresets) {
      const r = validate(RobotDesign, d);
      expect(r.ok, d.name).toBe(true);
      expect(checkDesignRunnable(d, rebuilt.mechanisms), d.name).toEqual([]);
    }
  });

  it("schema errors name the field and what it expects", () => {
    const bad = design(OTB, (d) => {
      (d.chassis as { mass: unknown }).mass = "heavy";
    });
    const r = validate(RobotDesign, bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]!.path).toBe("chassis.mass");
  });

  it("never rejects a design for robot-rule reasons (huge, tall, heavy robots run)", () => {
    const funky = design(OTB, (d) => {
      d.chassis.frame = { type: "rect", length: 2.5, width: 0.3 };
      d.chassis.height = 3;
      d.chassis.mass = 500;
    });
    expect(checkDesignRunnable(funky, rebuilt.mechanisms)).toEqual([]);
  });

  it("rejects designs the sim cannot run", () => {
    const broken = design(OTB, (d) => {
      d.chassis.mass = -1;
      d.mechanisms[0]!.mount.x = 5;
    });
    const issues = checkDesignRunnable(broken, rebuilt.mechanisms).map((i) => i.path);
    expect(issues).toContain("chassis.mass");
    expect(issues).toContain("mechanisms[0].mount");
  });
});

describe("REBUILT scoring rules (Table 6-4, 6-5)", () => {
  const base = { tick: 0, t: 0, phase: "X" } as const;
  const climb = (alliance: "blue" | "red", level: number, period: "auto" | "teleop", robot = 0): MatchEvent => ({
    ...base,
    period,
    type: "climb_assessed",
    robot,
    alliance,
    level,
    structure: `tower.${alliance}`,
  });

  it("Tower: L1 15 in AUTO (max 2 robots), L1 10 / L2 20 / L3 30 in TELEOP", () => {
    const s = newScoringState(6);
    for (const r of [0, 1, 2]) applyScoring(rebuilt.scoring, s, climb("blue", 1, "auto", r));
    expect(s.score.blue.total).toBe(30);
    applyScoring(rebuilt.scoring, s, climb("blue", 1, "teleop"));
    applyScoring(rebuilt.scoring, s, climb("blue", 2, "teleop", 1));
    applyScoring(rebuilt.scoring, s, climb("blue", 3, "teleop", 2));
    expect(s.score.blue.total).toBe(30 + 10 + 20 + 30);
    expect(s.score.blue.endgame).toBe(60);
    expect(s.counters.blue.towerPoints).toBe(90);
  });

  it("Fuel scores 1 only in an active Hub", () => {
    const s = newScoringState(6);
    const fuel = (active: boolean): MatchEvent => ({
      ...base,
      period: "teleop",
      type: "piece_scored",
      robot: 0,
      alliance: "blue",
      target: "hub.blue",
      targetBase: "hub",
      active,
      piece: "fuel",
    });
    applyScoring(rebuilt.scoring, s, fuel(true));
    applyScoring(rebuilt.scoring, s, fuel(true));
    applyScoring(rebuilt.scoring, s, fuel(false));
    expect(s.score.blue.total).toBe(2);
    expect(s.counters.blue.fuelActive).toBe(2);
    expect(s.counters.blue.fuelInactive).toBe(1);
  });

  it("fouls award 5 (MINOR) / 15 (MAJOR) to the opponent", () => {
    const s = newScoringState(6);
    applyScoring(rebuilt.scoring, s, { ...base, period: "auto", type: "foul", robot: 0, alliance: "blue", rule: "G403", severity: "MAJOR" });
    applyScoring(rebuilt.scoring, s, { ...base, period: "auto", type: "foul", robot: 3, alliance: "red", rule: "G405", severity: "MINOR" });
    expect(s.score.red.foul).toBe(15);
    expect(s.score.blue.foul).toBe(5);
  });

  it("bonus RP thresholds follow the selected profile", () => {
    const s = newScoringState(6);
    s.counters.blue.fuelActive = 240;
    s.counters.blue.towerPoints = 50;
    s.score.blue.total = 290;
    const regional = rankingPoints(rebuilt.scoring, s, rebuilt.game.thresholdProfiles.regional!);
    expect(regional.blue.bonus).toEqual({ ENERGIZED: true, SUPERCHARGED: false, TRAVERSAL: true });
    expect(regional.blue.total).toBe(3 + 2);
    const champs = rankingPoints(rebuilt.scoring, s, rebuilt.game.thresholdProfiles.championship!);
    expect(champs.blue.bonus.ENERGIZED).toBe(false);
  });
});
