import { describe, expect, it } from "vitest";
import { rebuilt, rebuiltPresets } from "@goldsim/game-rebuilt";
import { allianceObservations, analyzeContributions } from "@goldsim/analytics";
import { randomAllianceJobs, registerGame, runMatch, type RandomAllianceSettings } from "../src/index.js";

registerGame(rebuilt);
const [OTB, TURRET, CLIMBER, DEFENSE] = rebuiltPresets;

const settings = (over: Partial<RandomAllianceSettings> = {}): RandomAllianceSettings => ({
  subjects: [TURRET!],
  pool: [OTB!, TURRET!, CLIMBER!, DEFENSE!],
  matches: 12,
  baseSeed: 77,
  others: { kind: "random" },
  game: rebuilt.game.id,
  ...over,
});

describe("random alliances", () => {
  it("is deterministic for a base seed and different for another", () => {
    const a = randomAllianceJobs(settings());
    const b = randomAllianceJobs(settings());
    const c = randomAllianceJobs(settings({ baseSeed: 78 }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it("places the robot under test on both alliances and several stations, with varied partners and strategies", () => {
    const jobs = randomAllianceJobs(settings({ matches: 60 }));
    const alliances = new Set(jobs.map((j) => j.spec.robots[j.subject!]!.alliance));
    const stations = new Set(jobs.map((j) => j.spec.robots[j.subject!]!.station));
    expect(alliances).toEqual(new Set(["blue", "red"]));
    expect(stations.size).toBe(3);
    for (const j of jobs) {
      expect(j.spec.robots).toHaveLength(6);
      expect(j.spec.robots[j.subject!]!.design.name).toBe(TURRET!.name);
    }
    const lineups = new Set(jobs.map((j) => j.spec.robots.map((r) => r.design.name).join("|")));
    expect(lineups.size).toBeGreaterThan(20);
    const profiles = new Set(jobs.flatMap((j) => j.spec.drivers.map((d) => (d.kind === "agent" ? `${d.profile.role}:${d.profile.skill}` : "idle"))));
    expect(profiles.size).toBeGreaterThan(4);
  });

  it("a sweep sees the same lineups for every configuration (fair comparison)", () => {
    const param = { id: "bps", target: { kind: "design" as const, robot: 0, path: "/mechanisms/turret1/params/ballsPerSecond" }, values: [3, 9] };
    const jobs = randomAllianceJobs(settings({ matches: 5, params: [param], configs: [{ id: "c0", values: { bps: 3 } }, { id: "c1", values: { bps: 9 } }] }));
    expect(jobs).toHaveLength(10);
    const c0 = jobs.filter((j) => j.id.startsWith("c0-"));
    const c1 = jobs.filter((j) => j.id.startsWith("c1-"));
    expect(c0.map((j) => j.spec.robots.map((r) => r.design.name + r.station))).toEqual(c1.map((j) => j.spec.robots.map((r) => r.design.name + r.station)));
    expect(c0.map((j) => j.seed)).toEqual(c1.map((j) => j.seed));
    const turret = (j: (typeof jobs)[number]) => j.spec.robots[j.subject!]!.design.mechanisms.find((m) => m.id === "turret1")!.params.ballsPerSecond;
    expect(new Set(c0.map(turret))).toEqual(new Set([3]));
    expect(new Set(c1.map(turret))).toEqual(new Set([9]));
  });

  it("rejects empty subjects or pool", () => {
    expect(() => randomAllianceJobs(settings({ subjects: [] }))).toThrow(/at least one/);
    expect(() => randomAllianceJobs(settings({ pool: [] }))).toThrow(/empty/);
  });

  it("random lineups make contributions identifiable (fixed lineups do not)", async () => {
    const jobs = randomAllianceJobs(settings({ matches: 6, subjects: [OTB!, TURRET!], pool: [OTB!, TURRET!, CLIMBER!, DEFENSE!] }));
    const results = [];
    for (const j of jobs.slice(0, 12)) results.push((await runMatch({ ...j.spec, stopAtSeconds: 25 })).result);
    const analysis = analyzeContributions(allianceObservations(results));
    expect(analysis.status).toBe("ok");
    expect(analysis.rows.length).toBeGreaterThan(2);
  }, 120_000);
});
