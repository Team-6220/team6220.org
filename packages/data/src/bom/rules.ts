// Small pure helpers about BOM records, used by the screens, the export and the demo backend.
// The rules that decide who may do what are enforced in backend/apps-script/ops-api/Bom.gs.
import type { Project } from "../ops/types";
import type { Line, LineState, Order, Section } from "./types";

export const SIGNATURES_NEEDED = 2;

/** The vendor sections a new order starts with (the headings of the team's BOM Template sheet). */
export const DEFAULT_VENDORS = [
  "Amazon", "McMaster-Carr", "AndyMark", "REV Robotics", "The ThriftyBot", "WestCoast Products",
  "Ganahl Lumber (in-person)", "Single Items",
];

/** Money is added in whole cents so $0.10 + $0.20 is exactly $0.30. */
const cents = (dollars: number) => Math.round(dollars * 100);

/** Unit cost times quantity, in dollars. */
export function lineCost(line: Pick<Line, "unitCost" | "quantity">): number {
  return (cents(line.unitCost) * line.quantity) / 100;
}

export function totalCost(lines: Pick<Line, "unitCost" | "quantity">[]): number {
  return lines.reduce((sum, line) => sum + cents(line.unitCost) * line.quantity, 0) / 100;
}

/** "$1,234.50" */
export function formatMoney(dollars: number): string {
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function lineState(line: Pick<Line, "signatures" | "orderedAt" | "receivedQty" | "quantity">): LineState {
  if (line.receivedQty >= line.quantity) return "received";
  if (line.receivedQty > 0) return "partly-received";
  if (line.orderedAt) return "ordered";
  if (line.signatures.length >= SIGNATURES_NEEDED) return "approved";
  return line.signatures.length ? "signed-once" : "draft";
}

export const LINE_STATE_LABELS: Record<LineState, string> = {
  draft: "Needs signatures",
  "signed-once": "Signed 1 of 2",
  approved: "Approved",
  ordered: "Ordered",
  "partly-received": "Partly received",
  received: "Received",
};

/** Why this person can't sign this line, or "" when they can. Mirrors cantSign_ in Bom.gs. */
export function cantSign(line: Line, memberId: string): string {
  if (line.orderedAt) return "Already ordered.";
  if (line.signatures.length >= SIGNATURES_NEEDED) return "Already has two signatures.";
  if (line.signatures.some((s) => s.memberId === memberId)) return "You already signed this line.";
  if (!line.name || !(line.quantity >= 1)) return "The line isn't filled in yet.";
  return "";
}

/**
 * What an order is called: its custom name, or "<project name> 2" when it belongs to a project,
 * or "Order 3" (team decision, Nov 12, 2026).
 */
export function orderName(order: Pick<Order, "customName" | "projectId" | "sequence">, projects: Pick<Project, "_id" | "name">[]): string {
  if (order.customName) return order.customName;
  const project = order.projectId ? projects.find((p) => p._id === order.projectId) : undefined;
  return `${project ? project.name : "Order"} ${order.sequence}`;
}

export function bySortOrder(a: Section, b: Section): number {
  return a.sortOrder - b.sortOrder;
}
