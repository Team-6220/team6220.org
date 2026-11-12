// Turns an order into the rows of the team's BOM Google Sheet ("BOM Template"), so an exported file opens
// looking like the sheets people already know. One order is one tab.
//
// Columns A to M:
//   Item Name | Link | Item Cost | Qty | Cost | Two Mentor Signature (two columns) | Ordered | Received |
//   Store Subtotal | Store Total | Total | Comments
// Each vendor is a heading row followed by its lines. Beside a vendor's first three lines, columns J and K hold:
//   line 1: the subtotal of the lines | what was really paid
//   line 2: "Order Date:"             | "Approval to Order:"
//   line 3: the order date            | who approved
// The order's grand total (the sum of what was paid) is in column L of the first vendor's heading row.
import { formatMoney, lineCost, totalCost } from "./rules";
import type { OrderDetail } from "./types";

export const SHEET_HEADER = [
  "Item Name", "Link", "Item Cost", "Qty", "Cost", "Two Mentor Signature", "", "Ordered", "Received",
  "Store Subtotal", "Store Total", "Total", "Comments",
];
/** Every vendor block has at least this many line rows, so there is room for the cells in columns J and K. */
const MIN_ROWS_PER_VENDOR = 3;

const bool = (value: boolean) => (value ? "TRUE" : "FALSE");

export function orderToSheetRows(detail: OrderDetail): string[][] {
  const rows: string[][] = [SHEET_HEADER];
  const grandTotal = detail.sections.reduce((sum, s) => sum + Math.round((s.section.finalTotal ?? 0) * 100), 0) / 100;

  detail.sections.forEach(({ section, lines }, sectionIndex) => {
    const heading = Array<string>(SHEET_HEADER.length).fill("");
    heading[0] = section.vendor;
    if (sectionIndex === 0) heading[11] = formatMoney(grandTotal);
    rows.push(heading);

    const beside = [
      [formatMoney(totalCost(lines)), formatMoney(section.finalTotal ?? 0)],
      ["Order Date:", "Approval to Order:"],
      [section.orderDate, section.approval?.name ?? ""],
    ];
    const count = Math.max(lines.length, MIN_ROWS_PER_VENDOR);
    for (let i = 0; i < count; i++) {
      const line = lines[i];
      const [subtotalCell, totalCell] = beside[i] ?? ["", ""];
      rows.push([
        line?.name ?? "",
        line?.link ?? "",
        line ? formatMoney(line.unitCost) : "",
        line ? String(line.quantity) : "",
        formatMoney(line ? lineCost(line) : 0),
        line?.signatures[0]?.name ?? "",
        line?.signatures[1]?.name ?? "",
        bool(!!line?.orderedAt),
        bool(!!line && line.receivedQty >= line.quantity),
        subtotalCell,
        totalCell,
        "",
        line?.comments ?? "",
      ]);
    }
  });
  return rows;
}

export { toCsv } from "../ops/csv";
