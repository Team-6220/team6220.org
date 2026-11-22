// Supervision: who may supervise, signing up for shifts and withdrawing. Plain functions on lists, so the server
// (ops/server/supervision.ts) and the demo backend (./mock.ts) do exactly the same thing. Browser-safe.
//
// A supervisor's paperwork lives on their own account row (ops_people.supervisor). Who may do what:
//   - an approved supervisor signs up for an open shift, or withdraws from their own
//   - leads, mentors and boosters (the `scheduler` role) change anyone's paperwork, and can put any approved supervisor
//     in a shift, or take anyone off one
// The old sheet's shifts carry only a parent's name. When that parent asks to supervise or is approved, the shifts with
// exactly their name are moved onto their account, so their history counts. Nothing else uses names.
import { minutes, PlanError } from "./plan";
import type { CalEvent, Shift, StepStatus, Supervisor, SupervisorInfo } from "./types";
import type { Person } from "../ops/types";

/** The steps to become a supervisor, as Become a supervisor shows them. */
export const SUPERVISOR_STEPS = [
  "Tell the lead parent you want to supervise",
  "Fill out the TB risk assessment",
  "Complete Livescan fingerprinting",
  "Email the forms to the school office",
  "The school emails you when you're approved",
];

const STATUSES: SupervisorInfo["status"][] = ["started", "approved", "inactive"];
const STEP_STATUSES: StepStatus[] = ["done", "waiting", ""];

/** What a new request starts with: step 1 under way. */
export const FIRST_STEPS: SupervisorInfo = { status: "started", steps: ["waiting", "", "", "", ""], approvedMonth: "" };

/** Everyone with supervisor paperwork, by name. */
export function supervisorsFrom(people: Pick<Person, "memberId" | "name" | "supervisor">[]): Supervisor[] {
  return people
    .filter((p) => p.supervisor && STATUSES.includes(p.supervisor.status))
    .map((p) => ({ memberId: p.memberId, name: p.name, ...p.supervisor! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** This person's paperwork, if any. */
export const supervisorFor = (supervisors: Supervisor[], memberId: string) => supervisors.find((s) => s.memberId === memberId);

/** True when this person may sign themselves up. */
export const isApproved = (supervisors: Supervisor[], memberId: string) => supervisorFor(supervisors, memberId)?.status === "approved";

/** Shifts supervised before today, and their hours. */
export function supervised(person: Supervisor, shifts: Shift[], events: CalEvent[], today: string): { shifts: number; hours: number } {
  const past = shifts.filter((s) => {
    if (s.cancelled || s.memberId !== person.memberId) return false;
    const e = events.find((x) => x._id === s.eventId);
    return e && !e.cancelled && e.startDate < today;
  });
  const hours = past.reduce((sum, s) => sum + (minutes(s.end) - minutes(s.start)) / 60, 0);
  return { shifts: past.length, hours: Math.round(hours * 10) / 10 };
}

/** What the browser sent -> clean paperwork. */
export function cleanSupervisorInfo(input: Record<string, unknown>): SupervisorInfo {
  const status = input.status as SupervisorInfo["status"];
  if (!STATUSES.includes(status)) throw new PlanError("Pick a status.");
  const steps = SUPERVISOR_STEPS.map((_, i) => {
    const v = Array.isArray(input.steps) ? input.steps[i] : "";
    return STEP_STATUSES.includes(v as StepStatus) ? (v as StepStatus) : "";
  });
  const month = typeof input.approvedMonth === "string" ? input.approvedMonth : "";
  if (month && !/^\d{4}-\d{2}$/.test(month)) throw new PlanError("The approved month must look like 2026-09.");
  return { status, steps, approvedMonth: month };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The old sheet's shifts with exactly this person's name and no account: moved onto their account. */
export function linkedShifts(memberId: string, name: string, shifts: Shift[]): Shift[] {
  if (!memberId || !name.trim()) return [];
  return shifts.filter((s) => !s.memberId && s.name && sameName(s.name, name)).map((s) => ({ ...s, memberId }));
}

/** Puts an approved supervisor in an open shift. The meeting must be today or later. */
export function signUp(shift: Shift, event: CalEvent | undefined, who: Supervisor, today: string, now: string): Shift {
  if (!event || event.cancelled || shift.cancelled) throw new PlanError("That shift isn't on the calendar any more. Reload the page.");
  if (event.startDate < today) throw new PlanError("That meeting already happened.");
  if (who.status !== "approved") throw new PlanError("Only approved supervisors can take a shift.");
  if (shift.memberId === who.memberId) return shift;
  if (shift.memberId || shift.name) throw new PlanError("Someone else took that shift. Reload the page.");
  return { ...shift, memberId: who.memberId, name: who.name, signedUpAt: now };
}

/** Takes whoever is on a shift off it, so it is open again. */
export function withdraw(shift: Shift, event: CalEvent | undefined, today: string): Shift {
  if (!event || event.cancelled || shift.cancelled) throw new PlanError("That shift isn't on the calendar any more. Reload the page.");
  if (event.startDate < today) throw new PlanError("That meeting already happened.");
  return { ...shift, memberId: "", name: "", signedUpAt: "" };
}
