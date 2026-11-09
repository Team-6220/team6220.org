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
import { exampleGroups } from "./hooks.js";

/** Raw module files, as authored (for validation). */
export const moduleFiles = {
  "game.json": game,
  "field.json": field,
  "pieces.json": pieces,
  "scoring.json": scoring,
  "rules.json": rules,
  "mechanisms.json": mechanisms,
  "named-commands.json": namedCommands,
  "stats.json": stats,
};

/** The game module with its reviewed hooks. */
export const gameModule = {
  game,
  field,
  pieces,
  scoring,
  rules,
  mechanisms,
  namedCommands,
  stats,
  hooks: { groups: { "example.groups": exampleGroups } },
} as unknown as GameModule;

/** Archetype presets (robot JSON files in presets/). Add imports here as you create them. */
export const presets: RobotDesign[] = [];
