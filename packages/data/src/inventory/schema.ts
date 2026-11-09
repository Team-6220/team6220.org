// Inventory data model: one entry per table of the old Google Sheet (backend/apps-script/inventory/Config.gs),
// with the Wix CMS collection it moves to. This file is the single source of truth for:
//   - the in-browser validation (validate.ts),
//   - the Wix adapter's field mapping (wix-mapping.ts),
//   - the one-time import script (apps/inventory/scripts/import-from-sheet.mjs),
//   - the collection design in apps/inventory/docs/DATA-MODEL.md.
//
// Keep it plain TypeScript (no enums, no parameter properties) so Node can run it directly with type stripping.

/** Column types, same names as Config.gs. */
export type ColumnType =
  | "id" // record ID (Wix: the item's _id)
  | "string" // one line of text
  | "text" // multi-line text
  | "int" // whole number
  | "number" // decimal number
  | "bool"
  | "date" // ISO timestamp
  | "enum" // one of a fixed list
  | "json" // structured data
  | "ref" // ID of a row in another table
  | "refList" // several IDs (Sheet: "ID1|ID2", Wix: array of strings)
  | "measure"; // a size typed by people ("1 1/2"), with a numeric copy in valueColumn

/** Wix CMS field types used by the inventory collections. */
export type WixFieldType = "TEXT" | "NUMBER" | "BOOLEAN" | "DATETIME" | "REFERENCE" | "ARRAY_STRING" | "OBJECT";

export interface Column {
  name: string;
  type: ColumnType;
  /** Only the app sets it; anything the browser sends is ignored. */
  system?: boolean;
  required?: boolean;
  immutable?: boolean;
  label?: string;
  min?: number;
  max?: number;
  maxItems?: number;
  /** For ref / refList: the table it points at. */
  ref?: TableKey;
  /** For refs into the dropdown "lists" table: which list. */
  listKey?: ListKey;
  values?: readonly string[];
  /** For measure: the companion numeric column. */
  valueColumn?: string;
  /** For json: which checker validates it. */
  check?: "filter" | "sections" | "shape" | "placement" | "summary";
  /** For json: the empty value ({} or []). */
  empty?: "object" | "array";
  /** Wix field type override (default comes from wixTypeFor). */
  wixType?: WixFieldType;
}

export type TableKind = "inventory" | "setting" | "audit" | "packing" | "production";

export interface TableDef {
  key: TableKey;
  /** Tab name in the Google Sheet (and the CSV file name the import script looks for). */
  sheet: string;
  /** Wix CMS collection ID. */
  wix: string;
  /** Two-letter ID prefix ("PT-3f9a0c1e"). */
  prefix: string;
  kind: TableKind;
  label: string;
  qtyField?: string | null;
  auditable?: boolean;
  columns: Column[];
}

export const APP_LIMITS = {
  MAX_QUANTITY: 1000000,
  ARCHIVE_PURGE_DAYS: 30,
  PACKING_MAX_DEPTH: 4,
} as const;

export const LIST_KEYS = {
  materialType: "Material types",
  unit: "Units",
  fastenerType: "Fastener types",
  threadSize: "Thread sizes",
  threadPitch: "Thread pitches",
  fastenerMaterial: "Fastener materials",
  wireGauge: "Wire gauges",
} as const;
export type ListKey = keyof typeof LIST_KEYS;
export const LIST_KEY_NAMES = Object.keys(LIST_KEYS) as ListKey[];

export const INVENTORY_SECTIONS = ["parts", "rawMaterials", "tools", "fasteners", "wire"] as const;
export type InventorySection = (typeof INVENTORY_SECTIONS)[number];
/** Fasteners have no quantity, so they are never audited. */
export const AUDIT_SECTIONS = ["parts", "rawMaterials", "tools", "wire"] as const;
export type AuditSection = (typeof AUDIT_SECTIONS)[number];
export const AUDIT_STATUSES = ["unchecked", "confirmed", "different", "missing"] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];
export const PACKING_SECTIONS = ["always", "season", "loadout"] as const;
export type PackingSection = (typeof PACKING_SECTIONS)[number];

export type TableKey =
  | InventorySection
  | "categories"
  | "tags"
  | "locations"
  | "suppliers"
  | "lists"
  | "collections"
  | "auditSessions"
  | "auditItems"
  | "packingItems"
  | "packingNotes"
  | "production";

function inventorySystemColumns(auditable: boolean): Column[] {
  const cols: Column[] = [];
  if (auditable) cols.push({ name: "needsCheck", type: "bool", system: true });
  cols.push(
    { name: "version", type: "int", system: true },
    { name: "createdAt", type: "date", system: true },
    { name: "updatedAt", type: "date", system: true },
    { name: "archivedAt", type: "date", system: true },
  );
  return cols;
}

const MAXQ = APP_LIMITS.MAX_QUANTITY;

export const TABLES: Record<TableKey, TableDef> = {
  // ───────────── Inventory ─────────────
  parts: {
    key: "parts", sheet: "Parts", wix: "inventory_parts", prefix: "PT", kind: "inventory", label: "Parts Inventory",
    qtyField: "quantity", auditable: true,
    columns: [
      { name: "id", type: "id", system: true },
      { name: "name", type: "string", required: true, max: 150 },
      { name: "quantity", type: "int", required: true, min: 0, max: MAXQ },
      { name: "categoryId", type: "ref", ref: "categories", label: "Category" },
      { name: "tagIds", type: "refList", ref: "tags", maxItems: 30, label: "Tags" },
      { name: "locationId", type: "ref", ref: "locations", label: "Location" },
      { name: "supplierId", type: "ref", ref: "suppliers", label: "Supplier" },
      { name: "description", type: "text", max: 2000 },
      { name: "aliases", type: "string", max: 500, label: "Search aliases" },
      { name: "lowStockThreshold", type: "int", min: 0, max: MAXQ, label: "Low stock threshold" },
      { name: "imageId", type: "string", system: true, label: "Photo (Drive file ID)" },
      ...inventorySystemColumns(true),
    ],
  },
  rawMaterials: {
    key: "rawMaterials", sheet: "RawMaterials", wix: "inventory_raw_materials", prefix: "RM", kind: "inventory",
    label: "Raw Materials", qtyField: "quantity", auditable: true,
    columns: [
      { name: "id", type: "id", system: true },
      { name: "materialTypeId", type: "ref", ref: "lists", listKey: "materialType", required: true, label: "Material" },
      { name: "thickness", type: "measure", max: 30, valueColumn: "thicknessValue" },
      { name: "thicknessValue", type: "number", system: true },
      { name: "thicknessUnitId", type: "ref", ref: "lists", listKey: "unit", label: "Thickness unit" },
      { name: "length", type: "measure", max: 30, valueColumn: "lengthValue" },
      { name: "lengthValue", type: "number", system: true },
      { name: "width", type: "measure", max: 30, valueColumn: "widthValue" },
      { name: "widthValue", type: "number", system: true },
      { name: "dimUnitId", type: "ref", ref: "lists", listKey: "unit", label: "Dimension unit" },
      // The piece's outline { kind: 'rect'|'traced', points: [[x,y],...], edges: [...] } in the dimension unit.
      // Length / width / area are filled in from it (bounding box), as in Config.gs and Validate.gs.
      { name: "shape", type: "json", check: "shape", empty: "object", label: "Shape" },
      { name: "area", type: "number", system: true },
      { name: "quantity", type: "int", required: true, min: 0, max: MAXQ },
      { name: "locationId", type: "ref", ref: "locations", label: "Location" },
      { name: "description", type: "text", max: 2000 },
      ...inventorySystemColumns(true),
    ],
  },
  tools: {
    key: "tools", sheet: "Tools", wix: "inventory_tools", prefix: "TL", kind: "inventory", label: "Tools & Equipment",
    qtyField: "quantity", auditable: true,
    columns: [
      { name: "id", type: "id", system: true },
      { name: "name", type: "string", required: true, max: 150 },
      { name: "quantity", type: "int", required: true, min: 0, max: MAXQ },
      { name: "locationId", type: "ref", ref: "locations", label: "Location" },
      { name: "description", type: "text", max: 2000 },
      { name: "imageId", type: "string", system: true, label: "Photo (Drive file ID)" },
      ...inventorySystemColumns(true),
    ],
  },
  fasteners: {
    key: "fasteners", sheet: "Fasteners", wix: "inventory_fasteners", prefix: "FS", kind: "inventory",
    label: "Fastener Reference", qtyField: null, auditable: false,
    columns: [
      { name: "id", type: "id", system: true },
      { name: "typeId", type: "ref", ref: "lists", listKey: "fastenerType", required: true, label: "Type" },
      { name: "threadSizeId", type: "ref", ref: "lists", listKey: "threadSize", required: true, label: "Thread size" },
      { name: "pitchId", type: "ref", ref: "lists", listKey: "threadPitch", label: "Thread pitch" },
      { name: "length", type: "measure", max: 30, valueColumn: "lengthValue" },
      { name: "lengthValue", type: "number", system: true },
      { name: "lengthUnitId", type: "ref", ref: "lists", listKey: "unit", label: "Length unit" },
      { name: "materialId", type: "ref", ref: "lists", listKey: "fastenerMaterial", label: "Material" },
      { name: "description", type: "text", max: 2000 },
      ...inventorySystemColumns(false),
    ],
  },
  wire: {
    key: "wire", sheet: "Wire", wix: "inventory_wire", prefix: "WR", kind: "inventory", label: "Wire Inventory",
    qtyField: "approxLength", auditable: true,
    columns: [
      { name: "id", type: "id", system: true },
      { name: "gaugeId", type: "ref", ref: "lists", listKey: "wireGauge", required: true, label: "Gauge" },
      { name: "approxLength", type: "number", required: true, min: 0, max: MAXQ, label: "Approximate length" },
      { name: "lengthUnitId", type: "ref", ref: "lists", listKey: "unit", label: "Length unit" },
      { name: "typeColor", type: "string", max: 80, label: "Type / color" },
      { name: "locationId", type: "ref", ref: "locations", label: "Location" },
      { name: "description", type: "text", max: 2000 },
      ...inventorySystemColumns(true),
    ],
  },

  // ───────────── Settings ─────────────
  categories: {
    key: "categories", sheet: "Categories", wix: "inventory_categories", prefix: "CA", kind: "setting", label: "Categories",
    columns: [
      { name: "id", type: "id", system: true },
      { name: "name", type: "string", required: true, max: 60 },
      { name: "sortOrder", type: "int", system: true },
    ],
  },
  tags: {
    key: "tags", sheet: "Tags", wix: "inventory_tags", prefix: "TG", kind: "setting", label: "Tags",
    columns: [
      { name: "id", type: "id", system: true },
      { name: "name", type: "string", required: true, max: 60 },
      { name: "categoryId", type: "ref", ref: "categories", label: "Group" },
      { name: "sortOrder", type: "int", system: true },
    ],
  },
  locations: {
    key: "locations", sheet: "Locations", wix: "inventory_locations", prefix: "LO", kind: "setting", label: "Locations",
    columns: [
      { name: "id", type: "id", system: true },
      { name: "parentId", type: "ref", ref: "locations", label: "Area" },
      { name: "name", type: "string", required: true, max: 60 },
      { name: "sortOrder", type: "int", system: true },
    ],
  },
  suppliers: {
    key: "suppliers", sheet: "Suppliers", wix: "inventory_suppliers", prefix: "SU", kind: "setting", label: "Suppliers",
    columns: [
      { name: "id", type: "id", system: true },
      { name: "name", type: "string", required: true, max: 80 },
      { name: "sortOrder", type: "int", system: true },
    ],
  },
  lists: {
    key: "lists", sheet: "Lists", wix: "inventory_lists", prefix: "LI", kind: "setting", label: "Dropdown lists",
    columns: [
      { name: "id", type: "id", system: true },
      { name: "listKey", type: "enum", values: LIST_KEY_NAMES, required: true, immutable: true, label: "List" },
      { name: "value", type: "string", required: true, max: 60 },
      { name: "sortOrder", type: "int", system: true },
    ],
  },
  // "Collections" in the old app = saved filters on an inventory page. The Wix collection is called
  // inventory_saved_filters so it isn't confused with a Wix CMS collection.
  collections: {
    key: "collections", sheet: "Collections", wix: "inventory_saved_filters", prefix: "CO", kind: "setting",
    label: "Saved filters (Collections)",
    columns: [
      { name: "id", type: "id", system: true },
      { name: "name", type: "string", required: true, max: 60 },
      { name: "section", type: "enum", values: INVENTORY_SECTIONS, required: true },
      { name: "filter", type: "json", check: "filter", empty: "object" },
      { name: "sortOrder", type: "int", system: true },
    ],
  },

  // ───────────── Audits ─────────────
  auditSessions: {
    key: "auditSessions", sheet: "AuditSessions", wix: "inventory_audit_sessions", prefix: "AS", kind: "audit",
    label: "Audit sessions",
    columns: [
      { name: "id", type: "id", system: true },
      { name: "name", type: "string", required: true, max: 80 },
      { name: "status", type: "enum", values: ["active", "finalized", "cancelled"], system: true },
      { name: "sections", type: "json", check: "sections", empty: "array", wixType: "ARRAY_STRING" },
      { name: "createdAt", type: "date", system: true },
      { name: "finalizedAt", type: "date", system: true },
      { name: "summary", type: "json", check: "summary", system: true, empty: "object" },
    ],
  },
  auditItems: {
    key: "auditItems", sheet: "AuditItems", wix: "inventory_audit_items", prefix: "AI", kind: "audit",
    label: "Audit items",
    columns: [
      { name: "id", type: "id", system: true },
      { name: "auditId", type: "string", system: true, wixType: "REFERENCE", ref: "auditSessions" },
      { name: "itemTable", type: "string", system: true },
      { name: "itemId", type: "string", system: true },
      { name: "nameSnapshot", type: "string", system: true },
      { name: "baselineQty", type: "number", system: true },
      { name: "countedQty", type: "number" },
      { name: "status", type: "enum", values: AUDIT_STATUSES },
      { name: "updatedAt", type: "date", system: true },
    ],
  },

  // ───────────── Packing list ─────────────
  packingItems: {
    key: "packingItems", sheet: "PackingItems", wix: "inventory_packing_items", prefix: "PK", kind: "packing",
    label: "Packing list",
    columns: [
      { name: "id", type: "id", system: true },
      { name: "parentId", type: "ref", ref: "packingItems", label: "Inside" },
      { name: "section", type: "enum", values: PACKING_SECTIONS, required: true },
      { name: "name", type: "string", required: true, max: 150 },
      { name: "note", type: "text", max: 500 },
      { name: "linkTable", type: "enum", values: ["parts", "tools"], label: "Linked section" },
      { name: "linkId", type: "string", max: 20, label: "Linked item" },
      { name: "imageId", type: "string", system: true, label: "Photo (Drive file ID)" },
      { name: "sortOrder", type: "int", system: true },
      { name: "packed", type: "bool", system: true },
      { name: "verified", type: "bool", system: true },
      { name: "updatedAt", type: "date", system: true },
    ],
  },
  packingNotes: {
    key: "packingNotes", sheet: "PackingNotes", wix: "inventory_packing_notes", prefix: "PN", kind: "packing",
    label: "Packing notes",
    columns: [
      { name: "id", type: "id", system: true },
      { name: "text", type: "text", required: true, max: 500 },
      { name: "done", type: "bool" },
      { name: "createdAt", type: "date", system: true },
    ],
  },

  // ───────────── Production (cut planner) ─────────────
  // One row per physical part to make. The cut planner creates rows; "Mark as cut" updates the stock (service rawCut).
  production: {
    key: "production", sheet: "Production", wix: "inventory_production", prefix: "PR", kind: "production",
    label: "Production",
    columns: [
      { name: "id", type: "id", system: true },
      { name: "partName", type: "string", required: true, max: 100, label: "Part" },
      { name: "materialTypeId", type: "ref", ref: "lists", listKey: "materialType", required: true, label: "Material" },
      { name: "thickness", type: "measure", max: 30, valueColumn: "thicknessValue", required: true },
      { name: "thicknessValue", type: "number", system: true },
      { name: "partLength", type: "number", required: true, min: 0.01, max: 500, label: "Part length (in)" },
      { name: "partWidth", type: "number", required: true, min: 0.01, max: 500, label: "Part width (in)" },
      { name: "method", type: "enum", values: ["handmade", "shapeoko"], required: true },
      { name: "stockLength", type: "number", min: 0, max: 500, label: "Stock length (in)" },
      { name: "stockWidth", type: "number", min: 0, max: 500, label: "Stock width (in)" },
      { name: "rawMaterialId", type: "string", max: 20, label: "Stock piece" },
      { name: "copyIndex", type: "int", min: 0, max: 10000 },
      { name: "placement", type: "json", check: "placement", empty: "object" },
      { name: "status", type: "enum", values: ["planned", "cut", "done"], required: true },
      { name: "notes", type: "text", max: 500 },
      { name: "createdAt", type: "date", system: true },
      { name: "updatedAt", type: "date", system: true },
    ],
  },
};

export const TABLE_KEYS = Object.keys(TABLES) as TableKey[];

/** Extra collection for small app-wide values (Apps Script kept these in Script Properties). */
export const META_COLLECTION = "inventory_meta";
export const META_KEYS = ["packingMeta"] as const;
export type MetaKey = (typeof META_KEYS)[number];

/** Default Wix field type for a column. */
export function wixTypeFor(col: Column): WixFieldType {
  if (col.wixType) return col.wixType;
  switch (col.type) {
    case "int":
    case "number":
      return "NUMBER";
    case "bool":
      return "BOOLEAN";
    case "date":
      return "DATETIME";
    case "ref":
      return "REFERENCE";
    case "refList":
      return "ARRAY_STRING";
    case "json":
      return col.empty === "array" ? "ARRAY_STRING" : "OBJECT";
    default:
      return "TEXT";
  }
}

export function columnLabel(col: Column): string {
  if (col.label) return col.label;
  const s = col.name.replace(/Ids?$/, "").replace(/([A-Z])/g, " $1").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getColumn(key: TableKey, name: string): Column | undefined {
  return TABLES[key].columns.find((c) => c.name === name);
}

/**
 * Wix collection permissions for every inventory collection (Phase 1).
 * Every approved member (Team Member badge) may view and edit the inventory; there is no separate inventory role.
 * Wix can only tell "site member" from "visitor" here, so in Phase 1 any signed-in site member could write; the
 * app shows editing only to approved members (cosmetic). Phase 2 moves writes behind /api/inventory, where
 * insert/update/remove become ADMIN and the server writes after checking the Team Member badge.
 */
export const WIX_PERMISSIONS_PHASE1 = {
  read: "SITE_MEMBER",
  insert: "SITE_MEMBER",
  update: "SITE_MEMBER",
  remove: "SITE_MEMBER",
} as const;
export const WIX_PERMISSIONS_PHASE2 = {
  read: "SITE_MEMBER",
  insert: "ADMIN",
  update: "ADMIN",
  remove: "ADMIN",
} as const;

/** Wix "create collection" bodies for every inventory collection (used by docs and the import script's --print-schema). */
export function wixCollectionDefinitions(permissions: Record<string, string> = WIX_PERMISSIONS_PHASE1) {
  const defs = TABLE_KEYS.map((key) => {
    const t = TABLES[key];
    const fields = t.columns
      .filter((c) => c.type !== "id")
      .map((c) => {
        const type = wixTypeFor(c);
        const f: Record<string, unknown> = { key: c.name, displayName: columnLabel(c), type };
        if (type === "REFERENCE" && c.ref) {
          f.typeMetadata = { reference: { referencedCollectionId: TABLES[c.ref].wix } };
        }
        return f;
      });
    const display = t.columns.find((c) => c.name === "name" || c.name === "value" || c.name === "text" || c.name === "partName");
    return {
      id: t.wix,
      displayName: `Inventory: ${t.label}`,
      ...(display ? { displayField: display.name } : {}),
      fields,
      permissions: { ...permissions },
    };
  });
  defs.push({
    id: META_COLLECTION,
    displayName: "Inventory: app settings",
    displayField: "key",
    fields: [
      { key: "key", displayName: "Key", type: "TEXT" },
      { key: "value", displayName: "Value", type: "OBJECT" },
    ],
    permissions: { ...permissions },
  });
  return defs;
}
