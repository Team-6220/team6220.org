// The public calendar: what anyone sees, signed in or not. Plain functions, used by the server (ops/server/calendar.ts)
// and the demo backend (./mock.ts), so both leave out exactly the same things.
import type { CalEvent } from "./types";

/** Meetings, competitions, events and breaks marked public, with only what a visitor needs: no notes, no subteams, no
 *  season parts, and never shifts or supervisors (those are other collections). */
export function publicEvents(events: CalEvent[]): CalEvent[] {
  return events
    .filter((e) => e.public && !e.cancelled && e.type !== "part")
    .map((e) => ({
      _id: e._id,
      type: e.type,
      title: e.title,
      startDate: e.startDate,
      endDate: e.endDate,
      startTime: e.startTime,
      endTime: e.endTime,
      location: e.location,
      notes: "",
      mandatory: e.mandatory,
      subteams: [],
      public: true,
      cancelled: false,
      ...(e.setupDate ? { setupDate: e.setupDate } : {}),
    }));
}
