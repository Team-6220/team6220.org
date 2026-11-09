/**
 * Simulated drivers (PRD §11).
 *
 * OBJECTIVE NAMING CONVENTION (Stay Gold: follow this in every future game module so agents work unchanged)
 * Agents never hard-code a season. They find what they need in the game module by these names:
 *   - field.json objective "towerClimb" (mirrored): pose where a robot stands to climb, facing the climb structure.
 *     Agents use it and two side slots ~0.95 m to either side.
 *   - field.json objective "outpost" (mirrored): pose to receive pieces from the human-player feeder, facing away
 *     from the feeder exit (the intake faces the feeder).
 *   - field.json objective "hubShot" (mirrored): a known-good shooting pose (informational; agents compute their own).
 *   - pieceSource element "depot" (mirrored): the alliance's own piece store (for the "depot" pickup preference).
 *   - zone tag "alliance" on each alliance's home zone (the zone shots must be taken from), tag "neutral" on the
 *     neutral zone (for the "neutral" pickup preference).
 *   - sink elements with scoresFor = alliance are that alliance's scoring targets.
 * If a module lacks one of these, the related behavior is skipped rather than failing.
 */
import {
  pointInShape,
  resolveMechanisms,
  Rng,
  shapeCenter,
  shotEnvelope,
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

/** Names agents look up in game modules (see the convention above). */
export const OBJ = {
  climb: "towerClimb",
  feeder: "outpost",
  shot: "hubShot",
  depot: "depot",
  allianceZoneTag: "alliance",
  neutralZoneTag: "neutral",
} as const;

type Mode = "idle" | "collect" | "shoot" | "wait" | "harass" | "climb" | "autoClimb" | "descend" | "defend" | "feed";

type Sink = Extract<ResolvedElement, { kind: "sink" }>;

/**
 * Parameterized policy (PRD §11.1): a priority selector over behaviors (endgame, cycle, defense, feeding).
 * Produces the same DriverInput a human would.
 */
export class Agent implements Driver {
  readonly profile: DriverProfile;
  /** This match's form: the profile's knobs with per-match variation applied (see sampleForm). */
  readonly eff: DriverProfile;
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
  private shotJitter = 0;
  private aimStallSince = -1;
  /** Slowly drifting aim error (rad), updated every tick. */
  private wobble = 0;
  private hesitateUntil = -1;
  /** Where in the shooting window this driver likes to shoot from (0 = close, 1 = far); fixed per match. */
  private distPref = 0.2;
  private nextJockey = -1;
  /** Sideways nudge (m) applied to the staging spot; flips sign each time so the robot really moves. */
  private stageOffset = 0;
  /** Match times (s) when a mishap starts, drawn once per match, and when the current one ends. */
  private mishapTimes: { at: number; len: number }[] = [];
  private mishapUntil = -1;
  private nextWeave = -1;
  private weaveOffset = 0;
  private cachedWindow?: { min: number; max: number };

  constructor(ctx: AgentContext, profile: DriverProfile = DEFAULT_PROFILE) {
    this.ctx = ctx;
    this.profile = profile;
    this.alliance = ctx.robot.alliance;
    this.rng = new Rng((ctx.seed ^ Math.imul(ctx.index + 1, 0x9e3779b9)) >>> 0);
    // Separate stream, so a driver's form doesn't depend on how the match plays out.
    const formRng = new Rng((ctx.seed ^ Math.imul(ctx.index + 7, 0x85ebca6b) ^ 0x5bd1e995) >>> 0);
    this.eff = sampleForm(profile, formRng);
    this.distPref = 0.05 + 0.45 * formRng.next();
    this.mishapTimes = drawMishaps(this.eff.mishaps, ctx.game.game.timeline.phases.reduce((t, ph) => t + ph.duration, 0), formRng);
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
      (e): e is Extract<ResolvedElement, { kind: "zone" }> => e.kind === "zone" && e.alliance === this.alliance && (e.tags ?? []).includes(OBJ.allianceZoneTag),
    );
  }

  get role(): DriverProfile["role"] {
    if (this.eff.role !== "auto") return this.eff.role;
    if (this.shooter && this.intake) return this.eff.pickup === "outpost" ? "feeder" : "scorer";
    return "defender";
  }

  getInput(tick: number, obs: Observation): DriverInput {
    const me = obs.self;
    this.grid ??= navGridFor(this.ctx.game.field, this.ctx.elements, me.radius, me.height);
    if (tick >= this.nextDecision) {
      const before = this.mode;
      this.decide(obs);
      this.nextDecision = tick + Math.max(1, Math.round(this.eff.reactionTime * obs.hz * (0.6 + 0.8 * this.rng.next())));
      // Humans sometimes pause between tasks (never during the endgame climb).
      if (this.mode !== before && !this.isClimbing() && this.rng.next() < this.eff.hesitation * 0.6)
        this.hesitateUntil = tick + Math.round(obs.hz * (0.3 + this.rng.next() * 1.2 * (0.3 + this.eff.hesitation)));
    }
    this.updateWobble(obs);
    if (this.inMishap(obs)) return { vx: 0, vy: 0, omega: 0, actions: {} };
    if (tick < this.hesitateUntil && !this.isClimbing()) return { vx: 0, vy: 0, omega: 0, actions: {} };
    const out = this.act(obs);
    // Climb is a press: keep the button edge-triggered.
    const climbNow = !!out.actions.climb;
    if (climbNow && this.lastClimbButton) out.actions.climb = false;
    this.lastClimbButton = !!out.actions.climb;
    return out;
  }

  /** True while the robot is stopped by a mistake or minor breakdown. Never starts mid-climb. */
  private inMishap(obs: Observation): boolean {
    if (obs.t < this.mishapUntil) return true;
    const next = this.mishapTimes[0];
    if (!next || obs.t < next.at || !obs.phase.robotsEnabled) return false;
    this.mishapTimes.shift();
    if (obs.self.climbState !== "idle" || this.isClimbing()) return false;
    this.mishapUntil = obs.t + next.len;
    return true;
  }

  private isClimbing(): boolean {
    return this.mode === "climb" || this.mode === "autoClimb" || this.mode === "descend";
  }

  /** Ornstein-Uhlenbeck aim drift: each shot in a volley points a little differently. */
  private updateWobble(obs: Observation): void {
    const dt = 1 / obs.hz;
    const tau = 0.35;
    this.wobble += (-this.wobble / tau) * dt + this.eff.aimError * Math.sqrt((2 * dt) / tau) * this.rng.normal();
  }

  /** Total aim offset the driver is currently steering with. */
  private get aimOffset(): number {
    return this.aimBias + this.wobble;
  }

  /**
   * Distances (m, from the shooter to the near edge of the target) where a shot can score.
   * Uses the core's shot envelope when available so exit speed limits reach; otherwise the design's range window.
   */
  private shotWindow(): { min: number; max: number } {
    if (this.cachedWindow) return this.cachedWindow;
    const s = this.shooter!;
    const aim = { min: s.p.rangeMin!, max: Math.max(s.p.rangeMax!, s.p.rangeMin!) };
    let win = aim;
    if (this.hub) {
      const env = shotEnvelope(
        { exitSpeed: s.p.exitSpeed!, launchAngle: s.p.launchAngle!, launchHeight: s.p.launchHeight!, rangeMin: aim.min, rangeMax: aim.max },
        this.hub.target.height ?? 0,
        this.hub.target.entry ?? "top",
      );
      // If nothing in the window can reach the goal, keep trying with the aim window (the sim will show the misses).
      if (env.reachable) win = { min: env.minDistance, max: env.maxDistance };
    }
    this.cachedWindow = win;
    return win;
  }

  /**
   * Distance (to the target center) this driver likes to shoot from. Accuracy is only reliable from about 2.5 m out
   * (closer shots are steep and fussy) up to about 5 m (farther shots are sensitive to speed error), inside whatever
   * the shooter can physically reach. Each driver has a favorite spot in that band.
   */
  private shotDistance(): number {
    const win = this.shotWindow();
    let lo = Math.max(win.min + 0.3, 2.5);
    let hi = Math.min(win.max - 0.4, 5);
    if (hi < lo) {
      lo = win.min + 0.3;
      hi = Math.max(lo, win.max - 0.4);
    }
    return lo + this.distPref * (hi - lo);
  }

  /** Seconds until this robot's own scoring target is active again, from the static timeline. 0 if active now. */
  private secondsUntilActive(obs: Observation): number {
    if (!this.hub || obs.elementActive[this.hub.id] !== false) return 0;
    const phases = this.ctx.game.game.timeline.phases;
    const idx = phases.findIndex((ph) => ph.id === obs.phase.id);
    if (idx < 0) return 0;
    const cur = phases[idx]!.elementActive?.[this.hub.baseId];
    // Inactive in a groupA phase means we are in group B, and the other way round.
    const mine = cur === "groupA" ? "groupB" : cur === "groupB" ? "groupA" : null;
    let t = obs.phase.timeLeft;
    for (let k = idx + 1; k < phases.length; k++) {
      const act = phases[k]!.elementActive?.[this.hub.baseId] ?? "both";
      if (act === "both" || (mine ? act === mine : act === "groupA" || act === "groupB")) return t;
      t += phases[k]!.duration;
    }
    return Infinity;
  }

  /** Seconds to get back to the shooting spot from here (plus a little margin). */
  private returnTime(obs: Observation): number {
    const speed = Math.max(0.5, obs.self.design.chassis.drivetrain.maxSpeed * this.eff.speedScale * 0.6);
    const spot = this.hubCenter;
    const d = Math.max(0, Math.hypot(spot.x - obs.self.x, spot.y - obs.self.y) - 2.5);
    return d / speed + 1.5;
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
    if (this.climber && this.eff.climb && teleop && obs.matchTimeLeft <= this.timeToClimb(obs, this.climber.p.maxLevel!)) {
      this.mode = "climb";
      return;
    }
    if (this.climber && this.eff.autoClimb && !teleop && obs.phase.timeLeft <= this.timeToClimb(obs, 1) - this.eff.endgameBuffer + 0.7) {
      this.mode = "autoClimb";
      return;
    }
    if (me.climbState !== "idle") return;
    this.lockedSlot = null;

    if (this.role === "defender") {
      this.mode = teleop ? "defend" : "idle";
      return;
    }

    const hubActive = this.hub ? obs.elementActive[this.hub.id] !== false : false;
    const threshold = Math.max(1, Math.ceil(me.capacity * this.eff.shootThreshold));
    const wantsShoot =
      !!this.shooter &&
      me.ready > 0 &&
      (me.stored >= threshold || (prev === "shoot" && me.stored > 0) || (!teleop && obs.phase.timeLeft < 9) || (!this.intake && me.stored > 0));

    if (wantsShoot && (hubActive || this.eff.shootWhenInactive)) {
      if (prev !== "shoot") this.aimBias = this.eff.aimError * 0.6 * this.rng.normal();
      this.mode = "shoot";
      this.planShot(obs);
      return;
    }
    if (me.stored >= me.capacity && this.shooter) {
      // Full, but nothing legal to shoot at yet (own goal closed, or pieces still transferring): never just sit.
      this.planWait(obs, hubActive, prev);
      return;
    }
    if (this.intake) {
      if (this.role === "feeder" && this.planFeed(obs)) return;
      if (this.planCollect(obs)) return;
    }
    if (this.shooter && me.stored > 0) this.planWait(obs, hubActive, prev);
    else this.mode = "idle";
  }

  /**
   * Holding pieces with nothing legal to shoot at. In order of preference:
   *  1. Goal opens soon (or we are only waiting for pieces to transfer): hold station at a legal shooting spot,
   *     making small position adjustments instead of freezing.
   *  2. Goal stays closed for a while and this driver likes defense: harass opponents, then head back in time.
   * TODO(learned policy): this is where a policy learned from recorded human matches would plug in, e.g. shuttling
   * pieces to a teammate or into the Alliance Zone while the goal is closed.
   */
  private planWait(obs: Observation, hubActive: boolean, prev: Mode): void {
    const until = hubActive ? 0 : this.secondsUntilActive(obs);
    const budget = this.returnTime(obs) + 2;
    const teleop = obs.phase.period === "teleop";
    const liking = this.eff.defenseAggression >= 0.6;
    const staying = prev === "harass" ? until > budget : until > budget + 4;
    const someoneToHarass = obs.robots.some((r) => r.alliance !== this.alliance);
    if (!hubActive && teleop && liking && staying && someoneToHarass) {
      this.mode = "harass";
      return;
    }
    this.mode = "wait";
    // Small adjustments every couple of seconds, so a staged robot is never frozen in place.
    if (obs.tick >= this.nextJockey) {
      const sign = this.stageOffset > 0 ? -1 : 1;
      this.stageOffset = sign * (0.25 + 0.25 * this.rng.next());
      this.nextJockey = obs.tick + Math.round(obs.hz * (1.5 + this.rng.next()));
    }
    this.planShot(obs);
    // Slide the staging spot sideways (perpendicular to the line to the target), staying legal.
    const dx = this.target.x - this.hubCenter.x;
    const dy = this.target.y - this.hubCenter.y;
    const len = Math.hypot(dx, dy) || 1;
    const nudged = { x: this.target.x - (dy / len) * this.stageOffset, y: this.target.y + (dx / len) * this.stageOffset };
    if (this.grid!.isFree(nudged) && (!this.zone || pointInShape(nudged.x, nudged.y, this.zone.shape))) {
      this.target = nudged;
      this.heading = this.aimHeading(nudged);
    }
  }

  private timeToClimb(obs: Observation, level: number): number {
    const slot = this.climbSlot(obs);
    if (!slot || !this.climber) return 0;
    const d = Math.hypot(slot.x - obs.self.x, slot.y - obs.self.y) * 1.5;
    const speed = obs.self.design.chassis.drivetrain.maxSpeed * this.eff.speedScale * 0.5;
    const times = [this.climber.p.level1Time!, this.climber.p.level2Time!, this.climber.p.level3Time!];
    // Teammates already at the structure make the last approach slower.
    const o = obs.objectives.find((x) => x.baseId === OBJ.climb && x.alliance === this.alliance);
    const crowd = o ? obs.robots.filter((r) => r.index !== obs.self.index && r.alliance === this.alliance && Math.hypot(r.x - o.pose.x, r.y - o.pose.y) < 2).length : 0;
    // Travel + staging/turning + climb + the driver's reserve.
    return d / speed + 2 + crowd * 1.5 + times[Math.max(0, Math.min(2, level - 1))]! + this.eff.endgameBuffer;
  }

  private lockedSlot: { x: number; y: number; theta: number } | null = null;

  /** Climb positions beside the climb objective; picks the nearest one no other robot is using. */
  private climbSlot(obs: Observation): { x: number; y: number; theta: number } | null {
    if (this.lockedSlot) return this.lockedSlot;
    const o = obs.objectives.find((x) => x.baseId === OBJ.climb && x.alliance === this.alliance);
    if (!o) return null;
    const slots = [0, -0.95, 0.95].map((off) => ({
      x: o.pose.x - Math.sin(o.pose.theta) * off,
      y: o.pose.y + Math.cos(o.pose.theta) * off,
      theta: o.pose.theta,
    }));
    const me = obs.self;
    const free = slots.filter((s) => !obs.robots.some((r) => r.index !== me.index && Math.hypot(r.x - s.x, r.y - s.y) < 0.6));
    const pool = free.length ? free : slots;
    // Outer slots first when equally close, so a late climber can still reach the middle.
    const pick = pool.reduce((a, b) => (Math.hypot(a.x - me.x, a.y - me.y) - (a === slots[0] ? 0 : 0.3) <= Math.hypot(b.x - me.x, b.y - me.y) - (b === slots[0] ? 0 : 0.3) ? a : b));
    if (Math.hypot(pick.x - me.x, pick.y - me.y) < 1.5) this.lockedSlot = pick;
    return pick;
  }

  /** Shooting pose inside the own Alliance Zone, within the shooter's range window, facing the target. */
  private planShot(obs: Observation): void {
    const me = obs.self;
    const D = this.shotDistance();
    let ang = Math.atan2(me.y - this.hubCenter.y, me.x - this.hubCenter.x);
    // Keep to the own side of the target.
    const homeAngle = this.alliance === "blue" ? Math.PI : 0;
    const maxOff = 1.1;
    // Teammates spread out around the target by station so they don't park in each other's way.
    const spread = [0, -0.5, 0.5][this.ctx.robot.station % 3]!;
    const off = wrapAngle(ang - homeAngle) * 0.5 + spread + this.shotJitter;
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
    return wrapAngle(theta + this.aimOffset);
  }

  private planCollect(obs: Observation): boolean {
    const me = obs.self;
    const intake = this.intake!;
    const reach = intake.mount.x + intake.p.rollerDepth! / 2;
    const teleop = obs.phase.period === "teleop";
    const cl = this.ctx.game.field.centerLineX;
    const ownSide = (x: number) => (this.alliance === "blue" ? x < cl - me.radius - 0.1 : x > cl + me.radius + 0.1);
    const depot = this.ctx.elements.find((e) => e.baseId === OBJ.depot && e.alliance === this.alliance);
    const neutral = this.ctx.elements.find((e) => e.kind === "zone" && (e.tags ?? []).includes(OBJ.neutralZoneTag));
    const candidates: { p: Vec2; cost: number }[] = [];
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
      if (this.eff.pickup === "depot" && depot && pointInShape(piece.x, piece.y, depot.shape)) cost -= 3;
      if (this.eff.pickup === "neutral" && neutral && pointInShape(piece.x, piece.y, neutral.shape)) cost -= 1.5;
      // Robots nearby make a piece less attractive.
      for (const r of obs.robots) if (r.index !== me.index && Math.hypot(r.x - piece.x, r.y - piece.y) < r.radius + 0.3) cost += 2;
      candidates.push({ p: piece, cost });
    }
    const best = this.choose(candidates);
    if (!best) return false;
    this.mode = "collect";
    const dir = Math.atan2(best.p.y - me.y, best.p.x - me.x);
    // Aim through the piece so the roller sweeps it in.
    // Line-up error: the driver aims a little to the side of the piece (sometimes enough to miss it).
    const miss = this.eff.drivingError * this.rng.normal();
    this.target = {
      x: best.p.x + Math.cos(dir) * 0.15 - Math.cos(dir) * reach - Math.sin(dir) * miss,
      y: best.p.y + Math.sin(dir) * 0.15 - Math.sin(dir) * reach + Math.cos(dir) * miss,
    };
    this.heading = wrapAngle(dir - intake.mount.theta);
    this.pieceKey = `${best.p.x.toFixed(1)},${best.p.y.toFixed(1)}`;
    return true;
  }

  /** Picks the cheapest option most of the time; decisionNoise is a softmax temperature (in cost units, about meters). */
  private choose<T extends { cost: number }>(options: T[]): T | null {
    if (!options.length) return null;
    options.sort((a, b) => a.cost - b.cost);
    const temp = this.eff.decisionNoise;
    if (temp <= 1e-6) return options[0]!;
    const top = options.slice(0, 25);
    const min = top[0]!.cost;
    const w = top.map((o) => Math.exp(-(o.cost - min) / temp));
    let r = this.rng.next() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < top.length; i++) {
      r -= w[i]!;
      if (r <= 0) return top[i]!;
    }
    return top[top.length - 1]!;
  }

  private planFeed(obs: Observation): boolean {
    const o = obs.objectives.find((x) => x.baseId === OBJ.feeder && x.alliance === this.alliance);
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
        const s = this.shooter!;
        const turret = s.p.turretRange! > 0;
        const origin = toWorld({ x: me.x, y: me.y, theta: me.theta }, s.mount.x, s.mount.y);
        const toTarget = Math.atan2(this.hubCenter.y - origin.y, this.hubCenter.x - origin.x);
        const turretAngle = me.mechanisms.find((m) => m.id === s.id)?.turret ?? 0;
        const aimErr = Math.abs(wrapAngle(toTarget + this.aimOffset - (me.theta + s.mount.theta + turretAngle)));
        const range = Math.hypot(this.hubCenter.x - origin.x, this.hubCenter.y - origin.y);
        const win = this.shotWindow();
        const inRange = range > win.min + 0.05 && range < win.max - 0.1;
        const inZone = !this.zone || pointInShape(me.x, me.y, this.zone.shape);
        const impatience = this.eff.impatience;
        const aimed = aimErr < (turret ? this.eff.aimTolerance * 1.5 : this.eff.aimTolerance) * (1 + impatience);
        // Patient drivers wait until the robot has settled; impatient ones fire on the move.
        const settled = Math.hypot(me.vx, me.vy) < 0.1 + 1.8 * impatience * impatience && Math.abs(me.omega) < 0.15 + 2 * impatience * impatience;
        // Fire whenever a shot is legal and lined up, even if pushed off the planned pose.
        out.actions.shoot = this.mode === "shoot" && inZone && inRange && aimed && settled;
        // Lined up but unable to fire (blocked, pushed, out of zone): pick a different spot.
        const slow = Math.hypot(me.vx, me.vy) < 0.2;
        if (this.mode === "shoot" && !out.actions.shoot && (posErr < 0.8 || slow)) {
          if (this.aimStallSince < 0) this.aimStallSince = obs.tick;
          else if (obs.tick - this.aimStallSince > obs.hz * 2) {
            this.shotJitter = (this.rng.next() - 0.5) * 1.2;
            this.aimStallSince = -1;
            this.planShot(obs);
          }
        } else this.aimStallSince = -1;
        if (posErr < 0.8 && !turret) out.omega = Math.max(-1, Math.min(1, (wrapAngle(this.aimHeading({ x: me.x, y: me.y }) - me.theta) * 5) / me.design.chassis.drivetrain.maxAngularSpeed));
        out.actions.intake = this.mode === "wait" ? false : me.stored < me.capacity;
        return out;
      }
      case "climb":
      case "autoClimb": {
        const slot = this.climbSlot(obs);
        if (!slot) return idle;
        if (me.climbState !== "idle") return { ...idle, actions: { climbLevel: this.mode === "autoClimb" ? 1 : this.climber!.p.maxLevel! } };
        // Line up on a staging point straight out from the slot, then drive straight in.
        const fx = Math.cos(slot.theta);
        const fy = Math.sin(slot.theta);
        const along = (slot.x - me.x) * fx + (slot.y - me.y) * fy;
        const lateral = Math.abs(-(slot.x - me.x) * fy + (slot.y - me.y) * fx);
        const staged = lateral < 0.15 || along < 0.25;
        const goal = staged ? slot : { x: slot.x - fx * 1.0, y: slot.y - fy * 1.0, theta: slot.theta };
        const finalApproach = staged && Math.hypot(slot.x - me.x, slot.y - me.y) < 1.1;
        const out = this.navigate(obs, goal, slot.theta, true, finalApproach);
        const close = Math.hypot(slot.x - me.x, slot.y - me.y) < 0.2 && Math.abs(wrapAngle(slot.theta - me.theta)) < 0.2;
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
      case "harass":
        return this.defend(obs);
    }
  }

  private defend(obs: Observation): DriverInput {
    const me = obs.self;
    // Late in the match, leave opponents at their climb position alone (Tower-protection style rules, e.g. REBUILT G420).
    const theirClimb = obs.objectives.find((o) => o.baseId === OBJ.climb && o.alliance !== this.alliance);
    const protectedNow = (r: { x: number; y: number }) =>
      obs.phase.period === "teleop" && obs.matchTimeLeft < 30 && !!theirClimb && Math.hypot(r.x - theirClimb.pose.x, r.y - theirClimb.pose.y) < 2.2;
    const opponents = obs.robots.filter((r) => r.alliance !== this.alliance && !protectedNow(r));
    const theirHub = this.ctx.elements.find((e): e is Sink => e.kind === "sink" && e.scoresFor !== this.alliance && e.scoresFor !== undefined);
    if (!opponents.length || !theirHub) return { vx: 0, vy: 0, omega: 0, actions: {} };
    const hc = shapeCenter(theirHub.target.shape);
    // Mark the opponent closest to their own goal (most likely about to score).
    const mark = opponents.reduce((a, b) => (Math.hypot(a.x - hc.x, a.y - hc.y) < Math.hypot(b.x - hc.x, b.y - hc.y) ? a : b));
    const toHub = Math.atan2(hc.y - mark.y, hc.x - mark.x);
    const standoff = (1 - this.eff.defenseAggression) * 1.2 + me.radius + mark.radius - 0.1;
    // Real defenders weave across the shooting lane instead of freezing.
    if (obs.tick >= this.nextWeave) {
      const sign = this.weaveOffset > 0 ? -1 : 1;
      this.weaveOffset = sign * (0.3 + 0.35 * this.eff.defenseAggression * this.rng.next() + 0.15 * this.rng.next());
      this.nextWeave = obs.tick + Math.round(obs.hz * (1.5 + this.rng.next()));
    }
    const goal = {
      x: mark.x + Math.cos(toHub) * standoff - Math.sin(toHub) * this.weaveOffset,
      y: mark.y + Math.sin(toHub) * standoff + Math.cos(toHub) * this.weaveOffset,
    };
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
      obs.tick - this.pathTick > obs.hz * 0.4 ||
      this.path.length === 0;
    const robotOnLine = obs.robots.some((r) => {
      if (r.index === me.index) return false;
      const dx = goal.x - pos.x;
      const dy = goal.y - pos.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((r.x - pos.x) * dx + (r.y - pos.y) * dy) / len2));
      return Math.hypot(r.x - (pos.x + t * dx), r.y - (pos.y + t * dy)) < (me.radius + r.radius) * 0.75;
    });
    if (Math.hypot(goal.x - pos.x, goal.y - pos.y) < 1.2 && !robotOnLine) {
      // Final approach: go straight in. Goals may sit against structure (e.g. a climb pose touching the Tower),
      // inside the grid's conservative margin; physics stops the robot at contact.
      this.path = [goal];
      this.pathGoal = goal;
    } else if (replan) {
      // Slow robots nearby are planned around; moving ones are handled by local avoidance.
      const parked = ignoreRobots
        ? []
        : obs.robots
            .filter((r) => r.index !== me.index && Math.hypot(r.vx, r.vy) < 0.6 && Math.hypot(r.x - pos.x, r.y - pos.y) < 6)
            .map((r) => ({ x: r.x, y: r.y, r: r.radius }));
      this.path = grid.plan(pos, goal, parked) ?? grid.plan(pos, goal) ?? [goal];
      this.pathGoal = goal;
      this.pathTick = obs.tick;
    }
    while (this.path.length > 1 && Math.hypot(this.path[0]!.x - pos.x, this.path[0]!.y - pos.y) < 0.35) this.path.shift();
    const wp = this.path[0] ?? goal;
    const distGoal = Math.hypot(goal.x - pos.x, goal.y - pos.y) + (this.path.length > 1 ? 0.5 : 0);

    const vmax = dtv.maxSpeed * this.eff.speedScale;
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
        const ax = r.x - pos.x;
        const ay = r.y - pos.y;
        const rd = Math.hypot(ax, ay);
        // Bounding radii overstate square robots; use a tighter clearance.
        const clear = (me.radius + r.radius) * 0.8 + 0.25;
        if (rd >= clear || rd < 1e-6) continue;
        const ux = ax / rd;
        const uy = ay / rd;
        const toward = vx * ux + vy * uy;
        if (toward > 0) {
          // Replace the approach component with a sidestep (always to the same side, so two robots pass cleanly).
          vx -= ux * toward;
          vy -= uy * toward;
          vx += -uy * toward * 0.8;
          vy += ux * toward * 0.8;
        }
        if (rd < me.radius + r.radius + 0.05) {
          vx -= ux * 0.4;
          vy -= uy * 0.4;
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

const clampTo = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Draws a driver's form for one match: each knob is the profile's typical value times a random factor
 * (spread set by formVariation), plus endgame timing error. Deterministic for a given rng.
 */
export function sampleForm(p: DriverProfile, rng: Rng): DriverProfile {
  const fv = Math.max(0, p.formVariation ?? 0);
  const n = () => clampTo(rng.normal(), -2.5, 2.5);
  const mult = () => Math.exp(fv * n());
  // One shared good-day/bad-day factor plus per-knob noise, so a good day is good across the board.
  const day = n();
  const dayMult = (sign: number) => Math.exp(fv * 0.9 * day * sign) * mult();
  return {
    ...p,
    speedScale: clampTo(p.speedScale * dayMult(1), 0.3, 1),
    reactionTime: clampTo(p.reactionTime * dayMult(-1), 0.05, 1.5),
    aimTolerance: clampTo(p.aimTolerance * dayMult(-1), 0.005, 0.3),
    aimError: clampTo((p.aimError ?? 0) * dayMult(-1), 0, 0.3),
    decisionNoise: clampTo((p.decisionNoise ?? 0) * dayMult(-1), 0, 5),
    hesitation: clampTo((p.hesitation ?? 0) * dayMult(-1), 0, 1),
    impatience: clampTo((p.impatience ?? 0) * mult(), 0, 1),
    drivingError: clampTo((p.drivingError ?? 0) * dayMult(-1), 0, 0.6),
    shootThreshold: clampTo(p.shootThreshold + 0.5 * fv * n(), 0.1, 1),
    endgameBuffer: Math.max(-1.5, p.endgameBuffer + (p.endgameTiming ?? 0) * n()),
    mishaps: clampTo((p.mishaps ?? 0) * dayMult(-1), 0, 6),
  };
}

/**
 * Draws this match's mishaps: a Poisson number of them (mean = rate), at random times, each lasting a few seconds
 * (median about 5 s) with a long tail, so now and then a robot loses a big chunk of the match. Deterministic per rng.
 */
export function drawMishaps(rate: number, matchSeconds: number, rng: Rng): { at: number; len: number }[] {
  if (rate <= 0) return [];
  let k = 0;
  const limit = Math.exp(-rate);
  for (let prod = rng.next(); prod > limit && k < 12; prod *= rng.next()) k++;
  const out = Array.from({ length: k }, () => ({
    at: 4 + rng.next() * Math.max(1, matchSeconds - 14),
    len: Math.min(60, 6 * Math.exp(1.0 * clampTo(rng.normal(), -2, 2.5))),
  }));
  return out.sort((a, b) => a.at - b.at);
}
