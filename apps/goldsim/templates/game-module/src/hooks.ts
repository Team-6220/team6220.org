import type { GroupsHook } from "@goldsim/core";

/**
 * Reviewed TypeScript hooks for logic the JSON cannot express (PRD §8.3).
 * Hooks ship only from the repo and are code-reviewed. Delete this file if the game needs none.
 *
 * Example: a groupsHook decides which alliance is "groupA" for phases whose elementActive uses
 * groupA/groupB (REBUILT uses this for its Hub shift order; see packages/game-rebuilt/src/hooks.ts).
 * To use it, set "groupsHook": "<id>" in game.json and register it in src/index.ts.
 */
export const exampleGroups: GroupsHook = ({ counters, rng }) => {
  const blue = counters.blue.goalPieces ?? 0;
  const red = counters.red.goalPieces ?? 0;
  if (blue !== red) return { groupA: blue > red ? "red" : "blue" };
  return { groupA: rng.next() < 0.5 ? "blue" : "red" };
};
