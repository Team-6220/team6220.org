// Reading and writing collections for the apps, with a role check. SERVER ONLY.
//
// Until Wix's own collection permissions are tightened (https://github.com/Team-6220/team6220.org/wiki/Operations-Server, "Locking the collections"), the
// apps could read and write several collections straight from the browser, so any approved site member could change
// them, a Guest included. These three actions are what the apps use instead (see lazyWixStore in ../index.ts). They
// check the caller's role first, then read or write with the server's elevated permission.
import { rolesFor } from "../roles";
import { COLLECTION_HISTORY, COLLECTION_PEOPLE, COLLECTION_PROJECTS, type Ctx } from "./context";
import { apiError, type Doc } from "./env";
import * as notify from "./notify";

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
  "cal_events",
  "cal_shifts",
];

/** What a Guest sees: all of Icarus, with people's names. Not the BOM, Production, or the history of anything but tasks. */
const GUEST_READABLE = [COLLECTION_PROJECTS, COLLECTION_PEOPLE, COLLECTION_HISTORY, "icarus_tasks", "icarus_comments", "icarus_milestones", "icarus_events", "icarus_seasons", "icarus_templates"];

/** The collections the apps write directly (everything else has its own action that checks the rules). Team members only. */
const WRITABLE = ["icarus_tasks", "icarus_comments", "production_parts"];

/** The most one query returns. A collection that reaches it is refused rather than cut short without a word. */
const LIST_LIMIT = 1000;

/**
 * The parts of someone's ops_people row that other members may see: what the pickers and task owners need (Person in
 * ../types.ts). Everything else on the row (Discord link, notification and frame settings, real name parts) is private
 * to its owner, who still gets the whole row.
 */
const PUBLIC_PERSON_FIELDS = ["_id", "memberId", "name", "username", "githubLogin", "subteams", "active"];

/** A supervisor's paperwork (TB assessment, fingerprinting) is for leads, mentors and boosters (`scheduler`); everyone
 *  else sees only whether they're a supervisor, which the Calendar needs. */
function publicPerson(row: Doc, scheduler: boolean): Doc {
  const out = Object.fromEntries(PUBLIC_PERSON_FIELDS.filter((f) => f in row).map((f) => [f, row[f]]));
  if (row.supervisor) out.supervisor = scheduler ? row.supervisor : { status: row.supervisor.status, steps: [], approvedMonth: "" };
  return out;
}

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
  if (collection === COLLECTION_HISTORY && roles.guest) return { items: rows.filter((r) => r.recordKind === "task") };
  // Everyone sees the people list, but only their own row in full.
  if (collection === COLLECTION_PEOPLE) return { items: rows.map((r) => (r.memberId === ctx.actor.id ? r : publicPerson(r, roles.scheduler))) };
  return { items: rows };
}

/** { collection, item } -> { item }. Adds the item, or replaces the one with the same `_id`. Then sends the notifications it causes. */
export async function saveRecord(ctx: Ctx, body: Doc) {
  const collection = collectionOf(body, WRITABLE);
  const item = body.item as Doc;
  if (!item || typeof item !== "object" || Array.isArray(item)) throw apiError("bad-request", "Send the item to save.");
  const before = item._id ? (await ctx.data.queryIds(collection, [String(item._id)]))[0] ?? null : null;
  const saved = await ctx.data.save(collection, item);
  if (collection === "icarus_tasks") await notify.taskSaved(ctx, before, saved);
  if (collection === "production_parts") await notify.partSaved(ctx, before, saved);
  if (collection === "icarus_comments" && !before) {
    const task = (await ctx.data.queryIds("icarus_tasks", [String(saved.taskId)]))[0];
    if (task) await notify.commentAdded(ctx, saved, task);
  }
  return { item: saved };
}

/** { collection, id } -> {}. */
export async function removeRecord(ctx: Ctx, body: Doc) {
  const collection = collectionOf(body, WRITABLE);
  if (typeof body.id !== "string" || !body.id || body.id.length > 200) throw apiError("bad-request", "Send the ID of the item to remove.");
  await ctx.data.remove(collection, body.id);
  return {};
}
