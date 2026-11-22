// calendar: the functions /apps/calendar uses. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Calendar.
//
//   import { calendar } from "@team6220/data";
//   const data = await calendar.load();                       // every event and shift
//   const today = calendar.eventsOn(data.events, "2026-11-21");
//
// Reads go through the team server (listRecords), which only lets team members see the calendar's collections.
import "./mock"; // the demo data (only used in demo mode)
import { callOps, store } from "../ops";
import type { Me } from "../ops/types";
import { addDays } from "./dates";
import { COLLECTION_EVENTS, COLLECTION_SHIFTS } from "./plan";
import type { Person } from "../ops/types";
import { supervisorsFrom } from "./supervision";
import type { CalEvent, CalendarData, Shift, Supervisor, SupervisorInfo } from "./types";

export * from "./dates";
export type { CalEvent, CalEventType, CalendarData, PartDay, Shift, StepStatus, Supervisor, SupervisorInfo } from "./types";
export { isApproved, supervised, SUPERVISOR_STEPS, supervisorFor } from "./supervision";

export { COLLECTION_EVENTS, COLLECTION_SHIFTS };
export { addShift, MAX_SHIFTS, parsePattern, patternText, PlanError, splitShifts, uncovered, WEEKDAYS } from "./plan";

const byStart = (a: CalEvent, b: CalEvent) => a.startDate.localeCompare(b.startDate) || a.startTime.localeCompare(b.startTime);

/** Every event and shift, events in date order. */
export async function load(): Promise<CalendarData> {
  const s = store();
  const [events, shifts, supervisors] = await Promise.all([s.list<CalEvent>(COLLECTION_EVENTS), s.list<Shift>(COLLECTION_SHIFTS), s.list<Person>("ops_people")]);
  return {
    events: events.filter((e) => !e.cancelled).sort(byStart),
    shifts: shifts.filter((s) => !s.cancelled).sort((a, b) => a.start.localeCompare(b.start)),
    supervisors: supervisorsFrom(supervisors),
  };
}

// ----- changes (Leads, Mentors and Boosters; assigning subteams is Leads only) -----

export type ShiftTimes = { start: string; end: string };

/** Adds or changes a meeting, event, competition or break, with a meeting's supervision shifts (left out: the meeting
 *  keeps the shifts it has). */
export async function saveEvent(event: Partial<CalEvent>, shifts?: ShiftTimes[]): Promise<CalEvent> {
  return (await callOps<{ event: CalEvent }>("saveCalEvent", { event, shifts })).event;
}

/** Removes an event and its shifts. */
export async function removeEvent(id: string): Promise<void> {
  await callOps("removeCalEvent", { id });
}

/** Saves Meeting schedule (every season part and break, as they should be now) and makes its meetings. */
export async function saveSchedule(parts: Partial<CalEvent>[], breaks: Partial<CalEvent>[]): Promise<{ added: number; moved: number; removed: number }> {
  return callOps("saveSchedule", { parts, breaks });
}

/** Sets who each meeting is for and whether it is mandatory. */
export async function assignMeetings(changes: { id: string; subteams: string[]; mandatory: boolean }[]): Promise<number> {
  return (await callOps<{ saved: number }>("assignMeetings", { changes })).saved;
}

// ----- supervision -----

/** Signs yourself up for an open shift, or (leads, mentors and boosters) puts an approved supervisor in it. */
export async function signUpShift(shiftId: string, memberId?: string): Promise<Shift> {
  return (await callOps<{ shift: Shift }>("signUpShift", { shiftId, ...(memberId ? { memberId } : {}) })).shift;
}

/** Takes yourself (or, for leads, mentors and boosters, anyone) off a shift. */
export async function withdrawShift(shiftId: string): Promise<Shift> {
  return (await callOps<{ shift: Shift }>("withdrawShift", { shiftId })).shift;
}

/** Sets someone's supervisor paperwork (leads, mentors and boosters). Approving gives them the Supervisor badge. */
export async function saveSupervisor(memberId: string, supervisor: SupervisorInfo): Promise<Supervisor> {
  return (await callOps<{ supervisor: Supervisor }>("saveSupervisor", { memberId, supervisor })).supervisor;
}

/** Your own row on the supervisor list, if any. Works before your account is approved. */
export async function mySupervisorRow(): Promise<Supervisor | null> {
  return (await callOps<{ supervisor: Supervisor | null }>("mySupervisorRow")).supervisor;
}

/** "I want to supervise": puts you on the list with the paperwork to do, and tells the leads, mentors and boosters. */
export async function askToSupervise(): Promise<Supervisor> {
  return (await callOps<{ supervisor: Supervisor }>("askToSupervise")).supervisor;
}

/** The season part a day falls in, if any (the latest-starting one where two overlap). */
export function partOn(events: CalEvent[], day: string): CalEvent | undefined {
  return events.filter((e) => e.type === "part" && e.startDate <= day && day <= e.endDate).sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

/** What happens on a day (things that span days included). */
export function eventsOn(events: CalEvent[], day: string): CalEvent[] {
  return events.filter((e) => e.startDate <= day && day <= e.endDate);
}

/** The shifts of one meeting, earliest first. */
export function shiftsOf(shifts: Shift[], eventId: string): Shift[] {
  return shifts.filter((s) => s.eventId === eventId);
}

/** True when the event is for this person: for everyone, for one of their subteams, or they lead. People with no
 *  subteam (mentors, boosters, supervisors) see every meeting: they help at all of them. */
export function isForMe(event: CalEvent, me: Me | null): boolean {
  if (!event.subteams.length || !me || me.roles.lead || !me.subteams.length) return true;
  return event.subteams.some((s) => me.subteams.includes(s));
}

/** "Programming and Electrical", "Everyone" */
export function audience(event: CalEvent): string {
  const s = event.subteams;
  if (!s.length) return "Everyone";
  return s.length === 1 ? s[0] : `${s.slice(0, -1).join(", ")} and ${s[s.length - 1]}`;
}

/** "Team meeting", or the event's own title. */
export function titleOf(event: CalEvent): string {
  return event.title || (event.type === "meeting" ? "Team meeting" : "Event");
}

/** Everything from `from` for `days` days, in order (for Coming up). */
export function upcoming(events: CalEvent[], from: string, days = 14): CalEvent[] {
  const until = addDays(from, days - 1);
  return events.filter((e) => e.endDate >= from && e.startDate <= until && e.type !== "part");
}
