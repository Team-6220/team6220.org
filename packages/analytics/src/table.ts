export type Cell = number | string | boolean | null;

export interface Column {
  key: string;
  label: string;
  /** Unit or format hint for display, e.g. "s", "pts", "%". */
  unit?: string;
}

/** A plain table that every analytics function returns, so it can be shown, exported to CSV, or saved as JSON. */
export interface Table {
  title: string;
  columns: Column[];
  rows: Record<string, Cell>[];
}

function csvCell(v: Cell | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(t: Table): string {
  const header = t.columns.map((c) => csvCell(c.unit ? `${c.label} (${c.unit})` : c.label)).join(",");
  const lines = t.rows.map((r) => t.columns.map((c) => csvCell(r[c.key])).join(","));
  return [header, ...lines].join("\n") + "\n";
}

export function toJSON(t: Table): string {
  return JSON.stringify(t, null, 2);
}

/** Parses simple CSV (quoted fields supported) into header-keyed records. */
export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
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
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  const [header, ...data] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}
