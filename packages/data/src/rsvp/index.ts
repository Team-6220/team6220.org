// rsvp: the functions /apps/rsvp uses. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-RSVP.
//
//   import { rsvp } from "@team6220/data";
//   const forms = await rsvp.openForms();                       // the forms you can answer
//   await rsvp.answer(formId, { days, pit, misses, extra });    // a Maybe is saved but doesn't finish the form
//   const results = await rsvp.results(formId);                 // who's coming (+ private details for leads, mentors, boosters)
//
// Every call goes to the team server (/api/ops), which checks who is asking. Demo mode (?demo=lead|member) uses made-up
// data (./mock.ts).
import "./mock"; // the demo data (only used in demo mode)
import { callOps } from "../ops";
import type { ManageRow, OpenForm, Question, Results, RsvpForm, RsvpSettings } from "./types";

export * from "./types";
export { answerSummary, askedDays, canRemoveQuestions, formableEvents, formState, hasPit, isComplete, reminderDue, seasonLabel, eventInfo } from "./plan";

/** The published forms whose event hasn't ended, with your answer to each. */
export async function openForms(): Promise<OpenForm[]> {
  return (await callOps<{ forms: OpenForm[] }>("rsvpOpen")).forms;
}

export type AnswerInput = { days: Record<string, string>; pit: string; misses: string; extra: Record<string, string> };

/** Saves your answer to a form. */
export async function answer(formId: string, input: AnswerInput): Promise<OpenForm> {
  return (await callOps<{ form: OpenForm }>("rsvpAnswer", { formId, answer: input })).form;
}

/** Who's coming. Leads, mentors and boosters also get `details` (what people have to miss, and the extra answers). */
export async function results(formId: string): Promise<Results> {
  return (await callOps<{ results: Results }>("rsvpResults", { formId })).results;
}

/** Leads: every form, newest event first. */
export async function manage(): Promise<ManageRow[]> {
  return (await callOps<{ rows: ManageRow[] }>("rsvpManage")).rows;
}

export type FormInput = { _id?: string; eventId: string; status: "draft" | "published"; answerBy: string; questions: Partial<Question>[]; remind?: boolean; remindAfter?: boolean };

/** Leads: makes, changes or publishes a form. */
export async function saveForm(form: FormInput): Promise<RsvpForm> {
  return (await callOps<{ form: RsvpForm }>("rsvpSaveForm", { form })).form;
}

/** Leads: sends the reminder now to everyone on the team who hasn't finished. */
export async function remind(formId: string): Promise<number> {
  return (await callOps<{ sent: number }>("rsvpRemind", { formId })).sent;
}

export async function settings(): Promise<RsvpSettings> {
  return (await callOps<{ settings: RsvpSettings }>("rsvpGetSettings")).settings;
}

export async function saveSettings(next: RsvpSettings): Promise<RsvpSettings> {
  return (await callOps<{ settings: RsvpSettings }>("rsvpSaveSettings", { settings: next })).settings;
}
