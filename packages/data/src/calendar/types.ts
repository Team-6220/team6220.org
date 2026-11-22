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
}

export interface CalendarData {
  events: CalEvent[];
  shifts: Shift[];
}
