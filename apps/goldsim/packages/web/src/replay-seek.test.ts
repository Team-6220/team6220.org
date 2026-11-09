import { describe, expect, it } from "vitest";
import { Match, matchFromReplay, ReplayDriver } from "@goldsim/core";
import { createAgent } from "@goldsim/agents";
import { rebuilt, rebuiltPresets } from "@goldsim/game-rebuilt";
import type { MatchRobot } from "@goldsim/schema";

// The replay viewer scrubs by restoring a snapshot and replacing the drivers with fresh ReplayDrivers.
// That must land on exactly the same state as playing straight through.
describe("replay viewer seeking", () => {
  it("restore + fresh replay drivers reproduces linear playback", async () => {
    const robots: MatchRobot[] = [
      { design: rebuiltPresets[1]!, alliance: "blue", station: 1 },
      { design: rebuiltPresets[0]!, alliance: "red", station: 1 },
    ];
    const live = await Match.create({ game: rebuilt, robots, seed: 77 });
    live.drivers = robots.map((_, i) => createAgent(live, i));
    while (live.tick < 30 * live.hz) live.step();
    const replay = live.replay();
    live.dispose();

    const linear = await matchFromReplay(replay, rebuilt);
    while (linear.tick < 25 * linear.hz) linear.step();
    const expected = JSON.stringify({ e: linear.events, p: linear.piecePositions(), r: [0, 1].map((i) => linear.robotPose(i)) });
    linear.dispose();

    const m = await matchFromReplay(replay, rebuilt);
    const snaps = [m.snapshot()];
    while (m.tick < 28 * m.hz) {
      m.step();
      if (m.tick % (2 * m.hz) === 0) snaps.push(m.snapshot());
    }
    // Seek back to 25 s: nearest snapshot at or before, fresh drivers, step forward.
    const target = 25 * m.hz;
    const snap = [...snaps].reverse().find((s) => s.state.tick <= target)!;
    m.restore(snap);
    m.drivers = replay.robots.map((_, i) => new ReplayDriver(replay, i));
    while (m.tick < target) m.step();
    expect(JSON.stringify({ e: m.events, p: m.piecePositions(), r: [0, 1].map((i) => m.robotPose(i)) })).toBe(expected);
    m.dispose();
  });
});
