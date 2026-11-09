import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { checkReferences, findCsvFile, fromCell, parseCsv, readTable } from "../scripts/lib/sheet.mjs";
import { IMPORT_ORDER, loadFolder } from "../scripts/import-from-sheet.mjs";
import { TABLES, TABLE_KEYS } from "@team6220/data/inventory";
import { toWixItem } from "../../../packages/data/src/inventory/wix-mapping.ts";

// Made-up sample data (no real inventory, nothing about students).
const FIXTURES = fileURLToPath(new URL("./fixtures/sheet-export", import.meta.url));

describe("CSV parsing", () => {
  it("handles quotes, doubled quotes, commas and newlines in cells", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n"two\nlines",\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["two\nlines", ""],
    ]);
  });

  it("reads cells like the Apps Script did", () => {
    const col = (t: string, extra = {}) => ({ name: "x", type: t, ...extra });
    expect(fromCell(col("int"), "")).toBeNull();
    expect(fromCell(col("int"), "1,200")).toBe(1200);
    expect(fromCell(col("bool"), "TRUE")).toBe(true);
    expect(fromCell(col("bool"), "false")).toBe(false);
    expect(fromCell(col("refList"), "TG-1| TG-2|")).toEqual(["TG-1", "TG-2"]);
    expect(fromCell(col("json", { empty: "object" }), "not json")).toEqual({});
    expect(fromCell(col("string"), "'=A1")).toBe("=A1");
  });

  it("finds Google's default export names", () => {
    expect(findCsvFile(["Golden Griffins Inventory - Parts.csv"], "Parts")).toBe("Golden Griffins Inventory - Parts.csv");
    expect(findCsvFile(["parts.csv"], "Parts")).toBe("parts.csv");
    expect(findCsvFile(["Inventory - RawMaterials.csv"], "Parts")).toBeNull();
  });
});

describe("reading a tab", () => {
  it("finds columns by header name, skips blank IDs and flags bad IDs", () => {
    const csv = "quantity,id,name\n3,PT-0000000a,Gear\n1,,skip me\n2,XX-0000000b,Wrong prefix\n";
    const r = readTable("parts", csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ id: "PT-0000000a", name: "Gear", quantity: 3, tagIds: [] });
    expect(r.problems.some((p) => p.level === "error" && /missing column/.test(p.message))).toBe(true);
    expect(r.problems.some((p) => p.level === "error" && /not a PT- ID/.test(p.message))).toBe(true);
  });

  it("clears dangling references with a warning", () => {
    const tables = Object.fromEntries(TABLE_KEYS.map((k) => [k, [] as Record<string, unknown>[]]));
    tables.parts = [{ id: "PT-0000000a", locationId: "LO-00000009", tagIds: ["TG-00000001"] }];
    const problems = checkReferences(tables);
    expect(problems).toHaveLength(2);
    expect(tables.parts[0]).toMatchObject({ locationId: "", tagIds: [] });
  });
});

describe("loading the sample export", () => {
  const { tables, problems } = loadFolder(FIXTURES, null);

  it("reads every tab that is there", () => {
    expect(tables.parts.map((p: { id: string }) => p.id)).toEqual(["PT-0000000a", "PT-0000000b", "PT-0000000c"]);
    expect(tables.wire[0].approxLength).toBe(12.5);
    expect(tables.parts[0].description).toBe('Flanged, "FR8"');
    expect(tables.parts[2].name).toBe("=SUM formula-looking name");
    expect(tables.parts[2].description).toBe("two\nlines");
    expect(tables.parts[1].archivedAt).toBe("2026-10-20T10:00:00.000Z");
    expect(tables.auditSessions[0].summary).toEqual({ total: 2, confirmed: 2 });
  });

  it("puts areas before the containers in them", () => {
    expect(tables.locations.map((l: { name: string }) => l.name)).toEqual(["Shop", "Drawer A"]);
  });

  it("reports problems without errors for a good export", () => {
    expect(problems.filter((p: { level: string }) => p.level === "error")).toEqual([]);
    const msgs = problems.map((p: { message: string }) => p.message).join("\n");
    expect(msgs).toMatch(/extra column\(s\) not imported: Notes \(extra column\)/);
    expect(msgs).toMatch(/TG-0000dead/); // dangling tag
    expect(msgs).toMatch(/AuditItems: 1 row\(s\) belong to no active audit/);
    expect(tables.auditItems).toEqual([]);
  });

  it("builds the REST bodies with the old IDs", () => {
    const item = toWixItem("parts", tables.parts[0], "rest");
    expect(item).toMatchObject({ _id: "PT-0000000a", quantity: 48, tagIds: ["TG-00000001", "TG-00000002"], createdAt: { $date: "2026-09-01T17:00:00.000Z" } });
  });

  it("imports every table, references first", () => {
    expect([...IMPORT_ORDER].sort()).toEqual([...TABLE_KEYS].sort());
    for (const k of TABLE_KEYS) {
      for (const c of TABLES[k].columns) {
        if (c.ref && c.ref !== k) expect(IMPORT_ORDER.indexOf(c.ref)).toBeLessThan(IMPORT_ORDER.indexOf(k));
      }
    }
  });
});
