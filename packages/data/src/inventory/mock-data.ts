// Demo data for the in-memory adapter. Made-up parts only: no real inventory and nothing about students.
// The dropdown lists, categories, tags, suppliers and saved filters are the old app's starting values
// (SEED in backend/apps-script/inventory/Config.gs).

import { TABLES, type ListKey, type TableKey } from "./schema.ts";
import type { PackingMeta, Row, Tables } from "./types.ts";
import { blankRecord } from "./validate.ts";

const SEED = {
  categories: ["Mechanical", "Electrical", "Design"],
  tags: {
    Mechanical: ["Belts", "Bearings", "Spacers", "Shafts", "Gears", "Sprockets", "Fasteners", "Rollers", "Wheels", "Pulleys", "Structural Components"],
    Electrical: ["Motors", "Sensors", "Connectors", "Motor Controllers", "Power Distribution", "Pneumatics", "Electronics"],
    Design: ["CAD", "Prototyping", "Fabrication", "Miscellaneous"],
    "": ["Swerve", "Dead Axle", "Intake", "Elevator"],
  } as Record<string, string[]>,
  suppliers: ["AndyMark", "CTR Electronics", "McMaster-Carr", "Redux Robotics", "REV Robotics", "ThriftyBot", "VEX Robotics", "West Coast Products"],
  lists: {
    materialType: ["6061 Aluminum", "5052 Aluminum", "7075 Aluminum", "Steel", "Polycarbonate", "HDPE", "Delrin (Acetal)", "Plywood", "Carbon Fiber"],
    unit: ["in", "mm", "ft", "m"],
    fastenerType: ["Socket Head Cap Screw", "Button Head Cap Screw", "Flat Head Screw", "Hex Bolt", "Set Screw", "Shoulder Bolt", "Nylock Nut", "Hex Nut", "Keps Nut", "Flat Washer", "Lock Washer", "POP Rivet"],
    threadSize: ["#4", "#6", "#8", "#10", '1/4"', '5/16"', "M3", "M4", "M5", "M6"],
    threadPitch: ["20 TPI", "24 TPI", "32 TPI", "40 TPI", "0.5 mm", "0.7 mm", "0.8 mm", "1.0 mm"],
    fastenerMaterial: ["Steel", "Alloy Steel", "Stainless Steel", "Aluminum", "Nylon"],
    wireGauge: ["6 AWG", "10 AWG", "12 AWG", "14 AWG", "16 AWG", "18 AWG", "20 AWG", "22 AWG", "24 AWG"],
  } as Record<ListKey, string[]>,
};

/** Builds a fresh copy of the demo data. IDs are predictable (PT-00000001, ...) so tests can refer to them. */
export function demoData(): { tables: Tables; packingMeta: PackingMeta } {
  const counters: Record<string, number> = {};
  const id = (key: TableKey) => {
    const p = TABLES[key].prefix;
    counters[p] = (counters[p] || 0) + 1;
    return `${p}-${String(counters[p]).padStart(8, "0")}`;
  };
  const t = {} as Tables;
  for (const k of Object.keys(TABLES) as TableKey[]) t[k] = [];
  const created = "2026-09-01T17:00:00.000Z";
  const add = (key: TableKey, fields: Record<string, unknown>): Row => {
    const r: Row = Object.assign(blankRecord(key), fields, { id: id(key) });
    if (TABLES[key].kind === "inventory") {
      Object.assign(r, { version: 1, createdAt: created, updatedAt: created, archivedAt: "" });
      if (TABLES[key].auditable && r.needsCheck !== true) r.needsCheck = false;
    }
    if ("sortOrder" in r && r.sortOrder === null) r.sortOrder = t[key].length + 1;
    t[key].push(r);
    return r;
  };
  const byName = (key: TableKey, name: string) => t[key].find((r) => r.name === name)?.id ?? "";
  const list = (k: ListKey, v: string) => t.lists.find((r) => r.listKey === k && r.value === v)?.id ?? "";

  SEED.categories.forEach((name) => add("categories", { name }));
  for (const [group, names] of Object.entries(SEED.tags)) {
    names.forEach((name) => add("tags", { name, categoryId: group ? byName("categories", group) : "" }));
  }
  SEED.suppliers.forEach((name) => add("suppliers", { name }));
  for (const [k, values] of Object.entries(SEED.lists)) values.forEach((value) => add("lists", { listKey: k, value }));

  const shop = add("locations", { name: "Shop", parentId: "" });
  const pit = add("locations", { name: "Pit cart", parentId: "" });
  const drawerA = add("locations", { name: "Drawer A", parentId: shop.id });
  const drawerB = add("locations", { name: "Drawer B", parentId: shop.id });
  const shelf = add("locations", { name: "Metal rack", parentId: shop.id });
  const pitBin = add("locations", { name: "Spares bin", parentId: pit.id });

  const tag = (...names: string[]) => names.map((n) => byName("tags", n)).filter(Boolean);
  add("parts", { name: "Flanged bearing 1/2\" hex", quantity: 48, categoryId: byName("categories", "Mechanical"), tagIds: tag("Bearings", "Swerve"), locationId: drawerA.id, supplierId: byName("suppliers", "West Coast Products"), lowStockThreshold: 20, aliases: "FR8 hex bearing" });
  add("parts", { name: "HTD 5mm belt 70T 15mm wide", quantity: 3, categoryId: byName("categories", "Mechanical"), tagIds: tag("Belts"), locationId: drawerB.id, supplierId: byName("suppliers", "West Coast Products"), lowStockThreshold: 4 });
  add("parts", { name: "Kraken X60 motor", quantity: 6, categoryId: byName("categories", "Electrical"), tagIds: tag("Motors", "Swerve"), locationId: shelf.id, supplierId: byName("suppliers", "West Coast Products"), lowStockThreshold: 2 });
  add("parts", { name: "CANcoder", quantity: 5, categoryId: byName("categories", "Electrical"), tagIds: tag("Sensors", "Swerve"), locationId: drawerA.id, supplierId: byName("suppliers", "CTR Electronics") });
  add("parts", { name: "Spacer 1/2\" hex 0.25\" long", quantity: 120, categoryId: byName("categories", "Mechanical"), tagIds: tag("Spacers", "Dead Axle"), locationId: drawerB.id, supplierId: byName("suppliers", "ThriftyBot"), description: "Aluminum, black." });
  add("parts", { name: "Compliant wheel 4\" 35A", quantity: 10, categoryId: byName("categories", "Mechanical"), tagIds: tag("Wheels", "Intake"), locationId: shelf.id, supplierId: byName("suppliers", "AndyMark"), needsCheck: true });
  add("parts", { name: "SPARK MAX", quantity: 1, categoryId: byName("categories", "Electrical"), tagIds: tag("Motor Controllers"), locationId: pitBin.id, supplierId: byName("suppliers", "REV Robotics"), lowStockThreshold: 2 });

  add("tools", { name: "Digital calipers 6\"", quantity: 3, locationId: drawerA.id });
  add("tools", { name: "Hex key set (inch)", quantity: 4, locationId: pitBin.id });
  add("tools", { name: "Battery tester", quantity: 1, locationId: pit.id, description: "CBA IV" });

  add("rawMaterials", { materialTypeId: list("materialType", "6061 Aluminum"), thickness: "1/8", thicknessValue: 0.125, thicknessUnitId: list("unit", "in"), length: "24", lengthValue: 24, width: "12", widthValue: 12, dimUnitId: list("unit", "in"), quantity: 2, locationId: shelf.id });
  add("rawMaterials", { materialTypeId: list("materialType", "Polycarbonate"), thickness: "1/4", thicknessValue: 0.25, thicknessUnitId: list("unit", "in"), length: "18 1/2", lengthValue: 18.5, width: "9", widthValue: 9, dimUnitId: list("unit", "in"), quantity: 1, locationId: shelf.id, description: "Leftover from intake plates" });

  add("fasteners", { typeId: list("fastenerType", "Socket Head Cap Screw"), threadSizeId: list("threadSize", "#10"), pitchId: list("threadPitch", "32 TPI"), length: "1/2", lengthValue: 0.5, lengthUnitId: list("unit", "in"), materialId: list("fastenerMaterial", "Alloy Steel") });
  add("fasteners", { typeId: list("fastenerType", "Button Head Cap Screw"), threadSizeId: list("threadSize", "#10"), pitchId: list("threadPitch", "32 TPI"), length: "3/4", lengthValue: 0.75, lengthUnitId: list("unit", "in"), materialId: list("fastenerMaterial", "Alloy Steel") });
  add("fasteners", { typeId: list("fastenerType", "Nylock Nut"), threadSizeId: list("threadSize", "#10"), pitchId: list("threadPitch", "32 TPI"), lengthUnitId: list("unit", "in"), materialId: list("fastenerMaterial", "Steel") });

  add("wire", { gaugeId: list("wireGauge", "12 AWG"), approxLength: 40, lengthUnitId: list("unit", "ft"), typeColor: "Red, silicone", locationId: shelf.id });
  add("wire", { gaugeId: list("wireGauge", "12 AWG"), approxLength: 35, lengthUnitId: list("unit", "ft"), typeColor: "Black, silicone", locationId: shelf.id });
  add("wire", { gaugeId: list("wireGauge", "22 AWG"), approxLength: 100, lengthUnitId: list("unit", "ft"), typeColor: "CAN yellow/green twisted", locationId: drawerA.id });

  add("collections", { name: "All Bearings", section: "parts", filter: { tagIds: tag("Bearings"), tagMode: "any" } });
  add("collections", { name: "Swerve Components", section: "parts", filter: { tagIds: tag("Swerve"), tagMode: "any" } });
  add("collections", { name: "Electrical Components", section: "parts", filter: { categoryIds: [byName("categories", "Electrical")] } });

  const tools = add("packingItems", { section: "always", name: "Tools", parentId: "" });
  add("packingItems", { section: "always", name: "Hex keys", parentId: tools.id, linkTable: "tools", linkId: t.tools[1].id });
  add("packingItems", { section: "always", name: "Calipers", parentId: tools.id, linkTable: "tools", linkId: t.tools[0].id });
  add("packingItems", { section: "always", name: "Battery tester", parentId: tools.id });
  const spares = add("packingItems", { section: "always", name: "Spare parts", parentId: "" });
  add("packingItems", { section: "always", name: "Bearings", parentId: spares.id, linkTable: "parts", linkId: t.parts[0].id });
  add("packingItems", { section: "always", name: "Motor controllers", parentId: spares.id });
  add("packingItems", { section: "season", name: "Polybelts", parentId: "" });
  add("packingItems", { section: "loadout", name: "Robot cart", parentId: "" });
  add("packingItems", { section: "loadout", name: "Batteries (8)", parentId: "" });
  t.packingItems.forEach((r) => {
    r.packed = false;
    r.verified = false;
    r.updatedAt = created;
  });
  add("packingNotes", { text: "Bring a second pair of zip-tie cutters", done: false, createdAt: created });

  return { tables: t, packingMeta: { event: "Demo event", season: "2027 season", roundStartedAt: created, finalCheck: { state: "none" } } };
}
