// Demo data for the Calendar: about three months of meetings around today from one season part, with shifts, a
// competition, a break and a few subteam meetings, so every screen has something to show in demo mode. Below it, the
// demo versions of the server's calendar actions, which use the same plan.ts as the server.
import { mockActions, mockWantedSubteams, seedMock, type MockDb } from "../ops/mock";
import { OpsError } from "../ops/types";
import { addDays, eachDay, today, weekday } from "./dates";
import { assignRows, cleanEvent, COLLECTION_EVENTS, COLLECTION_SHIFTS, eventRows, PlanError, removedRows, scheduleSave } from "./plan";
import type { CalEvent, Shift } from "./types";

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

mockActions({
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
