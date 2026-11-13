// Cutting parts from Inventory's raw stock, for Production's Cut planner. It uses Inventory's own cut jobs
// (collection inventory_production) to reserve spots on the stock, and Inventory's own "Mark as cut" rule to turn
// the piece into its leftovers. So the planner in Inventory and the one in Production always agree, and the rule that
// changes stock exists once.
//
//   const materials = await cutting.materials();                     // what raw stock there is
//   const plan = await cutting.plan({ materialTypeId, thicknessIn, method, parts });
//   const jobIds = await cutting.reserve(plan, ...);                 // the spots are now taken
//   await cutting.confirmCut(jobId);                                 // stock becomes what is left
import { containsRect, leftovers, placementPoly, planSheets, stockSize, toInches, type CutMethod, type Placement, type Polygon, type SheetPlan, type Stock } from "@team6220/cut-engine";
import { inventoryForOtherApps as inventory, resetInventoryForOtherApps } from "./connection.ts";
import type { Row } from "./types.ts";

/** Start again from fresh demo data (tests). */
export function reset(): void {
  resetInventoryForOtherApps();
}

/** One raw stock piece, with its outline in inches. */
export interface StockPiece {
  id: string;
  materialTypeId: string;
  material: string;
  thicknessIn: number;
  /** The outline in inches (rectangle or traced shape). */
  points: Polygon;
  quantity: number;
  description: string;
  version: number;
}

/** A spot already reserved on a piece (a planned cut job). */
export interface Reserved {
  jobId: string;
  pieceId: string;
  copy: number;
  partName: string;
  placement: Placement;
}

export interface Material {
  id: string;
  name: string;
  /** The thicknesses (inches) there is stock of, thinnest first. */
  thicknesses: number[];
}

/** Everything the planner needs from Inventory, read in one go. */
export async function load(): Promise<{ materials: Material[]; pieces: StockPiece[]; reserved: Reserved[] }> {
  const { tables } = await (await inventory()).loadAll();
  const listValue = (id: unknown) => String(tables.lists.find((l) => l.id === id)?.value ?? "");
  const pieces: StockPiece[] = [];
  for (const r of tables.rawMaterials) {
    if (r.archivedAt || !(Number(r.quantity) > 0)) continue;
    const points = outline(r);
    if (!points) continue;
    const toIn = toInches(listValue(r.dimUnitId) || "in");
    pieces.push({
      id: String(r.id),
      materialTypeId: String(r.materialTypeId),
      material: listValue(r.materialTypeId),
      thicknessIn: Math.round((Number(r.thicknessValue) || 0) * toInches(listValue(r.thicknessUnitId) || "in") * 1e4) / 1e4,
      points: points.map(([x, y]) => [x * toIn, y * toIn]),
      quantity: Number(r.quantity) || 1,
      description: String(r.description ?? ""),
      version: Number(r.version) || 0,
    });
  }
  const reserved: Reserved[] = tables.production
    .filter((j) => j.status === "planned" && j.rawMaterialId && (j.placement as Placement | undefined)?.w)
    .map((j) => ({ jobId: String(j.id), pieceId: String(j.rawMaterialId), copy: Number(j.copyIndex) || 0, partName: String(j.partName), placement: j.placement as Placement }));
  const materials = tables.lists
    .filter((l) => l.listKey === "materialType")
    .map((l) => ({
      id: String(l.id),
      name: String(l.value),
      thicknesses: [...new Set(pieces.filter((p) => p.materialTypeId === l.id && p.thicknessIn > 0).map((p) => p.thicknessIn))].sort((a, b) => a - b),
    }))
    .filter((m) => m.thicknesses.length);
  return { materials, pieces, reserved };
}

/** A piece's outline in its own unit: the traced shape, or a rectangle from its length and width. */
function outline(r: Row): Polygon | null {
  const shape = r.shape as { points?: Polygon } | undefined;
  if (shape?.points && shape.points.length >= 3) return shape.points;
  const l = Number(r.lengthValue), w = Number(r.widthValue);
  return l > 0 && w > 0 ? [[0, 0], [l, 0], [l, w], [0, w]] : null;
}

/** A part to plan: its finished size. The stock rectangle is worked out from the team's cut rules. */
export interface PartToPlan {
  key: string;
  name: string;
  length: number;
  width: number;
}

export type CutPlan = SheetPlan<Stock & { piece: StockPiece }, { key: string; name: string; w: number; h: number; length: number; width: number }>;

/** Works out where each part's stock comes from. Nothing is saved: show the result, then call reserve(). */
export function plan(
  data: { pieces: StockPiece[]; reserved: Reserved[] },
  choice: { materialTypeId: string; thicknessIn: number; method: CutMethod; parts: PartToPlan[] },
): CutPlan {
  const stocks = data.pieces
    .filter((p) => p.materialTypeId === choice.materialTypeId && Math.abs(p.thicknessIn - choice.thicknessIn) < 1e-3)
    .flatMap((piece) =>
      Array.from({ length: piece.quantity }, (_, copy) => ({
        id: piece.id,
        copy,
        points: piece.points,
        piece,
        taken: data.reserved.filter((r) => r.pieceId === piece.id && r.copy === copy).map((r) => placementPoly(r.placement)),
      })),
    );
  const parts = choice.parts.map((p) => ({ ...p, ...stockSize(p.length, p.width, choice.method, choice.thicknessIn) }));
  return planSheets(stocks, parts);
}

/** Saves the plan as Inventory cut jobs, so those spots are taken. Returns the job id of each part, by its key. */
export async function reserve(cutPlan: CutPlan, choice: { materialTypeId: string; thicknessIn: number; method: CutMethod }): Promise<Map<string, string>> {
  if (!cutPlan.placed.length) return new Map();
  const jobs = cutPlan.placed.map((p) => ({
    partName: p.part.name.slice(0, 100),
    materialTypeId: choice.materialTypeId,
    thickness: String(choice.thicknessIn),
    partLength: p.part.length,
    partWidth: p.part.width,
    method: choice.method,
    stockLength: p.part.w,
    stockWidth: p.part.h,
    rawMaterialId: p.stock.id,
    copyIndex: p.stock.copy,
    placement: p.placement,
  }));
  const saved = (await (await inventory()).productionCreate(jobs)).value;
  return new Map(cutPlan.placed.map((p, i) => [p.part.key, String(saved[i].id)]));
}

/** Gives a reserved spot back (the part was cancelled, or will be planned again). */
export async function release(jobId: string): Promise<void> {
  await (await inventory()).productionDelete([jobId]);
}

/**
 * The part was cut: the stock piece becomes what is left of it, using Inventory's "Mark as cut" rule. Other parts
 * planned on the same piece move to the leftover they sit on, or lose their spot if it was cut away. Leftovers are
 * flagged "needs check", so the next audit measures them.
 * Returns how many leftover pieces there are now (0 = the piece was used up).
 */
export async function confirmCut(jobId: string): Promise<{ leftovers: number }> {
  const inv = await inventory();
  const { tables } = await inv.loadAll();
  const job = tables.production.find((j) => j.id === jobId);
  if (!job || job.status !== "planned") throw new Error("This part's spot on the stock isn't reserved any more. Plan it again.");
  const row = tables.rawMaterials.find((r) => r.id === job.rawMaterialId);
  const points = row && outline(row);
  if (!row || !points) throw new Error("The stock piece for this part no longer exists. Plan it again.");
  const unit = String(tables.lists.find((l) => l.id === row.dimUnitId)?.value ?? "in");
  const toIn = toInches(unit);
  const inches: Polygon = points.map(([x, y]) => [x * toIn, y * toIn]);
  const copy = Number(job.copyIndex) || 0;
  const cut = placementPoly(job.placement as Placement);
  const left = leftovers(inches, [cut]);
  // Other planned parts on the same copy: which leftover (if any) still holds their spot.
  const reassign: Record<string, number> = {};
  for (const other of tables.production) {
    if (other.id === jobId || other.status !== "planned" || other.rawMaterialId !== row.id || (Number(other.copyIndex) || 0) !== copy) continue;
    const spot = placementPoly(other.placement as Placement);
    reassign[String(other.id)] = left.findIndex((l) => containsRect(l, spot));
  }
  const back = (poly: Polygon) => ({ points: poly.map(([x, y]) => [x / toIn, y / toIn]) });
  await inv.rawCut(String(row.id), Number(row.version), copy, [jobId], left.map(back), reassign, true);
  return { leftovers: left.length };
}
