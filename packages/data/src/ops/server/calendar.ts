// Calendar changes. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Calendar. SERVER ONLY.
//
// Members read cal_events and cal_shifts through listRecords; every change comes through here. What each change does
// is worked out in ../../calendar/plan.ts, which the demo backend (../../calendar/mock.ts) uses too.
//   saveCalEvent    a meeting, event, competition or break (one day's meeting from a season part too)
//   removeCalEvent  one of those, with its shifts
//   saveSchedule    Meeting schedule: season parts and breaks, then the meetings they make
//   assignMeetings  which subteams each meeting is for, and which are mandatory (Leads only)
import { assignRows, COLLECTION_EVENTS, COLLECTION_SHIFTS, cleanEvent, eventRows, PlanError, removedRows, scheduleSave } from "../../calendar/plan";
import type { CalEvent, Shift } from "../../calendar/types";
import { getRecord, type Ctx } from "./context";
import { apiError, type Doc } from "./env";
import * as notify from "./notify";
import { checkSubteams } from "./shared";

/** Runs a plan step, turning what the person typed wrong into a bad-request answer. */
function plan<T>(step: () => T): T {
  try {
    return step();
  } catch (e) {
    if (e instanceof PlanError) throw apiError("bad-request", e.message);
    throw e;
  }
}

const list = (value: unknown) => (Array.isArray(value) ? (value as Record<string, unknown>[]) : []);

async function checkedSubteams(ctx: Ctx, names: string[]): Promise<string[]> {
  return names.length ? checkSubteams(ctx, names) : [];
}

/** { event, shifts?: [{ start, end }] } -> { event, shifts } */
export async function saveCalEvent(ctx: Ctx, body: Doc) {
  const input = (body.event ?? {}) as Record<string, unknown>;
  const before = typeof input._id === "string" && input._id ? ((await getRecord(ctx, COLLECTION_EVENTS, input._id, "event")) as unknown as CalEvent) : null;
  if (before?.cancelled) throw apiError("bad-request", "That event was removed. Reload the page.");
  const event = plan(() => cleanEvent(input, before));
  if (event.type === "part" || (event.type === "break" && event.skipMeetings)) throw apiError("bad-request", "Season parts and their breaks are changed in Meeting schedule.");
  event.subteams = await checkedSubteams(ctx, event.subteams);
  const current = before ? ((await ctx.data.query(COLLECTION_SHIFTS, { eventId: before._id })) as unknown as Shift[]) : [];
  const shifts = plan(() => eventRows(event, (Array.isArray(body.shifts) ? body.shifts : null) as { start: string; end: string }[] | null, current));
  await ctx.data.save(COLLECTION_EVENTS, event as unknown as Doc);
  await ctx.data.saveMany(COLLECTION_SHIFTS, shifts as unknown as Doc[]);
  ctx.log({ kind: "calendar", id: event._id }, before ? "updated" : "created", `${event.type} ${event.startDate}`);
  await tellBumped(ctx, shifts.filter((s) => s.cancelled && s.memberId), [event]);
  return { event, shifts: shifts.filter((s) => !s.cancelled) };
}

/** { id } -> {} */
export async function removeCalEvent(ctx: Ctx, body: Doc) {
  const event = (await getRecord(ctx, COLLECTION_EVENTS, body.id, "event")) as unknown as CalEvent;
  if (event.type === "part" || (event.type === "break" && event.skipMeetings)) throw apiError("bad-request", "Season parts and their breaks are changed in Meeting schedule.");
  const gone = removedRows(event, (await ctx.data.query(COLLECTION_SHIFTS, { eventId: event._id })) as unknown as Shift[]);
  await ctx.data.save(COLLECTION_EVENTS, gone.event as unknown as Doc);
  await ctx.data.saveMany(COLLECTION_SHIFTS, gone.shifts as unknown as Doc[]);
  ctx.log({ kind: "calendar", id: event._id }, "removed", `${event.type} ${event.startDate}`);
  await tellBumped(ctx, gone.shifts.filter((s) => s.memberId), [event]);
  return {};
}

/** { parts: [...], breaks: [...] } -> { added, moved, removed } */
export async function saveSchedule(ctx: Ctx, body: Doc) {
  const parts = list(body.parts), breaks = list(body.breaks);
  if (parts.length > 20 || breaks.length > 40) throw apiError("bad-request", "That's too many season parts or breaks.");
  const [events, shifts] = await Promise.all([ctx.data.query(COLLECTION_EVENTS), ctx.data.query(COLLECTION_SHIFTS)]);
  const result = plan(() => scheduleSave(events as unknown as CalEvent[], shifts as unknown as Shift[], parts, breaks, ctx.today()));
  await ctx.data.saveMany(COLLECTION_EVENTS, result.events as unknown as Doc[]);
  await ctx.data.saveMany(COLLECTION_SHIFTS, result.shifts as unknown as Doc[]);
  await tellBumped(ctx, result.bumped, events as unknown as CalEvent[]);
  ctx.log({ kind: "calendar", id: "schedule" }, "updated", `${result.added} added, ${result.moved} moved, ${result.removed} removed`);
  return { added: result.added, moved: result.moved, removed: result.removed };
}

/** { changes: [{ id, subteams, mandatory }] } -> { saved } */
export async function assignMeetings(ctx: Ctx, body: Doc) {
  const changes = list(body.changes) as { id: unknown; subteams: unknown; mandatory: unknown }[];
  if (!changes.length) return { saved: 0 };
  const events = (await ctx.data.queryIds(COLLECTION_EVENTS, changes.map((c) => String(c.id)))) as unknown as CalEvent[];
  const rows = plan(() => assignRows(events, changes));
  const names = await checkedSubteams(ctx, [...new Set(rows.flatMap((r) => r.subteams))]);
  for (const r of rows) r.subteams = r.subteams.filter((s) => names.includes(s));
  await ctx.data.saveMany(COLLECTION_EVENTS, rows as unknown as Doc[]);
  ctx.log({ kind: "calendar", id: "assign" }, "updated", `${rows.length} meetings`);
  return { saved: rows.length };
}

/** Supervisors taken off a shift because its meeting changed hear about it (only future meetings change). */
function tellBumped(ctx: Ctx, shifts: Shift[], events: CalEvent[]) {
  return shifts.length ? notify.sendAll(ctx, notify.rules.shiftsBumped(shifts as unknown as Doc[], events as unknown as Doc[])) : undefined;
}
