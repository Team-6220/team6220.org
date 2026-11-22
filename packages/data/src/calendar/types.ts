// What the Calendar stores (collections cal_events and cal_shifts). Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Calendar.
import type { Item } from "../ops/types";

/** meeting: one team meeting on one day. competition / event: a dated thing (outreach, kickoff, parent meeting).
 *  break: days with no regular meetings. part: a season part (Fall, Build season), shown as a band. */
export type CalEventType = "meeting" | "competition" | "event" | "break" | "part";

export interface CalEvent extends Item {
  type: CalEventType;
  /** "" for an ordinary meeting ("Team meeting" is shown). */
  title: string;
  /** yyyy-mm-dd. A meeting is one day: endDate = startDate. Competitions, breaks and parts can span days. */
  startDate: string;
  endDate: string;
  /** HH:MM, 24-hour, team time (America/Los_Angeles). "" for all-day things. */
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  /** ★ on the calendar: everyone it's for is expected. */
  mandatory: boolean;
  /** Which subteams it's for. Empty = everyone (#291). */
  subteams: string[];
  /** On the public calendar too (meetings, competitions, breaks). Shifts and supervisors are never public. */
  public: boolean;
  cancelled: boolean;
  /** Competitions: the set-up day before, if any. */
  setupDate?: string;
  /** Meetings made by Meeting schedule: the season part they came from. "" or missing for a meeting added by hand. */
  partId?: string;
  /** A meeting from a season part that a lead changed (or removed) for that day only. Schedule changes leave it alone. */
  edited?: boolean;
  /** For an edited meeting from a season part: the day the schedule put it on, which the schedule keeps free. */
  partDate?: string;
  /** Breaks from Meeting schedule: no meetings are made from season parts on these days. Breaks added on the
   *  calendar are only marked there. */
  skipMeetings?: boolean;
  /** Season parts: the meeting on each weekday they cover. */
  pattern?: PartDay[];
}

/** One weekday of a season part: Tuesdays 15:20–17:00 with 1 supervision shift. */
export interface PartDay {
  /** 0 = Sunday ... 6 = Saturday */
  day: number;
  start: string;
  end: string;
  shifts: number;
}

/** One supervision slot on a meeting. */
export interface Shift extends Item {
  eventId: string;
  /** HH:MM */
  start: string;
  end: string;
  /** The supervisor's member ID, or "" when open (or for a name copied from the old sheet). */
  memberId: string;
  /** The supervisor's name as shown. Names copied from the old sheet have no memberId. */
  name: string;
  signedUpAt: string;
  /** Removed (its meeting was removed or changed). Kept, not deleted, so one bulk save does it. */
  cancelled?: boolean;
}

export interface CalendarData {
  events: CalEvent[];
  shifts: Shift[];
  supervisors: Supervisor[];
}

/** The paperwork, in order. "Tell the lead parent" is step 1. */
export type StepStatus = "done" | "waiting" | "";

/** A parent's supervisor paperwork, kept on their own account row (ops_people.supervisor). Approved supervisors can
 *  sign up for shifts. */
export interface SupervisorInfo {
  /** started: asked to supervise, paperwork under way. approved: the school approved them. inactive: no longer supervising. */
  status: "started" | "approved" | "inactive";
  /** One status per step in SUPERVISOR_STEPS. */
  steps: StepStatus[];
  /** yyyy-mm, or "" when unknown. */
  approvedMonth: string;
}

/** Someone with supervisor paperwork, as the Supervisors screen lists them. */
export interface Supervisor extends SupervisorInfo {
  memberId: string;
  name: string;
}
