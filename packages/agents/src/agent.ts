import {
  pointInShape,
  resolveMechanisms,
  Rng,
  shapeCenter,
  toWorld,
  wrapAngle,
  type Driver,
  type DriverInput,
  type GameModule,
  type Match,
  type Observation,
  type ResolvedElement,
  type ResolvedMechanism,
  type Vec2,
} from "@goldsim/core";
import type { Alliance, MatchRobot } from "@goldsim/schema";
import { navGridFor, type NavGrid } from "./nav.js";
import { DEFAULT_PROFILE, type DriverProfile } from "./profile.js";

/** Static information an agent may use: the game, the field, and its own robot. Never hidden match state. */
export interface AgentContext {
  game: GameModule;
  elements: ResolvedElement[];
  robot: MatchRobot;
  index: number;
  seed: number;
}

type Mode = "idle" | "collect" | "shoot" | "wait" | "climb" | "autoClimb" | "descend" | "defend" | "feed";

type Sink = Extract<ResolvedElement, { kind: "sink" }>;

/**
 * Parameterized policy (PRD §11.1): a priority selector over behaviors (endgame, cycle, defense, feeding).
 * Produces the same DriverInput a human would.
 */
export class Agent implements Driver {
  readonly profile: DriverProfile;
  mode: Mode = "idle";
  private ctx: AgentContext;
  private rng: Rng;
  private alliance: Alliance;
  private mechs: ResolvedMechanism[];
  private shooter?: ResolvedMechanism;
  private intake?: ResolvedMechanism;
  private climber?: ResolvedMechanism;
  private hub?: Sink;
  private hubCenter: Vec2 = { x: 0, y: 0 };
  private hubRadius = 0.5;
  private zone?: Extract<ResolvedElement, { kind: "zone" }>;
  private grid?: NavGrid;
  private nextDecision = 0;
  private target: Vec2 = { x: 0, y: 0 };
  private heading = 0;
  private path: Vec2[] = [];
  private pathGoal: Vec2 | null = null;
  private pathTick = -1e9;
  private aimBias = 0;
  private climbPressTick = -1e9;
  private lastClimbButton = false;
  private stuckSince = -1;
  private blacklist = new Map<string, number>();
  private pieceKey = "";

  constructor(ctx: AgentContext, profile: DriverProfile = DEFAULT_PROFILE) {
    this.ctx = ctx;
    this.profile = profile;
    this.alliance = ctx.robot.alliance;
    this.rng = new Rng((ctx.seed ^ Math.imul(ctx.index + 1, 0x9e3779b9)) >>> 0);
    this.mechs = resolveMechanisms(ctx.robot.design, ctx.game.mechanisms);
    this.shooter = this.mechs.find((m) => m.base === "shooter");
    this.intake = this.mechs.find((m) => m.base === "intake");
    this.climber = this.mechs.find((m) => m.base === "climber");
    this.hub = ctx.elements.find((e): e is Sink => e.kind === "sink" && e.scoresFor === this.alliance);
    if (this.hub) {
      this.hubCenter = shapeCenter(this.hub.target.shape);
      this.hubRadius = this.hub.target.shape.type === "circle" ? this.hub.target.shape.radius : 0.5;
    }
    this.zone = ctx.elements.find(
      (e): e is Extract<ResolvedElement, { kind: "zone" }> => e.kind === "zone" && e.alliance === this.alliance && (e.tags ?? []).includes("alliance"),
    );
  }

  get role(): DriverProfile["role"] {
    if (this.profile.role !== "auto") return this.profile.role;
    if (this.shooter && this.intake) return this.profile.pickup === "outpost" ? "feeder" : "scorer";
    return "defender";
  }

  getInput(tick: number, obs: Observation): DriverInput {
    const me = obs.self;
    this.grid ??= navGridFor(this.ctx.game.field, this.ctx.elements, me.radius, me.height);
    if (tick >= this.nextDecision) {
      this.decide(obs);
      this.nextDecision = tick + Math.max(1, Math.round(this.profile.reactionTime * obs.hz));
    }
    const out = this.act(obs);
    // Climb is a press: keep the button edge-triggered.
    const climbNow = !!out.actions.climb;
    if (climbNow && this.lastClimbButton) out.actions.climb = false;
    this.lastClimbButton = !!out.actions.climb;
    return out;
  }

  // -------------------------------------------------------------------------
  // Decisions
  // -------------------------------------------------------------------------

  private decide(obs: Observation): void {
    const me = obs.self;
    const prev = this.mode;
    if (!obs.phase.robotsEnabled) {
      this.mode = "idle";
      return;
    }
    const teleop = obs.phase.period === "teleop";

    // Come down after an AUTO climb.
    if (teleop && me.climbState !== "idle" && prev !== "climb") {
      this.mode = "descend";
      return;
    }
    if (this.climber && this.profile.climb && teleop && obs.matchTimeLeft <= this.timeToClimb(obs, this.climber.p.maxLevel!)) {
      this.mode = "climb";
      return;
    }
    if (this.climber && this.profile.autoClimb && !teleop && obs.phase.timeLeft <= this.timeToClimb(obs, 1) - this.profile.endgameBuffer + 0.7) {
      this.mode = "autoClimb";
      return;
    }
    if (me.climbState !== "idle") return;

    if (this.role === "defender") {
      this.mode = teleop ? "defend" : "idle";
      return;
    }

    const hubActive = this.hub ? obs.elementActive[this.hub.id] !== false : false;
    const threshold = Math.max(1, Math.ceil(me.capacity * this.profile.shootThreshold));
    const wantsShoot =
      !!this.shooter &&
      me.ready > 0 &&
      (me.stored >= threshold || (prev === "shoot" && me.stored > 0) || (!teleop && obs.phase.timeLeft < 9) || (!this.intake && me.stored > 0));

    if (wantsShoot && (hubActive || this.profile.shootWhenInactive)) {
      if (prev !== "shoot") this.aimBias = this.profile.aimError * this.rng.normal();
      this.mode = "shoot";
      this.planShot(obs);
      return;
    }
    if (me.stored >= me.capacity && this.shooter) {
      this.mode = "wait";
      this.planShot(obs);
      return;
    }
    if (this.intake) {
      if (this.role === "feeder" && this.planFeed(obs)) return;
      if (this.planCollect(obs)) return;
    }
    this.mode = this.shooter && me.stored > 0 ? "wait" : "idle";
    if (this.mode === "wait") this.planShot(obs);
  }

  private timeToClimb(obs: Observation, level: number): number {
    const slot = this.climbSlot(obs);
    if (!slot || !this.climber) return 0;
    const d = Math.hypot(slot.x - obs.self.x, slot.y - obs.self.y) * 1.3;
    const speed = obs.self.design.chassis.drivetrain.maxSpeed * this.profile.speedScale * 0.6;
    const times = [this.climber.p.level1Time!, this.climber.p.level2Time!, this.climber.p.level3Time!];
    return d / speed + times[Math.max(0, Math.min(2, level - 1))]! + this.profile.endgameBuffer;
  }

  private climbSlot(obs: Observation): { x: number; y: number; theta: number } | null {
    const o = obs.objectives.find((x) => x.baseId === "towerClimb" && x.alliance === this.alliance);
    if (!o) return null;
    const offsets = [0, -0.85, 0.85];
    const off = offsets[this.ctx.robot.station % 3]!;
    // Offset sideways relative to the climb heading.
    return { x: o.pose.x - Math.sin(o.pose.theta) * off, y: o.pose.y + Math.cos(o.pose.theta) * off, theta: o.pose.theta };
  }

  /** Shooting pose inside the own Alliance Zone, within the shooter's range window, facing the target. */
  private planShot(obs: Observation): void {
    const me = obs.self;
    const s = this.shooter!;
    const rMin = s.p.rangeMin! + this.hubRadius;
    const rMax = s.p.rangeMax! + this.hubRadius;
    const D = Math.min(rMax - 0.3, Math.max(rMin + 0.4, 2.2));
    let ang = Math.atan2(me.y - this.hubCenter.y, me.x - this.hubCenter.x);
    // Keep to the own side of the target.
    const homeAngle = this.alliance === "blue" ? Math.PI : 0;
    const maxOff = 1.1;
    const off = wrapAngle(ang - homeAngle);
    ang = homeAngle + Math.max(-maxOff, Math.min(maxOff, off));
    let p = { x: this.hubCenter.x + Math.cos(ang) * D, y: this.hubCenter.y + Math.sin(ang) * D };
    if (this.zone && !pointInShape(p.x, p.y, this.zone.shape)) {
      // Pull the pose back into the zone along the line to the target.
      for (let k = 0; k < 30 && !pointInShape(p.x, p.y, this.zone.shape); k++) {
        p = { x: p.x + Math.cos(homeAngle) * 0.1, y: p.y };
      }
    }
    p = this.grid!.nearestFree(p);
    this.target = p;
    this.heading = this.aimHeading(p);
  }

  /** Robot heading that points the shooter at the target center from pose p. */
  private aimHeading(p: Vec2): number {
    const s = this.shooter!;
    if (s.p.turretRange! >= Math.PI - 0.01) return this.heading;
    let theta = Math.atan2(this.hubCenter.y - p.y, this.hubCenter.x - p.x) - s.mount.theta;
    for (let k = 0; k < 2; k++) {
      const o = toWorld({ ...p, theta }, s.mount.x, s.mount.y);
      theta = Math.atan2(this.hubCenter.y - o.y, this.hubCenter.x - o.x) - s.mount.theta;
    }
    return wrapAngle(theta + this.aimBias);
  }

  private planCollect(obs: Observation): boolean {
    const me = obs.self;
    const intake = this.intake!;
    const reach = intake.mount.x + intake.p.rollerDepth! / 2;
    const teleop = obs.phase.period === "teleop";
    const cl = this.ctx.game.field.centerLineX;
    const ownSide = (x: number) => (this.alliance === "blue" ? x < cl - me.radius - 0.1 : x > cl + me.radius + 0.1);
    const depot = this.ctx.elements.find((e) => e.baseId === "depot" && e.alliance === this.alliance);
    let best: { p: Vec2; cost: number } | null = null;
    const now = obs.tick;
    for (const piece of obs.pieces) {
      if (!teleop && !ownSide(piece.x)) continue;
      const key = `${piece.x.toFixed(1)},${piece.y.toFixed(1)}`;
      if ((this.blacklist.get(key) ?? 0) > now) continue;
      const d = Math.hypot(piece.x - me.x, piece.y - me.y);
      if (d > 12) continue;
      const dir = Math.atan2(piece.y - me.y, piece.x - me.x);
      const approach = { x: piece.x - Math.cos(dir) * reach, y: piece.y - Math.sin(dir) * reach };
      if (!this.grid!.isFree(approach)) continue;
      let cost = d;
      if (this.profile.pickup === "depot" && depot && pointInShape(piece.x, piece.y, depot.shape)) cost -= 3;
      if (this.profile.pickup === "neutral" && Math.abs(piece.x - cl) < 3.6) cost -= 1.5;
      // Robots nearby make a piece less attractive.
      for (const r of obs.robots) if (r.index !== me.index && Math.hypot(r.x - piece.x, r.y - piece.y) < r.radius + 0.3) cost += 2;
      if (!best || cost < best.cost) best = { p: piece, cost };
    }
    if (!best) return false;
    this.mode = "collect";
    const dir = Math.atan2(best.p.y - me.y, best.p.x - me.x);
    // Aim through the piece so the roller sweeps it in.
    this.target = { x: best.p.x + Math.cos(dir) * 0.15 - Math.cos(dir) * reach, y: best.p.y + Math.sin(dir) * 0.15 - Math.sin(dir) * reach };
    this.heading = wrapAngle(dir - intake.mount.theta);
    this.pieceKey = `${best.p.x.toFixed(1)},${best.p.y.toFixed(1)}`;
    return true;
  }

  private planFeed(obs: Observation): boolean {
    const o = obs.objectives.find((x) => x.baseId === "outpost" && x.alliance === this.alliance);
    if (!o || !obs.phase.robotsEnabled || obs.phase.period === "auto") return false;
    this.mode = "feed";
    this.target = o.pose;
    this.heading = wrapAngle(o.pose.theta + Math.PI - this.intake!.mount.theta);
    return true;
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  private act(obs: Observation): DriverInput {
    const me = obs.self;
    const idle: DriverInput = { vx: 0, vy: 0, omega: 0, actions: {} };
    switch (this.mode) {
      case "idle":
        return idle;
      case "collect": {
        const out = this.navigate(obs, this.target, this.heading, false);
        out.actions.intake = Math.hypot(this.target.x - me.x, this.target.y - me.y) < 2.5;
        this.checkStuck(obs);
        return out;
      }
      case "feed": {
        const out = this.navigate(obs, this.target, this.heading, true);
        out.actions.intake = true;
        return out;
      }
      case "shoot":
      case "wait": {
        const out = this.navigate(obs, this.target, this.heading, true);
        const posErr = Math.hypot(this.target.x - me.x, this.target.y - me.y);
        const turret = this.shooter!.p.turretRange! >= Math.PI - 0.01;
        const aimErr = Math.abs(wrapAngle(this.aimHeading({ x: me.x, y: me.y }) - me.theta));
        const inZone = !this.zone || pointInShape(me.x, me.y, this.zone.shape);
        const aimed = turret || aimErr < this.profile.aimTolerance;
        // Spin up on the way in; release once lined up.
        out.actions.shoot = this.mode === "shoot" && inZone && posErr < 0.6 && aimed;
        if (out.actions.shoot && !turret) out.omega = Math.max(-1, Math.min(1, (wrapAngle(this.aimHeading({ x: me.x, y: me.y }) - me.theta) * 5) / me.design.chassis.drivetrain.maxAngularSpeed));
        out.actions.intake = this.mode === "wait" ? false : me.stored < me.capacity;
        return out;
      }
      case "climb":
      case "autoClimb": {
        const slot = this.climbSlot(obs);
        if (!slot) return idle;
        if (me.climbState !== "idle") return { ...idle, actions: { climbLevel: this.mode === "autoClimb" ? 1 : this.climber!.p.maxLevel! } };
        const out = this.navigate(obs, slot, slot.theta, true);
        const close = Math.hypot(slot.x - me.x, slot.y - me.y) < 0.15 && Math.abs(wrapAngle(slot.theta - me.theta)) < 0.15;
        if (close && obs.tick - this.climbPressTick > obs.hz * 0.5) {
          this.climbPressTick = obs.tick;
          return { vx: 0, vy: 0, omega: 0, actions: { climb: true, climbLevel: this.mode === "autoClimb" ? 1 : this.climber!.p.maxLevel! } };
        }
        return out;
      }
      case "descend": {
        if (me.climbState === "climbed" || me.climbState === "climbing") {
          if (obs.tick - this.climbPressTick > obs.hz * 0.5) {
            this.climbPressTick = obs.tick;
            return { ...idle, actions: { climb: true } };
          }
        }
        if (me.climbState === "idle") this.nextDecision = 0;
        return idle;
      }
      case "defend":
        return this.defend(obs);
    }
  }

  private defend(obs: Observation): DriverInput {
    const me = obs.self;
    const opponents = obs.robots.filter((r) => r.alliance !== this.alliance);
    const theirHub = this.ctx.elements.find((e): e is Sink => e.kind === "sink" && e.scoresFor !== this.alliance && e.scoresFor !== undefined);
    if (!opponents.length || !theirHub) return { vx: 0, vy: 0, omega: 0, actions: {} };
    const hc = shapeCenter(theirHub.target.shape);
    // Mark the opponent closest to their own goal (most likely about to score).
    const mark = opponents.reduce((a, b) => (Math.hypot(a.x - hc.x, a.y - hc.y) < Math.hypot(b.x - hc.x, b.y - hc.y) ? a : b));
    const toHub = Math.atan2(hc.y - mark.y, hc.x - mark.x);
    const standoff = (1 - this.profile.defenseAggression) * 1.2 + me.radius + mark.radius - 0.1;
    const goal = { x: mark.x + Math.cos(toHub) * standoff, y: mark.y + Math.sin(toHub) * standoff };
    const face = Math.atan2(mark.y - goal.y, mark.x - goal.x);
    return this.navigate(obs, goal, face, false, true);
  }

  private checkStuck(obs: Observation): void {
    const me = obs.self;
    const speed = Math.hypot(me.vx, me.vy);
    if (speed < 0.15) {
      if (this.stuckSince < 0) this.stuckSince = obs.tick;
      else if (obs.tick - this.stuckSince > obs.hz * 1.2) {
        this.blacklist.set(this.pieceKey, obs.tick + obs.hz * 4);
        this.stuckSince = -1;
        this.nextDecision = 0;
        this.path = [];
      }
    } else this.stuckSince = -1;
  }

  /** Follows a grid path to the goal and turns to the heading. Converts to tank commands when needed. */
  private navigate(obs: Observation, goal: Vec2, heading: number, settle: boolean, ignoreRobots = false): DriverInput {
    const me = obs.self;
    const dtv = me.design.chassis.drivetrain;
    const pos = { x: me.x, y: me.y };
    const grid = this.grid!;

    const replan =
      !this.pathGoal ||
      Math.hypot(goal.x - this.pathGoal.x, goal.y - this.pathGoal.y) > 0.3 ||
      obs.tick - this.pathTick > obs.hz * 0.6 ||
      this.path.length === 0;
    if (replan) {
      this.path = grid.plan(pos, goal) ?? [goal];
      this.pathGoal = goal;
      this.pathTick = obs.tick;
    }
    while (this.path.length > 1 && Math.hypot(this.path[0]!.x - pos.x, this.path[0]!.y - pos.y) < 0.35) this.path.shift();
    const wp = this.path[0] ?? goal;
    const distGoal = Math.hypot(goal.x - pos.x, goal.y - pos.y) + (this.path.length > 1 ? 0.5 : 0);

    const vmax = dtv.maxSpeed * this.profile.speedScale;
    let speed = Math.min(vmax, Math.sqrt(2 * dtv.maxAccel * 0.7 * Math.max(0, distGoal - 0.05)));
    if (!settle) speed = Math.max(speed, Math.min(vmax, 1.2));
    const dx = wp.x - pos.x;
    const dy = wp.y - pos.y;
    const d = Math.hypot(dx, dy) || 1;
    let vx = (dx / d) * speed;
    let vy = (dy / d) * speed;
    if (settle && distGoal < 0.3) {
      vx = (goal.x - pos.x) * 3;
      vy = (goal.y - pos.y) * 3;
    }
    if (!ignoreRobots)
      for (const r of obs.robots) {
        if (r.index === me.index) continue;
        const rx = pos.x - r.x;
        const ry = pos.y - r.y;
        const rd = Math.hypot(rx, ry);
        const clear = me.radius + r.radius + 0.35;
        if (rd < clear && rd > 1e-6) {
          const push = ((clear - rd) / clear) * vmax * 0.8;
          vx += (rx / rd) * push;
          vy += (ry / rd) * push;
        }
      }

    const omegaFor = (target: number) => Math.max(-1, Math.min(1, (wrapAngle(target - me.theta) * 4) / dtv.maxAngularSpeed));
    if (dtv.type === "tank") {
      const v = Math.hypot(vx, vy);
      if (v < 0.15) return { vx: 0, vy: 0, omega: omegaFor(heading), actions: {} };
      let dir = Math.atan2(vy, vx);
      let sign = 1;
      if (Math.abs(wrapAngle(dir - me.theta)) > Math.PI / 2 && distGoal < 1.5) {
        dir = wrapAngle(dir + Math.PI);
        sign = -1;
      }
      const err = wrapAngle(dir - me.theta);
      const fwd = (sign * v * Math.max(0, Math.cos(err))) / dtv.maxSpeed;
      return { vx: Math.max(-1, Math.min(1, fwd)), vy: 0, omega: omegaFor(dir), actions: {} };
    }
    const n = Math.hypot(vx, vy) / dtv.maxSpeed;
    const k = n > 1 ? 1 / n : 1;
    return { vx: (vx / dtv.maxSpeed) * k, vy: (vy / dtv.maxSpeed) * k, omega: omegaFor(heading), actions: {} };
  }
}

/** Creates an agent for robot `index` of a match, using only the match's public, static information. */
export function createAgent(match: Match, index: number, profile: DriverProfile = DEFAULT_PROFILE): Agent {
  return new Agent({ game: match.game, elements: match.elements, robot: match.robots[index]!, index, seed: match.seed }, profile);
}
