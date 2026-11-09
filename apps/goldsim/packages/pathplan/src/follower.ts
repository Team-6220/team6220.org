import { G, wrapAngle, type Driver, type DriverInput, type Observation } from "@goldsim/core";
import { rotationAt, sampleAt, speedCapAt, type SampledMarker, type SampledPath } from "./sample.js";

export interface FollowerOptions {
  /** Base lookahead distance, meters (grows with speed). */
  lookahead?: number;
  /** Abandon the path after this many seconds without progress (blocked or pushed). */
  timeoutSeconds?: number;
  /** Distance to the end point that counts as arrived, meters. */
  endTolerance?: number;
  /** Lateral acceleration used for the curvature speed limit, m/s^2 (default: 0.8 x the robot's acceleration limit). */
  maxLateralAccel?: number;
  /** Fraction of the robot's top speed to use. */
  speedScale?: number;
  /** Called when progress crosses an event marker's start, or a zoned marker's end. */
  onMarker?: (marker: SampledMarker, phase: "start" | "end") => void;
}

export type FollowerState = "running" | "done" | "abandoned";

/**
 * Drives a robot along path geometry with its own speed and acceleration limits (PRD §16.3).
 * Timing therefore reflects the design under test, and markers fire by progress, not by clock time.
 */
export class PathFollower implements Driver {
  state: FollowerState = "running";
  /** Arc-length progress along the path, meters. */
  progress = 0;
  private started = false;
  private bestProgress = 0;
  private lastProgressTick = 0;
  private fired = new Set<string>();
  private opts: Required<Omit<FollowerOptions, "onMarker" | "maxLateralAccel">> & Pick<FollowerOptions, "onMarker" | "maxLateralAccel">;

  constructor(
    readonly path: SampledPath,
    opts: FollowerOptions = {},
  ) {
    this.opts = {
      lookahead: opts.lookahead ?? 0.35,
      timeoutSeconds: opts.timeoutSeconds ?? 2,
      endTolerance: opts.endTolerance ?? 0.05,
      speedScale: opts.speedScale ?? 1,
      maxLateralAccel: opts.maxLateralAccel,
      onMarker: opts.onMarker,
    };
  }

  get finished(): boolean {
    return this.state !== "running";
  }

  /** Closest sample to the robot, searched in a window around the current progress (forward-biased). */
  private project(x: number, y: number): number {
    const p = this.path;
    const sp = p.spacing;
    const cur = Math.round(this.progress / sp);
    const lo = this.started ? Math.max(0, cur - 10) : 0;
    const hi = this.started ? Math.min(p.points.length - 1, cur + Math.ceil(1.5 / sp)) : Math.min(p.points.length - 1, Math.ceil(1.0 / sp));
    let best = lo;
    let bestD = Infinity;
    for (let i = lo; i <= hi; i++) {
      const q = p.points[i]!;
      const d = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return Math.max(this.progress, p.points[best]!.s);
  }

  private fireMarkers(from: number, to: number, all = false): void {
    for (const m of this.path.markers) {
      const key = `${m.name}@${m.s}`;
      if (!this.fired.has(`${key}:start`) && (all || (m.s <= to && m.s >= from - 1e-9) || m.s < from)) {
        this.fired.add(`${key}:start`);
        this.opts.onMarker?.(m, "start");
      }
      if (m.endS !== null && !this.fired.has(`${key}:end`) && this.fired.has(`${key}:start`) && (all || m.endS <= to)) {
        this.fired.add(`${key}:end`);
        this.opts.onMarker?.(m, "end");
      }
    }
  }

  getInput(tick: number, obs: Observation): DriverInput {
    const zero: DriverInput = { vx: 0, vy: 0, omega: 0, actions: {} };
    if (this.state !== "running") return zero;
    const me = obs.self;
    const dtv = me.design.chassis.drivetrain;
    const p = this.path;

    const prev = this.progress;
    this.progress = this.project(me.x, me.y);
    if (!this.started) {
      this.started = true;
      this.lastProgressTick = tick;
      this.fireMarkers(-1, this.progress);
    } else this.fireMarkers(prev, this.progress);

    if (this.progress > this.bestProgress + 0.02) {
      this.bestProgress = this.progress;
      this.lastProgressTick = tick;
    } else if ((tick - this.lastProgressTick) / obs.hz > this.opts.timeoutSeconds) {
      this.state = "abandoned";
      return zero;
    }

    const distEnd = Math.hypot(p.end.x - me.x, p.end.y - me.y);
    const remaining = Math.max(0, p.length - this.progress);
    const speedNow = Math.hypot(me.vx, me.vy);
    const arrived = p.goalEndVelocity > 0 ? remaining < this.opts.endTolerance * 2 && distEnd < 0.25 : distEnd < this.opts.endTolerance && speedNow < 0.4;
    if (arrived) {
      this.state = "done";
      this.progress = p.length;
      this.fireMarkers(prev, p.length, true);
      return zero;
    }

    // Speed: robot limit, path caps, curvature ahead, and braking toward the goal end velocity.
    const accel = Math.min(dtv.maxAccel, dtv.traction * G) * 0.8;
    const aLat = this.opts.maxLateralAccel ?? accel;
    let speed = dtv.maxSpeed * this.opts.speedScale;
    speed = Math.min(speed, speedCapAt(p, this.progress));
    let kMax = 0;
    for (let s = this.progress; s <= Math.min(p.length, this.progress + 1.0); s += p.spacing * 5) kMax = Math.max(kMax, sampleAt(p, s).curvature);
    if (kMax > 1e-3) speed = Math.min(speed, Math.sqrt(aLat / kMax));
    speed = Math.min(speed, Math.sqrt(p.goalEndVelocity ** 2 + 2 * accel * Math.max(remaining, distEnd)));

    const L = this.opts.lookahead + 0.25 * speedNow;
    let vx: number;
    let vy: number;
    if (remaining <= L) {
      const ex = p.end.x - me.x;
      const ey = p.end.y - me.y;
      const d = Math.hypot(ex, ey) || 1;
      const v = Math.min(speed, d * 3 + p.goalEndVelocity);
      vx = (ex / d) * v;
      vy = (ey / d) * v;
    } else {
      const la = sampleAt(p, this.progress + L);
      const ex = la.x - me.x;
      const ey = la.y - me.y;
      const d = Math.hypot(ex, ey) || 1;
      vx = (ex / d) * speed;
      vy = (ey / d) * speed;
    }

    const omegaTo = (target: number) => Math.max(-1, Math.min(1, (wrapAngle(target - me.theta) * 4) / dtv.maxAngularSpeed));

    if (dtv.type === "tank") {
      const v = Math.hypot(vx, vy);
      let dir = Math.atan2(vy, vx);
      let sign = 1;
      if (p.reversed) {
        dir = wrapAngle(dir + Math.PI);
        sign = -1;
      }
      const err = wrapAngle(dir - me.theta);
      const fwd = (sign * v * Math.max(0, Math.cos(err))) / dtv.maxSpeed;
      return { vx: Math.max(-1, Math.min(1, fwd)), vy: 0, omega: omegaTo(dir), actions: {} };
    }

    const rot = rotationAt(p, Math.min(p.length, this.progress + 0.1));
    const n = Math.hypot(vx, vy) / dtv.maxSpeed;
    const k = n > 1 ? 1 / n : 1;
    return {
      vx: (vx / dtv.maxSpeed) * k,
      vy: (vy / dtv.maxSpeed) * k,
      omega: rot === null ? 0 : omegaTo(rot),
      actions: {},
    };
  }
}
