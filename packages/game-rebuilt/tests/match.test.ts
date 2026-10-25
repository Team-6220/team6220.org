import { describe, expect, it } from "vitest";
import { Match, matchFromReplay, type MatchEvent } from "@goldsim/core";
import { rebuilt } from "../src/index.js";
import { CLIMBER, OTB, TURRET, design, goTo, makeMatch, near, robot, runUntil, script, with_ } from "./helpers.js";

const eventsOf = (m: Match, type: MatchEvent["type"]) => m.events.filter((e) => e.type === type);

/** Drive to the shooting pose facing away from the Hub (rear shooter) and shoot. */
function rearShooter(alliance: "blue" | "red") {
  return script([
    (obs) => {
      const p = obs.objectives.find((o) => o.id === `hubShot.${alliance}`)!.pose;
      const t = { ...p, theta: p.theta + Math.PI };
      return near(obs, t, 0.05, 0.02) ? null : goTo(obs, t);
    },
    (obs) => {
      const p = obs.objectives.find((o) => o.id === `hubShot.${alliance}`)!.pose;
      return with_(goTo(obs, { ...p, theta: p.theta + Math.PI }), { shoot: true });
    },
  ]);
}

describe("determinism (PRD §6.4)", () => {
  it("same seed + same inputs => identical event stream and score", async () => {
    const run = async () => {
      const m = await makeMatch([robot(OTB, "blue", 1), robot(TURRET, "red", 1)], [rearShooter("blue"), rearShooter("red")], 42);
      runUntil(m, 40);
      const out = JSON.stringify(m.events) + JSON.stringify(m.score);
      m.dispose();
      return out;
    };
    expect(await run()).toBe(await run());
  });

  it("a replay re-simulates the recorded match exactly", async () => {
    const m = await makeMatch([robot(OTB, "blue", 1), robot(TURRET, "red", 1)], [rearShooter("blue"), rearShooter("red")], 7);
    runUntil(m, 30);
    const replay = m.replay();
    const original = JSON.stringify(m.events);
    m.dispose();

    const r = await matchFromReplay(replay, rebuilt);
    runUntil(r, 30);
    expect(JSON.stringify(r.events)).toBe(original);
    r.dispose();
  });

  it("snapshot/restore continues identically", async () => {
    const m = await makeMatch([robot(OTB, "blue", 1)], [null], 3);
    runUntil(m, 5);
    const snap = m.snapshot();
    runUntil(m, 12);
    const after = JSON.stringify(m.events.slice(snap.state.eventCount)) + JSON.stringify(m.piecePositions());
    m.restore(snap);
    runUntil(m, 12);
    expect(JSON.stringify(m.events.slice(snap.state.eventCount)) + JSON.stringify(m.piecePositions())).toBe(after);
    m.dispose();
  });
});

describe("Trench height gate (§5.6, 22.25 in clearance)", () => {
  const throughTrench = script([
    (obs) => (near(obs, { x: 3.4, y: 0.7925, theta: 0 }, 0.04) ? null : goTo(obs, { x: 3.4, y: 0.7925, theta: 0 })),
    (obs) => ({ ...goTo(obs, { x: 7, y: 0.7925, theta: 0 }), vx: 0.6 }),
  ]);

  it("a robot shorter than the clearance passes", async () => {
    const m = await makeMatch([robot(OTB)], [throughTrench]);
    runUntil(m, 8);
    expect(m.robotPose(0).x).toBeGreaterThan(5.6);
    m.dispose();
  });

  it("a robot taller than the clearance is blocked", async () => {
    const tall = design(OTB, (d) => (d.chassis.height = 0.75));
    const m = await makeMatch([robot(tall)], [throughTrench]);
    runUntil(m, 8);
    expect(m.robotPose(0).x).toBeLessThan(4.1);
    m.dispose();
  });
});

describe("Hub scoring, re-emission and shift order (§6.4.1, §6.5)", () => {
  it("AUTO Fuel scores, the Hub re-emits it, and the AUTO leader's Hub is inactive in SHIFT 1", async () => {
    const m = await makeMatch([robot(OTB, "blue", 1)], [rearShooter("blue")], 11);
    runUntil(m, 20);
    const scored = eventsOf(m, "piece_scored");
    expect(scored.length).toBeGreaterThanOrEqual(5);
    expect(scored.every((e) => e.type === "piece_scored" && e.active && e.period === "auto")).toBe(true);
    expect(m.counters.blue.autoFuel).toBe(scored.length);
    expect(m.score.blue.auto).toBe(scored.length);

    runUntil(m, 25);
    expect(eventsOf(m, "piece_emitted").some((e) => e.type === "piece_emitted" && e.source === "hub.blue")).toBe(true);

    runUntil(m, 34); // SHIFT_1 starts at 33 s (20 + 3 + 10)
    expect(m.phase.id).toBe("SHIFT_1");
    expect(m.groupA).toBe("red");
    expect(m.isActive("hub.blue")).toBe(false);
    expect(m.isActive("hub.red")).toBe(true);
    runUntil(m, 59);
    expect(m.phase.id).toBe("SHIFT_2");
    expect(m.isActive("hub.blue")).toBe(true);
    m.dispose();
  });

  it("an AUTO Fuel tie picks the shift order with the seeded RNG", async () => {
    const order = async (seed: number) => {
      const m = await makeMatch([robot(OTB)], [null], seed);
      runUntil(m, 34);
      const g = m.groupA;
      m.dispose();
      return g;
    };
    const seen = new Set<string | null>();
    for (const seed of [1, 2, 3, 4, 5, 6]) seen.add(await order(seed));
    expect(seen).toEqual(new Set(["blue", "red"]));
    expect(await order(3)).toBe(await order(3));
  });

  it("Fuel landing within 3 s after the Hub deactivates still scores (assessment delay)", async () => {
    const m = await makeMatch([robot(OTB, "blue", 1)], [null], 5);
    // Force blue to lead AUTO so blue's Hub turns off at SHIFT_1.
    m.counters.blue.autoFuel = 10;
    runUntil(m, 33.5);
    expect(m.isActive("hub.blue")).toBe(false);
    expect(m.isScoringActive("hub.blue")).toBe(true);
    runUntil(m, 36.2);
    expect(m.isScoringActive("hub.blue")).toBe(false);
    m.dispose();
  });
});

describe("Tower (§6.5.2)", () => {
  const climbTo = (level: number) =>
    script([
      (obs) => {
        const p = obs.objectives.find((o) => o.id === "towerClimb.blue")!.pose;
        return near(obs, p, 0.06, 0.05) || obs.phase.id === "END_GAME" ? null : goTo(obs, p);
      },
      (obs) => (obs.phase.id === "END_GAME" ? null : { vx: 0, vy: 0, omega: 0, actions: {} }),
      () => ({ vx: 0, vy: 0, omega: 0, actions: { climb: true, climbLevel: level } }),
    ]);

  it("a Level 3 climb in END GAME scores 30 and counts toward TRAVERSAL", async () => {
    const m = await makeMatch([robot(CLIMBER, "blue", 1)], [climbTo(3)]);
    const result = m.runToEnd();
    expect(result.score.blue.endgame).toBe(30);
    expect(result.counters.blue.towerPoints).toBe(30);
    expect(result.robots[0]!.climbLevel).toBe(3);
    m.dispose();
  });

  it("a climber limited to Level 1 gets 10 in TELEOP", async () => {
    const m = await makeMatch([robot(OTB, "blue", 1)], [climbTo(3)]);
    const result = m.runToEnd();
    expect(result.score.blue.endgame).toBe(10);
    m.dispose();
  });
});

describe("fouls", () => {
  it("G403: completely crossing the Center Line in AUTO is a MAJOR FOUL", async () => {
    const lane = { x: 3.4, y: 7.28, theta: 0 }; // center of the Trench opening
    const cross = script([
      (obs) => (near(obs, lane, 0.05) ? null : goTo(obs, lane)),
      (obs) => goTo(obs, { x: 10, y: 7.28, theta: 0 }),
    ]);
    const m = await makeMatch([robot(TURRET, "blue", 2)], [cross]);
    runUntil(m, 10);
    const fouls = eventsOf(m, "foul");
    expect(fouls.map((f) => f.type === "foul" && f.rule)).toEqual(["G403"]);
    expect(m.score.red.foul).toBe(15);
    m.dispose();
  });

  it("G407: shooting at your own Hub from outside your Alliance Zone is a foul", async () => {
    // Turret robot drives into the Neutral Zone and shoots back at its Hub.
    const outside = script([
      (obs) => (obs.t < 20 ? { vx: 0, vy: 0, omega: 0, actions: {} } : null),
      (obs) => (near(obs, { x: 3.4, y: 7.28, theta: 0 }, 0.08, 0.1) ? null : goTo(obs, { x: 3.4, y: 7.28, theta: 0 })),
      (obs) => (near(obs, { x: 7.0, y: 7.28, theta: 0 }, 0.1, 0.1) ? null : goTo(obs, { x: 7.0, y: 7.28, theta: 0 })),
      (obs) => with_(goTo(obs, { x: 7.0, y: 7.28, theta: 0 }), { shoot: true }),
    ]);
    const m = await makeMatch([robot(design(TURRET, (d) => (d.mechanisms[3]!.params.rangeMax = 8)), "blue", 2)], [outside]);
    runUntil(m, 45);
    expect(eventsOf(m, "foul").some((f) => f.type === "foul" && f.rule === "G407")).toBe(true);
    m.dispose();
  });
});

describe("full match", () => {
  it("runs a 6-robot match headless to the end with a coverage report", async () => {
    const robots = [
      robot(OTB, "blue", 0),
      robot(TURRET, "blue", 1),
      robot(CLIMBER, "blue", 2),
      robot(OTB, "red", 0),
      robot(TURRET, "red", 1),
      robot(CLIMBER, "red", 2),
    ];
    const m = await Match.create({ game: rebuilt, robots, seed: 99, drivers: [] });
    const t0 = performance.now();
    const result = m.runToEnd();
    const ms = performance.now() - t0;
    expect(m.isOver).toBe(true);
    expect(result.coverage.length).toBe(rebuilt.rules.rules.length);
    expect(result.winner).toBe("tie");
    console.log(`6-robot idle match: ${(m.tick / m.hz).toFixed(0)} s simulated in ${ms.toFixed(0)} ms (x${((m.tick / m.hz) / (ms / 1000)).toFixed(1)} real time)`);
    m.dispose();
  });
});
