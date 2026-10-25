import type { Driver, DriverInput, Observation } from "@goldsim/core";
import type { NamedCommand } from "@goldsim/schema";
import type { PPAuto, PPCommand, PPPath } from "./format.js";
import { PathFollower, type FollowerOptions } from "./follower.js";
import { samplePath, type SampledPath } from "./sample.js";

export interface AutoOptions {
  /** Resolves a path by name (the .path file name without extension). */
  lookupPath: (name: string) => PPPath | undefined;
  /** The game module's named commands (named-commands.json). */
  namedCommands: Record<string, NamedCommand>;
  /** User mappings that add to or replace the game's. null removes a mapping. */
  overrides?: Record<string, NamedCommand | null>;
  follower?: Omit<FollowerOptions, "onMarker">;
}

interface Ctx {
  tick: number;
  hz: number;
  obs: Observation;
  exec: AutoExecutor;
}

interface Node {
  start(ctx: Ctx): void;
  /** Returns true when finished. */
  update(ctx: Ctx): boolean;
  /** Called once when the node stops (finished or interrupted). */
  stop(interrupted: boolean, ctx: Ctx): void;
}

/** Merges game named commands with user overrides. */
export function namedCommandMap(game: Record<string, NamedCommand>, overrides: Record<string, NamedCommand | null> = {}): Record<string, NamedCommand> {
  const out: Record<string, NamedCommand> = { ...game };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

/** Runs a .auto command tree as a Driver (PRD §16.2, §16.4). Actions come out as DriverInput.actions. */
export class AutoExecutor implements Driver {
  readonly unmapped = new Set<string>();
  readonly warnings: string[] = [];
  readonly log: { tick: number; message: string }[] = [];
  finished = false;

  /** Actions set by on/off commands; they persist until changed. */
  persistent: Record<string, boolean | number> = {};
  /** Actions held only for the current tick (timed and press commands). */
  held: Record<string, boolean | number> = {};
  drive: DriverInput | null = null;
  private driveWriters = 0;

  private root: Node;
  private rootStarted = false;
  private background: Node[] = [];
  private paths = new Map<string, SampledPath>();
  readonly commands: Record<string, NamedCommand>;
  private warnedOnce = new Set<string>();

  constructor(
    readonly auto: PPAuto,
    readonly opts: AutoOptions,
  ) {
    this.commands = namedCommandMap(opts.namedCommands, opts.overrides);
    this.root = this.build(auto.command);
  }

  warnOnce(key: string, message: string): void {
    if (this.warnedOnce.has(key)) return;
    this.warnedOnce.add(key);
    this.warnings.push(message);
  }

  sampled(name: string): SampledPath | null {
    let s = this.paths.get(name);
    if (!s) {
      const p = this.opts.lookupPath(name);
      if (!p) return null;
      s = samplePath(p);
      this.paths.set(name, s);
    }
    return s;
  }

  build(c: PPCommand): Node {
    switch (c.type) {
      case "sequential":
        return new SequentialNode(c.commands.map((x) => this.build(x)));
      case "parallel":
        return new GroupNode(c.commands.map((x) => this.build(x)), "all");
      case "race":
        return new GroupNode(c.commands.map((x) => this.build(x)), "any");
      case "deadline":
        return new GroupNode(c.commands.map((x) => this.build(x)), "first");
      case "wait":
        return new WaitNode(c.waitTime);
      case "named":
        return new NamedNode(c.name);
      case "path":
        return new PathNode(c.pathName);
      case "unsupported":
        this.warnOnce(`unsupported:${c.originalType}`, `Command type "${c.originalType}" is not supported and was skipped.`);
        return new WaitNode(0);
    }
  }

  /** Starts a marker command in the background; returns a handle to cancel it (zoned markers). */
  spawn(c: PPCommand, ctx: Ctx): Node {
    const n = this.build(c);
    n.start(ctx);
    this.background.push(n);
    return n;
  }

  cancel(n: Node, ctx: Ctx): void {
    const i = this.background.indexOf(n);
    if (i >= 0) {
      this.background.splice(i, 1);
      n.stop(true, ctx);
    }
  }

  setDrive(input: DriverInput): void {
    this.driveWriters++;
    if (this.driveWriters > 1) this.warnOnce("multi-path", "Two paths ran at the same time; only the last one drives the robot.");
    this.drive = input;
  }

  getInput(tick: number, obs: Observation): DriverInput {
    const ctx: Ctx = { tick, hz: obs.hz, obs, exec: this };
    this.held = {};
    this.drive = null;
    this.driveWriters = 0;
    if (!this.rootStarted) {
      this.rootStarted = true;
      this.checkStart(obs);
      this.root.start(ctx);
    }
    if (!this.finished && this.root.update(ctx)) {
      this.root.stop(false, ctx);
      this.finished = true;
      this.log.push({ tick, message: "auto finished" });
    }
    this.background = this.background.filter((n) => {
      if (!n.update(ctx)) return true;
      n.stop(false, ctx);
      return false;
    });
    const d = this.drive ?? { vx: 0, vy: 0, omega: 0, actions: {} };
    return { vx: d.vx, vy: d.vy, omega: d.omega, actions: { ...this.persistent, ...this.held } };
  }

  private checkStart(obs: Observation): void {
    let start: { x: number; y: number } | null = this.auto.startingPose;
    if (!start) {
      const first = firstPath(this.auto.command);
      const p = first ? this.opts.lookupPath(first) : undefined;
      if (p) start = p.waypoints[0]!.anchor;
    }
    if (!start) return;
    const d = Math.hypot(start.x - obs.self.x, start.y - obs.self.y);
    if (d > 0.5)
      this.warnings.push(
        `The robot starts ${d.toFixed(2)} m from this auto's starting pose. The sim does not reset odometry; the follower drives to the path from where the robot is.`,
      );
  }
}

function firstPath(c: PPCommand): string | null {
  if (c.type === "path") return c.pathName;
  if (c.type === "sequential" || c.type === "parallel" || c.type === "race" || c.type === "deadline")
    for (const x of c.commands) {
      const p = firstPath(x);
      if (p) return p;
    }
  return null;
}

class SequentialNode implements Node {
  private i = 0;
  constructor(private children: Node[]) {}
  start(ctx: Ctx) {
    this.i = 0;
    this.children[0]?.start(ctx);
  }
  /** WPILib semantics: when a child finishes, the next one initializes this tick and first runs next tick. */
  update(ctx: Ctx): boolean {
    if (this.i >= this.children.length) return true;
    const c = this.children[this.i]!;
    if (!c.update(ctx)) return false;
    c.stop(false, ctx);
    this.i++;
    this.children[this.i]?.start(ctx);
    return this.i >= this.children.length;
  }
  stop(interrupted: boolean, ctx: Ctx) {
    if (interrupted && this.i < this.children.length) this.children[this.i]!.stop(true, ctx);
  }
}

class GroupNode implements Node {
  private done: boolean[] = [];
  constructor(
    private children: Node[],
    private until: "all" | "any" | "first",
  ) {}
  start(ctx: Ctx) {
    this.done = this.children.map(() => false);
    for (const c of this.children) c.start(ctx);
  }
  update(ctx: Ctx): boolean {
    this.children.forEach((c, i) => {
      if (this.done[i]) return;
      if (c.update(ctx)) {
        this.done[i] = true;
        c.stop(false, ctx);
      }
    });
    if (!this.children.length) return true;
    if (this.until === "all") return this.done.every(Boolean);
    if (this.until === "any") return this.done.some(Boolean);
    return this.done[0]!;
  }
  stop(_interrupted: boolean, ctx: Ctx) {
    // Anything still running is interrupted (race losers, deadline followers, or a cancelled group).
    this.children.forEach((c, i) => {
      if (!this.done[i]) {
        this.done[i] = true;
        c.stop(true, ctx);
      }
    });
  }
}

class WaitNode implements Node {
  private startTick = -1;
  constructor(private seconds: number) {}
  start() {
    this.startTick = -1;
  }
  update(ctx: Ctx): boolean {
    // Timed commands count from their first run and occupy exactly T * hz ticks.
    if (this.startTick < 0) this.startTick = ctx.tick;
    return (ctx.tick - this.startTick + 1) / ctx.hz >= this.seconds - 1e-9;
  }
  stop() {}
}

class NamedNode implements Node {
  private startTick = -1;
  private cmd: NamedCommand | undefined;
  constructor(private name: string | null) {}
  start(ctx: Ctx) {
    this.startTick = -1;
    const exec = ctx.exec;
    if (!this.name) {
      exec.warnOnce("named-empty", "A named command has no name and was skipped.");
      return;
    }
    this.cmd = exec.commands[this.name];
    if (!this.cmd) {
      exec.unmapped.add(this.name);
      exec.warnOnce(`unmapped:${this.name}`, `Named command "${this.name}" is not mapped to a sim action; it does nothing.`);
      return;
    }
    exec.log.push({ tick: ctx.tick, message: `named ${this.name}` });
    if (this.cmd.state) exec.persistent[this.cmd.action] = this.cmd.state === "on";
  }
  update(ctx: Ctx): boolean {
    const c = this.cmd;
    if (!c || c.state) return true;
    if (this.startTick < 0) this.startTick = ctx.tick;
    ctx.exec.held[c.action] = true;
    if (c.level !== undefined) ctx.exec.held.climbLevel = c.level;
    if (c.durationSeconds !== undefined) return (ctx.tick - this.startTick + 1) / ctx.hz >= c.durationSeconds - 1e-9;
    return true; // press: held for exactly one tick
  }
  stop() {}
}

class PathNode implements Node {
  private follower: PathFollower | null = null;
  private zoned = new Map<string, Node>();
  constructor(private name: string | null) {}
  start(ctx: Ctx) {
    const exec = ctx.exec;
    const sampled = this.name ? exec.sampled(this.name) : null;
    if (!sampled) {
      exec.warnOnce(`missing:${this.name}`, `Path "${this.name ?? "(unnamed)"}" was not found and was skipped.`);
      return;
    }
    exec.log.push({ tick: ctx.tick, message: `path ${this.name}` });
    this.follower = new PathFollower(sampled, {
      ...exec.opts.follower,
      onMarker: (m, phase) => {
        const key = `${m.name}@${m.s}`;
        if (phase === "start" && m.command) {
          exec.log.push({ tick: ctx.tick, message: `marker ${m.name}` });
          const n = exec.spawn(m.command, ctx);
          if (m.endS !== null) this.zoned.set(key, n);
        } else if (phase === "end") {
          const n = this.zoned.get(key);
          if (n) exec.cancel(n, ctx);
          this.zoned.delete(key);
        }
      },
    });
  }
  update(ctx: Ctx): boolean {
    const f = this.follower;
    if (!f) return true;
    const input = f.getInput(ctx.tick, ctx.obs);
    if (f.finished) {
      if (f.state === "abandoned") ctx.exec.log.push({ tick: ctx.tick, message: `path ${this.name} abandoned (blocked)` });
      return true;
    }
    ctx.exec.setDrive(input);
    return false;
  }
  stop(_interrupted: boolean, ctx: Ctx) {
    for (const n of this.zoned.values()) ctx.exec.cancel(n, ctx);
    this.zoned.clear();
  }
}
