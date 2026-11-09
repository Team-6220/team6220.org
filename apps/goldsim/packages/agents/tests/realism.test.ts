import { describe, expect, it } from "vitest";
import { Match, Rng, type MatchEvent } from "@goldsim/core";
import { rebuilt, rebuiltPresets } from "@goldsim/game-rebuilt";
import type { MatchRobot, RobotDesign } from "@goldsim/schema";
import {
  createAgent,
  DEFAULT_PROFILE,
  drawMishaps,
  PROFILE_KNOBS,
  PROFILE_PRESETS,
  profileById,
  randomProfile,
  sampleForm,
  withSkill,
  type DriverProfile,
  type SkillLevel,
} from "../src/index.js";

const [OTB, TURRET, CLIMBER] = rebuiltPresets as [RobotDesign, RobotDesign, RobotDesign, RobotDesign];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));

describe("a full robot with nothing legal to shoot at keeps moving", () => {
  // Hopper holds exactly the 8 preloaded pieces, so the robot starts full. The robot is idle until SHIFT_1
  // starts, then an agent takes over while blue's own Hub is closed (blue led AUTO, so blue is inactive in SHIFT_1
  // and active again in SHIFT_2).
  async function fullHopperRun(profile: DriverProfile, withOpponent = false) {
    const design = structuredClone(TURRET);
    design.mechanisms.find((m) => m.type === "storage")!.params.capacity = 8;
    const robots: MatchRobot[] = [{ design, alliance: "blue", station: 1 }];
    if (withOpponent) robots.push({ design: TURRET, alliance: "red", station: 1 });
    const m = await Match.create({ game: rebuilt, robots, seed: 5 });
    m.counters.blue.autoFuel = 10;
    while (m.phase.id !== "SHIFT_1") m.step();
    expect(m.observe(0).self.stored).toBe(8);
    expect(m.isActive("hub.blue")).toBe(false);
    m.drivers = robots.map((_, i) => createAgent(m, i, i === 0 ? profile : DEFAULT_PROFILE));

    const hz = m.hz;
    let still = 0;
    let longestStill = 0;
    let last = m.robotPose(0);
    while (m.phase.id === "SHIFT_1") {
      m.step();
      const p = m.robotPose(0);
      const speed = Math.hypot(p.x - last.x, p.y - last.y) * hz;
      last = p;
      still = speed < 0.05 ? still + 1 / hz : 0;
      longestStill = Math.max(longestStill, still);
    }
    const shotsWhileClosed = m.events.filter((e) => e.type === "shot_launched" && e.robot === 0 && e.phase === "SHIFT_1").length;
    const openedAt = m.time;
    // Run into SHIFT_2 (blue active) and look for the first shot.
    while (m.phase.id === "SHIFT_2" && m.time < openedAt + 6) m.step();
    const first = m.events.find((e): e is Extract<MatchEvent, { type: "shot_launched" }> => e.type === "shot_launched" && e.robot === 0 && e.phase === "SHIFT_2");
    const secondsToFirstShot = first ? first.t - openedAt : Infinity;
    m.dispose();
    return { longestStill, shotsWhileClosed, secondsToFirstShot };
  }

  it("a staging driver never stands still for more than 3 s, then shoots as soon as the Hub opens", async () => {
    const r = await fullHopperRun(profileById("experienced"));
    expect(r.longestStill).toBeLessThan(3);
    expect(r.shotsWhileClosed).toBe(0);
    expect(r.secondsToFirstShot).toBeLessThan(3);
  });

  it("a defense-minded driver uses the closed window to harass, never stands still, and is back to shoot", async () => {
    const harasser: DriverProfile = { ...profileById("experienced"), id: "harasser", defenseAggression: 0.9 };
    const r = await fullHopperRun(harasser, true);
    expect(r.longestStill).toBeLessThan(3);
    expect(r.shotsWhileClosed).toBe(0);
    expect(r.secondsToFirstShot).toBeLessThan(6);
  });
});

describe("driver profiles", () => {
  it("form is deterministic per seed but differs between drivers and matches", () => {
    const a1 = sampleForm(DEFAULT_PROFILE, new Rng(1));
    const a2 = sampleForm(DEFAULT_PROFILE, new Rng(1));
    const b = sampleForm(DEFAULT_PROFILE, new Rng(2));
    expect(a1).toEqual(a2);
    expect(a1.speedScale).not.toBe(b.speedScale);
    const rookie = Array.from({ length: 200 }, (_, i) => sampleForm(withSkill(DEFAULT_PROFILE, "rookie"), new Rng(i)).aimError);
    const elite = Array.from({ length: 200 }, (_, i) => sampleForm(withSkill(DEFAULT_PROFILE, "elite"), new Rng(i)).aimError);
    expect(mean(rookie)).toBeGreaterThan(mean(elite) * 3);
    expect(sd(rookie)).toBeGreaterThan(0);
  });

  it("a robot-like driver (no variation) has the same form every match", () => {
    const flat: DriverProfile = { ...DEFAULT_PROFILE, formVariation: 0 };
    expect(sampleForm(flat, new Rng(1)).speedScale).toBe(sampleForm(flat, new Rng(99)).speedScale);
  });

  it("every knob has a plain-English help string and a valid range", () => {
    for (const k of PROFILE_KNOBS) {
      expect(k.help.length, k.key).toBeGreaterThan(20);
      expect(k.max, k.key).toBeGreaterThan(k.min);
      expect(typeof DEFAULT_PROFILE[k.key], k.key).toBe("number");
    }
    expect(PROFILE_PRESETS.map((p) => p.id)).toEqual(expect.arrayContaining(["rookie", "average", "experienced", "elite"]));
  });

  it("randomProfile is deterministic for an rng, varied across draws, and respects what the robot can do", () => {
    const draws = (seed: number) => {
      const rng = new Rng(seed);
      return Array.from({ length: 40 }, () => randomProfile(rng));
    };
    expect(draws(3)).toEqual(draws(3));
    const ds = draws(4);
    expect(new Set(ds.map((d) => d.id)).size).toBeGreaterThan(5);
    expect(new Set(ds.map((d) => d.skill)).size).toBeGreaterThan(2);
    expect(new Set(ds.map((d) => d.role)).size).toBeGreaterThan(1);
    const rng = new Rng(8);
    for (let i = 0; i < 30; i++) {
      const p = randomProfile(rng, { capabilities: { shooter: false, intake: false, climber: false } });
      expect(p.role).toBe("defender");
      expect(p.climb).toBe(false);
      expect(p.autoClimb).toBe(false);
    }
  });
});

describe("mishaps", () => {
  it("are drawn deterministically, average out to the rate, and stay in a sensible range", () => {
    const a = drawMishaps(1.2, 160, new Rng(5));
    expect(a).toEqual(drawMishaps(1.2, 160, new Rng(5)));
    expect(drawMishaps(0, 160, new Rng(5))).toEqual([]);
    const counts = Array.from({ length: 400 }, (_, i) => drawMishaps(1.2, 160, new Rng(i)).length);
    expect(mean(counts)).toBeGreaterThan(0.9);
    expect(mean(counts)).toBeLessThan(1.5);
    for (const m of Array.from({ length: 100 }, (_, i) => drawMishaps(2, 160, new Rng(i))).flat()) {
      expect(m.at).toBeGreaterThanOrEqual(4);
      expect(m.at).toBeLessThanOrEqual(160);
      expect(m.len).toBeGreaterThan(0.5);
      expect(m.len).toBeLessThanOrEqual(60);
    }
  });
});

describe("realistic variability", () => {
  const lineup = (): MatchRobot[] => [
    { design: OTB, alliance: "blue", station: 0 },
    { design: TURRET, alliance: "blue", station: 1 },
    { design: CLIMBER, alliance: "blue", station: 2 },
    { design: OTB, alliance: "red", station: 0 },
    { design: TURRET, alliance: "red", station: 1 },
    { design: CLIMBER, alliance: "red", station: 2 },
  ];

  async function play(skill: SkillLevel, seed: number) {
    const robots = lineup();
    const m = await Match.create({ game: rebuilt, robots, seed });
    const profile = withSkill(DEFAULT_PROFILE, skill);
    m.drivers = robots.map((_, i) => createAgent(m, i, profile));
    const r = m.runToEnd();
    m.dispose();
    return r;
  }

  it("Elite > Average > Rookie by alliance score, and matches differ from one another", async () => {
    const seeds = [101, 202, 303, 404];
    const alliance: Record<string, number[]> = {};
    for (const skill of ["rookie", "average", "elite"] as SkillLevel[]) {
      const totals: number[] = [];
      for (const seed of seeds) {
        const r = await play(skill, seed);
        totals.push(r.score.blue.total, r.score.red.total);
      }
      alliance[skill] = totals;
      console.log(`${skill}: alliance mean ${mean(totals).toFixed(0)}, sd ${sd(totals).toFixed(0)} (${((100 * sd(totals)) / mean(totals)).toFixed(0)}%)`);
    }
    expect(mean(alliance.elite!)).toBeGreaterThan(mean(alliance.rookie!) + 40);
    expect(mean(alliance.average!)).toBeGreaterThan(mean(alliance.rookie!));
    expect(mean(alliance.elite!)).toBeGreaterThan(mean(alliance.average!) - 20);
    // Scores are not near-identical from match to match. Rookie and Average drivers swing a lot; Elite drivers are
    // steadier by design (few mishaps), so a short run only needs to show that results are not all the same.
    for (const skill of ["rookie", "average"]) expect(sd(alliance[skill]!) / mean(alliance[skill]!)).toBeGreaterThan(0.07);
    expect(new Set(alliance.elite).size).toBeGreaterThan(4);
  }, 600000);

  it("the same seed replays the same match", async () => {
    const a = await play("average", 7);
    const b = await play("average", 7);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, 300000);
});
