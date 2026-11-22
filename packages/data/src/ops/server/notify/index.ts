// Notifications, for the actions: call one of these after saving a change. Each one works out who should hear about it
// (rules.ts) and leaves it in the outbox (outbox.ts). None of them throws: a failed notification never undoes a change.
// SERVER ONLY.
import { COLLECTION_PEOPLE, type Ctx } from "../context";
import type { Doc } from "../env";
import { send, type Outgoing } from "./outbox";
import * as rules from "./rules";

export { send, sendDeliveries } from "./outbox";
export { rules };

/** Works out the notifications, then sends them. Logs and swallows any error. */
async function run(ctx: Ctx, what: string, work: () => Promise<Outgoing[]>): Promise<void> {
  try {
    await send(ctx, await work());
  } catch (err) {
    console.error(`notify: ${what} failed`, err instanceof Error ? err.name : "unknown");
  }
}

/** After a task was created or edited. */
export function taskSaved(ctx: Ctx, before: Doc | null, after: Doc) {
  return run(ctx, "task", async () => {
    const waiting = after.status === "done" && before?.status !== "done"
      ? (await ctx.data.query("icarus_tasks", {})).filter((t) => Array.isArray(t.blockedBy) && t.blockedBy.includes(after._id) && t.status !== "done")
      : [];
    return rules.taskSaved(before, after, waiting);
  });
}

/** After a new comment on a task. */
export function commentAdded(ctx: Ctx, comment: Doc, task: Doc) {
  return run(ctx, "comment", async () => rules.commentAdded(comment, task, await ctx.data.query(COLLECTION_PEOPLE, {})));
}

/** After a part request was saved. */
export function partSaved(ctx: Ctx, before: Doc | null, after: Doc) {
  return run(ctx, "part", async () => rules.partSaved(before, after));
}

/** Anything already worked out (BOM lines, account news). */
export function sendAll(ctx: Ctx, list: Outgoing[]) {
  return run(ctx, "send", async () => list);
}

/** The member IDs of everyone holding any of these badges (by title), from the people the apps know. */
export async function membersWithBadge(ctx: Ctx, titles: string[]): Promise<string[]> {
  const all = await ctx.siteBadges();
  const badgeIds = Object.keys(all).filter((id) => titles.includes(all[id]));
  const memberIds = (await ctx.data.query(COLLECTION_PEOPLE, {})).filter((p) => p.active !== false && !p.deleted).map((p) => String(p.memberId));
  if (!badgeIds.length || !memberIds.length) return [];
  return [...new Set((await ctx.env.badges.assignmentsOf(memberIds, badgeIds)).map((a) => a.memberId))];
}
