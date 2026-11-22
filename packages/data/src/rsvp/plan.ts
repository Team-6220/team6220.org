// RSVP rules: which days a form asks about, what counts as finished, what a lead may type, and the results. Plain
// functions on lists, so the server (ops/server/rsvp.ts) and the demo backend (./mock.ts) do exactly the same thing.
// Browser-safe.
import { eachDay } from "../calendar/dates";
import { seasonOf } from "../attendance/stats";
import type { CalEvent } from "../calendar/types";
import type { DayAnswer, EventInfo, FormState, ManageRow, OpenForm, Question, QuestionType, ResultRow, Results, RsvpAnswer, RsvpForm, RsvpSettings } from "./types";

export const COLLECTION_FORMS = "rsvp_forms";
export const COLLECTION_ANSWERS = "rsvp_answers";
export const COLLECTION_SETTINGS = "rsvp_settings";

/** Something a person typed wrong: the message is safe to show them. */
export class RsvpError extends Error {}

const MAX_QUESTIONS = 12;
const DAY_ANSWERS: DayAnswer[] = ["yes", "no", "maybe"];

/** What a form needs to know about its Calendar event. */
export function eventInfo(e: CalEvent): EventInfo {
  return { id: e._id, title: e.title || "Event", type: e.type === "competition" ? "competition" : "event", startDate: e.startDate, endDate: e.endDate, setupDate: e.setupDate ?? "", location: e.location, startTime: e.startTime, endTime: e.endTime };
}

/** Events a form can be made for: competitions and other events that haven't ended (not meetings, breaks or season parts). */
export const formableEvents = (events: CalEvent[], today: string) => events.filter((e) => (e.type === "competition" || e.type === "event") && !e.cancelled && e.endDate >= today);

/** Each day of the event is asked on its own; a one-day event asks once. */
export const askedDays = (event: Pick<EventInfo, "startDate" | "endDate">) => eachDay(event.startDate, event.endDate);

/** Pit setup is asked only of a competition with a set-up day, and only whether you are available. */
export const hasPit = (event: Pick<EventInfo, "type" | "setupDate">) => event.type === "competition" && !!event.setupDate;

/** Draft: leads only. Open: members see it. Ended: the event is over, so it disappears for members (and is kept). */
export function formState(form: Pick<RsvpForm, "status">, event: Pick<EventInfo, "endDate"> | undefined, today: string): FormState {
  if (event && event.endDate < today) return "ended";
  return form.status === "published" ? "open" : "draft";
}

/** "2026–27" for the season an event is in (August to July). */
export function seasonLabel(date: string): string {
  const start = Number(seasonOf(date));
  return `${start}–${String(start + 1).slice(2)}`;
}

// ----- the answer -----

/** Finished: every day, pit setup (when asked), "anything you have to miss", and every extra question has an answer, and no day is Maybe. */
export function isComplete(form: Pick<RsvpForm, "questions">, event: EventInfo, answer: Pick<RsvpAnswer, "days" | "pit" | "misses" | "extra">): boolean {
  if (!askedDays(event).every((d) => answer.days[d] === "yes" || answer.days[d] === "no")) return false;
  if (hasPit(event) && !answer.pit) return false;
  if (!answer.misses.trim()) return false;
  return form.questions.every((q) => (answer.extra[q.id] ?? "").trim() !== "");
}

/** What the browser sent -> a clean answer, with `complete` worked out. Throws RsvpError for something that can't be right. */
export function cleanAnswer(form: Pick<RsvpForm, "questions">, event: EventInfo, input: Record<string, unknown>): Pick<RsvpAnswer, "days" | "pit" | "misses" | "extra" | "complete"> {
  const asked = askedDays(event);
  const daysIn = (input.days && typeof input.days === "object" ? input.days : {}) as Record<string, unknown>;
  const days: Record<string, DayAnswer> = {};
  for (const d of asked) {
    const v = daysIn[d];
    if (v === undefined || v === "") continue;
    if (!DAY_ANSWERS.includes(v as DayAnswer)) throw new RsvpError("Pick Yes, No or Maybe for each day.");
    days[d] = v as DayAnswer;
  }
  const pit = hasPit(event) ? (input.pit === "available" || input.pit === "not" ? input.pit : "") : "";
  const misses = typeof input.misses === "string" ? input.misses.trim().slice(0, 1000) : "";
  const extraIn = (input.extra && typeof input.extra === "object" ? input.extra : {}) as Record<string, unknown>;
  const extra: Record<string, string> = {};
  for (const q of form.questions) {
    const v = typeof extraIn[q.id] === "string" ? (extraIn[q.id] as string).trim() : "";
    if (!v) continue;
    if (q.type === "yesno" && v !== "Yes" && v !== "No") throw new RsvpError(`Answer "${q.label}" with Yes or No.`);
    if (q.type === "choice" && !q.options.includes(v)) throw new RsvpError(`Pick one of the choices for "${q.label}".`);
    extra[q.id] = v.slice(0, 500);
  }
  const clean = { days, pit: pit as RsvpAnswer["pit"], misses, extra };
  return { ...clean, complete: isComplete(form, event, clean) };
}

/** "none", "maybe" (saved, still needs a yes or no) or "done", and for a finished one "coming", "not coming" or "coming 2 of 3 days". */
export function answerSummary(form: Pick<RsvpForm, "questions">, event: EventInfo, answer: RsvpAnswer | undefined): { mine: OpenForm["mine"]; summary: string } {
  if (!answer) return { mine: "none", summary: "" };
  if (!answer.complete) return { mine: "maybe", summary: "" };
  const asked = askedDays(event);
  const yes = asked.filter((d) => answer.days[d] === "yes").length;
  return { mine: "done", summary: yes === asked.length ? "coming" : yes === 0 ? "not coming" : `coming ${yes} of ${asked.length} days` };
}

// ----- the form -----

const newId = () => `q${Math.random().toString(36).slice(2, 8)}`;

/** A lead's question -> a clean one, keeping its ID if it has one (answers are filed under it). */
export function cleanQuestion(input: Record<string, unknown>): Question {
  const label = typeof input.label === "string" ? input.label.trim().slice(0, 200) : "";
  if (!label) throw new RsvpError("Type each question.");
  const type = (["yesno", "text", "choice"] as QuestionType[]).includes(input.type as QuestionType) ? (input.type as QuestionType) : "yesno";
  let options: string[] = [];
  if (type === "choice") {
    options = [...new Set((Array.isArray(input.options) ? input.options : []).map((o) => String(o).trim().slice(0, 80)).filter(Boolean))];
    if (options.length < 2 || options.length > 8) throw new RsvpError(`"${label}" needs 2 to 8 choices.`);
  }
  return { id: typeof input.id === "string" && /^q\w{3,12}$/.test(input.id) ? input.id : newId(), label, type, options };
}

/** What a lead sent -> a clean form. The event must be one a form can be made for. */
export function cleanForm(input: Record<string, unknown>, event: EventInfo | undefined, today: string): Pick<RsvpForm, "eventId" | "status" | "answerBy" | "questions" | "remind" | "remindAfter"> {
  if (!event) throw new RsvpError("Pick a Calendar event for the form.");
  if (event.endDate < today) throw new RsvpError("That event is over.");
  const answerBy = typeof input.answerBy === "string" ? input.answerBy : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(answerBy)) throw new RsvpError("Pick the day people should answer by.");
  const questions = Array.isArray(input.questions) ? (input.questions as Record<string, unknown>[]).map(cleanQuestion) : [];
  if (questions.length > MAX_QUESTIONS) throw new RsvpError(`A form can have up to ${MAX_QUESTIONS} extra questions.`);
  return { eventId: event.id, status: input.status === "published" ? "published" : "draft", answerBy, questions, remind: input.remind !== false, remindAfter: input.remindAfter !== false };
}

/** Changing a form's questions is fine until answers exist; after that only adding keeps answers meaningful. */
export const canRemoveQuestions = (answerCount: number) => answerCount === 0;

// ----- who and what -----

export interface TeamMember {
  memberId: string;
  name: string;
  subteams: string[];
}

/** The cards on Open forms for one member: forms that are published and whose event hasn't ended. */
export function openFor(forms: RsvpForm[], events: Map<string, EventInfo>, answers: RsvpAnswer[], memberId: string, today: string): OpenForm[] {
  return forms
    .map((form) => ({ form, event: events.get(form.eventId) }))
    .filter((x): x is { form: RsvpForm; event: EventInfo } => !!x.event && formState(x.form, x.event, today) === "open")
    .map(({ form, event }) => {
      const answer = answers.find((a) => a.formId === form._id && a.memberId === memberId);
      return { form, event, answer: answer ?? null, ...answerSummary(form, event, answer) };
    })
    .sort((a, b) => a.event.startDate.localeCompare(b.event.startDate));
}

/** Manage forms: every form, newest event first, with how many have finished (as kept on the form; `askedNow` is the team's size today). */
export function manageRows(forms: RsvpForm[], events: Map<string, EventInfo>, askedNow: number, today: string): ManageRow[] {
  return forms
    .map((form) => ({ form, event: events.get(form.eventId) }))
    .filter((x): x is { form: RsvpForm; event: EventInfo } => !!x.event)
    .map(({ form, event }): ManageRow => {
      const state = formState(form, event, today);
      return { form, event, state, season: seasonLabel(event.startDate), finished: form.finished ?? 0, asked: state === "ended" ? (form.asked ?? askedNow) : askedNow };
    })
    .sort((a, b) => b.event.startDate.localeCompare(a.event.startDate));
}

/** Who's coming: the counts and one row per team member. `details` (what people have to miss and the extra answers) only when asked. */
export function resultsFor(form: RsvpForm, event: EventInfo, team: TeamMember[], answers: RsvpAnswer[], withDetails: boolean): Results {
  const days = askedDays(event);
  const mine = (m: TeamMember) => answers.find((a) => a.formId === form._id && a.memberId === m.memberId);
  const rows: ResultRow[] = team.map((m) => {
    const a = mine(m);
    return { memberId: m.memberId, name: m.name, subteams: m.subteams, pit: a?.pit ?? "", days: Object.fromEntries(days.map((d) => [d, a?.days[d] ?? ""])) as ResultRow["days"], finished: !!a?.complete };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return {
    form,
    event,
    days,
    hasPit: hasPit(event),
    pitAvailable: rows.filter((r) => r.pit === "available").length,
    coming: Object.fromEntries(days.map((d) => [d, rows.filter((r) => r.days[d] === "yes").length])),
    noAnswer: rows.filter((r) => !r.finished).length,
    rows,
    details: withDetails ? team.flatMap((m) => { const a = mine(m); return a ? [{ memberId: m.memberId, name: m.name, subteams: m.subteams, misses: a.misses, extra: a.extra }] : []; }).sort((a, b) => a.name.localeCompare(b.name)) : null,
  };
}

// ----- reminders -----

/** Whether a reminder is due on `today` for a form with this answer-by date: days before, the day itself, or every N days after. */
export function reminderDue(settings: RsvpSettings, answerBy: string, eventEnd: string, today: string, remindAfter = true): string | null {
  if (today > eventEnd) return null;
  const gap = Math.round((Date.parse(`${answerBy}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (gap >= 0) return settings.before.includes(gap) ? `before:${gap}` : null;
  const after = -gap;
  return remindAfter && settings.afterEvery > 0 && after % settings.afterEvery === 0 ? `after:${after}` : null;
}

/** What a lead sent for Reminders -> clean settings. */
export function cleanSettings(input: Record<string, unknown>): RsvpSettings {
  const before = [...new Set((Array.isArray(input.before) ? input.before : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 60))].sort((a, b) => b - a);
  const afterEvery = Number(input.afterEvery);
  if (!Number.isInteger(afterEvery) || afterEvery < 0 || afterEvery > 30) throw new RsvpError("Remind again every 0 to 30 days (0 turns it off).");
  return { before, afterEvery, leadSummary: input.leadSummary !== false, includeLink: input.includeLink !== false };
}
