// Shapes of the Production app's records. Plan: docs/operations/PRODUCTION.md.
// One collection, production_parts, written straight to Wix by members (every Team Member can do everything
// in Production; the app records who did each step).
import type { Item } from "../ops/types";

export type Method = "handmade" | "shapeoko" | "print" | "other";
export type Priority = "low" | "normal" | "high" | "urgent";

/**
 * Where a part is:
 *   pending-setup  a Shapeoko part waiting for someone to set the stock size and toolpath
 *   ready          can be picked up and made
 *   in-progress    someone has claimed it
 *   handed-back    someone stopped before finishing; it can be claimed again
 *   cut            cut or printed, may still need finishing (deburr, tap, bend)
 *   done           finished and checked
 *   cancelled      no longer needed
 */
export type PartStatus = "pending-setup" | "ready" | "in-progress" | "handed-back" | "cut" | "done" | "cancelled";

/** One stretch of work on a part by one person. Kept even when they don't finish, so the next person knows. */
export interface WorkEntry {
  memberId: string;
  name: string;
  startedAt: string;
  /** "" while they are still working on it. */
  endedAt: string;
  result: "" | "finished" | "unfinished";
  note: string;
  /** Where an unfinished piece was left. */
  leftAt: string;
}

/** Extra details for a 3D printed part (the print queue). */
export interface PrintDetails {
  printer: string;
  filament: string;
  color: string;
  estMinutes: number;
  estGrams: number;
  /** Why the last print failed, or "". */
  failReason: string;
}

export interface Part extends Item {
  /** Shown as PR-0123. */
  number: number;
  /** "Same as CAD". */
  partName: string;
  designerId: string;
  designerName: string;
  projectId: string;
  /** The _id of the Icarus task this part is for, or "". */
  taskId: string;
  cadLink: string;
  /** Links to drawings, DXF or STL files in Google Drive or Onshape. */
  fileLinks: string;
  material: string;
  thickness: string;
  /** Inches. 0 when not given. */
  length: number;
  width: number;
  quantity: number;
  method: Method;
  /** Tolerance, in the designer's words ("±0.005", "loose"). */
  accuracy: string;
  priority: Priority;
  dueDate: string;
  details: string;
  status: PartStatus;
  work: WorkEntry[];
  /** For Shapeoko parts: the stock size and toolpath notes from whoever set it up, and who that was. */
  setupNotes: string;
  setupBy: string;
  print: PrintDetails | null;
  /**
   * The Inventory cut jobs that reserve this part's spots on stock pieces (one per copy of the part), set by the Cut
   * planner. Empty when it has not been planned on Inventory stock. Confirm cut uses them to update the stock.
   */
  cutJobIds: string[];
  /** Which stock, for showing on the card: "6061 Aluminum, 1/8\"". */
  cutStock: string;
  createdAt: string;
}

/** What the request form collects. */
export type PartRequest = Pick<
  Part,
  | "partName" | "projectId" | "taskId" | "cadLink" | "fileLinks" | "material" | "thickness" | "length" | "width" | "quantity"
  | "method" | "accuracy" | "priority" | "dueDate" | "details"
> & { print?: Partial<PrintDetails> };
