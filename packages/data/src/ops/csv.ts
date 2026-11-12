// CSV text for downloads (BOM orders, Icarus task lists).

/** Rows to CSV text (RFC 4180: cells with commas, quotes or line breaks are quoted). */
export function toCsv(rows: string[][]): string {
  const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
