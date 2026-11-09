import { describe, expect, it } from "vitest";
import { Match, type DriverInput, type Observation } from "@goldsim/core";
import { rebuilt, rebuiltPresets } from "@goldsim/game-rebuilt";
import type { NamedCommand } from "@goldsim/schema";
import { AutoExecutor, parseAuto, type PPCommand } from "../src/index.js";
import { fakeObs, loadAuto, loadPath } from "./helpers.js";

const COMMANDS: Record<string, NamedCommand> = {
  Shoot: { action: "shoot", durationSeconds: 0.5 },
  IntakeOn: { action: "intake", state: "on" },
  IntakeOff: { action: "intake", state: "off" },
  Climb: { action: "climb", level: 2 },
};

const named = (name: string): PPCommand => ({ type: "named", name });
const wait = (waitTime: number): PPCommand => ({ type: "wait", waitTime });

/** Runs a command tree with no paths and returns per-tick actions until it finishes (hz = 100). */
function trace(command: PPCommand, maxTicks = 500) {
  const exec = new AutoExecutor({ name: "t", version: "test", command, resetOdom: true, startingPose: null, choreoAuto: false, folder: null }, { lookupPath: () => undefined, namedCommands: COMMANDS });
  const out: DriverInput["actions"][] = [];
  let tick = 0;
  for (; tick < maxTicks && !exec.finished; tick++) out.push(exec.getInput(tick, fakeObs(tick)).actions);
  return { exec, out, ticks: tick };
}

describe("command tree semantics", () => {
  it("sequential runs children in order; timed commands hold their action for their duration", () => {
    const { out, ticks } = trace({ type: "sequential", commands: [named("Shoot"), wait(0.25), named("IntakeOn")] });
    expect(out.slice(0, 50).every((a) => a.shoot === true)).toBe(true);
    expect(out[51]!.shoot).toBeUndefined();
    expect(out.at(-1)!.intake).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(75);
    expect(ticks).toBeLessThanOrEqual(77);
  });

  it("press commands (no state or duration) hold for one tick and carry the level", () => {
    const { out } = trace({ type: "sequential", commands: [named("Climb"), wait(0.05)] });
    expect(out[0]).toMatchObject({ climb: true, climbLevel: 2 });
    expect(out[1]!.climb).toBeUndefined();
  });

  it("parallel waits for all, race for the first, deadline for its first child", () => {
    expect(trace({ type: "parallel", commands: [wait(1), wait(0.3)] }).ticks).toBe(100);
    expect(trace({ type: "race", commands: [wait(1), wait(0.3)] }).ticks).toBe(30);
    const d = trace({ type: "deadline", commands: [wait(0.3), { type: "named", name: "Shoot" }] });
    expect(d.ticks).toBe(30);
    expect(d.out.every((a) => a.shoot === true)).toBe(true);
  });

  it("on/off commands persist until changed", () => {
    const { out } = trace({ type: "sequential", commands: [named("IntakeOn"), wait(0.2), named("IntakeOff"), wait(0.1)] });
    expect(out[5]!.intake).toBe(true);
    expect(out.at(-1)!.intake).toBe(false);
  });

  it("reports unmapped named commands and unsupported command types instead of failing", () => {
    const r = parseAuto({ command: { type: "sequential", data: { commands: [{ type: "named", data: { name: "Dance" } }, { type: "conditional", data: {} }] } } }, "x");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const exec = new AutoExecutor(r.value, { lookupPath: () => undefined, namedCommands: COMMANDS });
    for (let t = 0; t < 3; t++) exec.getInput(t, fakeObs(t));
    expect([...exec.unmapped]).toEqual(["Dance"]);
    expect(exec.warnings.join("\n")).toContain("conditional");
    expect(exec.finished).toBe(true);
  });

  it("user overrides add, replace, and remove mappings", () => {
    const exec = new AutoExecutor(loadAuto("Exit And Intake"), {
      lookupPath: () => undefined,
      namedCommands: COMMANDS,
      overrides: { Mystery: { action: "place", durationSeconds: 0.1 }, IntakeOff: null },
    });
    expect(exec.commands.Mystery).toEqual({ action: "place", durationSeconds: 0.1 });
    expect(exec.commands.IntakeOff).toBeUndefined();
  });
});

describe("running an auto in a REBUILT match", () => {
  it("follows a path out of the Alliance Zone through the Trench and fires event markers by progress", async () => {
    const auto = loadAuto("Exit And Intake");
    const paths = { "Exit Trench": loadPath("Exit Trench") };
    const exec = new AutoExecutor(auto, {
      lookupPath: (n) => paths[n as keyof typeof paths],
      namedCommands: rebuilt.namedCommands.namedCommands,
    });
    let intakeOnX: number | null = null;
    let intakeOffSeen = false;
    const spy = {
      getInput(tick: number, obs: Observation) {
        const input = exec.getInput(tick, obs);
        if (input.actions.intake === true && intakeOnX === null) intakeOnX = obs.self.x;
        if (intakeOnX !== null && input.actions.intake === false) intakeOffSeen = true;
        return input;
      },
    };
    const m = await Match.create({
      game: rebuilt,
      robots: [{ design: rebuiltPresets[0]!, alliance: "blue", station: 0 }],
      seed: 1,
      drivers: [spy],
    });
    while (!exec.finished && m.time < 15) m.step();
    const pose = m.robotPose(0);
    m.dispose();

    expect(exec.finished).toBe(true);
    expect(Math.hypot(pose.x - 6.8, pose.y - 0.79)).toBeLessThan(0.15);
    // Marker at waypoint-relative 1.5 sits around x = 5.1 m on this path.
    expect(intakeOnX).not.toBeNull();
    expect(intakeOnX!).toBeGreaterThan(4.6);
    expect(intakeOnX!).toBeLessThan(5.6);
    expect(intakeOffSeen).toBe(true);
    expect([...exec.unmapped]).toEqual(["Mystery"]);
    expect(exec.log.some((l) => l.message.includes("abandoned"))).toBe(false);
  });

  it("abandons a blocked path after the timeout and moves on", async () => {
    // A path straight into the Hub: the robot gets stuck against it.
    const r = parseAuto({ command: { type: "sequential", data: { commands: [{ type: "path", data: { pathName: "Into Hub" } }, { type: "named", data: { name: "IntakeOn" } }] } } }, "blocked");
    if (!r.ok) throw new Error("parse");
    const into = loadPath("Straight");
    into.waypoints = [
      { anchor: { x: 3.4, y: 4.035 }, prevControl: null, nextControl: { x: 4.0, y: 4.035 }, linkedName: null },
      { anchor: { x: 6.0, y: 4.035 }, prevControl: { x: 5.0, y: 4.035 }, nextControl: null, linkedName: null },
    ];
    into.constraintZones = [];
    into.eventMarkers = [];
    const exec = new AutoExecutor(r.value, { lookupPath: () => into, namedCommands: rebuilt.namedCommands.namedCommands, follower: { timeoutSeconds: 1 } });
    const m = await Match.create({ game: rebuilt, robots: [{ design: rebuiltPresets[0]!, alliance: "blue", station: 1 }], seed: 1, drivers: [exec] });
    while (!exec.finished && m.time < 10) m.step();
    m.dispose();
    expect(exec.finished).toBe(true);
    expect(exec.log.some((l) => l.message.includes("abandoned"))).toBe(true);
    expect(exec.persistent.intake).toBe(true);
  });
});
