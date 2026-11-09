// Reading CSV exports of the old inventory Google Sheet and turning them into app records.
// Mirrors how backend/apps-script/inventory/Db.gs reads cells (fromCell_), so the import keeps exactly
// what the old app saw. Used by import-from-sheet.mjs and its tests.

import { TABLES, TABLE_KEYS } from "../../../../packages/data/src/inventory/schema.ts";
import { ID_PATTERN, parseMeasure } from "../../../../packages/data/src/inventory/util.ts";

/** RFC 4180 CSV parser (quotes, doubled quotes, newlines inside quotes, CRLF). Returns rows of strings. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let atStart = true; // a quote only opens a quoted cell at the start of the cell; elsewhere it is literal
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // BOM
  for (; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"' && atStart) {
      inQuotes = true;
      atStart = false;
    } else if (c === ",") {
      row.push(field);
      field = "";
      atStart = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      atStart = true;
    } else {
      field += c;
      atStart = false;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** One sheet cell (as CSV text) -> value, like Db.gs fromCell_. */
export function fromCell(col, raw) {
  const v = raw === undefined || raw === null ? "" : String(raw);
  switch (col.type) {
    case "int":
    case "number": {
      if (v.trim() === "") return null;
      const n = Number(v.replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : null;
    }
    case "bool":
      return v.trim().toUpperCase() === "TRUE";
    case "refList":
      return v.trim() === "" ? [] : v.split("|").map((s) => s.trim()).filter(Boolean);
    case "json": {
      const empty = col.empty === "array" ? [] : {};
      if (v.trim() === "") return empty;
      try {
        return JSON.parse(v);
      } catch {
        return empty;
      }
    }
    default: {
      let s = v;
      if (s.charAt(0) === "'" && s.charAt(1) === "=") s = s.slice(1); // Db.gs toCell_ escaped leading "="
      return col.type === "id" || col.type === "ref" || col.type === "enum" || col.type === "date" ? s.trim() : s;
    }
  }
}

/**
 * Parses one tab's CSV into records. Columns are found by header name (like Db.gs), so column order
 * doesn't matter and extra columns are ignored. Rows with a blank ID are skipped (Db.gs did the same).
 * Returns { rows, problems: [{ level: 'error'|'warning', message }] }.
 */
export function readTable(key, csvText) {
  const def = TABLES[key];
  const problems = [];
  const data = parseCsv(csvText);
  if (!data.length) return { rows: [], problems: [{ level: "error", message: `${def.sheet}: the file is empty (no header row).` }] };
  const headers = data[0].map((h) => h.trim());
  const idx = new Map();
  headers.forEach((h, i) => h && !idx.has(h) && idx.set(h, i));
  const missing = def.columns.filter((c) => !idx.has(c.name)).map((c) => c.name);
  if (missing.length) problems.push({ level: "error", message: `${def.sheet}: missing column(s) ${missing.join(", ")}.` });
  const extra = headers.filter((h) => h && !def.columns.some((c) => c.name === h));
  if (extra.length) problems.push({ level: "warning", message: `${def.sheet}: extra column(s) not imported: ${extra.join(", ")}.` });
  if (missing.includes("id")) return { rows: [], problems };

  const rows = [];
  const seen = new Set();
  for (let r = 1; r < data.length; r++) {
    const cells = data[r];
    if (cells.every((c) => c === "")) continue;
    const id = String(cells[idx.get("id")] ?? "").trim();
    if (!id) continue;
    const line = r + 1;
    if (!ID_PATTERN.test(id) || !id.startsWith(def.prefix + "-")) {
      problems.push({ level: "error", message: `${def.sheet} row ${line}: "${id}" is not a ${def.prefix}- ID.` });
      continue;
    }
    if (seen.has(id)) {
      problems.push({ level: "error", message: `${def.sheet} row ${line}: duplicate ID ${id}.` });
      continue;
    }
    seen.add(id);
    const rec = { id };
    for (const col of def.columns) {
      if (col.type === "id") continue;
      rec[col.name] = idx.has(col.name) ? fromCell(col, cells[idx.get(col.name)]) : fromCell(col, "");
      if (col.required && (rec[col.name] === "" || rec[col.name] === null || (Array.isArray(rec[col.name]) && !rec[col.name].length))) {
        problems.push({ level: "warning", message: `${def.sheet} row ${line} (${id}): required field "${col.name}" is empty.` });
      }
      if (col.type === "measure" && rec[col.name] !== "" && parseMeasure(rec[col.name]) === null) {
        problems.push({ level: "warning", message: `${def.sheet} row ${line} (${id}): "${col.name}" = "${rec[col.name]}" is not a size.` });
      }
      if (col.type === "date" && rec[col.name] && Number.isNaN(Date.parse(rec[col.name]))) {
        problems.push({ level: "warning", message: `${def.sheet} row ${line} (${id}): "${col.name}" = "${rec[col.name]}" is not a date; left empty.` });
        rec[col.name] = "";
      }
      if ((col.type === "int" || col.type === "number") && idx.has(col.name)) {
        const rawCell = String(cells[idx.get(col.name)] ?? "").trim();
        if (rawCell !== "" && rec[col.name] === null) {
          problems.push({ level: "warning", message: `${def.sheet} row ${line} (${id}): "${col.name}" = "${rawCell}" is not a number; left empty.` });
        }
      }
    }
    rows.push(rec);
  }
  return { rows, problems };
}

/**
 * Checks references between the imported tables. Dangling references (to rows that don't exist) are
 * cleared, as the old app treated them as empty, and reported as warnings.
 */
export function checkReferences(tables) {
  const problems = [];
  const ids = {};
  for (const k of TABLE_KEYS) ids[k] = new Set((tables[k] ?? []).map((r) => r.id));
  for (const k of TABLE_KEYS) {
    const def = TABLES[k];
    for (const r of tables[k] ?? []) {
      for (const col of def.columns) {
        if (!col.ref) continue;
        if (col.type === "ref" || (col.wixType === "REFERENCE" && col.type === "string")) {
          if (r[col.name] && !ids[col.ref].has(r[col.name])) {
            problems.push({ level: "warning", message: `${def.sheet} ${r.id}: ${col.name} points at missing ${r[col.name]}; cleared.` });
            r[col.name] = "";
          }
        } else if (col.type === "refList") {
          const keep = r[col.name].filter((x) => ids[col.ref].has(x));
          if (keep.length !== r[col.name].length) {
            const gone = r[col.name].filter((x) => !ids[col.ref].has(x));
            problems.push({ level: "warning", message: `${def.sheet} ${r.id}: ${col.name} points at missing ${gone.join(", ")}; removed.` });
            r[col.name] = keep;
          }
        }
      }
    }
  }
  return problems;
}

/** Finds the CSV file for a tab: "Parts.csv", or Google's "<spreadsheet name> - Parts.csv". */
export function findCsvFile(fileNames, sheet) {
  const lower = fileNames.map((f) => f.toLowerCase());
  const exact = lower.indexOf(`${sheet.toLowerCase()}.csv`);
  if (exact >= 0) return fileNames[exact];
  const suffix = lower.findIndex((f) => f.endsWith(` - ${sheet.toLowerCase()}.csv`));
  return suffix >= 0 ? fileNames[suffix] : null;
}
