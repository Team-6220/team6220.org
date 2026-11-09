// Inventory data functions for apps/inventory. Apps call these; they never import the Wix SDK.
//
// Which backend is used is decided by PUBLIC_INVENTORY_BACKEND (build-time env var):
//   "mock" (default) - in-memory demo data; nothing is saved. Used by `pnpm dev`, tests, and the dev site
//                      until the Wix collections exist.
//   "wix"            - Wix CMS collections, called from the browser with the signed-in member's Wix client.
// Phase 2 adds an "api" backend that calls /api/inventory instead; app code doesn't change.

import { MemoryStore, type MemoryStoreOptions } from "./memory-store.ts";
import { demoData } from "./mock-data.ts";
import { createInventoryService, type InventoryService } from "./service.ts";
import type { MemberSession } from "./types.ts";

export * from "./schema.ts";
export * from "./types.ts";
export { InventoryError, parseMeasure, fmtFraction } from "./util.ts";
export { createInventoryService, auditItemName, type InventoryService, type AuditConflict, type AuditSummary } from "./service.ts";
export { MemoryStore } from "./memory-store.ts";
export { demoData } from "./mock-data.ts";
// The Wix adapter is loaded on demand by connectInventory() (import "./wix-store.ts" directly if you need it).
export type { WixItemsApi } from "./wix-store.ts";
export { toWixItem, fromWixItem } from "./wix-mapping.ts";

export type InventoryBackend = "mock" | "wix";

/** The badge that unlocks editing (docs/MIGRATION-PLAN.md, "Login and permissions"). */
export const INVENTORY_MANAGER_BADGE = "Inventory Manager";

export function inventoryBackend(): InventoryBackend {
  let v: string | undefined;
  try {
    v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.PUBLIC_INVENTORY_BACKEND;
  } catch {
    v = undefined;
  }
  return v === "wix" ? "wix" : "mock";
}

/** A service over fresh demo data. */
export function createMockInventory(opts: Omit<MemoryStoreOptions, "seed" | "meta"> = {}): InventoryService {
  const demo = demoData();
  return createInventoryService(new MemoryStore({ ...opts, seed: demo.tables, meta: { packingMeta: demo.packingMeta } }));
}

// ─────────────── who is signed in ───────────────
// The login code (packages/data/src/auth, built on another branch) registers a provider with
// setInventorySessionProvider(() => ...). Until then:
//   mock backend: a demo member with the Inventory Manager badge (add ?demo=member or ?demo=signed-out to the URL to try the other views);
//   wix backend:  signed out, so the app shows "sign in at /apps".

export type SessionProvider = () => Promise<MemberSession>;
let sessionProvider: SessionProvider | null = null;

export function setInventorySessionProvider(p: SessionProvider | null): void {
  sessionProvider = p;
}

function demoSession(): MemberSession {
  let mode = "";
  try {
    mode = new URLSearchParams(globalThis.location?.search ?? "").get("demo") ?? "";
  } catch {
    mode = "";
  }
  if (mode === "signed-out") return { loggedIn: false, badges: [] };
  if (mode === "member") return { loggedIn: true, name: "Demo member", badges: ["Team Member"] };
  return { loggedIn: true, name: "Demo manager", badges: ["Team Member", INVENTORY_MANAGER_BADGE] };
}

export async function getInventorySession(): Promise<MemberSession> {
  if (sessionProvider) return sessionProvider();
  return inventoryBackend() === "mock" ? demoSession() : { loggedIn: false, badges: [] };
}

/** Connects to the configured backend for this session. */
export async function connectInventory(session: MemberSession, backend: InventoryBackend = inventoryBackend()): Promise<InventoryService> {
  if (backend === "mock") return createMockInventory({ latencyMs: 120 });
  if (!session.loggedIn) throw new Error("Sign in to use the inventory.");
  const { createWixStore } = await import("./wix-store.ts");
  return createInventoryService(await createWixStore(session.wixClient));
}

let connected: InventoryService | null = null;

/**
 * Shortcut used as `inventory.listItems()` (docs/MIGRATION-PLAN.md). Call `inventory.connect(session)` first;
 * every other method is the InventoryService of the connected backend.
 */
export const inventory = {
  async connect(session?: MemberSession): Promise<InventoryService> {
    connected = await connectInventory(session ?? (await getInventorySession()));
    return connected;
  },
  get service(): InventoryService {
    if (!connected) throw new Error("Call inventory.connect() first.");
    return connected;
  },
  listItems: (...args: Parameters<InventoryService["listItems"]>) => inventory.service.listItems(...args),
};
