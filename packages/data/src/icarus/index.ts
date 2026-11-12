// icarus: the functions /apps/icarus uses. Plan: docs/operations/ICARUS.md.
//
//   import { icarus } from "@team6220/data";
//   const data = await icarus.loadAll();                     // tasks, milestones, events, seasons, templates
//   const chart = icarus.buildGantt({ season, ...data, subteams, today: icarus.today() });
//   await icarus.saveTask({ title: "Wire the elevator", ... }, me);   // gets the next t-number
//
// Tasks are written straight to Wix by members (like Inventory items). Milestones, events, seasons and
// templates can only be changed by a Lead, through the ops API (backend/apps-script/ops-api/Icarus.gs).
import "./mock"; // registers the demo data and demo rules (only used in demo mode)
import { callOps, logHistory, nextNumber, store } from "../ops";
import type { Draft, Me, Person } from "../ops/types";
import { byNumber, STATUS_LABELS } from "./gantt";
import { previewTemplate } from "./templates";
import type { MaterialNeed, Milestone, PlanningRecords, Season, Task, TaskComment, TeamEvent, Template } from "./types";

export interface IcarusData {
  tasks: Task[];
  milestones: Milestone[];
  events: TeamEvent[];
  seasons: Season[];
  templates: Template[];
}

/** Everything Icarus shows, read in one go. */
export async function loadAll(): Promise<IcarusData> {
  const s = store();
  const [tasks, milestones, events, seasons, templates] = await Promise.all([
    s.list<Task>("icarus_tasks"),
    s.list<Milestone>("icarus_milestones"),
    s.list<TeamEvent>("icarus_events"),
    s.list<Season>("icarus_seasons"),
    s.list<Template>("icarus_templates"),
  ]);
  return {
    tasks: tasks.sort(byNumber),
    milestones: milestones.sort((a, b) => a.date.localeCompare(b.date)),
    events: events.sort((a, b) => a.startDate.localeCompare(b.startDate)),
    seasons: seasons.sort((a, b) => b.startDate.localeCompare(a.startDate)),
    templates,
  };
}

// ----- tasks -----

/** "t42", "t42.1" */
export function taskLabel(task: Pick<Task, "number">): string {
  return `t${task.number}`;
}

/** A task with nothing filled in, for the "new task" form. */
export function emptyTask(seasonId: string, parentId = ""): Draft<Task> {
  return {
    number: "", parentId, title: "", description: "", projectId: "", subteams: [], ownerIds: [], status: "not-started",
    startDate: "", dueDate: "", notes: "", seasonId, blockedBy: [], related: [], needs: [], createdBy: "",
  };
}

/**
 * Who may change a task: a Lead, its owners, and whoever created it. This only decides which buttons show
 * (docs/operations/ARCHITECTURE.md, "Known limit").
 */
export function canEditTask(me: Me, task: Pick<Task, "ownerIds" | "createdBy">): boolean {
  return me.roles.lead || (me.roles.team && (task.ownerIds.includes(me.id) || task.createdBy === me.id));
}

/**
 * Create or change a task. A new task gets the next t-number from the server; a new subtask gets its parent's
 * number plus ".1", ".2", ... `allTasks` is the current list, used to find the parent and its other subtasks.
 */
export async function saveTask(task: Draft<Task>, me: Me, allTasks: Task[]): Promise<Task> {
  const title = task.title.trim();
  if (!title) throw new Error("A task needs a title.");
  if (task.startDate && task.dueDate && task.dueDate < task.startDate) throw new Error("The due date is before the start date.");
  const isNew = !task._id;
  let number = task.number;
  if (isNew) {
    const parent = allTasks.find((t) => t._id === task.parentId);
    if (parent) {
      const siblings = allTasks.filter((t) => t.parentId === parent._id).map((t) => Number(t.number.split(".").pop()));
      number = `${parent.number}.${Math.max(0, ...siblings) + 1}`;
    } else number = String(await nextNumber("task"));
  }
  const saved = await store().save<Task>("icarus_tasks", { ...task, title, number, createdBy: task.createdBy || me.id });
  await logHistory({ kind: "task", id: saved._id }, isNew ? "created" : "edited", `${taskLabel(saved)} ${saved.title} (${STATUS_LABELS[saved.status]})`);
  return saved;
}

/** Removes a task. Its subtasks have to be removed (or moved) first, so nothing is lost by accident. */
export async function removeTask(task: Task, allTasks: Task[]): Promise<void> {
  if (allTasks.some((t) => t.parentId === task._id)) throw new Error("Remove this task's subtasks first.");
  await store().remove("icarus_tasks", task._id);
  await logHistory({ kind: "task", id: task._id }, "removed", `${taskLabel(task)} ${task.title}`);
}

// ----- relations and comments -----

export type RelationType = "needs" | "blocks" | "related";
export const RELATION_LABELS: Record<RelationType, string> = {
  needs: "Needs completion of",
  blocks: "Blocks",
  related: "Related to",
};

/** Every relation of a task, including the ones stored on the OTHER task ("t7 needs this one" shows here as "Blocks t7"). */
export function relationsOf(task: Pick<Task, "_id" | "blockedBy" | "related">, allTasks: Task[]): { type: RelationType; task: Task }[] {
  const find = (id: string) => allTasks.find((t) => t._id === id);
  const out: { type: RelationType; task: Task }[] = [];
  for (const id of task.blockedBy) if (find(id)) out.push({ type: "needs", task: find(id)! });
  for (const other of allTasks) if (task._id && other.blockedBy.includes(task._id)) out.push({ type: "blocks", task: other });
  const relatedIds = new Set([...(task.related ?? []), ...allTasks.filter((t) => task._id && (t.related ?? []).includes(task._id)).map((t) => t._id)]);
  for (const id of relatedIds) if (find(id)) out.push({ type: "related", task: find(id)! });
  return out;
}

/** The comments on one task, oldest first. */
export async function listComments(taskId: string): Promise<TaskComment[]> {
  return (await store().list<TaskComment>("icarus_comments")).filter((c) => c.taskId === taskId).sort((a, b) => a.at.localeCompare(b.at));
}

export async function addComment(task: Pick<Task, "_id">, body: string, me: Me): Promise<TaskComment> {
  const text = body.trim();
  if (!text) throw new Error("Write something first.");
  return store().save<TaskComment>("icarus_comments", { taskId: task._id, authorId: me.id, authorName: me.name, body: text.slice(0, 4000), at: new Date().toISOString() });
}

/** How many of a needed part are missing, given what Inventory has (0 when there is enough). */
export function shortfall(need: MaterialNeed, inStock: number | undefined): number {
  return Math.max(0, need.quantity - (inStock ?? 0));
}

/** For the "Needs you" list on the dashboard: this person's open tasks, and how many are overdue. */
export async function needsMe(me: Me, todayDate: string): Promise<{ open: number; overdue: number }> {
  const mine = (await store().list<Task>("icarus_tasks")).filter(
    (t) => t.ownerIds.includes(me.id) && (t.status === "not-started" || t.status === "in-progress"),
  );
  return { open: mine.length, overdue: mine.filter((t) => t.dueDate && t.dueDate < todayDate).length };
}

// ----- planning records (Leads) -----

/** Create or change a milestone, event, season or template. Checked on the server. */
export async function savePlanning<K extends keyof PlanningRecords>(kind: K, record: Draft<PlanningRecords[K]>): Promise<PlanningRecords[K]> {
  return (await callOps<{ record: PlanningRecords[K] }>("saveIcarusRecord", { kind, record })).record;
}

/** Looks an event up on The Blue Alliance by its code ("2027casd"). Nothing is saved. */
/**
 * What needs a person's attention across Icarus, BOM and Production (the summary Apollo's reminders use).
 * The website reads its own data directly; this is here so the demo and tests can call the same action.
 */
export async function needsAttention(): Promise<Record<string, unknown[]>> {
  const { ok: _ok, ...summary } = await callOps<Record<string, unknown[]> & { ok: true }>("needsAttention");
  return summary;
}

export async function lookupEvent(code: string): Promise<Draft<TeamEvent>> {
  return (await callOps<{ event: Draft<TeamEvent> }>("lookupEvent", { code })).event;
}

/** Every event the team is registered for in a year, from The Blue Alliance. Nothing is saved. */
export async function teamEvents(year: number): Promise<Draft<TeamEvent>[]> {
  return (await callOps<{ events: Draft<TeamEvent>[] }>("listTeamEvents", { year })).events;
}

export async function removePlanning(kind: keyof PlanningRecords, id: string): Promise<void> {
  await callOps("removeIcarusRecord", { kind, id });
}

/**
 * Lays a template onto a season: creates its tasks and milestones with real dates. Call previewTemplate first
 * and show the result, so nothing is created until the lead confirms.
 */
export async function startSeasonFromTemplate(template: Pick<Template, "tasks" | "milestones">, season: Season, me: Me): Promise<number> {
  const plan = previewTemplate(template, season);
  const topLevel = plan.tasks.filter((t) => !t.parentKey);
  let number = topLevel.length ? await nextNumber("task", topLevel.length) : 0;
  const saved = new Map<string, Task>();
  const subtaskCount = new Map<string, number>();
  // Parents come before their subtasks in a template, so one pass is enough.
  for (const t of plan.tasks) {
    const parent = saved.get(t.parentKey);
    if (parent) subtaskCount.set(parent._id, (subtaskCount.get(parent._id) ?? 0) + 1);
    const task = await store().save<Task>("icarus_tasks", {
      ...emptyTask(season._id, parent?._id ?? ""),
      number: parent ? `${parent.number}.${subtaskCount.get(parent._id)}` : String(number++),
      title: t.title,
      subteams: t.subteams,
      startDate: t.startDate,
      dueDate: t.dueDate,
      createdBy: me.id,
    });
    saved.set(t.key, task);
  }
  for (const m of plan.milestones) {
    await savePlanning("milestone", { name: m.name, date: m.date, subteams: m.subteams, seasonId: season._id, eventId: "" });
  }
  await logHistory({ kind: "season", id: season._id }, "started from a template", `${plan.tasks.length} tasks, ${plan.milestones.length} milestones`);
  return plan.tasks.length;
}

// ----- export -----

/** Tasks as rows in the column order of the team's Gantt sheets: TASK, OWNER(S), NOTES, STATUS, START, DUE. */
export function tasksToSheetRows(tasks: Task[], people: Pick<Person, "memberId" | "name">[]): string[][] {
  const name = (id: string) => people.find((p) => p.memberId === id)?.name ?? "";
  return [
    ["TASK", "OWNER(S)", "NOTES", "STATUS", "START", "DUE"],
    ...tasks.map((t) => [
      `${taskLabel(t)} ${t.title}`,
      t.ownerIds.map(name).filter(Boolean).join(", "),
      t.notes,
      STATUS_LABELS[t.status],
      t.startDate,
      t.dueDate,
    ]),
  ];
}

export * from "./dates";
export * from "./gantt";
export * from "./templates";
export type * from "./types";
