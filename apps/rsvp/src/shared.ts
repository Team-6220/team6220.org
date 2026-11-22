// Small things every RSVP screen uses: links between pages, and how an event's dates are written.
import { calendar, type EventInfo } from "@team6220/data";

export const answerHref = (id: string) => `/apps/rsvp/answer?id=${encodeURIComponent(id)}`;
export const resultsHref = (id: string) => `/apps/rsvp/results?id=${encodeURIComponent(id)}`;
export const editHref = (id: string) => `/apps/rsvp/new?id=${encodeURIComponent(id)}`;

/** A page's ?name= value. */
export const param = (name: string) => new URLSearchParams(location.search).get(name) ?? "";

/** "Sat Nov 21", or "Fri Dec 4 to Sun Dec 6". */
export function eventDates(e: Pick<EventInfo, "startDate" | "endDate">): string {
  return e.startDate === e.endDate ? calendar.shortDay(e.startDate) : `${calendar.shortDay(e.startDate)} to ${calendar.shortDay(e.endDate)}`;
}

/** "Sat Nov 21 · one day", "Fri Dec 4 to Sun Dec 6 · 3 days + pit setup", or "Sun Nov 22, 5:30 pm". */
export function eventWhen(e: EventInfo): string {
  const days = calendar.daysBetween(e.startDate, e.endDate) + 1;
  if (days === 1) return e.startTime ? `${eventDates(e)}, ${calendar.longTime(e.startTime).toLowerCase()}` : `${eventDates(e)} · one day`;
  return `${eventDates(e)} · ${days} days${e.type === "competition" && e.setupDate ? " + pit setup" : ""}`;
}

/** "Nov 28" */
export const dayName = (date: string) => calendar.monthDay(date);
