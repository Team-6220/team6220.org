// POST /api/inventory: every inventory change (docs/PHASE-2.md, issue #100). The Wix build only (integrations/site-api.mjs).
// All logic is in @team6220/data/site-server (handleInventoryRequest, InventoryWrites), which is unit-tested; this file
// connects it to Wix: who is asking comes from the session, and the writes run with elevated permissions because the
// inventory collections only let the server write.
import type { APIRoute } from "astro";
import { auth } from "@wix/essentials";
import { items } from "@wix/data";
import { badgeAssignments, badgesV2, members } from "@wix/members";
import { InventoryWrites, createSessionVerifier, handleInventoryRequest, type WixItemFns } from "@team6220/data/site-server";

export const prerender = false;

const verify = createSessionVerifier({
  getCurrentMember: async () => (await members.getCurrentMember({ fieldsets: ["FULL"] })).member,
  listBadges: async () => (await badgesV2.queryBadges().limit(100).find()).items,
  listBadgeIds: async (memberId) =>
    (await badgeAssignments.queryBadgeAssignments().eq("memberId", memberId).limit(100).find()).items.map((a) => a.badgeId ?? ""),
});

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
