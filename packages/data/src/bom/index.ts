// bom: the functions /apps/bom uses. Plan: docs/operations/BOM.md.
//
//   import { bom } from "@team6220/data";
//   const boms = await bom.listBoms();
//   const detail = await bom.getOrder(orderId);        // the order, its vendor sections and their lines
//   await bom.signLines([lineId1, lineId2]);            // Mentors and Boosters; checked on the server
//
// Reading goes straight to Wix. Every change goes through the ops API (backend/apps-script/ops-api/Bom.gs),
// because members can read the bom_* collections but not write them.
import "./mock"; // registers the demo data and demo rules (only used in demo mode)
import { callOps, store } from "../ops";
import { bySortOrder } from "./rules";
import type { ImportedOrder } from "./import";
import type { Bom, Line, LineInput, Order, OrderDetail, Section, SignResult } from "./types";

/** Every BOM, newest season first. */
export async function listBoms(): Promise<Bom[]> {
  return (await store().list<Bom>("bom_boms")).sort((a, b) => b.season.localeCompare(a.season) || a.name.localeCompare(b.name));
}

/** The orders of one BOM, oldest first. */
export async function listOrders(bomId: string): Promise<Order[]> {
  const orders = await store().list<Order>("bom_orders");
  return orders.filter((o) => o.bomId === bomId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** One order with its vendor sections and lines, or null if it no longer exists. */
export async function getOrder(orderId: string): Promise<OrderDetail | null> {
  const [orders, sections, lines] = await Promise.all([
    store().list<Order>("bom_orders"),
    store().list<Section>("bom_sections"),
    store().list<Line>("bom_lines"),
  ]);
  const order = orders.find((o) => o._id === orderId);
  if (!order) return null;
  return {
    order,
    sections: sections
      .filter((s) => s.orderId === orderId)
      .sort(bySortOrder)
      .map((section) => ({ section, lines: lines.filter((l) => l.sectionId === section._id) })),
  };
}

// ----- changes (each is checked by the server; the comment says who may make it) -----

/** Leads. */
export async function saveBom(bom: { _id?: string; name: string; season?: string; status?: Bom["status"] }): Promise<Bom> {
  return (await callOps<{ bom: Bom }>("saveBom", { bom })).bom;
}

/** Leads. The order is numbered automatically and starts with the default vendor sections. */
export async function createOrder(order: { bomId: string; projectId?: string; customName?: string }): Promise<Order> {
  return (await callOps<{ order: Order }>("createOrder", { order })).order;
}

/** Team members. */
export async function addSection(orderId: string, vendor: string): Promise<Section> {
  return (await callOps<{ section: Section }>("addSection", { orderId, vendor })).section;
}

/**
 * Team members. Adds a line, or changes one that isn't ordered yet. Changing the item, link, cost or quantity
 * of a signed line removes its signatures; `signaturesCleared` says when that happened.
 */
export async function saveLine(line: LineInput): Promise<{ line: Line; signaturesCleared: boolean }> {
  return callOps("saveLine", { line });
}

/** Team members, and only for a line nobody has signed. */
export async function removeLine(lineId: string): Promise<void> {
  await callOps("removeLine", { lineId });
}

/** Leads. Takes a line back to "not signed, not ordered". */
export async function reopenLine(lineId: string): Promise<Line> {
  return (await callOps<{ line: Line }>("reopenLine", { lineId })).line;
}

/** Mentors and Boosters. Signs many lines at once; lines that can't be signed are skipped with the reason. */
export async function signLines(lineIds: string[]): Promise<SignResult> {
  return callOps<SignResult>("signLines", { lineIds });
}

/** Mentors and Boosters. Gives "Approval to Order" for one vendor section. */
export async function approveSection(sectionId: string): Promise<Section> {
  return (await callOps<{ section: Section }>("approveSection", { sectionId })).section;
}

/** Mentors and Boosters. Marks the fully signed lines of a section as ordered and records what was paid. */
export async function markOrdered(args: {
  sectionId: string;
  orderDate: string;
  finalTotal: number;
  expectedArrival?: string;
}): Promise<{ section: Section; ordered: Line[]; notReady: number }> {
  return callOps("markOrdered", args);
}

/** Team members. Records that ordered items arrived; part of a line can be received. */
export async function receiveLines(items: { lineId: string; quantity: number }[]): Promise<Line[]> {
  return (await callOps<{ lines: Line[] }>("receiveLines", { items })).lines;
}

/** Leads. Saves one tab of an old BOM sheet (already read with parseSheetRows) as a new order. */
export async function importOrder(bomId: string, customName: string, imported: ImportedOrder): Promise<Order> {
  return (await callOps<{ order: Order }>("importOrder", { bomId, customName, sections: imported.sections })).order;
}

export * from "./rules";
export { orderToSheetRows, toCsv } from "./export";
export { parseSheetRows, parseCsv, type ImportedOrder } from "./import";
export type * from "./types";
