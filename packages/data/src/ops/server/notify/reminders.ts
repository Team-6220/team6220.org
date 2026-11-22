// Timed notifications: the timer runs runReminders every 15 minutes, and it finds what is due. Each reminder has a
// dedupe key (which task, which day), so running again never sends twice. SERVER ONLY.
import { BADGES } from "../../../config";
import type { Ctx } from "../context";
import type { Doc } from "../env";
import { membersWithBadge } from "./index";
import { COLLECTION_NOTIFICATIONS, send, type Outgoing } from "./outbox";
import { reminderDue, COLLECTION_ANSWERS, COLLECTION_FORMS } from "../../../rsvp/plan";
import type { RsvpAnswer, RsvpForm } from "../../../rsvp/types";
import { settingsOf, teamMembers, unfinished } from "../rsvp";
import { bizFollowUp, bizReminder, rsvpReminder, rsvpSummary, shiftReminders } from "./rules";
import { COLLECTION_PITCHES, daysBetween as bizDaysBetween, reminderEvery } from "../../../business/fundraising";
import { seasonLabel } from "../../../business/plan";
import type { Pitch } from "../../../business/types";
import { bizStatus, settingsOf as bizSettingsOf } from "../fundraising";

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

/** RSVP forms: on each day the schedule names (days before the answer-by date, the day itself, every few days after), the
 *  people who haven't finished get a reminder; the morning it is due, the leads hear a summary. Cheap on the days nothing is
 *  due: it reads the published forms and the schedule, and goes further only for a form that is due. */
export async function rsvpReminders(ctx: Ctx, today: string, events: Doc[]): Promise<Outgoing[]> {
  const forms = (await ctx.data.query(COLLECTION_FORMS, { status: "published" }, 1000)) as unknown as RsvpForm[];
  if (!forms.length) return [];
  const settings = await settingsOf(ctx);
  const due = forms.flatMap((form) => {
    const event = events.find((e) => e._id === form.eventId && !e.cancelled);
    const when = event && form.remind !== false ? reminderDue(settings, form.answerBy, String(event.endDate), today, form.remindAfter !== false) : null;
    return event && when ? [{ form, event, when }] : [];
  });
  const summaries = forms.flatMap((form) => { const event = events.find((e) => e._id === form.eventId && !e.cancelled); return event && settings.leadSummary && form.answerBy === today && String(event.endDate) >= today ? [{ form, event }] : []; });
  if (!due.length && !summaries.length) return [];
  const [team, leads, remindKeys, summaryKeys] = await Promise.all([teamMembers(ctx), membersWithBadge(ctx, [BADGES.lead]), usedKeys(ctx, "rsvp.reminder"), usedKeys(ctx, "rsvp.summary")]);
  const out: Outgoing[] = [];
  for (const { form, event, when } of due) {
    const answers = (await ctx.data.query(COLLECTION_ANSWERS, { formId: form._id }, 1000)) as unknown as RsvpAnswer[];
    const to = unfinished(team, answers);
    if (to.length) out.push(rsvpReminder(form as unknown as Doc, event, to, settings.includeLink, `rsvp.reminder:${form._id}:${today}:${when}`));
  }
  for (const { form, event } of summaries) {
    const answers = (await ctx.data.query(COLLECTION_ANSWERS, { formId: form._id }, 1000)) as unknown as RsvpAnswer[];
    const finished = team.filter((m) => answers.some((a) => a.memberId === m.memberId && a.complete)).length;
    out.push(rsvpSummary(form as unknown as Doc, event, leads, finished, team.length, `rsvp.summary:${form._id}:${today}`));
  }
  return [...out.filter(fresh(remindKeys)).filter((n) => n.kind !== "rsvp.summary"), ...out.filter(fresh(summaryKeys)).filter((n) => n.kind === "rsvp.summary")];
}

/** The daily RSVP job (its own timer, once each morning: it has more to read than runReminders can fit in one request). */
export async function runRsvpReminders(ctx: Ctx) {
  const list = await rsvpReminders(ctx, ctx.today(), await ctx.data.query("cal_events", { cancelled: false }));
  await send(ctx, list);
  return { reminders: list.length };
}

/**
 * The daily 1-2-3-100 job (its own timer: it reads everyone's things). Students who aren't done are reminded on the
 * schedule in the settings, counted back from the deadline; students whose sponsor pitch follow-up is due hear about it.
 */
export async function runBizReminders(ctx: Ctx) {
  const today = ctx.today();
  const settings = await bizSettingsOf(ctx);
  const out: Outgoing[] = [];
  const anyWay = settings.ways.discord || settings.ways.push || settings.ways.badge;
  if (settings.deadline && today <= settings.deadline && anyWay) {
    const daysLeft = bizDaysBetween(today, settings.deadline);
    if (daysLeft % reminderEvery(settings.reminders, daysLeft) === 0) {
      const { rows } = await bizStatus(ctx);
      const to = rows.filter((r) => r.standing !== "done" && r.standing !== "exempt").map((r) => r.memberId);
      if (to.length) out.push(bizReminder(to, settings.deadline, `biz.reminder:${today}`));
    }
  }
  const pitches = (await ctx.data.query(COLLECTION_PITCHES, { season: seasonLabel(today) }, 1000)) as unknown as Pitch[];
  for (const p of pitches) {
    if (!p.sentOn || p.reply !== "none") continue;
    for (const f of p.followUps) {
      const late = bizDaysBetween(f.dueOn, today);
      if (!f.sentOn && late >= 0 && late % 3 === 0) out.push(bizFollowUp(p.memberId, p.company, f.n, `biz.followup:${p._id}:${f.n}:${today}`));
    }
  }
  const [reminded, followed] = await Promise.all([usedKeys(ctx, "biz.reminder"), usedKeys(ctx, "biz.followup")]);
  const list = out.filter((n) => !(n.kind === "biz.reminder" ? reminded : followed).has(n.dedupeKey ?? ""));
  await send(ctx, list);
  return { reminders: list.length };
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
