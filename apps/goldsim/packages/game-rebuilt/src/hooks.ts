import type { GroupsHook } from "@goldsim/core";

/**
 * REBUILT shift order (manual §6.4.1, Table 6-3): the alliance that scored more Fuel in AUTO has its Hub
 * inactive in SHIFT 1, so the other alliance is groupA (active in SHIFT 1 and SHIFT 3).
 * A tie is broken randomly with the match's seeded RNG.
 */
export const shiftOrder: GroupsHook = ({ counters, rng }) => {
  const blue = counters.blue.autoFuel ?? 0;
  const red = counters.red.autoFuel ?? 0;
  if (blue > red) return { groupA: "red" };
  if (red > blue) return { groupA: "blue" };
  return { groupA: rng.next() < 0.5 ? "blue" : "red" };
};
