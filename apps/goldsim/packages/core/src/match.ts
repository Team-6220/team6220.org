import type { Alliance, MatchRobot, Phase, Replay, RobotDesign } from "@goldsim/schema";
import { REPLAY_SCHEMA_VERSION } from "@goldsim/schema";
import type { MatchEvent, Period } from "./events.js";
import {
  other,
  resolveElements,
  resolveObjectives,
  startPose,
  Mirror,
  type GameModule,
  type ResolvedElement,
  type ResolvedObjective,
} from "./field.js";
import {
  ACTION_NAMES,
  climbLevelOf,
  hasAction,
  quantize,
  sameQuantized,
  ZERO_QUANTIZED,
  type DriverInput,
  type QuantizedInput,
} from "./input.js";
import { clamp, G, pointInShape, polygonOverlapsShape, rayClosest, rotate, shapeCenter, shapePoints, toWorld, wrapAngle, type Pose, type Vec2 } from "./math.js";
import { commandedSpeed, crossingDistance, flightTime, groundDistance, type Entry, type ShotParams } from "./ballistics.js";
import type { ResolvedMechanism } from "./mechanisms/specs.js";
import { COLLIDE, initPhysics, RAPIER } from "./physics.js";
import { Rng } from "./rng.js";
import { bumperPolygon, checkDesignRunnable, framePolygon, mechanismFootprint, resolveMechanisms } from "./robot.js";
import { applyScoring, computeGameStats, newScoringState, rankingPoints, type RankingResult, type ScoreBreakdown, type ScoringState } from "./scoring.js";
import { ENGINE_VERSION } from "./version.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Driver {
  getInput(tick: number, obs: Observation): DriverInput;
}

export interface MatchConfig {
  game: GameModule;
  robots: MatchRobot[];
  seed: number;
  profile?: string;
  hz?: number;
  drivers?: (Driver | null | undefined)[];
  /** Record an input log for replay (default true). */
  record?: boolean;
}

export interface RobotObs {
  index: number;
  alliance: Alliance;
  x: number;
  y: number;
  theta: number;
  vx: number;
  vy: number;
  omega: number;
  height: number;
  radius: number;
}

export interface MechObs {
  id: string;
  base: string;
  deploy: number;
  spin: number;
  turret: number;
}

export interface SelfObs extends RobotObs {
  stored: number;
  ready: number;
  capacity: number;
  climbState: ClimbState;
  climbLevel: number;
  mechanisms: MechObs[];
  design: RobotDesign;
}

/** Limited, documented view of the match given to every driver (human UI, agents, path followers). */
export interface Observation {
  tick: number;
  t: number;
  hz: number;
  phase: { id: string; label: string; period: Period; robotsEnabled: boolean; timeLeft: number };
  matchTimeLeft: number;
  self: SelfObs;
  robots: RobotObs[];
  pieces: Vec2[];
  elementActive: Record<string, boolean>;
  objectives: ResolvedObjective[];
  score: Record<Alliance, number>;
}

export interface RobotView {
  index: number;
  alliance: Alliance;
  name: string;
  pose: Pose;
  bumper: Vec2[];
  frame: Vec2[];
  mechanisms: { id: string; base: string; polygon: Vec2[]; active: boolean }[];
  stored: number;
  height: number;
  climbState: ClimbState;
  climbLevel: number;
  shooterVectors: { x: number; y: number; heading: number; rangeMin: number; rangeMax: number }[];
}

export interface MatchResult {
  seed: number;
  profile: string;
  module: { id: string; version: string };
  engineVersion: string;
  score: Record<Alliance, ScoreBreakdown>;
  rp: Record<Alliance, RankingResult>;
  winner: Alliance | "tie";
  counters: Record<Alliance, Record<string, number>>;
  fouls: Record<Alliance, Record<string, number>>;
  robots: {
    index: number;
    alliance: Alliance;
    name: string;
    points: number;
    acquired: number;
    shots: number;
    scoredActive: number;
    scoredInactive: number;
    fouls: number;
    climbLevel: number;
  }[];
  gameStats: ReturnType<typeof computeGameStats>;
  coverage: { id: string; topic: string; status: string; reason?: string }[];
}

export type ClimbState = "idle" | "climbing" | "climbed" | "descending";

// ---------------------------------------------------------------------------
// Internal plain-data state (everything needed for snapshot/restore)
// ---------------------------------------------------------------------------

interface MechState {
  deploy: number; // 0..1
  spin: number; // seconds of spin accumulated
  turret: number; // radians relative to mount
  acc: number; // rate accumulator (intake / shooter / placer)
  burstTick: number; // last tick this mechanism launched
}

interface StoredPiece {
  type: string;
  readyTick: number;
}

interface RobotState {
  bodyHandle: number;
  mechColliders: Record<string, number>;
  stored: StoredPiece[];
  mech: MechState[];
  input: QuantizedInput;
  prevMask: number;
  climbState: ClimbState;
  climbT: number;
  climbLevel: number;
  climbTarget: number;
  climbStructure: string | null;
  crossedLine: Record<string, boolean>;
  g407LastTick: number;
}

interface InFlight {
  type: string;
  launchTick: number;
  ox: number;
  oy: number;
  landTick: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  roll: number;
  robot: number;
  target: string | null;
}

interface FreePiece {
  type: string;
  handle: number;
}

interface FeederState {
  stock: number;
  acc: number;
}

interface State {
  tick: number;
  phaseIndex: number;
  over: boolean;
  nextPieceId: number;
  pieces: Record<number, FreePiece>;
  pieceOrder: number[];
  inFlight: InFlight[];
  sinkQueue: { element: string; type: string; emitTick: number }[];
  feeders: Record<string, FeederState>;
  active: Record<string, boolean>;
  deactivatedTick: Record<string, number>;
  groupA: Alliance | null;
  lastPhaseEnded: boolean;
  robots: RobotState[];
  scoring: ScoringState;
  rng: number[];
  eventCount: number;
}

export interface MatchSnapshot {
  world: Uint8Array;
  state: State;
}

// ---------------------------------------------------------------------------

export class Match {
  readonly game: GameModule;
  readonly robots: MatchRobot[];
  readonly seed: number;
  readonly profile: string;
  readonly hz: number;
  readonly dt: number;
  readonly elements: ResolvedElement[];
  readonly objectives: ResolvedObjective[];
  readonly events: MatchEvent[] = [];
  readonly totalTicks: number;
  drivers: (Driver | null | undefined)[];

  private world!: InstanceType<typeof RAPIER.World>;
  private eventQueue = new RAPIER.EventQueue(false);
  private s!: State;
  private rng: Rng;
  private mirror: Mirror;
  private mechs: ResolvedMechanism[][];
  private bumpers: Vec2[][];
  private frames: Vec2[][];
  private phaseStartTicks: number[];
  private matchEndTick: number;
  private bodyToRobot = new Map<number, number>();
  private gateClearance = new Map<number, number>();
  private robotHeights: number[] = [];
  private listeners: ((e: MatchEvent) => void)[] = [];
  private recordInputs: boolean;
  private inputLog: Replay["inputs"] = [];
  private obsCache: { tick: number; pieces: Vec2[]; robots: RobotObs[] } | null = null;
  private pieceTypes: Map<string, GameModule["pieces"]["types"][number]>;

  private constructor(cfg: MatchConfig) {
    this.game = cfg.game;
    this.robots = cfg.robots;
    this.seed = cfg.seed;
    this.profile = cfg.profile ?? cfg.game.game.defaultProfile;
    this.hz = cfg.hz ?? 120;
    this.dt = 1 / this.hz;
    this.drivers = cfg.drivers ?? [];
    this.recordInputs = cfg.record ?? true;
    this.rng = new Rng(cfg.seed);
    this.mirror = new Mirror(cfg.game.field);
    this.elements = resolveElements(cfg.game.field);
    this.objectives = resolveObjectives(cfg.game.field);
    this.pieceTypes = new Map(cfg.game.pieces.types.map((p) => [p.id, p]));
    this.mechs = cfg.robots.map((r) => resolveMechanisms(r.design, cfg.game.mechanisms));
    this.bumpers = cfg.robots.map((r) => bumperPolygon(r.design));
    this.frames = cfg.robots.map((r) => framePolygon(r.design));

    let acc = 0;
    this.phaseStartTicks = cfg.game.game.timeline.phases.map((p) => {
      const start = Math.round(acc * this.hz);
      acc += p.duration;
      return start;
    });
    this.matchEndTick = Math.round(acc * this.hz);
    this.totalTicks = this.matchEndTick + Math.round(cfg.game.game.timeline.postMatchAssessment * this.hz);
  }

  static async create(cfg: MatchConfig): Promise<Match> {
    await initPhysics();
    cfg.robots.forEach((r, i) => {
      const issues = checkDesignRunnable(r.design, cfg.game.mechanisms);
      if (issues.length)
        throw new Error(`Robot ${i} ("${r.design.name}") cannot run:\n${issues.map((x) => `  ${x.path}: ${x.message}`).join("\n")}`);
    });
    const m = new Match(cfg);
    m.build();
    return m;
  }

  // -------------------------------------------------------------------------
  // World construction
  // -------------------------------------------------------------------------

  private build(): void {
    const world = new RAPIER.World({ x: 0, y: 0 });
    world.timestep = this.dt;
    this.world = world;
    const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

    const addStatic = (pts: Vec2[], groups: number) => {
      const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(pts.flatMap((p) => [p.x, p.y])));
      if (!desc) throw new Error("Degenerate field shape.");
      return world.createCollider(desc.setCollisionGroups(groups).setFriction(0.3), fixed);
    };

    const feeders: Record<string, FeederState> = {};
    for (const el of this.elements) {
      switch (el.kind) {
        case "wall":
          addStatic(shapePoints(el.shape), COLLIDE.wall);
          break;
        case "sink":
        case "climbStructure":
          if (el.solid) addStatic(shapePoints(el.shape), COLLIDE.wall);
          break;
        case "gate": {
          const c = addStatic(shapePoints(el.shape), COLLIDE.gate);
          c.setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
          this.gateClearance.set(c.handle, el.clearance);
          break;
        }
        case "feeder":
          feeders[el.id] = { stock: el.stock, acc: 0 };
          break;
      }
    }

    const robots: RobotState[] = this.robots.map((r, i) => this.buildRobot(r, i));

    this.s = {
      tick: 0,
      phaseIndex: 0,
      over: false,
      nextPieceId: 1,
      pieces: {},
      pieceOrder: [],
      inFlight: [],
      sinkQueue: [],
      feeders,
      active: {},
      deactivatedTick: {},
      groupA: null,
      lastPhaseEnded: false,
      robots,
      scoring: newScoringState(this.robots.length),
      rng: [],
      eventCount: 0,
    };

    this.placeInitialPieces();
    this.applyElementActivity(this.phases[0]!);
    this.robotHeights = this.robots.map((_, i) => this.robotHeight(i));
    this.emit({ type: "phase_start" });
  }

  private buildRobot(r: MatchRobot, i: number): RobotState {
    const d = r.design;
    const pose = startPose(this.game.field, r.alliance, r.station);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(pose.x, pose.y).setRotation(pose.theta).setCanSleep(false),
    );
    const totalMass = d.chassis.mass + d.chassis.bumpers.mass;
    const pts = this.bumpers[i]!;
    let desc = RAPIER.ColliderDesc.convexHull(new Float32Array(pts.flatMap((p) => [p.x, p.y])))!;
    desc = desc.setCollisionGroups(COLLIDE.robot).setFriction(0.4).setRestitution(0.05);
    if (d.chassis.momentOfInertia === "auto") desc = desc.setMass(totalMass);
    else desc = desc.setMassProperties(totalMass, { x: 0, y: 0 }, d.chassis.momentOfInertia);
    this.world.createCollider(desc, body);
    this.bodyToRobot.set(body.handle, i);

    const mechColliders: Record<string, number> = {};
    for (const m of this.mechs[i]!) {
      if (m.base !== "intake" && m.base !== "blocker") continue;
      const poly = mechanismFootprint(m, 1);
      const cd = RAPIER.ColliderDesc.convexHull(new Float32Array(poly.flatMap((p) => [p.x, p.y])));
      if (!cd) continue;
      const c = this.world.createCollider(
        cd.setDensity(0).setCollisionGroups(m.base === "intake" ? COLLIDE.mech : COLLIDE.robot).setFriction(0.3),
        body,
      );
      const startsOut = (m.base === "intake" ? m.p.deployTime : m.p.deployTime) === 0;
      c.setEnabled(startsOut);
      mechColliders[m.id] = c.handle;
    }

    const preloadMax = this.game.pieces.preload.max;
    const preload = Math.max(0, Math.min(Math.floor(d.preload ?? preloadMax), preloadMax, this.capacityOf(i)));
    return {
      bodyHandle: body.handle,
      mechColliders,
      stored: Array.from({ length: preload }, () => ({ type: this.game.pieces.preload.piece, readyTick: 0 })),
      mech: this.mechs[i]!.map((m) => ({ deploy: m.p.deployTime === 0 ? 1 : 0, spin: 0, turret: 0, acc: 0, burstTick: -1e9 })),
      input: ZERO_QUANTIZED,
      prevMask: 0,
      climbState: "idle",
      climbT: 0,
      climbLevel: 0,
      climbTarget: 0,
      climbStructure: null,
      crossedLine: {},
      g407LastTick: -1e9,
    };
  }

  private placeInitialPieces(): void {
    const preloaded = this.s.robots.reduce((n, r) => n + r.stored.length, 0);
    let fixed = preloaded;
    for (const el of this.elements) {
      if (el.kind === "pieceSource" && el.count !== "remainder") fixed += el.count;
      if (el.kind === "feeder") fixed += el.stock;
    }
    for (const el of this.elements) {
      if (el.kind !== "pieceSource") continue;
      const count = el.count === "remainder" ? Math.max(0, this.game.pieces.totalCount - fixed) : el.count;
      const type = this.pieceTypes.get(el.piece)!;
      for (const p of this.layoutPieces(el, count, type.radius)) this.spawnPiece(el.piece, p.x, p.y, 0, 0);
    }
  }

  private layoutPieces(el: Extract<ResolvedElement, { kind: "pieceSource" }>, count: number, radius: number): Vec2[] {
    const pts = shapePoints(el.shape);
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const out: Vec2[] = [];
    if (el.layout === "random") {
      for (let i = 0; i < count; i++) out.push({ x: this.rng.range(minX + radius, maxX - radius), y: this.rng.range(minY + radius, maxY - radius) });
      return out;
    }
    const s = 2 * radius + 0.004;
    const gap = el.gapAlongX ?? 0;
    const cx = (minX + maxX) / 2;
    const halfCols = Math.max(1, Math.floor((maxX - minX - gap) / 2 / s));
    const cols: number[] = [];
    if (gap > 0) {
      for (let c = 0; c < halfCols; c++) cols.push(cx - gap / 2 - radius - c * s, cx + gap / 2 + radius + c * s);
    } else {
      const n = Math.max(1, Math.floor((maxX - minX) / s));
      for (let c = 0; c < n; c++) cols.push(minX + radius + c * s + ((maxX - minX) - n * s) / 2);
    }
    const rows = Math.max(1, Math.floor((maxY - minY) / s));
    const y0 = minY + radius + ((maxY - minY) - rows * s) / 2;
    for (let r = 0; r < rows && out.length < count; r++)
      for (const x of cols) {
        if (out.length >= count) break;
        out.push({ x, y: y0 + r * s });
      }
    // More pieces than the grid holds: scatter the rest inside the region; physics separates overlaps.
    while (out.length < count) out.push({ x: this.rng.range(minX + radius, maxX - radius), y: this.rng.range(minY + radius, maxY - radius) });
    return out;
  }

  private spawnPiece(type: string, x: number, y: number, vx: number, vy: number): number {
    const t = this.pieceTypes.get(type)!;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y).setLinvel(vx, vy).setLinearDamping(t.linearDamping).setAngularDamping(2),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(t.radius).setMass(t.mass).setRestitution(t.restitution).setFriction(t.friction).setCollisionGroups(COLLIDE.piece),
      body,
    );
    const id = this.s.nextPieceId++;
    this.s.pieces[id] = { type, handle: body.handle };
    this.s.pieceOrder.push(id);
    return id;
  }

  private removePiece(id: number): void {
    const p = this.s.pieces[id];
    if (!p) return;
    this.world.removeRigidBody(this.world.getRigidBody(p.handle));
    delete this.s.pieces[id];
  }

  // -------------------------------------------------------------------------
  // Timeline and element activity
  // -------------------------------------------------------------------------

  get phases(): Phase[] {
    return this.game.game.timeline.phases;
  }

  get phase(): Phase {
    return this.phases[this.s.phaseIndex]!;
  }

  get tick(): number {
    return this.s.tick;
  }

  get time(): number {
    return this.s.tick * this.dt;
  }

  get isOver(): boolean {
    return this.s.over;
  }

  /** True after the last phase, while in-flight pieces are still assessed. */
  get inPostMatch(): boolean {
    return this.s.tick >= this.matchEndTick;
  }

  get robotsEnabled(): boolean {
    return !this.inPostMatch && this.phase.robotsEnabled;
  }

  get period(): Period {
    return this.inPostMatch ? "teleop" : this.phase.period;
  }

  get matchTimeLeft(): number {
    return Math.max(0, (this.matchEndTick - this.s.tick) * this.dt);
  }

  get phaseTimeLeft(): number {
    const next = this.phaseStartTicks[this.s.phaseIndex + 1] ?? this.matchEndTick;
    return Math.max(0, (next - this.s.tick) * this.dt);
  }

  get groupA(): Alliance | null {
    return this.s.groupA;
  }

  private applyElementActivity(phase: Phase): void {
    const spec = phase.elementActive ?? {};
    for (const el of this.elements) {
      if (el.kind !== "sink") continue;
      const activity = spec[el.baseId] ?? "both";
      let on = true;
      if (activity === "none") on = false;
      else if (activity === "groupA" || activity === "groupB") {
        const groupA = this.resolveGroups();
        on = el.alliance === (activity === "groupA" ? groupA : other(groupA));
      }
      const was = this.s.active[el.id];
      if (was && !on) this.s.deactivatedTick[el.id] = this.s.tick;
      this.s.active[el.id] = on;
    }
  }

  private resolveGroups(): Alliance {
    if (this.s.groupA) return this.s.groupA;
    const hookId = this.game.game.groupsHook;
    const hook = hookId ? this.game.hooks?.groups?.[hookId] : undefined;
    const groupA = hook ? hook({ counters: this.s.scoring.counters, rng: this.rng }).groupA : "blue";
    this.s.groupA = groupA;
    this.emit({ type: "groups_decided", groupA, reason: hook ? hookId! : "default (no hook)" });
    return groupA;
  }

  /** Active now, or deactivated less than activationGrace seconds ago (assessment delay). */
  isScoringActive(elementId: string): boolean {
    if (this.s.active[elementId]) return true;
    const off = this.s.deactivatedTick[elementId];
    return off !== undefined && (this.s.tick - off) * this.dt <= this.game.game.activationGrace + 1e-9;
  }

  isActive(elementId: string): boolean {
    return !!this.s.active[elementId];
  }

  private advanceTimeline(): void {
    const s = this.s;
    while (s.phaseIndex + 1 < this.phases.length && s.tick >= this.phaseStartTicks[s.phaseIndex + 1]!) {
      if (this.phase.assessClimbAtEnd) this.assessClimbs();
      this.emit({ type: "phase_end" });
      s.phaseIndex++;
      this.applyElementActivity(this.phase);
      this.emit({ type: "phase_start" });
    }
    if (s.tick >= this.matchEndTick && !s.lastPhaseEnded) {
      s.lastPhaseEnded = true;
      if (this.phase.assessClimbAtEnd) this.assessClimbs();
      this.emit({ type: "phase_end" });
    }
  }

  private assessClimbs(): void {
    this.s.robots.forEach((r, i) => {
      if (r.climbLevel >= 1 && r.climbStructure)
        this.emit({ type: "climb_assessed", robot: i, alliance: this.robots[i]!.alliance, level: r.climbLevel, structure: r.climbStructure });
    });
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  onEvent(fn: (e: MatchEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(partial: DistributiveOmit<MatchEvent, "tick" | "t" | "phase" | "period">): void {
    const e = { ...partial, tick: this.s.tick, t: this.s.tick * this.dt, phase: this.phase.id, period: this.period } as MatchEvent;
    this.events.push(e);
    this.s.eventCount = this.events.length;
    applyScoring(this.game.scoring, this.s.scoring, e);
    for (const l of this.listeners) l(e);
  }

  // -------------------------------------------------------------------------
  // Main step
  // -------------------------------------------------------------------------

  /** Advances one physics tick. */
  step(): void {
    if (this.s.over) return;
    const s = this.s;
    const enabled = this.robotsEnabled;

    // 1. Inputs
    s.robots.forEach((r, i) => {
      let q = ZERO_QUANTIZED;
      const driver = this.drivers[i];
      if (enabled && driver) q = quantize(driver.getInput(s.tick, this.observe(i)));
      r.prevMask = r.input.mask;
      if (!sameQuantized(q, r.input)) {
        r.input = q;
        if (this.recordInputs) this.inputLog.push([s.tick, i, q.vx, q.vy, q.omega, q.mask]);
      }
    });

    // 2. Mechanisms, climbing, drive
    s.robots.forEach((r, i) => {
      this.updateMechanisms(i, r, enabled);
      this.updateClimb(i, r, enabled);
      this.robotHeights[i] = this.robotHeight(i);
      this.drive(i, r, enabled);
    });

    // 3. Field elements that introduce pieces
    this.updateFeeders();
    this.updateSinkQueue();

    // 4. Physics (Rapier only runs contact-filter hooks when an event queue is passed)
    this.world.step(this.eventQueue, this.hooks);

    // 5. Post-step resolution
    s.robots.forEach((r, i) => this.acquirePieces(i, r, enabled));
    this.resolveLandings();
    this.runLineDetectors(enabled);

    // 6. Time
    s.tick++;
    this.obsCache = null;
    this.advanceTimeline();
    if (s.tick >= this.totalTicks && (s.inFlight.length === 0 || s.tick >= this.totalTicks + this.hz * 10)) {
      s.over = true;
      this.emit({ type: "match_end" });
    }
  }

  /** Runs headless until the match is over (or maxTicks). */
  runToEnd(maxTicks = Infinity): MatchResult {
    let n = 0;
    while (!this.s.over && n++ < maxTicks) this.step();
    return this.result();
  }

  private hooks = {
    filterContactPair: (c1: number, c2: number, b1: number, b2: number) => {
      const clearance = this.gateClearance.get(c1) ?? this.gateClearance.get(c2);
      if (clearance === undefined) return RAPIER.SolverFlags.COMPUTE_IMPULSE;
      const robot = this.bodyToRobot.get(b1) ?? this.bodyToRobot.get(b2);
      if (robot === undefined) return null;
      return this.robotHeights[robot]! > clearance ? RAPIER.SolverFlags.COMPUTE_IMPULSE : null;
    },
    filterIntersectionPair: () => true,
  };

  // -------------------------------------------------------------------------
  // Robots
  // -------------------------------------------------------------------------

  private body(i: number) {
    return this.world.getRigidBody(this.s.robots[i]!.bodyHandle);
  }

  robotPose(i: number): Pose {
    const b = this.body(i);
    const p = b.translation();
    return { x: p.x, y: p.y, theta: wrapAngle(b.rotation()) };
  }

  private capacityOf(i: number): number {
    const storages = this.mechs[i]!.filter((m) => m.base === "storage");
    return storages.length ? storages.reduce((n, m) => n + Math.floor(m.p.capacity!), 0) : 1;
  }

  private transferDelayTicks(i: number): number {
    return Math.round(this.mechs[i]!.filter((m) => m.base === "transfer").reduce((n, m) => n + m.p.delay!, 0) * this.hz);
  }

  robotHeight(i: number): number {
    let h = this.robots[i]!.design.chassis.height;
    const r = this.s.robots[i]!;
    this.mechs[i]!.forEach((m, k) => {
      if (m.base === "intake" && m.p.deployedHeight! > 0 && r.mech[k]!.deploy > 0.5) h = Math.max(h, m.p.deployedHeight!);
      if (m.base === "climber" && m.p.extendedHeight! > 0 && r.climbState !== "idle") h = Math.max(h, m.p.extendedHeight!);
    });
    return h;
  }

  private worldBumper(i: number, pose = this.robotPose(i)): Vec2[] {
    return this.bumpers[i]!.map((p) => toWorld(pose, p.x, p.y));
  }

  private terrainFactors(x: number, y: number): { speed: number; accel: number } {
    let speed = 1;
    let accel = 1;
    for (const el of this.elements)
      if (el.kind === "terrain" && pointInShape(x, y, el.shape)) {
        speed = Math.min(speed, el.speedFactor);
        accel = Math.min(accel, el.accelFactor);
      }
    return { speed, accel };
  }

  private drive(i: number, r: RobotState, enabled: boolean): void {
    if (r.climbState !== "idle") return;
    const b = this.body(i);
    const dtv = this.robots[i]!.design.chassis.drivetrain;
    const theta = b.rotation();
    const p = b.translation();
    const v = b.linvel();
    const terrain = this.terrainFactors(p.x, p.y);
    const maxSpeed = dtv.maxSpeed * terrain.speed;
    const q = enabled ? r.input : ZERO_QUANTIZED;
    const ix = q.vx / 127;
    const iy = q.vy / 127;
    const iw = q.omega / 127;

    // Target velocity in the field frame
    let tx = 0;
    let ty = 0;
    if (dtv.type === "tank") {
      const fwd = clamp(ix, -1, 1) * maxSpeed;
      tx = Math.cos(theta) * fwd;
      ty = Math.sin(theta) * fwd;
    } else {
      let mag = Math.hypot(ix, iy);
      const sx = mag > 1 ? ix / mag : ix;
      const sy = mag > 1 ? iy / mag : iy;
      tx = sx * maxSpeed;
      ty = sy * maxSpeed;
      if (dtv.type === "mecanum") {
        const local = rotate(tx, ty, -theta);
        const k = dtv.strafeFactor ?? 0.8;
        const w = rotate(local.x, local.y * k, theta);
        tx = w.x;
        ty = w.y;
      }
      mag = 0;
    }

    // Acceleration capped by motor limit and by traction (pushing force <= traction * weight)
    const mass = b.mass();
    const accelCap = Math.min(dtv.maxAccel * terrain.accel, dtv.traction * G) * this.dt;
    let dx = tx - v.x;
    let dy = ty - v.y;
    const dm = Math.hypot(dx, dy);
    if (dm > accelCap) {
      dx *= accelCap / dm;
      dy *= accelCap / dm;
    }
    b.applyImpulse({ x: dx * mass, y: dy * mass }, true);

    const targetW = clamp(iw, -1, 1) * dtv.maxAngularSpeed;
    const angCap = (dtv.maxAngularAccel ?? dtv.maxAngularSpeed * 4) * this.dt;
    const dw = clamp(targetW - b.angvel(), -angCap, angCap);
    b.applyTorqueImpulse(dw * b.principalInertia(), true);
  }

  private pressed(r: RobotState, name: (typeof ACTION_NAMES)[number]): boolean {
    const bit = 1 << ACTION_NAMES.indexOf(name);
    return (r.input.mask & bit) !== 0 && (r.prevMask & bit) === 0;
  }

  private updateMechanisms(i: number, r: RobotState, enabled: boolean): void {
    const q = enabled ? r.input : ZERO_QUANTIZED;
    const pose = this.robotPose(i);
    this.mechs[i]!.forEach((m, k) => {
      const st = r.mech[k]!;
      switch (m.base) {
        case "intake": {
          const want = hasAction(q, "intake") && r.climbState === "idle";
          this.deployToward(r, m, st, want, m.p.deployTime!);
          break;
        }
        case "blocker": {
          const want = m.p.deployTime === 0 || hasAction(q, "deploy");
          this.deployToward(r, m, st, want, m.p.deployTime!);
          break;
        }
        case "shooter":
          this.updateShooter(i, r, m, st, q, pose);
          break;
        case "placer":
          if (hasAction(q, "place") && r.stored.length) {
            st.acc = Math.min(st.acc + m.p.rate! * this.dt, 1.5);
            while (st.acc >= 1 && r.stored.some((p) => p.readyTick <= this.s.tick)) {
              st.acc -= 1;
              const idx = r.stored.findIndex((p) => p.readyTick <= this.s.tick);
              const piece = r.stored.splice(idx, 1)[0]!;
              const at = toWorld(pose, m.mount.x + Math.cos(m.mount.theta) * 0.15, m.mount.y + Math.sin(m.mount.theta) * 0.15);
              const h = pose.theta + m.mount.theta;
              this.spawnPiece(piece.type, at.x, at.y, Math.cos(h) * m.p.ejectSpeed!, Math.sin(h) * m.p.ejectSpeed!);
            }
          } else st.acc = 0;
          break;
        default:
          break;
      }
    });
  }

  private deployToward(r: RobotState, m: ResolvedMechanism, st: MechState, want: boolean, time: number): void {
    if (time <= 0) {
      st.deploy = 1;
    } else {
      const step = this.dt / time;
      st.deploy = clamp(st.deploy + (want ? step : -step), 0, 1);
    }
    const handle = r.mechColliders[m.id];
    if (handle !== undefined) this.world.getCollider(handle).setEnabled(st.deploy > 0.5);
  }

  /** Own-alliance scoring targets (sinks whose scoresFor is this robot's alliance). */
  private ownTargets(alliance: Alliance) {
    return this.elements.filter((e): e is Extract<ResolvedElement, { kind: "sink" }> => e.kind === "sink" && e.scoresFor === alliance);
  }

  private updateShooter(i: number, r: RobotState, m: ResolvedMechanism, st: MechState, q: QuantizedInput, pose: Pose): void {
    const alliance = this.robots[i]!.alliance;
    const origin = toWorld(pose, m.mount.x, m.mount.y);

    // Turret auto-aim toward the nearest own target within range of motion
    if (m.p.turretRange! > 0) {
      const target = this.ownTargets(alliance)[0];
      if (target) {
        const tc = target.target.shape.type === "polygon" ? target.target.shape.points[0]! : target.target.shape;
        const desired = wrapAngle(Math.atan2(tc.y - origin.y, tc.x - origin.x) - pose.theta - m.mount.theta);
        const goal = clamp(desired, -m.p.turretRange!, m.p.turretRange!);
        st.turret += clamp(goal - st.turret, -m.p.turretSpeed! * this.dt, m.p.turretSpeed! * this.dt);
      }
    }

    const shooting = hasAction(q, "shoot") && r.climbState === "idle";
    st.spin = shooting ? Math.min(st.spin + this.dt, m.p.spinUpTime!) : Math.max(0, st.spin - this.dt * 2);
    if (!shooting) {
      st.acc = 0;
      return;
    }
    if (st.spin < m.p.spinUpTime! - 1e-9) return;
    st.acc = Math.min(st.acc + m.p.ballsPerSecond! * this.dt, 1.5);
    while (st.acc >= 1) {
      const idx = r.stored.findIndex((p) => p.readyTick <= this.s.tick);
      if (idx < 0) {
        st.acc = Math.min(st.acc, 1);
        break;
      }
      st.acc -= 1;
      const piece = r.stored.splice(idx, 1)[0]!;
      this.launch(i, r, m, st, piece.type, origin, pose.theta + m.mount.theta + st.turret);
    }
  }

  /**
   * Projectile ballistics (PRD §7.6, equations in ballistics.ts). The shooter's flywheel picks the speed for the
   * distance to the goal it is pointed at (capped by exit speed and its aim window); heading spread, speed error,
   * and the robot's own velocity then decide where the piece actually comes down.
   */
  private launch(i: number, r: RobotState, m: ResolvedMechanism, st: MechState, type: string, origin: Vec2, aim: number): void {
    const alliance = this.robots[i]!.alliance;
    const p: ShotParams = {
      exitSpeed: m.p.exitSpeed!,
      launchAngle: m.p.launchAngle!,
      launchHeight: m.p.launchHeight!,
      rangeMin: m.p.rangeMin!,
      rangeMax: Math.max(m.p.rangeMax!, m.p.rangeMin!),
    };
    const pieceRadius = this.pieceTypes.get(type)?.radius ?? 0;

    // The goal the shooter is pointed at (closest along the aim line, within a generous cone).
    const ax = Math.cos(aim);
    const ay = Math.sin(aim);
    let aimed: { el: Extract<ResolvedElement, { kind: "sink" }>; along: number; center: Vec2; radius: number; height: number; entry: Entry } | null = null;
    for (const el of this.elements) {
      if (el.kind !== "sink") continue;
      const ts = el.target.shape;
      const center = shapeCenter(ts);
      const radius = ts.type === "circle" ? ts.radius : Math.max(...shapePoints(ts).map((q) => Math.hypot(q.x - center.x, q.y - center.y)));
      const { along, perp } = rayClosest(origin.x, origin.y, ax, ay, center.x, center.y);
      if (along <= 0 || perp > radius + Math.max(0.3, along * 0.12)) continue;
      if (!aimed || along < aimed.along)
        aimed = { el, along, center, radius, height: el.target.height ?? 0, entry: el.target.entry ?? "top" };
    }

    const command = aimed ? commandedSpeed(aimed.along, aimed.height, p, aimed.entry) : commandedSpeed(p.rangeMax, 0, p, "front");
    const heading = aim + m.p.spread! * this.rng.normal();
    const speed = Math.max(0.1, command * (1 + m.p.speedError! * this.rng.normal()));
    const dx = Math.cos(heading);
    const dy = Math.sin(heading);
    const rv = this.body(i).linvel();
    const at = (x: number) => {
      const t = flightTime(x, speed, p.launchAngle);
      return { x: origin.x + dx * x + rv.x * t, y: origin.y + dy * x + rv.y * t, t };
    };

    let scored: { el: Extract<ResolvedElement, { kind: "sink" }>; t: number } | null = null;
    if (aimed) {
      const crossings = aimed.entry === "top" ? (["descending"] as const) : (["ascending", "descending"] as const);
      for (const which of crossings) {
        const x = crossingDistance(speed, aimed.height, p, which);
        if (x === null) continue;
        const q = at(x);
        const ts = aimed.el.target.shape;
        const inside =
          ts.type === "circle" ? Math.hypot(q.x - ts.x, q.y - ts.y) <= Math.max(0, ts.radius - pieceRadius) : pointInShape(q.x, q.y, ts);
        if (inside) {
          scored = { el: aimed.el, t: q.t };
          break;
        }
      }
    }

    const ground = at(groundDistance(speed, p));
    const landing = scored ? { x: scored.el.target.shape.type === "circle" ? scored.el.target.shape.x : ground.x, y: scored.el.target.shape.type === "circle" ? scored.el.target.shape.y : ground.y, t: scored.t } : ground;
    this.s.inFlight.push({
      type,
      launchTick: this.s.tick,
      ox: origin.x,
      oy: origin.y,
      landTick: this.s.tick + Math.max(1, Math.round(landing.t * this.hz)),
      x: landing.x,
      y: landing.y,
      dx,
      dy,
      roll: speed * Math.cos(p.launchAngle) * 0.25,
      robot: i,
      target: scored ? scored.el.id : null,
    });
    this.emit({ type: "shot_launched", robot: i, alliance, x: origin.x, y: origin.y, heading, target: aimed?.el.id ?? null, hit: scored !== null });

    // G407-style detector: launching at your own target while not partly in the required zone
    if (aimed && aimed.el.alliance === alliance) this.checkLaunchZone(i, r, aimed.el.baseId);
    st.burstTick = this.s.tick;
  }

  private checkLaunchZone(i: number, r: RobotState, targetBase: string): void {
    const alliance = this.robots[i]!.alliance;
    for (const rule of this.game.rules.rules) {
      const d = rule.detector;
      if (rule.status === "not_implemented" || d?.type !== "launchOutsideZone" || d.target !== targetBase) continue;
      const zone = this.elements.find((e) => e.baseId === d.zone && (e.alliance ?? alliance) === alliance);
      if (!zone) continue;
      const inside = polygonOverlapsShape(this.worldBumper(i), zone.shape);
      const sameSequence = this.s.tick - r.g407LastTick <= Math.round(0.5 * this.hz);
      if (!inside) {
        if (!sameSequence) this.emit({ type: "foul", robot: i, alliance, rule: rule.id, severity: rule.penalty ?? "MINOR" });
        r.g407LastTick = this.s.tick;
      }
    }
  }

  private updateClimb(i: number, r: RobotState, enabled: boolean): void {
    const climber = this.mechs[i]!.find((m) => m.base === "climber");
    if (!climber || !enabled) return;
    const alliance = this.robots[i]!.alliance;
    const b = this.body(i);
    const toggle = this.pressed(r, "climb");

    if (r.climbState === "idle" && toggle) {
      const bumper = this.worldBumper(i);
      const structure = this.elements.find(
        (e): e is Extract<ResolvedElement, { kind: "climbStructure" }> =>
          e.kind === "climbStructure" && (e.alliance ?? alliance) === alliance && polygonOverlapsShape(bumper, e.engageZone),
      );
      if (!structure) return;
      const structMax = Math.max(...structure.levels.map((l) => l.level));
      const req = climbLevelOf(r.input);
      r.climbTarget = Math.min(req === 0 ? Infinity : req, climber.p.maxLevel!, structMax);
      r.climbState = "climbing";
      r.climbT = 0;
      r.climbStructure = structure.id;
      b.setLinvel({ x: 0, y: 0 }, true);
      b.setAngvel(0, true);
      b.lockTranslations(true, true);
      b.lockRotations(true, true);
      this.emit({ type: "climb_started", robot: i, alliance, structure: structure.id, targetLevel: r.climbTarget });
      return;
    }
    if (r.climbState === "climbing" || r.climbState === "climbed") {
      if (toggle) {
        r.climbState = "descending";
        r.climbT = 0;
        return;
      }
      if (r.climbState === "climbing") {
        r.climbT += this.dt;
        const times = [climber.p.level1Time!, climber.p.level2Time!, climber.p.level3Time!];
        let level = 0;
        for (let L = 1; L <= r.climbTarget; L++) if (r.climbT >= times[L - 1]! - 1e-9) level = L;
        if (level > r.climbLevel) {
          r.climbLevel = level;
          this.emit({ type: "climb_level", robot: i, alliance, level });
        }
        if (r.climbLevel >= r.climbTarget) r.climbState = "climbed";
      }
      return;
    }
    if (r.climbState === "descending") {
      r.climbT += this.dt;
      if (r.climbT >= climber.p.descendTime!) {
        r.climbState = "idle";
        r.climbLevel = 0;
        r.climbStructure = null;
        b.lockTranslations(false, true);
        b.lockRotations(false, true);
        this.emit({ type: "climb_released", robot: i, alliance });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Pieces
  // -------------------------------------------------------------------------

  private acquirePieces(i: number, r: RobotState, enabled: boolean): void {
    if (!enabled) return;
    const capacity = this.capacityOf(i);
    const pose = this.robotPose(i);
    this.mechs[i]!.forEach((m, k) => {
      if (m.base !== "intake") return;
      const st = r.mech[k]!;
      if (!hasAction(r.input, "intake") || st.deploy < 1 || r.stored.length >= capacity || r.climbState !== "idle") {
        st.acc = 0;
        return;
      }
      st.acc = Math.min(st.acc + m.p.rate! * this.dt, 1.5);
      if (st.acc < 1) return;
      // Roller contact region in the chassis frame, grown by the piece radius (contact = touching).
      const c = Math.cos(m.mount.theta);
      const sn = Math.sin(m.mount.theta);
      const depth = m.p.rollerDepth!;
      const halfW = m.p.width! / 2;
      for (const id of this.s.pieceOrder) {
        if (st.acc < 1 || r.stored.length >= capacity) break;
        const piece = this.s.pieces[id];
        if (!piece) continue;
        const rad = this.pieceTypes.get(piece.type)!.radius;
        const t = this.world.getRigidBody(piece.handle).translation();
        // piece in chassis frame, then mount frame
        const lx = (t.x - pose.x) * Math.cos(-pose.theta) - (t.y - pose.y) * Math.sin(-pose.theta);
        const ly = (t.x - pose.x) * Math.sin(-pose.theta) + (t.y - pose.y) * Math.cos(-pose.theta);
        const mx = (lx - m.mount.x) * c + (ly - m.mount.y) * sn;
        const my = -(lx - m.mount.x) * sn + (ly - m.mount.y) * c;
        if (mx < -rad * 0.5 || mx > depth + rad || Math.abs(my) > halfW + rad * 0.5) continue;
        st.acc -= 1;
        this.removePiece(id);
        r.stored.push({ type: piece.type, readyTick: this.s.tick + this.transferDelayTicks(i) });
        this.emit({ type: "piece_acquired", robot: i, alliance: this.robots[i]!.alliance, piece: piece.type, source: "field" });
      }
    });
    if (this.s.pieceOrder.length > 2 * Object.keys(this.s.pieces).length + 64)
      this.s.pieceOrder = this.s.pieceOrder.filter((id) => this.s.pieces[id]);
  }

  private resolveLandings(): void {
    const s = this.s;
    if (!s.inFlight.length) return;
    const L = this.game.field.length;
    const W = this.game.field.width;
    const remaining: InFlight[] = [];
    for (const f of s.inFlight) {
      if (f.landTick > s.tick) {
        remaining.push(f);
        continue;
      }
      const shooterAlliance = this.robots[f.robot]!.alliance;
      if (f.target) {
        const el = this.elements.find((e) => e.id === f.target) as Extract<ResolvedElement, { kind: "sink" }>;
        const scoresFor = el.scoresFor ?? shooterAlliance;
        this.emit({
          type: "piece_scored",
          robot: scoresFor === shooterAlliance ? f.robot : null,
          alliance: scoresFor,
          target: el.id,
          targetBase: el.baseId,
          active: this.isScoringActive(el.id),
          piece: f.type,
        });
        if (el.emit) s.sinkQueue.push({ element: el.id, type: f.type, emitTick: s.tick + Math.round(el.emit.delay * this.hz) });
        continue;
      }
      const out = f.x < 0 || f.x > L || f.y < 0 || f.y > W;
      this.emit({ type: "piece_landed", robot: f.robot, alliance: shooterAlliance, x: f.x, y: f.y, outOfField: out });
      if (out) {
        for (const rule of this.game.rules.rules)
          if (rule.detector?.type === "pieceOutOfField" && rule.status !== "not_implemented")
            this.emit({ type: "foul", robot: f.robot, alliance: shooterAlliance, rule: rule.id, severity: rule.penalty ?? "MINOR" });
        this.returnToFeeder(shooterAlliance);
        continue;
      }
      const p = this.pushOutOfSolids(f.x, f.y, f.dx, f.dy);
      this.spawnPiece(f.type, p.x, p.y, f.dx * f.roll, f.dy * f.roll);
    }
    s.inFlight = remaining;
  }

  /** Moves a landing point back along its path until it is outside solid elements. */
  private pushOutOfSolids(x: number, y: number, dx: number, dy: number): Vec2 {
    for (let k = 0; k < 40; k++) {
      const inside = this.elements.some(
        (e) => (e.kind === "wall" || ((e.kind === "sink" || e.kind === "climbStructure") && e.solid)) && pointInShape(x, y, e.shape),
      );
      if (!inside) break;
      x -= dx * 0.05;
      y -= dy * 0.05;
    }
    const L = this.game.field.length;
    const W = this.game.field.width;
    return { x: clamp(x, 0.1, L - 0.1), y: clamp(y, 0.1, W - 0.1) };
  }

  private returnToFeeder(alliance: Alliance): void {
    const feeder = this.elements.find((e): e is Extract<ResolvedElement, { kind: "feeder" }> => e.kind === "feeder" && e.alliance === alliance);
    if (!feeder) return;
    const st = this.s.feeders[feeder.id]!;
    st.stock = Math.min(feeder.capacity, st.stock + 1);
  }

  private updateFeeders(): void {
    for (const el of this.elements) {
      if (el.kind !== "feeder") continue;
      const st = this.s.feeders[el.id]!;
      let on = st.stock > 0 && !this.inPostMatch && (this.period !== "auto" || el.enabledInAuto === true) && this.phase.robotsEnabled;
      if (on && el.mode === "onDemand") {
        const zone = el.triggerZone ?? el.shape;
        on = this.robots.some((r, i) => {
          if (r.alliance !== (el.alliance ?? r.alliance)) return false;
          const p = this.robotPose(i);
          return pointInShape(p.x, p.y, zone);
        });
      }
      if (!on) {
        st.acc = 0;
        continue;
      }
      st.acc = Math.min(st.acc + el.rate * this.dt, 1.5);
      while (st.acc >= 1 && st.stock > 0) {
        st.acc -= 1;
        st.stock--;
        const h = el.exit.theta + el.accuracy * this.rng.normal();
        this.spawnPiece(this.game.pieces.preload.piece, el.exit.x, el.exit.y, Math.cos(h) * el.speed, Math.sin(h) * el.speed);
        this.emit({ type: "piece_emitted", source: el.id, x: el.exit.x, y: el.exit.y });
      }
    }
  }

  private updateSinkQueue(): void {
    const s = this.s;
    if (!s.sinkQueue.length) return;
    const keep: State["sinkQueue"] = [];
    for (const q of s.sinkQueue) {
      if (q.emitTick > s.tick) {
        keep.push(q);
        continue;
      }
      const el = this.elements.find((e) => e.id === q.element) as Extract<ResolvedElement, { kind: "sink" }>;
      const exits = el.emit!.exits;
      const exit = exits[this.rng.int(exits.length)]!;
      const h = exit.theta + el.emit!.spread * (this.rng.next() * 2 - 1);
      this.spawnPiece(q.type, exit.x, exit.y, Math.cos(h) * exit.speed, Math.sin(h) * exit.speed);
      this.emit({ type: "piece_emitted", source: el.id, x: exit.x, y: exit.y });
    }
    s.sinkQueue = keep;
  }

  private runLineDetectors(enabled: boolean): void {
    if (!enabled) return;
    for (const rule of this.game.rules.rules) {
      const d = rule.detector;
      if (d?.type !== "crossLine" || rule.status === "not_implemented" || !d.periods.includes(this.period)) continue;
      this.robots.forEach((robot, i) => {
        const r = this.s.robots[i]!;
        const pts = this.worldBumper(i);
        const lx = this.mirror.lineX(d.lineX, robot.alliance);
        const xs = pts.map((p) => p.x);
        const crossed =
          robot.alliance === "blue"
            ? (d.completely ? Math.min(...xs) : Math.max(...xs)) > lx
            : (d.completely ? Math.max(...xs) : Math.min(...xs)) < lx;
        if (crossed && !r.crossedLine[rule.id])
          this.emit({ type: "foul", robot: i, alliance: robot.alliance, rule: rule.id, severity: rule.penalty ?? "MINOR" });
        r.crossedLine[rule.id] = crossed;
      });
    }
  }

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------

  private sharedObs() {
    if (this.obsCache && this.obsCache.tick === this.s.tick) return this.obsCache;
    const pieces = this.piecePositions();
    const robots: RobotObs[] = this.robots.map((r, i) => {
      const b = this.body(i);
      const p = b.translation();
      const v = b.linvel();
      return {
        index: i,
        alliance: r.alliance,
        x: p.x,
        y: p.y,
        theta: wrapAngle(b.rotation()),
        vx: v.x,
        vy: v.y,
        omega: b.angvel(),
        height: this.robotHeights[i]!,
        radius: Math.max(...this.bumpers[i]!.map((q) => Math.hypot(q.x, q.y))),
      };
    });
    this.obsCache = { tick: this.s.tick, pieces, robots };
    return this.obsCache;
  }

  observe(i: number): Observation {
    const shared = this.sharedObs();
    const r = this.s.robots[i]!;
    const self: SelfObs = {
      ...shared.robots[i]!,
      stored: r.stored.length,
      ready: r.stored.filter((p) => p.readyTick <= this.s.tick).length,
      capacity: this.capacityOf(i),
      climbState: r.climbState,
      climbLevel: r.climbLevel,
      mechanisms: this.mechs[i]!.map((m, k) => ({ id: m.id, base: m.base, deploy: r.mech[k]!.deploy, spin: r.mech[k]!.spin, turret: r.mech[k]!.turret })),
      design: this.robots[i]!.design,
    };
    return {
      tick: this.s.tick,
      t: this.time,
      hz: this.hz,
      phase: { id: this.phase.id, label: this.phase.label, period: this.period, robotsEnabled: this.robotsEnabled, timeLeft: this.phaseTimeLeft },
      matchTimeLeft: this.matchTimeLeft,
      self,
      robots: shared.robots,
      pieces: shared.pieces,
      elementActive: { ...this.s.active },
      objectives: this.objectives,
      score: { blue: this.s.scoring.score.blue.total, red: this.s.scoring.score.red.total },
    };
  }

  piecePositions(): Vec2[] {
    const out: Vec2[] = [];
    for (const id of this.s.pieceOrder) {
      const p = this.s.pieces[id];
      if (!p) continue;
      const t = this.world.getRigidBody(p.handle).translation();
      out.push({ x: t.x, y: t.y });
    }
    return out;
  }

  /** Pieces in the air: launch point, landing point, and flight progress 0..1 (for drawing). */
  inFlightPieces(): { fromX: number; fromY: number; toX: number; toY: number; progress: number; scoring: boolean }[] {
    return this.s.inFlight.map((f) => ({
      fromX: f.ox,
      fromY: f.oy,
      toX: f.x,
      toY: f.y,
      progress: clamp((this.s.tick - f.launchTick) / Math.max(1, f.landTick - f.launchTick), 0, 1),
      scoring: f.target !== null,
    }));
  }

  robotViews(): RobotView[] {
    return this.robots.map((robot, i) => {
      const pose = this.robotPose(i);
      const r = this.s.robots[i]!;
      const hasIntake = hasAction(r.input, "intake");
      return {
        index: i,
        alliance: robot.alliance,
        name: robot.design.name,
        pose,
        bumper: this.worldBumper(i, pose),
        frame: this.frames[i]!.map((p) => toWorld(pose, p.x, p.y)),
        mechanisms: this.mechs[i]!.map((m, k) => ({
          id: m.id,
          base: m.base,
          polygon: mechanismFootprint(m, r.mech[k]!.deploy).map((p) => toWorld(pose, p.x, p.y)),
          active: m.base === "intake" ? hasIntake && r.mech[k]!.deploy >= 1 : m.base === "shooter" ? r.mech[k]!.spin > 0 : false,
        })),
        stored: r.stored.length,
        height: this.robotHeights[i]!,
        climbState: r.climbState,
        climbLevel: r.climbLevel,
        shooterVectors: this.mechs[i]!.flatMap((m, k) =>
          m.base === "shooter"
            ? [{ ...toWorld(pose, m.mount.x, m.mount.y), heading: pose.theta + m.mount.theta + r.mech[k]!.turret, rangeMin: m.p.rangeMin!, rangeMax: m.p.rangeMax! }]
            : [],
        ),
      };
    });
  }

  feederStock(): Record<string, number> {
    return Object.fromEntries(Object.entries(this.s.feeders).map(([k, v]) => [k, v.stock]));
  }

  get score(): Record<Alliance, ScoreBreakdown> {
    return this.s.scoring.score;
  }

  get counters(): Record<Alliance, Record<string, number>> {
    return this.s.scoring.counters;
  }

  result(): MatchResult {
    const sc = this.s.scoring;
    const profile = this.game.game.thresholdProfiles[this.profile] ?? {};
    const rp = rankingPoints(this.game.scoring, sc, profile);
    const winner = sc.score.blue.total > sc.score.red.total ? "blue" : sc.score.red.total > sc.score.blue.total ? "red" : "tie";
    const per = (pred: (e: MatchEvent) => boolean) => {
      const counts = Array(this.robots.length).fill(0);
      for (const e of this.events) if (pred(e) && "robot" in e && typeof e.robot === "number") counts[e.robot]++;
      return counts;
    };
    const acquired = per((e) => e.type === "piece_acquired");
    const shots = per((e) => e.type === "shot_launched");
    const active = per((e) => e.type === "piece_scored" && e.active);
    const inactive = per((e) => e.type === "piece_scored" && !e.active);
    const fouls = per((e) => e.type === "foul");
    const climb = Array(this.robots.length).fill(0);
    for (const e of this.events) if (e.type === "climb_assessed" && e.period === "teleop") climb[e.robot] = e.level;
    return {
      seed: this.seed,
      profile: this.profile,
      module: { id: this.game.game.id, version: this.game.game.version },
      engineVersion: ENGINE_VERSION,
      score: structuredClone(sc.score),
      rp,
      winner,
      counters: structuredClone(sc.counters),
      fouls: structuredClone(sc.fouls),
      robots: this.robots.map((r, i) => ({
        index: i,
        alliance: r.alliance,
        name: r.design.name,
        points: sc.robotPoints[i]!,
        acquired: acquired[i],
        shots: shots[i],
        scoredActive: active[i],
        scoredInactive: inactive[i],
        fouls: fouls[i],
        climbLevel: climb[i],
      })),
      gameStats: computeGameStats(this.game.stats, this.events, this.robots.length),
      coverage: this.game.rules.rules.map(({ id, topic, status, reason }) => ({ id, topic, status, reason })),
    };
  }

  // -------------------------------------------------------------------------
  // Replay and snapshots
  // -------------------------------------------------------------------------

  replay(): Replay {
    return {
      schemaVersion: REPLAY_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      module: { id: this.game.game.id, version: this.game.game.version },
      seed: this.seed,
      hz: this.hz,
      profile: this.profile,
      robots: this.robots,
      actionNames: [...ACTION_NAMES],
      inputs: [...this.inputLog],
      durationTicks: this.s.tick,
      recordedAt: new Date().toISOString(),
    };
  }

  snapshot(): MatchSnapshot {
    this.s.rng = this.rng.getState();
    return { world: this.world.takeSnapshot(), state: structuredClone(this.s) };
  }

  restore(snap: MatchSnapshot): void {
    this.world.free();
    this.world = RAPIER.World.restoreSnapshot(snap.world);
    this.world.timestep = this.dt;
    this.s = structuredClone(snap.state);
    this.rng.setState(this.s.rng);
    this.events.length = this.s.eventCount;
    this.inputLog = this.inputLog.filter((e) => e[0] < this.s.tick);
    this.obsCache = null;
    this.robotHeights = this.robots.map((_, i) => this.robotHeight(i));
  }

  /** Frees the physics world. */
  dispose(): void {
    this.world.free();
    this.eventQueue.free();
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
