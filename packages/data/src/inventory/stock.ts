// A small window into Inventory for the other apps (BOM, Icarus, Production). They never use Inventory's full
// service: they ask "what parts do we have and how many?" and "add these to stock", and nothing else.
//
//   import { stock } from "@team6220/data";
//   const items = await stock.list();                 // parts with their quantity
//   await stock.add(itemId, 10);                      // 10 more arrived
//   await stock.create({ name: "NEO Vortex", quantity: 4 });
//
// In demo mode (see ops/index.ts) this uses Inventory's made-up data in memory, never the real inventory.
import { inventoryForOtherApps as inventory, resetInventoryForOtherApps } from "./connection.ts";
import type { Row } from "./types.ts";

/** One part in Inventory, as the other apps see it. */
export interface StockItem {
  id: string;
  name: string;
  quantity: number;
  /** At or below this many is "low". 0 when no threshold is set. */
  lowStockThreshold: number;
}

/** Start again from fresh demo data (tests). */
export function reset(): void {
  resetInventoryForOtherApps();
}

function toStockItem(row: Row): StockItem {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    quantity: Number(row.quantity) || 0,
    lowStockThreshold: Number(row.lowStockThreshold) || 0,
  };
}

/** Every part in Inventory (not archived), by name. */
export async function list(): Promise<StockItem[]> {
  const rows = await (await inventory()).listItems("parts");
  return rows.map(toStockItem).sort((a, b) => a.name.localeCompare(b.name));
}

/** Adds to a part's quantity and returns the part afterwards. */
export async function add(id: string, quantity: number): Promise<StockItem> {
  if (!(Number.isInteger(quantity) && quantity >= 1)) throw new Error("The quantity to add must be 1 or more.");
  const result = await (await inventory()).adjustQuantity("parts", id, quantity);
  return toStockItem(result.value.record);
}

/** Adds a new part to Inventory. Category and location can be set later in the Inventory app. */
export async function create(item: { name: string; quantity: number; description?: string }): Promise<StockItem> {
  const result = await (await inventory()).create("parts", { name: item.name.trim().slice(0, 150), quantity: item.quantity, description: item.description ?? "" });
  return toStockItem(result.value);
}

/** True when a part is at or below its low-stock threshold (parts with no threshold are never "low"). */
export function isLow(item: StockItem): boolean {
  return item.lowStockThreshold > 0 && item.quantity <= item.lowStockThreshold;
}
