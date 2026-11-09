// Inventory data functions for apps/inventory. Apps call these; they never import the Wix SDK.
// The inventory UI (the original Apps Script UI) reaches them through createScriptApi() (script-api.ts).
//
// Which backend is used is decided by PUBLIC_INVENTORY_BACKEND (build-time env var); when it isn't set,
// production builds (the deployed site) use "wix" and `pnpm dev` / tests use "mock":
//   "mock" - in-memory demo data; nothing is saved.
//   "wix"  - Wix CMS collections, called from the browser with the signed-in member's Wix client.
// Phase 2 adds an "api" backend that calls /api/inventory instead; app code doesn't change.

import { MemoryStore, type MemoryStoreOptions } from "./memory-store.ts";
import { demoData } from "./mock-data.ts";
import { createInventoryService, type InventoryService } from "./service.ts";
import type { MemberSession } from "./types.ts";

export * from "./schema.ts";
export * from "./types.ts";
export { InventoryError, parseMeasure, fmtFraction } from "./util.ts";
export {
  createInventoryService,
  auditItemName,
  publicPackingMeta,
  finalCheckLive,
  FINAL_CHECK_STALE_MS,
  type InventoryService,
  type ServiceOptions,
  type AuditConflict,
  type AuditSummary,
} from "./service.ts";
export { createScriptApi, isNetworkError, PHOTOS_UNAVAILABLE, type ScriptApi, type ScriptApiOptions, type ScriptReply } from "./script-api.ts";
export { MemoryStore } from "./memory-store.ts";
export { demoData } from "./mock-data.ts";
// The Wix adapter is loaded on demand by connectInventory() (import "./wix-store.ts" directly if you need it).
export type { WixItemsApi } from "./wix-store.ts";
export { toWixItem, fromWixItem } from "./wix-mapping.ts";

export type InventoryBackend = "mock" | "wix";

/**
 * PUBLIC_INVENTORY_BACKEND wins when set. Otherwise production builds (the deployed site) use Wix and
 * `pnpm dev` / tests use the mock data.
 */
export function inventoryBackend(): InventoryBackend {
  let env: Record<string, unknown> | undefined;
  try {
    env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  } catch {
    env = undefined;
  }
  const v = env?.PUBLIC_INVENTORY_BACKEND;
  if (v === "wix" || v === "mock") return v;
  return env?.PROD === true ? "wix" : "mock";
}

/** A service over fresh demo data. */
export function createMockInventory(opts: Omit<MemoryStoreOptions, "seed" | "meta"> = {}): InventoryService {
  const demo = demoData();
  return createInventoryService(new MemoryStore({ ...opts, seed: demo.tables, meta: { packingMeta: demo.packingMeta } }));
}

// ─────────────── who is signed in ───────────────
//   wix backend:  the site login (session.ts -> packages/data/src/auth.ts).
//   mock backend: a demo team member. Add ?demo=signed-out or ?demo=pending to the URL to see those screens.
// Tests (or a later /api session) can replace it with setInventorySessionProvider().

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
  if (mode === "signed-out") return { loggedIn: false, approved: false, badges: [] };
  if (mode === "pending") return { loggedIn: true, approved: false, name: "New member", badges: [] };
  return { loggedIn: true, approved: true, name: "Demo member", badges: ["Team Member"] };
}

export async function getInventorySession(backend: InventoryBackend = inventoryBackend()): Promise<MemberSession> {
  if (sessionProvider) return sessionProvider();
  if (backend === "mock") return demoSession();
  const { wixMemberSession } = await import("./session.ts");
  return wixMemberSession();
}

/** Connects to the configured backend for this session. */
export async function connectInventory(session: MemberSession, backend: InventoryBackend = inventoryBackend()): Promise<InventoryService> {
  if (backend === "mock") return createMockInventory({ latencyMs: 120 });
  if (!session.loggedIn || !session.approved) throw new Error("Sign in with an approved team account to use the inventory.");
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
