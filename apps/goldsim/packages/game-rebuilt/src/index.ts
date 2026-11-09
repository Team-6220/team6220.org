import type { GameModule } from "@goldsim/core";
import type { RobotDesign } from "@goldsim/schema";
import game from "../game.json";
import field from "../field.json";
import pieces from "../pieces.json";
import scoring from "../scoring.json";
import rules from "../rules.json";
import mechanisms from "../mechanisms.json";
import namedCommands from "../named-commands.json";
import stats from "../stats.json";
import { shiftOrder } from "./hooks.js";
import otbFixed from "../presets/otb-fixed-shooter.json";
import turret from "../presets/turret-shooter.json";
import climber from "../presets/climb-focused.json";
import defense from "../presets/defense.json";

/** Raw module files, as authored (for validation and the authoring guide). */
export const rebuiltFiles = {
  "game.json": game,
  "field.json": field,
  "pieces.json": pieces,
  "scoring.json": scoring,
  "rules.json": rules,
  "mechanisms.json": mechanisms,
  "named-commands.json": namedCommands,
  "stats.json": stats,
};

/** The REBUILT (2026) game module with its reviewed hooks. */
export const rebuilt = {
  game,
  field,
  pieces,
  scoring,
  rules,
  mechanisms,
  namedCommands,
  stats,
  hooks: { groups: { "rebuilt.shiftOrder": shiftOrder } },
} as unknown as GameModule;

/** Archetype presets students can duplicate and tweak (PRD §9.1). */
export const rebuiltPresets = [otbFixed, turret, climber, defense] as unknown as RobotDesign[];
