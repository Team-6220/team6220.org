// Shapes of the BOM app's records. Plan: docs/operations/BOM.md. Collections: bom_boms, bom_orders,
// bom_sections, bom_lines (members can read them; every write goes through the ops API).
import type { Item } from "../ops/types";

/** Who did something, and when. */
export interface Stamp {
  memberId: string;
  name: string;
  /** ISO date and time. Empty for signatures imported from an old sheet. */
  at: string;
  /** True for a typed name copied from an old Google Sheet, which no signed-in person made. */
  imported?: boolean;
}

/** One season's purchasing, for example "2027 Competition BOM". */
export interface Bom extends Item {
  name: string;
  season: string;
  status: "open" | "closed";
}

/** One round of buying inside a BOM (a tab in the old sheets). */
export interface Order extends Item {
  bomId: string;
  /** The project this order belongs to, or "" for a plain numbered order. */
  projectId: string;
  /** 1, 2, 3... counted separately for plain orders and for each project. */
  sequence: number;
  /** A name that replaces the automatic one, for example "Mouser Order". */
  customName: string;
  createdAt: string;
}

/** The lines for one vendor inside an order. */
export interface Section extends Item {
  orderId: string;
  vendor: string;
  sortOrder: number;
  /** "Approval to Order", given by a Mentor or Booster. */
  approval: Stamp | null;
  orderedBy: Stamp | null;
  /** yyyy-mm-dd */
  orderDate: string;
  /** What was really paid, with tax and shipping. Null until ordered. */
  finalTotal: number | null;
  /** yyyy-mm-dd, if known */
  expectedArrival: string;
}

/** One item to buy. */
export interface Line extends Item {
  sectionId: string;
  name: string;
  link: string;
  vendorPartNumber: string;
  /** Dollars for one. */
  unitCost: number;
  quantity: number;
  comments: string;
  requestedBy: Stamp;
  /** Up to two, from two different Mentors or Boosters. */
  signatures: Stamp[];
  /** ISO date and time, or "" when not ordered yet. */
  orderedAt: string;
  receivedQty: number;
  receivedAt: string;
  receivedBy: Stamp | null;
  /** The Inventory part this line refills, or "" when it is not tracked in Inventory (or not decided yet). */
  inventoryItemId: string;
}

/** What the form for a line collects. */
export interface LineInput {
  _id?: string;
  sectionId: string;
  name: string;
  link: string;
  vendorPartNumber: string;
  unitCost: number;
  quantity: number;
  comments: string;
}

/** Where a line is in its life. */
export type LineState = "draft" | "signed-once" | "approved" | "ordered" | "partly-received" | "received";

/** One order with everything in it, as the screen shows it. */
export interface OrderDetail {
  order: Order;
  sections: { section: Section; lines: Line[] }[];
}

export interface SignResult {
  signed: Line[];
  skipped: { lineId: string; reason: string }[];
  /** Cost of the lines that were signed, worked out on the server. */
  total: number;
}
