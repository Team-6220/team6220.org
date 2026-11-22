// Timed notifications: the timer runs runReminders every 15 minutes, and it finds what is due. Each reminder has a
// dedupe key (which task, which day), so running again never sends twice. SERVER ONLY.
import { BADGES } from "../../../config";
import type { Ctx } from "../context";
import type { Doc } from "../env";
import { membersWithBadge } from "./index";
import { COLLECTION_NOTIFICATIONS, send, type Outgoing } from "./outbox";
import { shiftReminders } from "./rules";

const SIGNATURES_NEEDED = 2;

/** The day after `day` (yyyy-mm-dd). */
function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The dedupe keys already used for a kind (the newest 1000 are plenty: keys include the day). */
async function usedKeys(ctx: Ctx, kind: string): Promise<Set<string>> {
  const rows = await ctx.data.query(COLLECTION_NOTIFICATIONS, { kind }, 1000, { field: "createdAt", descending: true });
  return new Set(rows.map((r) => String(r.dedupeKey)));
}

const fresh = (used: Set<string>) => (n: Outgoing) => !used.has(n.dedupeKey ?? "");

/** Tasks due tomorrow, and tasks overdue (once each, on the day they become overdue). */
export function taskReminders(tasks: Doc[], today: string): Outgoing[] {
  const tomorrow = nextDay(today);
  return tasks
    .filter((t) => t.dueDate && t.status !== "done" && t.status !== "cancelled" && Array.isArray(t.ownerIds) && t.ownerIds.length)
    .flatMap((t): Outgoing[] => {
      const when = t.dueDate === tomorrow ? "tomorrow" : t.dueDate < today ? "overdue" : "";
      if (!when) return [];
      return [{ kind: "task.due", to: t.ownerIds, title: `t${t.number} ${t.title} is ${when === "tomorrow" ? "due tomorrow" : "overdue"}`, text: `Due ${t.dueDate}`, url: `/apps/icarus?task=${encodeURIComponent(String(t._id))}`, record: { kind: "task", id: String(t._id) }, dedupeKey: `task.due:${t._id}:${t.dueDate}:${when}` }];
    });
}

/** One summary a day for each mentor and booster with lines still waiting for their signature. */
export function signatureReminders(lines: Doc[], signers: string[], today: string): Outgoing[] {
  const waiting = lines.filter((l) => !l.orderedAt && l.name && l.quantity >= 1 && (l.signatures ?? []).length < SIGNATURES_NEEDED);
  return signers.flatMap((id): Outgoing[] => {
    const mine = waiting.filter((l) => !(l.signatures ?? []).some((s: Doc) => s.memberId === id));
    if (!mine.length) return [];
    return [{ kind: "bom.toSign", to: [id], title: `${mine.length} BOM ${mine.length === 1 ? "line needs" : "lines need"} your signature`, url: "/apps/bom", dedupeKey: `bom.toSign:${id}:${today}` }];
  });
}

/** Orders past their expected arrival with lines not all received: the leads hear once per expected date. */
export function lateOrders(sections: Doc[], lines: Doc[], leads: string[], today: string): Outgoing[] {
  return sections
    .filter((s) => s.orderedBy && s.expectedArrival && s.expectedArrival < today)
    .filter((s) => lines.some((l) => l.sectionId === s._id && l.orderedAt && (l.receivedQty || 0) < l.quantity))
    .map((s) => ({ kind: "bom.late", to: leads, title: `The ${s.vendor} order is late`, text: `Expected ${s.expectedArrival}, not all received yet.`, url: "/apps/bom", record: { kind: "bomSection", id: String(s._id) }, dedupeKey: `bom.late:${s._id}:${s.expectedArrival}` }));
}

/** The timer job. */
export async function runReminders(ctx: Ctx) {
  const today = ctx.today();
  const [tasks, lines, sections, signers, leads, dueKeys, signKeys, lateKeys, events, shifts, shiftKeys] = await Promise.all([
    ctx.data.query("icarus_tasks", {}),
    ctx.data.query("bom_lines", {}),
    ctx.data.query("bom_sections", {}),
    membersWithBadge(ctx, [BADGES.mentor, BADGES.booster]),
    membersWithBadge(ctx, [BADGES.lead]),
    usedKeys(ctx, "task.due"),
    usedKeys(ctx, "bom.toSign"),
    usedKeys(ctx, "bom.late"),
    ctx.data.query("cal_events", { cancelled: false }),
    ctx.data.query("cal_shifts", {}),
    usedKeys(ctx, "shift.reminder"),
  ]);
  const list = [
    ...taskReminders(tasks, today).filter(fresh(dueKeys)),
    ...signatureReminders(lines, signers, today).filter(fresh(signKeys)),
    ...lateOrders(sections, lines, leads, today).filter(fresh(lateKeys)),
    ...shiftReminders(shifts, events, nextDay(today)).filter(fresh(shiftKeys)),
  ];
  await send(ctx, list);
  return { reminders: list.length };
}
