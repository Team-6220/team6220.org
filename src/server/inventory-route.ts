// POST /api/inventory: every inventory change (https://github.com/Team-6220/team6220.org/wiki/History-Phase-2, issue #100). The Wix build only (integrations/site-api.mjs).
// All logic is in @team6220/data/site-server (handleInventoryRequest, InventoryWrites), which is unit-tested; this file
// connects it to Wix: who is asking comes from the session, and the writes run with elevated permissions because the
// inventory collections only let the server write.
import type { APIRoute } from "astro";
import { auth } from "@wix/essentials";
import { items } from "@wix/data";
import { InventoryWrites, handleInventoryRequest, type WixItemFns } from "@team6220/data/site-server";
import { verifySession as verify } from "./session";

export const prerender = false;

// Plain (non-builder) forms of the @wix/data functions, each elevated (Wix docs: "Elevate API call permissions").
const fns: WixItemFns = {
  get: auth.elevate(items.get) as WixItemFns["get"],
  save: auth.elevate(items.save) as WixItemFns["save"],
  bulkInsert: auth.elevate(items.bulkInsert) as WixItemFns["bulkInsert"],
  update: auth.elevate(items.update) as WixItemFns["update"],
  bulkRemove: auth.elevate(items.bulkRemove) as WixItemFns["bulkRemove"],
  patch: auth.elevate(items.patch) as unknown as WixItemFns["patch"],
  versionIs: (version) => items.filter().eq("version", version),
};

const writes = new InventoryWrites(fns);

export const ALL: APIRoute = ({ request }) => handleInventoryRequest(request, { verify, writes });
