import { describe, expect, it } from "vitest";
import { Match } from "@goldsim/core";
import { rebuilt, rebuiltPresets } from "@goldsim/game-rebuilt";
import type { MatchRobot } from "@goldsim/schema";
import { createAgent, profileById } from "../src/index.js";

const [OTB, TURRET, CLIMBER, DEFENSE] = rebuiltPresets;

async function agentMatch(robots: MatchRobot[], seed = 1, profile = "balanced") {
  const m = await Match.create({ game: rebuilt, robots, seed });
  m.drivers = robots.map((_, i) => createAgent(m, i, profileById(profile)));
  return m;
}

describe("agents", () => {
  it("a scorer cycles: collects, shoots from its Alliance Zone, scores without G407 fouls", async () => {
    const m = await agentMatch([{ design: TURRET!, alliance: "blue", station: 1 }], 4);
    const r = m.runToEnd();
    expect(r.robots[0]!.acquired).toBeGreaterThan(20);
    expect(r.robots[0]!.scoredActive).toBeGreaterThan(20);
    expect(r.robots[0]!.fouls).toBe(0);
    console.log("solo turret:", r.score.blue, "acquired", r.robots[0]!.acquired, "scored", r.robots[0]!.scoredActive, "wasted", r.robots[0]!.scoredInactive, "climb", r.robots[0]!.climbLevel);
    m.dispose();
  });

  it("agents climb in END GAME", async () => {
    const m = await agentMatch([{ design: CLIMBER!, alliance: "red", station: 0 }], 9);
    const r = m.runToEnd();
    expect(r.robots[0]!.climbLevel).toBe(3);
    m.dispose();
  });

  it("a full 3v3 agent match is deterministic and produces scores on both sides", async () => {
    const robots: MatchRobot[] = [
      { design: OTB!, alliance: "blue", station: 0 },
      { design: TURRET!, alliance: "blue", station: 1 },
      { design: CLIMBER!, alliance: "blue", station: 2 },
      { design: OTB!, alliance: "red", station: 0 },
      { design: TURRET!, alliance: "red", station: 1 },
      { design: DEFENSE!, alliance: "red", station: 2 },
    ];
    const run = async () => {
      const m = await agentMatch(robots, 2026);
      const t0 = performance.now();
      const r = m.runToEnd();
      const ms = performance.now() - t0;
      m.dispose();
      return { r, ms };
    };
    const a = await run();
    const b = await run();
    expect(JSON.stringify(a.r)).toBe(JSON.stringify(b.r));
    expect(a.r.score.blue.total).toBeGreaterThan(30);
    expect(a.r.score.red.total).toBeGreaterThan(10);
    console.log(
      `3v3 agents: blue ${a.r.score.blue.total} red ${a.r.score.red.total} | fouls ${JSON.stringify(a.r.fouls)} | ` +
        `x${(166 / (a.ms / 1000)).toFixed(1)} real time`,
    );
  });
});
