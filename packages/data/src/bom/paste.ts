// Copying BOM rows to the clipboard and pasting rows from it, so lines can move between this app and Google
// Sheets (or Excel), and between orders. A spreadsheet puts rows on the clipboard as text with a TAB between
// cells and a new line between rows.
//
// The cells are in the order of the team's BOM sheet (see export.ts):
//   Item Name | Link | Item Cost | Qty | Cost | signature | signature | Ordered | Received | ... | Comments
// Only the first four and the comments are read when pasting: signatures and "ordered" can't be pasted in.
import { formatMoney, lineCost } from "./rules";
import type { Line, LineInput } from "./types";

const COMMENTS_COLUMN = 12; // column M of the sheet

/** Lines as clipboard text that pastes into the team's BOM sheet with every cell in the right column. */
export function linesToTsv(lines: Line[]): string {
  const cell = (value: string) => value.replace(/[\t\r\n]+/g, " "); // a tab or line break inside a cell would shift the rest
  return lines
    .map((line) =>
      [
        line.name, line.link, formatMoney(line.unitCost), String(line.quantity), formatMoney(lineCost(line)),
        line.signatures[0]?.name ?? "", line.signatures[1]?.name ?? "",
        line.orderedAt ? "TRUE" : "FALSE", line.receivedQty >= line.quantity ? "TRUE" : "FALSE", "", "", "", line.comments,
      ].map(cell).join("\t"),
    )
    .join("\n");
}

export interface PastedRows {
  lines: Omit<LineInput, "sectionId" | "_id">[];
  /** Rows that were left out, and why, to show before saving. */
  skipped: string[];
}

/** "$1,234.50" or "12.5" -> a number of dollars, or null. */
function money(cell: string): number | null {
  const cleaned = cell.replace(/[$,\s]/g, "");
  return /^\d*\.?\d+$/.test(cleaned) ? Math.round(Number(cleaned) * 100) / 100 : null;
}

/**
 * Clipboard text to new lines. Accepts rows copied from the BOM sheet, from this app, or a simple list with
 * just "name, link, cost, qty". Heading rows, vendor names and empty rows are skipped.
 */
export function parsePastedRows(text: string): PastedRows {
  const lines: PastedRows["lines"] = [];
  const skipped: string[] = [];
  for (const row of text.split(/\r?\n/)) {
    const cells = row.split("\t").map((c) => c.trim());
    const name = cells[0] ?? "";
    if (!name || name === "Item Name") continue;
    const unitCost = money(cells[2] ?? "");
    const quantity = Number(cells[3] ?? "");
    if (!cells[2] && !cells[3]) continue; // a vendor heading row ("Amazon") has a name and nothing else
    if (unitCost === null || !Number.isInteger(quantity) || quantity < 1) {
      skipped.push(`"${name}": the cost or quantity isn't a number`);
      continue;
    }
    lines.push({ name, link: cells[1] ?? "", vendorPartNumber: "", unitCost, quantity, comments: cells[COMMENTS_COLUMN] ?? "" });
  }
  return { lines, skipped };
}
