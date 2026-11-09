// Functions like inventory.listItems() live here.
// Phase 1: they call Wix from the browser. Phase 2: they call /api/*.
// App UIs never change between phases.
export { WIX_CLIENT_ID } from "./config";
// Inventory app data (apps/inventory). Also importable as "@team6220/data/inventory".
export { inventory } from "./inventory/index.ts";
