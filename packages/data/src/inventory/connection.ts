// The one connection to Inventory that the other apps share (stock.ts for BOM and Icarus, cutting.ts for Production).
// In demo mode it is Inventory's made-up data in memory; otherwise the real inventory as the signed-in member.
import { isDemo } from "../ops";
import { connectInventory, createMockInventory, getInventorySession } from "./index.ts";
import type { InventoryService } from "./service.ts";

let service: Promise<InventoryService> | undefined;

export function inventoryForOtherApps(): Promise<InventoryService> {
  service ??= isDemo() ? Promise.resolve(createMockInventory()) : getInventorySession().then((s) => connectInventory(s, "wix"));
  return service;
}

/** Start again from fresh demo data (tests). */
export function resetInventoryForOtherApps(): void {
  service = undefined;
}
