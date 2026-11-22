// Icarus (tasks and Gantt). Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Icarus. SERVER ONLY.
// Ported from backend/apps-script/ops-api/Icarus.gs; the answers are the same.
//
// Tasks themselves are written straight to Wix by members (collection icarus_tasks), like Inventory items.
// The PLANNING records below can only be changed by a Lead, so members can read their collections but not
// write them, and every change comes through here:
//   milestone   a target date, for the whole team or for some subteams
//   event       a competition or scrimmage, with the team's own display name
//   season      one Gantt chart: a name, a start date and an end date
//   template    a saved set of tasks and milestones with dates stored as day offsets
// The demo backend follows the same rules: packages/data/src/icarus/mock.ts. Change both together.
import { getRecord, text, type Ctx } from "./context";
import { apiError, type Doc } from "./env";
import { COLLECTION_LINES, SIGNATURES_NEEDED } from "./bom";
import * as notify from "./notify";
import { checkSubteams } from "./shared";

export const COLLECTION_TASKS = "icarus_tasks";
export const COLLECTION_EVENTS = "icarus_events";
export const COLLECTION_SEASONS = "icarus_seasons";

/** For each kind: its collection, and its fields with the type each must have. */
const ICARUS_KINDS: Record<string, { collection: string; fields: Record<string, string> }> = {
  milestone: {
    collection: "icarus_milestones",
    fields: { name: "text", date: "date", subteams: "subteams", seasonId: "text?", eventId: "text?" },
  },
  event: {
    collection: COLLECTION_EVENTS,
    fields: { code: "text", displayName: "text", officialName: "text?", startDate: "date", endDate: "date", location: "text?", source: "text?" },
  },
  season: {
    collection: COLLECTION_SEASONS,
    fields: { name: "text", startDate: "date", endDate: "date", eventIds: "list" },
  },
  template: {
    collection: "icarus_templates",
    fields: { name: "text", tasks: "list", milestones: "list" },
  },
};
export const ICARUS_COLLECTIONS = [COLLECTION_TASKS, ...Object.values(ICARUS_KINDS).map((k) => k.collection)];

function icarusKind(name: unknown) {
  if (typeof name !== "string" || !Object.hasOwn(ICARUS_KINDS, name)) throw apiError("bad-request", "Unknown kind of record.");
  return ICARUS_KINDS[name];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Checks one field of a planning record and returns the cleaned value. */
async function icarusField(ctx: Ctx, type: string, value: unknown, name: string): Promise<unknown> {
  const optional = type.endsWith("?");
  switch (optional ? type.slice(0, -1) : type) {
    case "text":
      return text(value, name, 300, optional);
    case "date": {
      const date = text(value, name, 10);
      if (!DATE.test(date)) throw apiError("bad-request", `${name} must be a date (yyyy-mm-dd).`);
      return date;
    }
    case "subteams":
      return checkSubteams(ctx, value);
    case "list": {
      const list = Array.isArray(value) ? value : [];
      if (JSON.stringify(list).length > 200000) throw apiError("bad-request", `${name} is too large.`);
      return list;
    }
    default:
      throw new Error(`Unknown field type ${type}`);
  }
}

/** { kind, record: { _id?, ...fields } } -> { record }. A Lead creates or changes a planning record. */
export async function saveIcarusRecord(ctx: Ctx, body: Doc) {
  const kind = icarusKind(body.kind);
  const input = body.record ?? {};
  const existing = input._id ? await getRecord(ctx, kind.collection, input._id, body.kind) : undefined;
  const record: Doc = existing ? { _id: existing._id } : {};
  for (const [name, type] of Object.entries(kind.fields)) record[name] = await icarusField(ctx, type, input[name], name);
  if (record.startDate && record.endDate && record.endDate < record.startDate) throw apiError("bad-request", "The end date is before the start date.");
  const saved = await ctx.data.save(kind.collection, record);
  ctx.log({ kind: body.kind, id: String(saved._id) }, existing ? "updated" : "created", saved.name || saved.displayName || "");
  return { record: saved };
}

/** { kind, id } -> {}. A Lead removes a planning record. Tasks that pointed at it keep working without it. */
export async function removeIcarusRecord(ctx: Ctx, body: Doc) {
  const kind = icarusKind(body.kind);
  const record = await getRecord(ctx, kind.collection, body.id, body.kind);
  await ctx.data.remove(kind.collection, String(record._id));
  ctx.log({ kind: body.kind, id: String(record._id) }, "removed", record.name || record.displayName || "");
  return {};
}

// ---------------------------------------------------------------------------------------------------------
// Tasks for Apollo (the team's Hermes agent). Members write tasks straight to Wix from the website; Apollo has no
// Wix login, so it uses these. Everything it writes is recorded under the Apollo user.
// ---------------------------------------------------------------------------------------------------------

const TASK_STATUSES = ["not-started", "in-progress", "done", "cancelled"];

export const isOpenTask = (t: Doc) => t.status === "not-started" || t.status === "in-progress";

/** "42.10" after "42.2". */
export function byTaskNumber(a: Doc, b: Doc): number {
  const pa = String(a.number).split(".").map(Number);
  const pb = String(b.number).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] === undefined ? -1 : pa[i]) - (pb[i] === undefined ? -1 : pb[i]);
    if (d) return d;
  }
  return 0;
}

/**
 * { status?: "open"|"closed"|<status>, assigneeId?, seasonId?, search?, overdue? } -> { tasks }
 * Up to 200 tasks, in number order.
 */
export async function listTasks(ctx: Ctx, body: Doc) {
  const today = ctx.today();
  const words = String(body.search || "").toLowerCase();
  const tasks = (await ctx.data.query(COLLECTION_TASKS, {})).filter((t) => {
    if (body.status === "open" && !isOpenTask(t)) return false;
    if (body.status === "closed" && isOpenTask(t)) return false;
    if (TASK_STATUSES.includes(body.status) && t.status !== body.status) return false;
    if (body.assigneeId && !(t.ownerIds ?? []).includes(String(body.assigneeId))) return false;
    if (body.seasonId && t.seasonId !== body.seasonId) return false;
    if (body.overdue && !(t.dueDate && t.dueDate < today && isOpenTask(t))) return false;
    if (words && !`t${t.number} ${t.title} ${t.description || ""}`.toLowerCase().includes(words)) return false;
    return true;
  });
  return { tasks: tasks.sort(byTaskNumber).slice(0, 200) };
}

/**
 * { task: { _id?, title, description, parentId, seasonId, projectId, subteams, ownerIds, status, startDate, dueDate,
 *   notes, blockedBy, related } } -> { task }
 * Creates a task (numbered like the website does: t43, or t42.3 under a parent) or changes one.
 */
export async function saveTask(ctx: Ctx, body: Doc) {
  const input = body.task ?? {};
  const existing = input._id ? await getRecord(ctx, COLLECTION_TASKS, String(input._id), "task") : undefined;
  const date = (v: unknown, name: string) => {
    const s = text(v, name, 10, true);
    if (s && !DATE.test(s)) throw apiError("bad-request", `${name} must be a date (yyyy-mm-dd).`);
    return s;
  };
  const ids = (v: unknown) => (Array.isArray(v) ? v : []).map(String).slice(0, 50);
  const status = input.status === undefined && existing ? existing.status : input.status || "not-started";
  if (!TASK_STATUSES.includes(status)) throw apiError("bad-request", `Status must be one of ${TASK_STATUSES.join(", ")}.`);
  const pick = async (name: string, clean: (v: unknown) => unknown | Promise<unknown>) => (input[name] === undefined && existing ? existing[name] : await clean(input[name]));
  const task: Doc = {
    ...existing,
    title: await pick("title", (v) => text(v, "title", 200)),
    description: await pick("description", (v) => text(v, "description", 4000, true)),
    parentId: existing ? existing.parentId : text(input.parentId, "parent", 100, true),
    seasonId: await pick("seasonId", (v) => text(v, "season", 100, true)),
    projectId: await pick("projectId", (v) => text(v, "project", 100, true)),
    subteams: await pick("subteams", (v) => (Array.isArray(v) && v.length ? checkSubteams(ctx, v) : [])),
    ownerIds: await pick("ownerIds", ids),
    status,
    startDate: await pick("startDate", (v) => date(v, "Start")),
    dueDate: await pick("dueDate", (v) => date(v, "Due")),
    notes: await pick("notes", (v) => text(v, "notes", 500, true)),
    blockedBy: await pick("blockedBy", ids),
    related: await pick("related", ids),
    needs: existing ? existing.needs ?? [] : [],
    updatedAt: ctx.env.now().toISOString(),
  };
  if (task.startDate && task.dueDate && task.dueDate < task.startDate) throw apiError("bad-request", "The due date is before the start date.");
  if (!existing) {
    task.createdBy = ctx.actor.id;
    if (!task.parentId) {
      task.number = String(await ctx.takeNumber("task"));
    } else {
      const parent = await getRecord(ctx, COLLECTION_TASKS, task.parentId, "parent task");
      const siblings = (await ctx.data.query(COLLECTION_TASKS, { parentId: parent._id })).map((t) => Number(String(t.number).split(".").pop()));
      if (!task.seasonId) task.seasonId = parent.seasonId;
      task.number = `${parent.number}.${Math.max(0, ...siblings) + 1}`;
    }
  }
  const saved = await ctx.data.save(COLLECTION_TASKS, task);
  ctx.log({ kind: "task", id: String(saved._id) }, existing ? "edited" : "created", `t${saved.number} ${saved.title} (${saved.status})`);
  await notify.taskSaved(ctx, existing ?? null, saved);
  return { task: saved };
}

/** { taskId, body } -> { comment }. */
export async function addTaskComment(ctx: Ctx, body: Doc) {
  const task = await getRecord(ctx, COLLECTION_TASKS, String(body.taskId || ""), "task");
  const comment = await ctx.data.insert("icarus_comments", {
    taskId: task._id,
    authorId: ctx.actor.id,
    authorName: ctx.actor.name,
    body: text(body.body, "comment", 4000),
    at: ctx.env.now().toISOString(),
  });
  await notify.commentAdded(ctx, comment, task);
  return { comment };
}

/**
 * {} -> what needs a person's attention across the three apps, for Apollo's reminders:
 *   overdueTasks, blockedTasks, linesWaitingForSignatures, orderedNotReceived, partsPendingSetup.
 */
export async function needsAttention(ctx: Ctx) {
  const today = ctx.today();
  const tasks = await ctx.data.query(COLLECTION_TASKS, {});
  const open = tasks.filter(isOpenTask);
  const byId = new Map(tasks.map((t) => [String(t._id), t]));
  const brief = (t: Doc) => ({ _id: t._id, number: t.number, title: t.title, dueDate: t.dueDate, ownerIds: t.ownerIds ?? [] });
  const lines = await ctx.data.query(COLLECTION_LINES, {});
  return {
    overdueTasks: open.filter((t) => t.dueDate && t.dueDate < today).sort(byTaskNumber).map(brief),
    blockedTasks: open.filter((t) => (t.blockedBy ?? []).some((id: string) => byId.has(id) && isOpenTask(byId.get(id)!))).sort(byTaskNumber).map(brief),
    linesWaitingForSignatures: lines
      .filter((l) => !l.orderedAt && (l.signatures ?? []).length < SIGNATURES_NEEDED)
      .map((l) => ({ _id: l._id, name: l.name, signatures: (l.signatures ?? []).length })),
    orderedNotReceived: lines
      .filter((l) => l.orderedAt && (l.receivedQty || 0) < l.quantity)
      .map((l) => ({ _id: l._id, name: l.name, left: l.quantity - (l.receivedQty || 0) })),
    partsPendingSetup: (await ctx.data.query("production_parts", { status: "pending-setup" })).map((p) => ({ _id: p._id, number: p.number, partName: p.partName })),
  };
}
