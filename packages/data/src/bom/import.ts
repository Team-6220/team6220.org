// Reads one tab of an old BOM Google Sheet (File > Download > Comma-separated values) into an order the
// server can save. The layout is described in export.ts. Columns are found by their heading, so the
// "Mouser Order" tab, which has an extra part-number column, also works.
import { SHEET_HEADER } from "./export";

export interface ImportedLine {
  name: string;
  link: string;
  vendorPartNumber: string;
  unitCost: number;
  quantity: number;
  comments: string;
  /** Names typed in the two signature columns. They are kept as text and marked "imported". */
  signatureNames: string[];
  ordered: boolean;
  received: boolean;
}

export interface ImportedSection {
  vendor: string;
  orderDate: string;
  approvalName: string;
  finalTotal: number | null;
  lines: ImportedLine[];
}

export interface ImportedOrder {
  sections: ImportedSection[];
  /** Things the reader wasn't sure about, to show before saving. */
  warnings: string[];
}

/** CSV text to rows (RFC 4180). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** "$1,234.50" -> 1234.5. Returns null for a cell that isn't money. */
function parseMoney(cell: string): number | null {
  const cleaned = cell.replace(/[$,\s]/g, "");
  if (!cleaned || !/^\d*\.?\d+$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100) / 100;
}

export function parseSheetRows(rows: string[][]): ImportedOrder {
  const warnings: string[] = [];
  const header = (rows[0] ?? []).map((h) => h.trim());
  const column = (title: string) => header.indexOf(title);
  const col = {
    name: column("Item Name"),
    link: column("Link"),
    unitCost: column("Item Cost"),
    quantity: column("Qty"),
    signature: column("Two Mentor Signature"),
    ordered: column("Ordered"),
    received: column("Received"),
    subtotal: column("Store Subtotal"),
    total: column("Store Total"),
    comments: header.findIndex((h) => h.startsWith("Comments")),
    partNumber: header.findIndex((h) => h.includes("#")),
  };
  if (col.name !== 0 || col.unitCost === -1 || col.quantity === -1) {
    throw new Error(`This doesn't look like a BOM sheet. The first row should start with: ${SHEET_HEADER.slice(0, 5).join(", ")}.`);
  }
  const at = (row: string[], index: number) => (index === -1 ? "" : (row[index] ?? "").trim());

  const sections: ImportedSection[] = [];
  let section: ImportedSection | undefined;
  let rowInSection = 0;
  for (const row of rows.slice(1)) {
    const name = at(row, col.name);
    const isLine = !!name && (!!at(row, col.unitCost) || !!at(row, col.quantity));
    if (name && !isLine) {
      section = { vendor: name, orderDate: "", approvalName: "", finalTotal: null, lines: [] };
      sections.push(section);
      rowInSection = 0;
      continue;
    }
    if (!section) continue;
    rowInSection++;
    // Columns J and K beside a vendor's first and third rows hold its total and its order date and approval.
    if (rowInSection === 1) section.finalTotal = parseMoney(at(row, col.total));
    if (rowInSection === 3) {
      section.orderDate = at(row, col.subtotal);
      section.approvalName = at(row, col.total);
    }
    if (!isLine) continue;
    const unitCost = parseMoney(at(row, col.unitCost));
    const quantity = Number(at(row, col.quantity));
    if (unitCost === null || !Number.isInteger(quantity) || quantity < 1) {
      warnings.push(`Skipped "${name}" under ${section.vendor}: its cost or quantity isn't a number.`);
      continue;
    }
    section.lines.push({
      name,
      link: at(row, col.link),
      vendorPartNumber: at(row, col.partNumber),
      unitCost,
      quantity,
      comments: at(row, col.comments),
      signatureNames: [at(row, col.signature), at(row, col.signature + 1)].filter(Boolean),
      ordered: at(row, col.ordered).toUpperCase() === "TRUE",
      received: at(row, col.received).toUpperCase() === "TRUE",
    });
  }
  if (!sections.some((s) => s.lines.length)) warnings.push("No items were found in this file.");
  return { sections: sections.filter((s) => s.lines.length), warnings };
}
