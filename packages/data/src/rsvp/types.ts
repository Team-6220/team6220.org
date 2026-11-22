// What RSVP stores (collections rsvp_forms, rsvp_answers, rsvp_settings) and what its screens show. Plan:
// https://github.com/Team-6220/team6220.org/wiki/Operations-RSVP. Browser-safe.
import type { Item } from "../ops/types";

/** What a lead's extra question asks: Yes or No, a short text answer, or pick one from a list. */
export type QuestionType = "yesno" | "text" | "choice";

export interface Question {
  id: string;
  label: string;
  type: QuestionType;
  /** The list to pick from, for `choice`. */
  options: string[];
}

/** One form for one Calendar event (collection rsvp_forms). Forms are never deleted. */
export interface RsvpForm extends Item {
  /** The Calendar event (a competition or event) it is for. Dates, times and place come from it, so they stay right. */
  eventId: string;
  /** draft: only leads see it. published: every member sees it until the event ends. */
  status: "draft" | "published";
  /** yyyy-mm-dd. Reminders go until then; people can still answer until the event ends. */
  answerBy: string;
  /** The lead's extra questions. Their answers are private to leads, mentors and boosters. */
  questions: Question[];
  publishedAt: string;
  /** Send reminders on the schedule in Reminders (default on), and keep reminding after the answer-by date (default on). */
  remind?: boolean;
  remindAfter?: boolean;
  /** How many have finished it, out of how many were asked: kept up to date each time someone answers, so Manage forms
   *  (and a form after its event ends) can show them without reading every answer. */
  finished?: number;
  asked?: number;
}

export type DayAnswer = "yes" | "no" | "maybe";

/** One member's answer to one form (collection rsvp_answers). */
export interface RsvpAnswer extends Item {
  formId: string;
  memberId: string;
  /** Are you coming? for each day asked (yyyy-mm-dd). */
  days: Record<string, DayAnswer>;
  /** Pit setup only asks if you are available. "" when the event has none. */
  pit: "" | "available" | "not";
  /** "Anything you have to miss?" Private. */
  misses: string;
  /** Answers to the lead's extra questions, by question ID. Private. */
  extra: Record<string, string>;
  /** Every part answered with a Yes or No (a Maybe is saved but does not finish the form). */
  complete: boolean;
  answeredAt: string;
}

/** The team's reminder schedule (one row in rsvp_settings). */
export interface RsvpSettings {
  /** Days before the answer-by date to remind people who have not finished; 0 is the morning it is due. */
  before: number[];
  /** After the date: remind again every this many days until they finish, or the event ends. 0 turns it off. */
  afterEvery: number;
  /** Tell the leads a summary the morning of the deadline. */
  leadSummary: boolean;
  /** Include a link that opens the form. */
  includeLink: boolean;
}

export const DEFAULT_SETTINGS: RsvpSettings = { before: [7, 3, 1, 0], afterEvery: 2, leadSummary: true, includeLink: true };

/** What a Calendar event gives a form. */
export interface EventInfo {
  id: string;
  title: string;
  type: "competition" | "event";
  startDate: string;
  endDate: string;
  setupDate: string;
  location: string;
  startTime: string;
  endTime: string;
}

export type FormState = "draft" | "open" | "ended";

// ----- what the screens get -----

/** A card on Open forms. */
export interface OpenForm {
  form: RsvpForm;
  event: EventInfo;
  /** "none": not answered. "maybe": saved with a Maybe. "done": finished. */
  mine: "none" | "maybe" | "done";
  /** "coming", "not coming", or "coming 2 of 3 days", once finished. */
  summary: string;
  answer: RsvpAnswer | null;
}

/** A row on Manage forms. */
export interface ManageRow {
  form: RsvpForm;
  event: EventInfo;
  state: FormState;
  /** How many of the team have finished, out of how many are asked. */
  finished: number;
  asked: number;
  /** The season the event is in: "2026–27". */
  season: string;
}

export interface ResultRow {
  memberId: string;
  name: string;
  subteams: string[];
  pit: "" | "available" | "not";
  days: Record<string, DayAnswer | "">;
  /** Finished the form (so not in "No answer yet"). */
  finished: boolean;
}

export interface PrivateRow {
  memberId: string;
  name: string;
  subteams: string[];
  misses: string;
  extra: Record<string, string>;
}

export interface Results {
  form: RsvpForm;
  event: EventInfo;
  /** Each day asked, in order. */
  days: string[];
  hasPit: boolean;
  /** People available for pit setup, and people coming each day. */
  pitAvailable: number;
  coming: Record<string, number>;
  noAnswer: number;
  rows: ResultRow[];
  /** Only for leads, mentors and boosters. */
  details: PrivateRow[] | null;
}
