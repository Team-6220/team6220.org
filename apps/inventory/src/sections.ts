// What each inventory page shows, filters, sorts and edits. Ported from the section configs in
// JsParts.html and JsSections.html. To add a field: add the column in packages/data/src/inventory/schema.ts,
// then add it to `form` here (and `columns` / `search` if it should be visible or searchable).
import type { InventorySection, ListKey, Row } from "@team6220/data/inventory";
import { natural, type Lookup } from "./lib/lookup.ts";
import type { SearchField } from "./lib/search.ts";

export type FormFieldType = "text" | "textarea" | "int" | "number" | "measure" | "list" | "location" | "category" | "supplier" | "tags";

export interface FormField {
  name: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  listKey?: ListKey;
  hint?: string;
  placeholder?: string;
  half?: boolean;
  defaultValue?: (L: Lookup) => unknown;
}

export interface FilterDef {
  id: string;
  label: string;
  /** Location filters include the containers inside a chosen area. */
  location?: boolean;
  options: (L: Lookup) => { id: string; label: string; indent?: boolean }[];
  value: (r: Row) => string | string[];
}

export interface SortDef {
  id: string;
  label: string;
  cmp: (L: Lookup) => (a: Row, b: Row) => number;
}

export interface SectionConfig {
  key: InventorySection;
  title: string;
  noun: string;
  nouns: string;
  addLabel: string;
  searchPlaceholder: string;
  emptyText: string;
  auditable: boolean;
  qtyField: string | null;
  qtyLabel: string;
  qtyUnit?: (r: Row, L: Lookup) => string;
  primary: (r: Row, L: Lookup) => string;
  meta: (r: Row, L: Lookup) => string;
  columns: { label: string; value: (r: Row, L: Lookup) => string }[];
  filters: FilterDef[];
  sorts: SortDef[];
  search: (r: Row, L: Lookup) => SearchField[];
  form: FormField[];
  lowStock?: boolean;
  savedFilters?: boolean;
}

const locationOptions = (L: Lookup) =>
  L.locationTree().flatMap((n) => [
    { id: n.area.id, label: n.area.name + (n.children.length ? " (all)" : "") },
    ...n.children.map((c) => ({ id: c.id, label: c.name, indent: true })),
  ]);

/** Options for filtering by a dropdown list: only values actually used. */
const usedListOptions = (key: InventorySection, field: string) => (L: Lookup) => {
  const used = new Set(L.rows(key).map((r) => r[field]).filter(Boolean));
  return L.sorted("lists", (l) => used.has(l.id)).map((l) => ({ id: l.id, label: l.value }));
};

/** Distinct typed sizes in use (value + unit). */
const usedMeasureOptions = (key: InventorySection, text: string, value: string, unit: string) => (L: Lookup) => {
  const seen = new Map<string, { id: string; label: string; n: number; u: number }>();
  for (const r of L.rows(key)) {
    if (!r[text]) continue;
    const id = `${r[value]}|${r[unit] || ""}`;
    if (!seen.has(id)) seen.set(id, { id, label: L.withUnit(r[text], r[unit]), n: r[value], u: L.listOrder(r[unit]) });
  }
  return [...seen.values()].sort((a, b) => a.u - b.u || a.n - b.n);
};

const locationFilter: FilterDef = { id: "location", label: "Location", location: true, options: locationOptions, value: (r) => r.locationId };
const byLocation = (L: Lookup) => (a: Row, b: Row) => natural(L.locationLabel(a.locationId) || "~", L.locationLabel(b.locationId) || "~");
const byUpdated = () => (a: Row, b: Row) => String(b.updatedAt).localeCompare(String(a.updatedAt));
const unitDefault = (name: string) => (L: Lookup) => (L.listOptions("unit").find((u) => u.value === name) ?? L.listOptions("unit")[0])?.id ?? "";

function pitchNumber(r: Row, L: Lookup): string {
  const m = L.listVal(r.pitchId).match(/^([\d.]+)/);
  return m ? m[1] : "";
}
const fastenerCmp = (L: Lookup) => (a: Row, b: Row) =>
  L.listOrder(a.threadSizeId) - L.listOrder(b.threadSizeId) ||
  L.listOrder(a.pitchId) - L.listOrder(b.pitchId) ||
  (a.lengthValue || 0) - (b.lengthValue || 0) ||
  L.listOrder(a.typeId) - L.listOrder(b.typeId);

function rawSize(r: Row, L: Lookup): string {
  const dims = [r.length, r.width].filter(Boolean).join(" × ");
  return dims ? `${dims}${r.dimUnitId ? " " + L.listVal(r.dimUnitId) : ""}` : "Size not set";
}

export const SECTIONS: Record<InventorySection, SectionConfig> = {
  parts: {
    key: "parts", title: "Parts Inventory", noun: "part", nouns: "parts", addLabel: "Add part",
    searchPlaceholder: "Search parts, tags, locations…", emptyText: "Add the parts the team keeps in stock.",
    auditable: true, qtyField: "quantity", qtyLabel: "Quantity", lowStock: true, savedFilters: true,
    primary: (r) => r.name,
    meta: (r, L) => [L.name("categories", r.categoryId), (r.tagIds as string[]).map((t) => L.name("tags", t)).filter(Boolean).join(", ")].filter(Boolean).join(" · "),
    columns: [
      { label: "Location", value: (r, L) => L.locationLabel(r.locationId) },
      { label: "Supplier", value: (r, L) => L.name("suppliers", r.supplierId) },
    ],
    filters: [
      { id: "category", label: "Category", options: (L) => L.sorted("categories").map((c) => ({ id: c.id, label: c.name })), value: (r) => r.categoryId },
      { id: "tag", label: "Tags", options: (L) => L.sorted("tags").map((t) => ({ id: t.id, label: t.name })), value: (r) => r.tagIds },
      locationFilter,
      { id: "supplier", label: "Supplier", options: (L) => L.sorted("suppliers").map((s) => ({ id: s.id, label: s.name })), value: (r) => r.supplierId },
    ],
    sorts: [
      { id: "name", label: "Name A–Z", cmp: () => (a, b) => natural(a.name, b.name) },
      { id: "qtyAsc", label: "Quantity: low to high", cmp: () => (a, b) => a.quantity - b.quantity || natural(a.name, b.name) },
      { id: "qtyDesc", label: "Quantity: high to low", cmp: () => (a, b) => b.quantity - a.quantity || natural(a.name, b.name) },
      { id: "location", label: "Location", cmp: (L) => (a, b) => byLocation(L)(a, b) || natural(a.name, b.name) },
      { id: "updated", label: "Recently updated", cmp: byUpdated },
    ],
    search: (p, L) => [
      [p.name, 5],
      [p.aliases, 5],
      [(p.tagIds as string[]).map((t) => L.name("tags", t)).join(" "), 3],
      [L.name("categories", p.categoryId), 2],
      [L.name("suppliers", p.supplierId), 2],
      [L.locationLabel(p.locationId), 2],
      [p.description, 1],
    ],
    form: [
      { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Flanged bearing 1/2\" hex" },
      { name: "quantity", label: "Quantity", type: "int", required: true, half: true, defaultValue: () => 0 },
      { name: "lowStockThreshold", label: "Low stock at", type: "int", half: true, hint: "Optional. Flags the part when the quantity is at or below this." },
      { name: "categoryId", label: "Category", type: "category", half: true },
      { name: "supplierId", label: "Supplier", type: "supplier", half: true },
      { name: "tagIds", label: "Tags", type: "tags" },
      { name: "locationId", label: "Storage location", type: "location" },
      { name: "aliases", label: "Search aliases", type: "text", hint: "Other names people search for, e.g. a part number." },
      { name: "description", label: "Description", type: "textarea" },
    ],
  },

  rawMaterials: {
    key: "rawMaterials", title: "Raw Materials", noun: "piece", nouns: "pieces", addLabel: "Add stock",
    searchPlaceholder: "Search material, thickness, size…", emptyText: "Track sheet and plate stock by material, thickness and size.",
    auditable: true, qtyField: "quantity", qtyLabel: "Quantity",
    primary: (r, L) => [L.listVal(r.materialTypeId), L.withUnit(r.thickness, r.thicknessUnitId)].filter(Boolean).join(" · "),
    meta: (r, L) => [rawSize(r, L), r.shape?.kind === "traced" ? "traced outline" : ""].filter(Boolean).join(" · "),
    columns: [{ label: "Location", value: (r, L) => L.locationLabel(r.locationId) }],
    filters: [
      { id: "material", label: "Material", options: usedListOptions("rawMaterials", "materialTypeId"), value: (r) => r.materialTypeId },
      { id: "thickness", label: "Thickness", options: usedMeasureOptions("rawMaterials", "thickness", "thicknessValue", "thicknessUnitId"), value: (r) => `${r.thicknessValue}|${r.thicknessUnitId || ""}` },
      locationFilter,
    ],
    sorts: [
      { id: "material", label: "Material", cmp: (L) => (a, b) => L.listOrder(a.materialTypeId) - L.listOrder(b.materialTypeId) || (a.thicknessValue || 0) - (b.thicknessValue || 0) },
      { id: "area", label: "Biggest first", cmp: () => (a, b) => (b.lengthValue || 0) * (b.widthValue || 0) - (a.lengthValue || 0) * (a.widthValue || 0) },
      { id: "location", label: "Location", cmp: byLocation },
      { id: "updated", label: "Recently updated", cmp: byUpdated },
    ],
    search: (r, L) => [
      [L.listVal(r.materialTypeId), 5],
      [`${r.thickness} ${L.listVal(r.thicknessUnitId)}`, 4],
      [`${r.length} ${r.width}`, 3],
      [L.locationLabel(r.locationId), 2],
      [r.description, 1],
    ],
    form: [
      { name: "materialTypeId", label: "Material", type: "list", listKey: "materialType", required: true },
      { name: "thickness", label: "Thickness", type: "measure", half: true, placeholder: "e.g. 1/8" },
      { name: "thicknessUnitId", label: "Thickness unit", type: "list", listKey: "unit", half: true, defaultValue: unitDefault("in") },
      { name: "length", label: "Length", type: "measure", half: true, placeholder: "e.g. 24" },
      { name: "width", label: "Width", type: "measure", half: true, placeholder: "e.g. 12" },
      { name: "dimUnitId", label: "Size unit", type: "list", listKey: "unit", half: true, defaultValue: unitDefault("in") },
      { name: "quantity", label: "Quantity", type: "int", required: true, half: true, defaultValue: () => 1, hint: "Identical full pieces." },
      { name: "locationId", label: "Storage location", type: "location" },
      { name: "description", label: "Description", type: "textarea" },
    ],
  },

  tools: {
    key: "tools", title: "Tools & Equipment", noun: "tool", nouns: "tools", addLabel: "Add tool",
    searchPlaceholder: "Search tools, locations…", emptyText: "List the tools and equipment the team owns and where they are kept.",
    auditable: true, qtyField: "quantity", qtyLabel: "Quantity",
    primary: (r) => r.name,
    meta: (r, L) => L.locationLabel(r.locationId) || "No location",
    columns: [],
    filters: [locationFilter],
    sorts: [
      { id: "name", label: "Name A–Z", cmp: () => (a, b) => natural(a.name, b.name) },
      { id: "location", label: "Location", cmp: (L) => (a, b) => byLocation(L)(a, b) || natural(a.name, b.name) },
      { id: "updated", label: "Recently updated", cmp: byUpdated },
    ],
    search: (r, L) => [[r.name, 5], [L.locationLabel(r.locationId), 2], [r.description, 1]],
    form: [
      { name: "name", label: "Name", type: "text", required: true, placeholder: 'e.g. Digital calipers 6"' },
      { name: "quantity", label: "Quantity", type: "int", required: true, half: true, defaultValue: () => 1 },
      { name: "locationId", label: "Storage location", type: "location" },
      { name: "description", label: "Description", type: "textarea", hint: "Optional — brand, model, accessories, notes." },
    ],
  },

  fasteners: {
    key: "fasteners", title: "Fastener Reference", noun: "fastener", nouns: "fasteners", addLabel: "Add fastener",
    searchPlaceholder: "Search size, type, length… e.g. 10-32 1/2",
    emptyText: "A reference of which fastener types, sizes and lengths the team has on hand. No counting needed.",
    auditable: false, qtyField: null, qtyLabel: "",
    primary: (r, L) => {
      const size = L.listVal(r.threadSizeId);
      const p = pitchNumber(r, L);
      return size + (p ? "-" + p : "") + (r.length ? " × " + L.withUnit(r.length, r.lengthUnitId) : "");
    },
    meta: (r, L) => [L.listVal(r.typeId), L.listVal(r.materialId)].filter(Boolean).join(" · "),
    columns: [{ label: "Type", value: (r, L) => L.listVal(r.typeId) }],
    filters: [
      { id: "type", label: "Type", options: usedListOptions("fasteners", "typeId"), value: (r) => r.typeId },
      { id: "size", label: "Size", options: usedListOptions("fasteners", "threadSizeId"), value: (r) => r.threadSizeId },
      { id: "length", label: "Length", options: usedMeasureOptions("fasteners", "length", "lengthValue", "lengthUnitId"), value: (r) => `${r.lengthValue}|${r.lengthUnitId || ""}` },
      { id: "material", label: "Material", options: usedListOptions("fasteners", "materialId"), value: (r) => r.materialId },
    ],
    sorts: [
      { id: "size", label: "Size", cmp: fastenerCmp },
      { id: "type", label: "Type", cmp: (L) => (a, b) => L.listOrder(a.typeId) - L.listOrder(b.typeId) || fastenerCmp(L)(a, b) },
      { id: "updated", label: "Recently added", cmp: () => (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) },
    ],
    search: (r, L) => {
      const size = L.listVal(r.threadSizeId);
      const p = pitchNumber(r, L);
      const bare = size.replace("#", "");
      return [
        [`${size} ${bare}${p ? ` ${bare}-${p} ${size}-${p}` : ""}`, 5],
        [L.listVal(r.typeId), 4],
        [L.listVal(r.pitchId), 3],
        [`${r.length} ${L.listVal(r.lengthUnitId)}`, 3],
        [L.listVal(r.materialId), 2],
        [r.description, 1],
      ];
    },
    form: [
      { name: "typeId", label: "Type", type: "list", listKey: "fastenerType", required: true },
      { name: "threadSizeId", label: "Thread size", type: "list", listKey: "threadSize", required: true, half: true },
      { name: "pitchId", label: "Thread pitch", type: "list", listKey: "threadPitch", half: true },
      { name: "length", label: "Length", type: "measure", half: true, placeholder: "e.g. 1/2", hint: "Leave blank for nuts and washers." },
      { name: "lengthUnitId", label: "Length unit", type: "list", listKey: "unit", half: true, defaultValue: unitDefault("in") },
      { name: "materialId", label: "Material", type: "list", listKey: "fastenerMaterial" },
      { name: "description", label: "Notes", type: "textarea", hint: "Optional — e.g. where the bin is." },
    ],
  },

  wire: {
    key: "wire", title: "Wire Inventory", noun: "spool", nouns: "spools", addLabel: "Add wire",
    searchPlaceholder: "Search gauge, color, location…", emptyText: "Track wire by gauge and color with a rough idea of how much is left.",
    auditable: true, qtyField: "approxLength", qtyLabel: "Approx. length", qtyUnit: (r, L) => L.listVal(r.lengthUnitId),
    primary: (r, L) => L.listVal(r.gaugeId) + (r.typeColor ? " · " + r.typeColor : ""),
    meta: (r, L) => L.locationLabel(r.locationId) || "No location",
    columns: [],
    filters: [{ id: "gauge", label: "Gauge", options: usedListOptions("wire", "gaugeId"), value: (r) => r.gaugeId }, locationFilter],
    sorts: [
      { id: "gauge", label: "Gauge", cmp: (L) => (a, b) => L.listOrder(a.gaugeId) - L.listOrder(b.gaugeId) || natural(a.typeColor, b.typeColor) },
      { id: "lenAsc", label: "Least left", cmp: () => (a, b) => (a.approxLength || 0) - (b.approxLength || 0) },
      { id: "location", label: "Location", cmp: byLocation },
    ],
    search: (r, L) => {
      const g = L.listVal(r.gaugeId);
      return [[`${g} ${g.replace(/\s*awg/i, "")}`, 5], [r.typeColor, 4], [L.locationLabel(r.locationId), 2], [r.description, 1]];
    },
    form: [
      { name: "gaugeId", label: "Gauge", type: "list", listKey: "wireGauge", required: true, half: true },
      { name: "typeColor", label: "Type / color", type: "text", half: true, placeholder: "e.g. Red, silicone" },
      { name: "approxLength", label: "Approximate length left", type: "number", required: true, half: true, hint: "A rough estimate is fine." },
      { name: "lengthUnitId", label: "Unit", type: "list", listKey: "unit", half: true, defaultValue: unitDefault("ft") },
      { name: "locationId", label: "Storage location", type: "location" },
      { name: "description", label: "Description", type: "textarea" },
    ],
  },
};

export function isLowStock(r: Row): boolean {
  return r.lowStockThreshold !== null && r.lowStockThreshold !== undefined && r.lowStockThreshold !== "" && Number(r.quantity) <= Number(r.lowStockThreshold);
}
