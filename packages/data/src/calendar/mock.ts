// Demo data for the Calendar: about three months of meetings around today from one season part, with shifts, a
// competition, a break and a few subteam meetings, so every screen has something to show in demo mode. Below it, the
// demo versions of the server's calendar actions, which use the same plan.ts as the server.
import { mockActions, mockWantedSubteams, seedMock, type MockDb } from "../ops/mock";
import { rolesFor } from "../ops/roles";
import { OpsError } from "../ops/types";
import { addDays, eachDay, today, weekday } from "./dates";
import { publicEvents } from "./public";
import { assignRows, cleanEvent, COLLECTION_EVENTS, COLLECTION_SHIFTS, eventRows, PlanError, removedRows, scheduleSave } from "./plan";
import type { Person } from "../ops/types";
import { cleanSupervisorInfo, FIRST_STEPS, linkedShifts, signUp, supervisorFor, supervisorsFrom, withdraw } from "./supervision";
import type { CalEvent, Shift, Supervisor } from "./types";

const NAMES = ["Alex Parker", "Jordan Rivera-Nakamura", "Sam Torres", "Casey Montgomery", "Robin Lee"];

seedMock((db) => {
  const now = today();
  const event = (e: Partial<CalEvent> & Pick<CalEvent, "type" | "startDate">) =>
    db.save<CalEvent>("cal_events", { title: "", endDate: e.startDate, startTime: "", endTime: "", location: "Workshop", notes: "", mandatory: false, subteams: [], public: true, cancelled: false, ...e });
  const breakStart = addDays(now, 12 - weekday(now)); // a Thursday-Friday break about two weeks out
  event({ type: "break", title: "Thanksgiving break", startDate: breakStart, endDate: addDays(breakStart, 1), location: "", skipMeetings: true });
  const part = event({
    type: "part", title: "Fall", startDate: addDays(now, -35), endDate: addDays(now, 60), location: "",
    pattern: [{ day: 2, start: "15:20", end: "17:00", shifts: 1 }, { day: 5, start: "15:20", end: "17:00", shifts: 1 }, { day: 6, start: "10:00", end: "14:00", shifts: 2 }],
  });
  const compDay = addDays(now, 27 - weekday(now)); // a Saturday-Sunday competition about four weeks out
  event({ type: "competition", title: "Beach Blitz", startDate: compDay, endDate: addDays(compDay, 1), setupDate: addDays(compDay, -1), location: "Capistrano Valley High School", startTime: "07:45", endTime: "18:00" });
  let n = 0;
  for (const day of eachDay(addDays(now, -35), addDays(now, 60))) {
    const wd = weekday(day);
    if (![2, 5, 6].includes(wd) || (day >= breakStart && day <= addDays(breakStart, 1)) || day === compDay) continue;
    const sat = wd === 6;
    const meeting = event({
      type: "meeting",
      partId: part._id,
      startDate: day,
      startTime: sat ? "10:00" : "15:20",
      endTime: sat ? "14:00" : "17:00",
      mandatory: sat && n % 2 === 0,
      subteams: wd === 2 && n % 3 === 1 ? ["Programming", "Electrical"] : sat && n % 5 === 3 ? ["Manufacturing"] : [],
      notes: sat ? "Wear closed-toe shoes. Pizza at noon." : "",
    });
    const slots = sat ? [["10:00", "12:00"], ["12:00", "14:00"]] : [["15:20", "17:00"]];
    slots.forEach(([start, end], i) => {
      const taken = day < now || (n + i) % 3 !== 0;
      const mine = !taken ? false : (n + i) % 7 === 2;
      db.save<Shift>("cal_shifts", {
        eventId: meeting._id, start, end,
        memberId: mine ? "demo-supervisor" : "",
        name: mine ? "Demo Supervisor" : taken ? NAMES[(n + i) % NAMES.length] : "",
        signedUpAt: taken ? `${addDays(day, -7)}T18:00:00Z` : "",
      });
    });
    n++;
  }
  // Supervisors' paperwork is on their account rows: the demo supervisor (approved), Alex Parker (approved), and one parent still doing the paperwork.
  const done = ["done", "done", "done", "done", "done"] as Supervisor["steps"];
  db.save<Person>("ops_people", { memberId: "demo-supervisor", name: "Demo Supervisor", username: "demosupervisor", subteams: [], active: true, supervisor: { status: "approved", steps: done, approvedMonth: "2025-08" } });
  db.save<Person>("ops_people", { memberId: "p-alex", name: "Alex Parker", username: "alexparker", subteams: [], active: true, supervisor: { status: "approved", steps: done, approvedMonth: "2026-09" } });
  db.save<Person>("ops_people", { memberId: "p-pat", name: "Pat Okafor", username: "patokafor", subteams: [], active: true, supervisor: { status: "started", steps: ["done", "done", "waiting", "", ""], approvedMonth: "" } });
  // Approving Alex moved the old shifts with Alex's name onto the account.
  for (const shift of linkedShifts("p-alex", "Alex Parker", db.rows<Shift>("cal_shifts"))) db.save("cal_shifts", shift);
});

// ----- the demo backend's calendar actions (the server's are in ops/server/calendar.ts) -----

function plan<T>(step: () => T): T {
  try {
    return step();
  } catch (e) {
    if (e instanceof PlanError) throw new OpsError("bad-request", e.message);
    throw e;
  }
}

const events = (db: MockDb) => db.rows<CalEvent>(COLLECTION_EVENTS);
const shifts = (db: MockDb) => db.rows<Shift>(COLLECTION_SHIFTS);
const list = (value: unknown) => (Array.isArray(value) ? (value as Record<string, unknown>[]) : []);
const isSchedule = (e: CalEvent) => e.type === "part" || (e.type === "break" && e.skipMeetings);

function found(db: MockDb, id: unknown): CalEvent {
  const event = events(db).find((e) => e._id === id && !e.cancelled);
  if (!event) throw new OpsError("bad-request", "That event doesn't exist any more. Reload the page.");
  return event;
}

function saveAll(db: MockDb, eventRows: CalEvent[], shiftRows: Shift[]) {
  for (const e of eventRows) db.save(COLLECTION_EVENTS, e);
  for (const s of shiftRows) db.save(COLLECTION_SHIFTS, s);
}

const people = (db: MockDb) => db.rows<Person>("ops_people");
const supervisors = (db: MockDb) => supervisorsFrom(people(db));
const mine = (db: MockDb, memberId: string): Supervisor | null => supervisors(db).find((s) => s.memberId === memberId) ?? null;
const isScheduler = (badges: string[]) => rolesFor(badges).scheduler;

function shiftAndEvent(db: MockDb, id: unknown): { shift: Shift; event: CalEvent | undefined } {
  const shift = shifts(db).find((s) => s._id === id);
  if (!shift) throw new OpsError("bad-request", "That shift doesn't exist any more. Reload the page.");
  return { shift, event: events(db).find((e) => e._id === shift.eventId) };
}

mockActions({
  publicCalendar: { who: "anyone", run: (_request, _actor, db) => ({ events: publicEvents(events(db)) }) },
  signUpShift: {
    who: "viewer",
    run: (request, actor, db) => {
      const { shift, event } = shiftAndEvent(db, request.shiftId);
      const forSomeoneElse = typeof request.memberId === "string" && request.memberId && request.memberId !== actor.id;
      if (forSomeoneElse && !isScheduler(actor.badges)) throw new OpsError("forbidden", "Your account isn't allowed to do that.");
      const who = supervisorFor(supervisors(db), forSomeoneElse ? String(request.memberId) : actor.id);
      if (!who) throw new OpsError(forSomeoneElse ? "bad-request" : "forbidden", forSomeoneElse ? "That person isn't a supervisor." : "Only approved supervisors can sign up for a shift. See Become a supervisor.");
      const saved = plan(() => signUp(shift, event, who, today(), new Date().toISOString()));
      db.save(COLLECTION_SHIFTS, saved);
      return { shift: saved };
    },
  },
  withdrawShift: {
    who: "viewer",
    run: (request, actor, db) => {
      const { shift, event } = shiftAndEvent(db, request.shiftId);
      if (shift.memberId !== actor.id && !isScheduler(actor.badges)) throw new OpsError("forbidden", "Your account isn't allowed to do that.");
      const saved = plan(() => withdraw(shift, event, today()));
      db.save(COLLECTION_SHIFTS, saved);
      return { shift: saved };
    },
  },
  saveSupervisor: {
    who: "scheduler",
    run: (request, actor, db) => {
      const row = people(db).find((p) => p.memberId === request.memberId);
      if (!row) throw new OpsError("bad-request", "That person hasn't signed in to the apps yet.");
      const info = plan(() => cleanSupervisorInfo((request.supervisor ?? {}) as Record<string, unknown>));
      const was = row.supervisor?.status;
      db.save("ops_people", { ...row, supervisor: info });
      if (info.status === "approved" && was !== "approved") for (const s of linkedShifts(row.memberId, row.name, shifts(db))) db.save(COLLECTION_SHIFTS, s);
      db.writeHistory(actor, { kind: "person", id: row.memberId }, "supervisor", `${row.name}: ${info.status}`);
      return { supervisor: mine(db, row.memberId) };
    },
  },
  mySupervisorRow: { who: "signedIn", run: (_request, actor, db) => ({ supervisor: mine(db, actor.id) }) },
  askToSupervise: {
    who: "signedIn",
    run: (_request, actor, db) => {
      const row = people(db).find((p) => p.memberId === actor.id);
      if (!row?.supervisor) {
        db.save("ops_people", { ...(row ?? { memberId: actor.id, name: actor.name, username: "", subteams: [], active: true }), supervisor: { ...FIRST_STEPS, steps: [...FIRST_STEPS.steps] } });
        for (const s of linkedShifts(actor.id, row?.name ?? actor.name, shifts(db))) db.save(COLLECTION_SHIFTS, s);
      }
      return { supervisor: mine(db, actor.id) };
    },
  },
  saveCalEvent: {
    who: "scheduler",
    run: (request, actor, db) => {
      const input = (request.event ?? {}) as Record<string, unknown>;
      const before = input._id ? found(db, input._id) : null;
      const event = plan(() => cleanEvent(input, before));
      if (isSchedule(event)) throw new OpsError("bad-request", "Season parts and their breaks are changed in Meeting schedule.");
      event.subteams = mockWantedSubteams(event.subteams);
      const rows = plan(() => eventRows(event, (Array.isArray(request.shifts) ? request.shifts : null) as { start: string; end: string }[] | null, before ? shifts(db).filter((s) => s.eventId === before._id) : []));
      saveAll(db, [event], rows);
      db.writeHistory(actor, { kind: "calendar", id: event._id }, before ? "updated" : "created", `${event.type} ${event.startDate}`);
      return { event, shifts: rows.filter((s) => !s.cancelled) };
    },
  },
  removeCalEvent: {
    who: "scheduler",
    run: (request, actor, db) => {
      const event = found(db, request.id);
      if (isSchedule(event)) throw new OpsError("bad-request", "Season parts and their breaks are changed in Meeting schedule.");
      const gone = removedRows(event, shifts(db).filter((s) => s.eventId === event._id));
      saveAll(db, [gone.event], gone.shifts);
      db.writeHistory(actor, { kind: "calendar", id: event._id }, "removed", `${event.type} ${event.startDate}`);
      return {};
    },
  },
  saveSchedule: {
    who: "scheduler",
    run: (request, actor, db) => {
      const result = plan(() => scheduleSave(structuredClone(events(db)), structuredClone(shifts(db)), list(request.parts), list(request.breaks), today()));
      saveAll(db, result.events, result.shifts);
      db.writeHistory(actor, { kind: "calendar", id: "schedule" }, "updated", `${result.added} added, ${result.moved} moved, ${result.removed} removed`);
      return { added: result.added, moved: result.moved, removed: result.removed };
    },
  },
  assignMeetings: {
    who: "lead",
    run: (request, actor, db) => {
      const rows = plan(() => assignRows(events(db), list(request.changes) as { id: unknown; subteams: unknown; mandatory: unknown }[]));
      for (const r of rows) r.subteams = mockWantedSubteams(r.subteams);
      saveAll(db, rows, []);
      db.writeHistory(actor, { kind: "calendar", id: "assign" }, "updated", `${rows.length} meetings`);
      return { saved: rows.length };
    },
  },
});
