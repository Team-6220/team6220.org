import type { Replay } from "@goldsim/schema";
import { ACTION_NAMES, type DriverInput } from "./input.js";
import type { Driver, Match, MatchConfig } from "./match.js";
import { Match as MatchClass } from "./match.js";
import type { GameModule } from "./field.js";

/** Plays back one robot's recorded inputs through the normal driver interface. */
export class ReplayDriver implements Driver {
  private changes: Replay["inputs"];
  private next = 0;
  private current: DriverInput = { vx: 0, vy: 0, omega: 0, actions: {} };

  constructor(replay: Replay, robotIndex: number) {
    this.changes = replay.inputs.filter((e) => e[1] === robotIndex);
    if (replay.actionNames.join() !== ACTION_NAMES.join())
      throw new Error("Replay uses a different action set; it was recorded by an incompatible engine version.");
  }

  getInput(tick: number): DriverInput {
    while (this.next < this.changes.length && this.changes[this.next]![0] <= tick) {
      const [, , vx, vy, omega, mask] = this.changes[this.next++]!;
      const actions: Record<string, boolean | number> = {};
      ACTION_NAMES.forEach((name, i) => {
        if (mask & (1 << i)) actions[name] = true;
      });
      const level = (mask >> 8) & 3;
      if (level) actions.climbLevel = level;
      this.current = { vx: vx / 127, vy: vy / 127, omega: omega / 127, actions };
    }
    return this.current;
  }
}

/** Rebuilds a match from a replay. Versions must match for an exact re-simulation. */
export async function matchFromReplay(replay: Replay, game: GameModule, extra: Partial<MatchConfig> = {}): Promise<Match> {
  return MatchClass.create({
    game,
    robots: replay.robots,
    seed: replay.seed,
    profile: replay.profile,
    hz: replay.hz,
    drivers: replay.robots.map((_, i) => new ReplayDriver(replay, i)),
    record: false,
    ...extra,
  });
}
