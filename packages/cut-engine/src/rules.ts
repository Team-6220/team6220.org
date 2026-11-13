// How much bigger than the part the stock is cut, so there is material to clean up to the line.
// The same numbers as CUT_RULES in Inventory (apps/inventory/ui/JsPlanner.html and Config.gs).

export const CUT_RULES = {
  /** Cut by hand (bandsaw, chop saw): this much extra on each dimension. */
  handmadeExtra: 0.25,
  /** On the Shapeoko, thin stock needs more room for the clamps... */
  shapeokoThinExtra: 1,
  /** ...than thick stock. */
  shapeokoThickExtra: 0.75,
  /** Stock this thick or more counts as "thick". */
  thickFrom: 0.25,
  /** Stock sizes are rounded up to the next 1/8". */
  roundTo: 0.125,
};

export type CutMethod = "handmade" | "shapeoko";

export function stockExtra(method: CutMethod, thicknessInches: number): number {
  if (method === "handmade") return CUT_RULES.handmadeExtra;
  return thicknessInches >= CUT_RULES.thickFrom - 1e-6 ? CUT_RULES.shapeokoThickExtra : CUT_RULES.shapeokoThinExtra;
}

/** Up to the next 1/8". */
export function roundUpToEighth(x: number): number {
  return Math.ceil(x / CUT_RULES.roundTo - 1e-9) * CUT_RULES.roundTo;
}

/** The stock rectangle to cut for a part: longer side first, extra added, rounded up. */
export function stockSize(partLength: number, partWidth: number, method: CutMethod, thicknessInches: number): { w: number; h: number } {
  const extra = stockExtra(method, thicknessInches);
  return {
    w: roundUpToEighth(Math.max(partLength, partWidth) + extra),
    h: roundUpToEighth(Math.min(partLength, partWidth) + extra),
  };
}
