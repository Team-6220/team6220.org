import { describe, expect, it } from "vitest";
import { collectNamedCommands, collectPathNames, parseAuto, parsePath } from "../src/index.js";
import { loadAuto, loadPath, readFixture } from "./helpers.js";

describe(".path parsing", () => {
  it("reads the 2025 format", () => {
    const p = loadPath("Straight");
    expect(p.waypoints).toHaveLength(2);
    expect(p.waypoints[0]!.prevControl).toBeNull();
    expect(p.rotationTargets[0]).toEqual({ waypointRelativePos: 0.5, rotationDegrees: 90 });
    expect(p.constraintZones[0]!.constraints.maxVelocity).toBe(1);
    expect(p.eventMarkers[0]!.command).toEqual({ type: "named", name: "IntakeOn" });
    expect(p.goalEndState.rotation).toBe(180);
    expect(p.idealStartingState).toEqual({ velocity: 0, rotation: 0 });
  });

  it("warns about fields it does not use instead of dropping them silently", () => {
    const r = parsePath(readFixture("paths", "Curve.path"), "Curve");
    expect(r.ok).toBe(true);
    expect(r.warnings.join("\n")).toContain('"somethingNew"');
  });

  it("rejects broken files with a readable reason", () => {
    expect(parsePath("{not json", "Bad").ok).toBe(false);
    const one = parsePath({ waypoints: [{ anchor: { x: 0, y: 0 } }] }, "One");
    expect(one.ok).toBe(false);
    if (!one.ok) expect(one.errors[0]).toContain("at least 2 waypoints");
  });

  it("clamps out-of-range waypoint positions with a warning", () => {
    const raw = JSON.parse(readFixture("paths", "Straight.path"));
    raw.eventMarkers[0].waypointRelativePos = 7;
    const r = parsePath(raw, "Straight");
    expect(r.ok && r.value.eventMarkers[0]!.waypointRelativePos).toBe(1);
    expect(r.warnings.some((w) => w.includes("outside 0..1"))).toBe(true);
  });
});

describe(".auto parsing", () => {
  it("reads the 2025 command tree", () => {
    const a = loadAuto("Exit And Intake");
    expect(a.command.type).toBe("sequential");
    expect(a.startingPose).toBeNull();
    expect(collectPathNames(a.command)).toEqual(["Exit Trench"]);
  });

  it("reads 2024 starting poses and reports unsupported command types", () => {
    const r = parseAuto(readFixture("autos", "Legacy2024.auto"), "Legacy2024");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.startingPose).toEqual({ x: 1.35, y: 5.55, rotationDegrees: 180 });
    expect(r.warnings.join("\n")).toContain('"conditional" is not supported');
  });

  it("warns that Choreo autos are not imported", () => {
    const r = parseAuto({ command: { type: "sequential", data: { commands: [] } }, choreoAuto: true }, "C");
    expect(r.warnings.join("\n")).toContain("Choreo");
  });

  it("lists every named command, including event markers inside paths", () => {
    const a = loadAuto("Exit And Intake");
    const names = collectNamedCommands(a, (n) => (n === "Exit Trench" ? loadPath("Exit Trench") : undefined));
    expect(names).toEqual(["IntakeOff", "IntakeOn", "Mystery"]);
  });
});
