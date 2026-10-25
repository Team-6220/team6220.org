import { Match, wrapAngle, type Driver, type DriverInput, type Observation } from "@goldsim/core";
import type { Alliance, MatchRobot, Pose, RobotDesign } from "@goldsim/schema";
import { rebuilt, rebuiltPresets } from "../src/index.js";

export const [OTB, TURRET, CLIMBER, DEFENSE] = rebuiltPresets as [RobotDesign, RobotDesign, RobotDesign, RobotDesign];

export function design(base: RobotDesign, patch: (d: RobotDesign) => void = () => {}): RobotDesign {
  const d = structuredClone(base);
  patch(d);
  return d;
}

export function robot(d: RobotDesign, alliance: Alliance = "blue", station = 0): MatchRobot {
  return { design: d, alliance, station };
}

export async function makeMatch(robots: MatchRobot[], drivers: (Driver | null)[], seed = 1) {
  return Match.create({ game: rebuilt, robots, seed, drivers });
}

/** Holonomic go-to-pose control, normalized to the robot's limits. */
export function goTo(obs: Observation, target: Pose, gain = 2.5): DriverInput {
  const me = obs.self;
  const dtv = me.design.chassis.drivetrain;
  const ex = target.x - me.x;
  const ey = target.y - me.y;
  const scale = gain / dtv.maxSpeed;
  let vx = ex * scale;
  let vy = ey * scale;
  const mag = Math.hypot(vx, vy);
  if (mag > 1) {
    vx /= mag;
    vy /= mag;
  }
  const omega = Math.max(-1, Math.min(1, (wrapAngle(target.theta - me.theta) * 4) / dtv.maxAngularSpeed));
  return { vx, vy, omega, actions: {} };
}

export function near(obs: Observation, p: Pose, tol = 0.08, angTol = 0.05): boolean {
  return Math.hypot(obs.self.x - p.x, obs.self.y - p.y) < tol && Math.abs(wrapAngle(obs.self.theta - p.theta)) < angTol;
}

/** A driver that runs a list of steps; each step returns an input or null when finished. */
export function script(steps: ((obs: Observation, tick: number) => DriverInput | null)[]): Driver {
  let i = 0;
  return {
    getInput(tick, obs) {
      while (i < steps.length) {
        const out = steps[i]!(obs, tick);
        if (out) return out;
        i++;
      }
      return { vx: 0, vy: 0, omega: 0, actions: {} };
    },
  };
}

export const with_ = (input: DriverInput, actions: DriverInput["actions"]): DriverInput => ({ ...input, actions });

export function runUntil(m: Match, seconds: number): void {
  const until = Math.round(seconds * m.hz);
  while (m.tick < until && !m.isOver) m.step();
}

export function objective(m: Match, id: string): Pose {
  return m.objectives.find((o) => o.id === id)!.pose;
}
