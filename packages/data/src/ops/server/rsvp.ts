// RSVP on the server. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-RSVP. SERVER ONLY.
//
// A form belongs to one Calendar event (a competition or event) and takes its dates, times and place from it. Leads make
// and publish forms; every team member sees a published form until its event ends, and answers it. Everyone on the team
// can see who is coming; leads, mentors and boosters also see the private details (what people have to miss, and the answers
// to the lead's extra questions). What the rules mean is worked out in ../../rsvp/plan.ts, which the demo backend uses too.
//   rsvpOpen          the forms you can answer, with your answers                           team
//   rsvpAnswer        save your answer (a Maybe is saved but doesn't finish the form)       team
//   rsvpResults       who's coming (+ private details for leads, mentors, boosters)         team
//   rsvpManage        every form, with how many have finished                               lead
//   rsvpSaveForm      make, change or publish a form                                       lead
//   rsvpRemind        send the reminder now to everyone who hasn't finished                 lead
//   rsvpGetSettings / rsvpSaveSettings   the reminder schedule                              lead
import { BADGES } from "../../config";
import { eventInfo, openFor, manageRows, resultsFor, cleanAnswer, cleanForm, cleanSettings, formState, COLLECTION_ANSWERS, COLLECTION_FORMS, COLLECTION_SETTINGS, RsvpError, type TeamMember } from "../../rsvp/plan";
import { DEFAULT_SETTINGS, type EventInfo, type RsvpAnswer, type RsvpForm, type RsvpSettings } from "../../rsvp/types";
import type { CalEvent } from "../../calendar/types";
import { rolesFor } from "../roles";
import { COLLECTION_PEOPLE, getRecord, type Ctx } from "./context";
import { apiError, type Doc } from "./env";
import * as notify from "./notify";

export const RSVP_COLLECTIONS = [COLLECTION_FORMS, COLLECTION_ANSWERS, COLLECTION_SETTINGS] as const;

function plan<T>(step: () => T): T {
  try {
    return step();
  } catch (e) {
    if (e instanceof RsvpError) throw apiError("bad-request", e.message);
    throw e;
  }
}

/** The Calendar events forms can be about, by ID. */
async function eventsById(ctx: Ctx): Promise<Map<string, EventInfo>> {
  const rows = (await ctx.data.query("cal_events", {}, 1000)) as unknown as CalEvent[];
  return new Map(rows.filter((e) => (e.type === "competition" || e.type === "event") && !e.cancelled).map((e) => [e._id, eventInfo(e)]));
}

/** Everyone with the Team Member badge: who a form asks, and who "No answer yet" counts. */
export async function teamMembers(ctx: Ctx): Promise<TeamMember[]> {
  const ids = new Set(await notify.membersWithBadge(ctx, [BADGES.teamMember]));
  const people = await ctx.data.query(COLLECTION_PEOPLE, {}, 1000);
  return people.filter((p) => ids.has(String(p.memberId))).map((p) => ({ memberId: String(p.memberId), name: String(p.name ?? ""), subteams: (p.subteams as string[]) ?? [] }));
}

export async function settingsOf(ctx: Ctx): Promise<RsvpSettings> {
  const row = (await ctx.data.query(COLLECTION_SETTINGS, {}, 1))[0] as Partial<RsvpSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(row ?? {}) };
}

/** {} -> { forms }: the published forms whose event hasn't ended, with your answer to each. */
export async function rsvpOpen(ctx: Ctx) {
  const [forms, events, answers] = await Promise.all([
    ctx.data.query(COLLECTION_FORMS, { status: "published" }, 1000),
    eventsById(ctx),
    ctx.data.query(COLLECTION_ANSWERS, { memberId: ctx.actor.id }, 1000),
  ]);
  return { forms: openFor(forms as unknown as RsvpForm[], events, answers as unknown as RsvpAnswer[], ctx.actor.id, ctx.today()) };
}

/** { formId, answer: { days, pit, misses, extra } } -> { form }. */
export async function rsvpAnswer(ctx: Ctx, body: Doc) {
  const form = (await getRecord(ctx, COLLECTION_FORMS, body.formId, "form")) as unknown as RsvpForm;
  const event = (await eventsById(ctx)).get(form.eventId);
  if (!event || formState(form, event, ctx.today()) !== "open") throw apiError("bad-request", "That form isn't open any more.");
  const clean = plan(() => cleanAnswer(form, event, (body.answer ?? {}) as Record<string, unknown>));
  const existing = (await ctx.data.query(COLLECTION_ANSWERS, { formId: form._id, memberId: ctx.actor.id }, 1))[0];
  const saved = (await ctx.data.save(COLLECTION_ANSWERS, { ...(existing ?? {}), formId: form._id, memberId: ctx.actor.id, ...clean, answeredAt: ctx.env.now().toISOString() })) as unknown as RsvpAnswer;
  // Keep the count on the form, so Manage forms and the ended forms don't read every answer.
  const [all, team] = await Promise.all([ctx.data.query(COLLECTION_ANSWERS, { formId: form._id }, 1000), teamMembers(ctx)]);
  const ids = new Set(team.map((m) => m.memberId));
  await ctx.data.save(COLLECTION_FORMS, { ...form, finished: all.filter((a) => a.complete && ids.has(String(a.memberId))).length, asked: team.length } as unknown as Doc);
  return { form: openFor([form], new Map([[event.id, event]]), [saved], ctx.actor.id, ctx.today())[0] };
}

/** { formId } -> { results }. Members see a published form's results; leads see a draft's too. */
export async function rsvpResults(ctx: Ctx, body: Doc) {
  const form = (await getRecord(ctx, COLLECTION_FORMS, body.formId, "form")) as unknown as RsvpForm;
  const roles = rolesFor(ctx.actor.badges);
  if (form.status !== "published" && !roles.lead) throw apiError("forbidden", "That form isn't published yet.");
  const [event, team, answers] = await Promise.all([eventsById(ctx).then((m) => m.get(form.eventId)), teamMembers(ctx), ctx.data.query(COLLECTION_ANSWERS, { formId: form._id }, 1000)]);
  if (!event) throw apiError("bad-request", "That form's event isn't on the calendar any more.");
  return { results: resultsFor(form, event, team, answers as unknown as RsvpAnswer[], roles.scheduler) };
}

/** {} -> { rows, events, settings }. */
export async function rsvpManage(ctx: Ctx) {
  const [forms, events, team] = await Promise.all([ctx.data.query(COLLECTION_FORMS, {}, 1000), eventsById(ctx), teamMembers(ctx)]);
  return { rows: manageRows(forms as unknown as RsvpForm[], events, team.length, ctx.today()) };
}

/** { form: { _id?, eventId, status, answerBy, questions } } -> { form }. */
export async function rsvpSaveForm(ctx: Ctx, body: Doc) {
  const input = (body.form ?? {}) as Record<string, unknown>;
  const before = typeof input._id === "string" && input._id ? ((await getRecord(ctx, COLLECTION_FORMS, input._id, "form")) as unknown as RsvpForm) : null;
  const event = (await eventsById(ctx)).get(String(before?.eventId ?? input.eventId));
  const clean = plan(() => cleanForm({ ...input, eventId: before?.eventId ?? input.eventId }, event, ctx.today()));
  if (!before && (await ctx.data.query(COLLECTION_FORMS, { eventId: clean.eventId }, 1)).length) throw apiError("bad-request", "That event already has a form.");
  if (before) {
    // Taking a question away would orphan answers already given: only add or change wording after answers exist.
    const gone = before.questions.filter((q) => !clean.questions.some((c) => c.id === q.id));
    if (gone.length && (await ctx.data.query(COLLECTION_ANSWERS, { formId: before._id }, 1)).length) throw apiError("bad-request", "People have already answered, so a question can't be taken away. You can change its wording.");
  }
  const publishing = clean.status === "published" && before?.status !== "published";
  const saved = (await ctx.data.save(COLLECTION_FORMS, { ...(before ?? { finished: 0, asked: 0 }), ...clean, publishedAt: publishing ? ctx.env.now().toISOString() : (before?.publishedAt ?? "") } as unknown as Doc)) as unknown as RsvpForm;
  ctx.log({ kind: "rsvp", id: String(saved._id) }, before ? (publishing ? "published" : "updated") : "created", event ? event.title : "form");
  return { form: saved };
}

/** { formId } -> { sent }. The reminder now, to everyone on the team who hasn't finished. */
export async function rsvpRemind(ctx: Ctx, body: Doc) {
  const form = (await getRecord(ctx, COLLECTION_FORMS, body.formId, "form")) as unknown as RsvpForm;
  const [event, team, answers, settings] = await Promise.all([eventsById(ctx).then((m) => m.get(form.eventId)), teamMembers(ctx), ctx.data.query(COLLECTION_ANSWERS, { formId: form._id }, 1000), settingsOf(ctx)]);
  if (!event || formState(form, event, ctx.today()) !== "open") throw apiError("bad-request", "Only a published form whose event hasn't ended can be reminded.");
  const to = unfinished(team, answers as unknown as RsvpAnswer[]);
  if (to.length) await notify.sendAll(ctx, [notify.rules.rsvpReminder(form, event, to, settings.includeLink)]);
  ctx.log({ kind: "rsvp", id: String(form._id) }, "reminded", `${to.length} people`);
  return { sent: to.length };
}

/** The team members with no finished answer (a Maybe doesn't finish a form). */
export function unfinished(team: TeamMember[], answers: RsvpAnswer[]): string[] {
  return team.filter((m) => !answers.some((a) => a.memberId === m.memberId && a.complete)).map((m) => m.memberId);
}

/** {} -> { settings } */
export async function rsvpGetSettings(ctx: Ctx) {
  return { settings: await settingsOf(ctx) };
}

/** { settings } -> { settings } */
export async function rsvpSaveSettings(ctx: Ctx, body: Doc) {
  const clean = plan(() => cleanSettings((body.settings ?? {}) as Record<string, unknown>));
  const row = (await ctx.data.query(COLLECTION_SETTINGS, {}, 1))[0];
  await ctx.data.save(COLLECTION_SETTINGS, { ...(row ?? {}), ...clean } as unknown as Doc);
  ctx.log({ kind: "rsvp", id: "settings" }, "updated", "reminder schedule");
  return { settings: clean };
}
