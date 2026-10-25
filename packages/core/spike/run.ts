// Phase 0 spike: compare Rapier2D (deterministic build) and Planck.js on the same scene.
// Scene: REBUILT-sized field walls, 6 robots, 500 balls, zero gravity (top-down), 120 Hz.
// Measures: same-seed determinism (state hash over 3 runs) and headless throughput.
//
// Usage: npm run spike [-- --seconds 160 --pieces 500 --runs 3]

import RAPIER from "@dimforge/rapier2d-deterministic-compat";
import * as planck from "planck";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ""), process.argv[i + 1]!);

const SECONDS = Number(args.get("seconds") ?? 160);
const PIECES = Number(args.get("pieces") ?? 500);
const RUNS = Number(args.get("runs") ?? 3);
const HZ = Number(args.get("hz") ?? 120);
const DT = 1 / HZ;
const STEPS = SECONDS * HZ;

const FIELD_L = 16.54;
const FIELD_W = 8.07;
const ROBOT_HALF = 0.43; // 27 in frame + bumpers, half-width in m
const ROBOT_MASS = 60;
const BALL_R = 0.075;
const BALL_MASS = 0.22;
const MAX_ACCEL = 8;
const MAX_SPEED = 4.5;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over the raw float bits of all body states. */
function hashFloats(values: number[], h = 2166136261): number {
  const buf = new Float64Array(values);
  const bytes = new Uint8Array(buf.buffer);
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

interface Layout {
  robots: { x: number; y: number }[];
  balls: { x: number; y: number }[];
  targets: { vx: number; vy: number }[][]; // per robot, per second
}

function makeLayout(seed: number): Layout {
  const rng = mulberry32(seed);
  const robots = [0, 1, 2].flatMap((i) => [
    { x: 1.5, y: 1.5 + i * 2.5 },
    { x: FIELD_L - 1.5, y: 1.5 + i * 2.5 },
  ]);
  const balls: { x: number; y: number }[] = [];
  const cols = Math.ceil(Math.sqrt(PIECES * 3));
  for (let i = 0; i < PIECES; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    balls.push({ x: FIELD_L / 2 - 2.6 + c * 0.16 + rng() * 0.01, y: FIELD_W / 2 - 0.9 + r * 0.16 });
  }
  const targets = robots.map(() =>
    Array.from({ length: SECONDS + 1 }, () => {
      const a = rng() * Math.PI * 2;
      return { vx: Math.cos(a) * MAX_SPEED, vy: Math.sin(a) * MAX_SPEED };
    }),
  );
  return { robots, balls, targets };
}

interface EngineResult {
  hash: number;
  ms: number;
}

async function runRapier(layout: Layout): Promise<EngineResult> {
  const world = new RAPIER.World({ x: 0, y: 0 });
  world.timestep = DT;
  const walls = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const t = 0.1;
  for (const [x, y, hx, hy] of [
    [FIELD_L / 2, -t, FIELD_L / 2, t],
    [FIELD_L / 2, FIELD_W + t, FIELD_L / 2, t],
    [-t, FIELD_W / 2, t, FIELD_W / 2],
    [FIELD_L + t, FIELD_W / 2, t, FIELD_W / 2],
  ] as const)
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy).setTranslation(x, y), walls);

  const robots = layout.robots.map((p) => {
    const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y).setAngularDamping(4));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(ROBOT_HALF, ROBOT_HALF)
        .setDensity(ROBOT_MASS / (4 * ROBOT_HALF * ROBOT_HALF))
        .setFriction(0.6),
      b,
    );
    return b;
  });
  const balls = layout.balls.map((p) => {
    const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y).setLinearDamping(1.5));
    world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_R)
        .setDensity(BALL_MASS / (Math.PI * BALL_R * BALL_R))
        .setRestitution(0.3),
      b,
    );
    return b;
  });

  let hash = 2166136261;
  const start = performance.now();
  for (let s = 0; s < STEPS; s++) {
    const sec = Math.floor(s / HZ);
    robots.forEach((b, i) => {
      const tgt = layout.targets[i]![sec]!;
      const v = b.linvel();
      const m = b.mass();
      let dx = tgt.vx - v.x;
      let dy = tgt.vy - v.y;
      const mag = Math.hypot(dx, dy);
      const cap = MAX_ACCEL * DT;
      if (mag > cap) {
        dx *= cap / mag;
        dy *= cap / mag;
      }
      b.applyImpulse({ x: dx * m, y: dy * m }, true);
    });
    world.step();
    if (s % HZ === 0) {
      const vals: number[] = [];
      for (const b of [...robots, ...balls]) {
        const p = b.translation();
        vals.push(p.x, p.y, b.rotation());
      }
      hash = hashFloats(vals, hash);
    }
  }
  const ms = performance.now() - start;
  world.free();
  return { hash, ms };
}

function runPlanck(layout: Layout): EngineResult {
  const world = new planck.World({ gravity: planck.Vec2(0, 0) });
  const walls = world.createBody();
  for (const [a, b] of [
    [planck.Vec2(0, 0), planck.Vec2(FIELD_L, 0)],
    [planck.Vec2(FIELD_L, 0), planck.Vec2(FIELD_L, FIELD_W)],
    [planck.Vec2(FIELD_L, FIELD_W), planck.Vec2(0, FIELD_W)],
    [planck.Vec2(0, FIELD_W), planck.Vec2(0, 0)],
  ] as const)
    walls.createFixture(planck.Edge(a, b));

  const robots = layout.robots.map((p) => {
    const b = world.createDynamicBody({ position: planck.Vec2(p.x, p.y), angularDamping: 4 });
    b.createFixture(planck.Box(ROBOT_HALF, ROBOT_HALF), {
      density: ROBOT_MASS / (4 * ROBOT_HALF * ROBOT_HALF),
      friction: 0.6,
    });
    return b;
  });
  const balls = layout.balls.map((p) => {
    const b = world.createDynamicBody({ position: planck.Vec2(p.x, p.y), linearDamping: 1.5 });
    b.createFixture(planck.Circle(BALL_R), {
      density: BALL_MASS / (Math.PI * BALL_R * BALL_R),
      restitution: 0.3,
    });
    return b;
  });

  let hash = 2166136261;
  const start = performance.now();
  for (let s = 0; s < STEPS; s++) {
    const sec = Math.floor(s / HZ);
    robots.forEach((b, i) => {
      const tgt = layout.targets[i]![sec]!;
      const v = b.getLinearVelocity();
      const m = b.getMass();
      let dx = tgt.vx - v.x;
      let dy = tgt.vy - v.y;
      const mag = Math.hypot(dx, dy);
      const cap = MAX_ACCEL * DT;
      if (mag > cap) {
        dx *= cap / mag;
        dy *= cap / mag;
      }
      b.applyLinearImpulse(planck.Vec2(dx * m, dy * m), b.getWorldCenter(), true);
    });
    world.step(DT, 8, 3);
    if (s % HZ === 0) {
      const vals: number[] = [];
      for (const b of [...robots, ...balls]) {
        const p = b.getPosition();
        vals.push(p.x, p.y, b.getAngle());
      }
      hash = hashFloats(vals, hash);
    }
  }
  return { hash, ms: performance.now() - start };
}

function report(name: string, results: EngineResult[]) {
  const hashes = new Set(results.map((r) => r.hash));
  const best = Math.min(...results.map((r) => r.ms));
  const stepsPerSec = STEPS / (best / 1000);
  console.log(
    `${name.padEnd(10)} deterministic=${hashes.size === 1 ? "YES" : "NO "}  ` +
      `best=${best.toFixed(0)}ms  steps/s=${stepsPerSec.toFixed(0)}  ` +
      `realtime x${(stepsPerSec / HZ).toFixed(1)}  hash=${results[0]!.hash.toString(16)}`,
  );
  return { name, deterministic: hashes.size === 1, stepsPerSec, realtimeMultiple: stepsPerSec / HZ };
}

async function main() {
  await RAPIER.init();
  console.log(`Spike: ${SECONDS}s match, ${PIECES} pieces, 6 robots, ${HZ} Hz, ${RUNS} runs per engine`);
  const layout = makeLayout(6220);
  const rapier: EngineResult[] = [];
  const pl: EngineResult[] = [];
  for (let i = 0; i < RUNS; i++) rapier.push(await runRapier(layout));
  for (let i = 0; i < RUNS; i++) pl.push(runPlanck(layout));
  const out = [report("Rapier2D", rapier), report("Planck.js", pl)];
  if (args.get("json")) console.log(JSON.stringify(out));
}

main();
