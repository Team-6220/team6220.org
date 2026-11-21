// Reading and writing collections for the apps, with a role check. SERVER ONLY.
//
// Until Wix's own collection permissions are tightened (https://github.com/Team-6220/team6220.org/wiki/Operations-Server, "Locking the collections"), the
// apps could read and write several collections straight from the browser, so any approved site member could change
// them, a Guest included. These three actions are what the apps use instead (see lazyWixStore in ../index.ts). They
// check the caller's role first, then read or write with the server's elevated permission.
import { rolesFor } from "../roles";
import { COLLECTION_HISTORY, COLLECTION_PEOPLE, COLLECTION_PROJECTS, type Ctx } from "./context";
import { apiError, type Doc } from "./env";

/** Every collection the apps list. A Guest may read only some of them (below). */
const READABLE = [
  COLLECTION_PROJECTS,
  COLLECTION_PEOPLE,
  COLLECTION_HISTORY,
  "icarus_tasks",
  "icarus_comments",
  "icarus_milestones",
  "icarus_events",
  "icarus_seasons",
  "icarus_templates",
  "bom_boms",
  "bom_orders",
  "bom_sections",
  "bom_lines",
  "production_parts",
];

/** What a Guest sees: all of Icarus, with people's names. Not the BOM, Production, or the history of anything but tasks. */
const GUEST_READABLE = [COLLECTION_PROJECTS, COLLECTION_PEOPLE, COLLECTION_HISTORY, "icarus_tasks", "icarus_comments", "icarus_milestones", "icarus_events", "icarus_seasons", "icarus_templates"];

/** The collections the apps write directly (everything else has its own action that checks the rules). Team members only. */
const WRITABLE = ["icarus_tasks", "icarus_comments", "production_parts"];

/** The most one query returns. A collection that reaches it is refused rather than cut short without a word. */
const LIST_LIMIT = 1000;

function collectionOf(body: Doc, allowed: string[]): string {
  const collection = typeof body.collection === "string" ? body.collection : "";
  if (!allowed.includes(collection)) throw apiError("bad-request", "Unknown collection.");
  return collection;
}

/** { collection } -> { items }. Every item of one collection. */
export async function listRecords(ctx: Ctx, body: Doc) {
  const collection = collectionOf(body, READABLE);
  const roles = rolesFor(ctx.actor.badges);
  if (roles.guest && !GUEST_READABLE.includes(collection)) throw apiError("forbidden", "Your account isn't allowed to see that.");
  const rows = await ctx.data.query(collection, {}, LIST_LIMIT);
  if (rows.length >= LIST_LIMIT) throw apiError("server-error", `${collection} has ${LIST_LIMIT} or more items, which is more than one request can return. Ask a web admin to archive some.`);
  // The history mixes in the BOM and Production; a Guest only gets what happened to tasks.
  const items = roles.guest && collection === COLLECTION_HISTORY ? rows.filter((r) => r.recordKind === "task") : rows;
  return { items };
}

/** { collection, item } -> { item }. Adds the item, or replaces the one with the same `_id`. */
export async function saveRecord(ctx: Ctx, body: Doc) {
  const collection = collectionOf(body, WRITABLE);
  const item = body.item;
  if (!item || typeof item !== "object" || Array.isArray(item)) throw apiError("bad-request", "Send the item to save.");
  return { item: await ctx.data.save(collection, item as Doc) };
}

/** { collection, id } -> {}. */
export async function removeRecord(ctx: Ctx, body: Doc) {
  const collection = collectionOf(body, WRITABLE);
  if (typeof body.id !== "string" || !body.id || body.id.length > 200) throw apiError("bad-request", "Send the ID of the item to remove.");
  await ctx.data.remove(collection, body.id);
  return {};
}
