import { describe, expect, it } from "vitest";
import { commandedSpeed, crossingDistance, requiredSpeed, shotEnvelope, type Observation, type ShotParams } from "@goldsim/core";
import type { RobotDesign } from "@goldsim/schema";
import { CLIMBER, design, goTo, makeMatch, robot, runUntil, script, with_ } from "./helpers.js";

const HUB = { x: 4.625, y: 4.035, height: 1.829 };
const base: ShotParams = { exitSpeed: 9, launchAngle: 1.0, launchHeight: 0.5, rangeMin: 1.0, rangeMax: 8 };

describe("shot physics (ballistics.ts)", () => {
  it("required speed passes through the target height", () => {
    const v = requiredSpeed(3, HUB.height, base)!;
    expect(crossingDistance(v, HUB.height, base, "descending")).toBeCloseTo(3, 6);
  });

  it("the envelope depends on exit speed: 4 m/s cannot reach the Hub from 2.5 m, 9 m/s can", () => {
    const slow = shotEnvelope({ ...base, exitSpeed: 4 }, HUB.height);
    const fast = shotEnvelope(base, HUB.height);
    expect(slow.reachable && slow.maxDistance >= 2.5).toBe(false);
    expect(fast.minDistance).toBeLessThan(2.5);
    expect(fast.maxDistance).toBeGreaterThan(2.5);
    // A steep top-entry shot cannot score from right under the goal.
    expect(fast.minDistance).toBeGreaterThan(1.5);
  });

  it("the flywheel slows down for closer shots, so extra exit speed doesn't change a reachable shot", () => {
    expect(commandedSpeed(3, HUB.height, base)).toBeCloseTo(commandedSpeed(3, HUB.height, { ...base, exitSpeed: 20 }), 9);
    expect(commandedSpeed(3, HUB.height, base)).toBeLessThan(base.exitSpeed);
  });
});

/** Shooter params on the climb-focused preset's forward shooter (mount x 0.15). */
function shooterDesign(params: Record<string, number>): RobotDesign {
  return design(CLIMBER, (d) => {
    const s = d.mechanisms.find((m) => m.type === "shooter")!;
    Object.assign(s.params, { rangeMin: 1.0, rangeMax: 8, ballsPerSecond: 6, spinUpTime: 0.4 }, params);
    d.preload = 8;
  });
}

/** Pose that puts the shooter `d` meters (horizontal) from the Hub center, facing it, clear of the Tower. */
function poseAt(d: number) {
  const mount = 0.15;
  const theta = Math.asin((HUB.y - 2.9) / (d + mount));
  return { x: HUB.x - (d + mount) * Math.cos(theta), y: 2.9, theta };
}

const settled = (obs: Observation, p: { x: number; y: number; theta: number }) =>
  Math.hypot(obs.self.x - p.x, obs.self.y - p.y) < 0.02 && Math.abs(obs.self.theta - p.theta) < 0.01 && Math.hypot(obs.self.vx, obs.self.vy) < 0.02;

async function accuracy(d: RobotDesign, distance: number, opts: { seeds?: number; strafe?: number } = {}) {
  let shots = 0;
  let scored = 0;
  const seeds = opts.seeds ?? 20;
  for (let seed = 1; seed <= seeds; seed++) {
    const pose = poseAt(distance);
    const drv = script([
      (obs) => (settled(obs, pose) ? null : goTo(obs, pose, 3)),
      (obs) =>
        opts.strafe
          ? with_({ vx: 0, vy: -opts.strafe, omega: 0, actions: {} }, { shoot: true })
          : with_(goTo(obs, pose, 3), { shoot: true }),
    ]);
    const m = await makeMatch([robot(d, "blue", 1)], [drv], seed);
    runUntil(m, 19);
    for (const e of m.events) {
      if (e.type === "shot_launched") shots++;
      if (e.type === "piece_scored") scored++;
    }
    m.dispose();
  }
  return { shots, scored, accuracy: shots ? scored / shots : 0 };
}

describe("shot accuracy in a match", () => {
  it("a 4 m/s shooter cannot score from 2.5 m; a 9 m/s shooter can", async () => {
    const slow = await accuracy(shooterDesign({ exitSpeed: 4 }), 2.5, { seeds: 3 });
    const fast = await accuracy(shooterDesign({ exitSpeed: 9 }), 2.5, { seeds: 3 });
    expect(slow.shots).toBeGreaterThan(0);
    expect(slow.scored).toBe(0);
    expect(fast.scored).toBeGreaterThan(fast.shots * 0.6);
  });

  it("with no aim or speed error every shot from 3 m scores", async () => {
    const r = await accuracy(shooterDesign({ spread: 0, speedError: 0 }), 3, { seeds: 3 });
    expect(r.accuracy).toBe(1);
  });

  it("default errors land roughly 85-95% from 3 m, and more error means more misses", async () => {
    const normal = await accuracy(shooterDesign({ spread: 0.04, speedError: 0.025 }), 3);
    const sloppy = await accuracy(shooterDesign({ spread: 0.08, speedError: 0.08 }), 3);
    console.log(`accuracy at 3 m: default ${(normal.accuracy * 100).toFixed(1)}% (${normal.shots} shots), sloppy ${(sloppy.accuracy * 100).toFixed(1)}%`);
    expect(normal.accuracy).toBeGreaterThan(0.8);
    expect(normal.accuracy).toBeLessThan(0.97);
    expect(sloppy.accuracy).toBeLessThan(normal.accuracy - 0.1);
  });

  it("extra exit speed beyond what the shot needs doesn't improve accuracy", async () => {
    const a = await accuracy(shooterDesign({ exitSpeed: 9 }), 3, { seeds: 8 });
    const b = await accuracy(shooterDesign({ exitSpeed: 18 }), 3, { seeds: 8 });
    expect(Math.abs(a.accuracy - b.accuracy)).toBeLessThan(0.03);
  });

  it("shooting while driving sideways misses more (no shoot-on-the-move compensation)", async () => {
    const turret = { turretRange: Math.PI, turretSpeed: 12 };
    const still = await accuracy(shooterDesign(turret), 3, { seeds: 6 });
    const moving = await accuracy(shooterDesign(turret), 3, { seeds: 6, strafe: 0.35 });
    console.log(`turret at 3 m: still ${(still.accuracy * 100).toFixed(1)}%, strafing ${(moving.accuracy * 100).toFixed(1)}%`);
    expect(moving.accuracy).toBeLessThan(still.accuracy - 0.3);
  });
});
