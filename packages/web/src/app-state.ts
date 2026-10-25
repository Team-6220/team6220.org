import type { RobotDesign, Alliance } from "@goldsim/schema";
import { rebuilt, rebuiltPresets } from "@goldsim/game-rebuilt";
import type { GameModule } from "@goldsim/core";

export type DriverChoice = { kind: "idle" } | { kind: "keyboard" } | { kind: "gamepad"; index: number } | { kind: "agent"; profile: string };

export interface SlotConfig {
  alliance: Alliance;
  station: number;
  design: RobotDesign;
  driver: DriverChoice;
}

export interface MatchSetup {
  game: GameModule;
  profile: string;
  seed: number;
  slots: SlotConfig[];
}

/** In-memory session state. Nothing here is saved; saving to a team workspace arrives in Phase 2. */
export const session = {
  game: rebuilt,
  presets: rebuiltPresets,
  customDesigns: [] as RobotDesign[],
  setup: null as MatchSetup | null,
};

export function allDesigns(): RobotDesign[] {
  return [...session.presets, ...session.customDesigns];
}

export function defaultSetup(): MatchSetup {
  const p = session.presets;
  const order = [0, 1, 2];
  return {
    game: session.game,
    profile: session.game.game.defaultProfile,
    seed: randomSeed(),
    slots: [
      ...order.map((i) => ({ alliance: "blue" as const, station: i, design: p[i % p.length]!, driver: { kind: i === 1 ? "keyboard" : "agent", profile: "balanced" } as DriverChoice })),
      ...order.map((i) => ({ alliance: "red" as const, station: i, design: p[(i + 1) % p.length]!, driver: { kind: "agent", profile: "balanced" } as DriverChoice })),
    ],
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
