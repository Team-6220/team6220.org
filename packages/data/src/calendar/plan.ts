// What changes when a lead, mentor or booster edits the calendar: checking what the browser sent, keeping supervisors
// on shifts that still exist, and making meetings from Meeting schedule's season parts. Plain functions on lists, so
// the server (ops/server/calendar.ts) and the demo backend (./mock.ts) do exactly the same thing. Browser-safe.
//
// Meetings come two ways:
//   - added by hand, or loaded from the old sheet: no partId. Schedule changes never touch them.
//   - made from a season part: partId set. Saving the schedule adds, moves and removes these, from tomorrow on.
//     Editing or removing one for a single day sets `edited`, and from then on the schedule leaves that day alone.
import { addDays, eachDay, weekday } from "./dates";
import type { CalEvent, CalEventType, PartDay, Shift } from "./types";

export const COLLECTION_EVENTS = "cal_events";
export const COLLECTION_SHIFTS = "cal_shifts";

/** Something the person typed doesn't work. The message says what, in plain words. */
export class PlanError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TYPES: CalEventType[] = ["meeting", "competition", "event", "break", "part"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Most supervision shifts one meeting can have. */
export const MAX_SHIFTS = 8;

export const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** A new ID, so shifts can point at a meeting before either is saved. */
export const newId = () => crypto.randomUUID();

// ---------------------------------------------------------------------------------------------------------
// Supervision shifts
// ---------------------------------------------------------------------------------------------------------

/** `count` shifts that cover start–end, split at whole or half hours: 10:00–2:00 in 2 -> 10–12, 12–2. */
export function splitShifts(start: string, end: string, count: number): { start: string; end: string }[] {
  if (count < 1) return [];
  const a = minutes(start), b = minutes(end);
  const cuts = [a];
  for (let i = 1; i < count; i++) cuts.push(Math.min(b, Math.max(cuts[i - 1], Math.round((a + ((b - a) * i) / count) / 30) * 30)));
  cuts.push(b);
  return cuts.slice(0, -1).map((c, i) => ({ start: clock(c), end: clock(cuts[i + 1]) })).filter((s) => s.start < s.end);
}

/** "+ Add supervision shift": the first adds one for the whole event, each after that splits the longest in half. */
export function addShift(shifts: { start: string; end: string }[], start: string, end: string): { start: string; end: string }[] {
  if (!shifts.length) return start && end ? [{ start, end }] : shifts;
  let longest = 0;
  shifts.forEach((s, i) => {
    if (minutes(s.end) - minutes(s.start) > minutes(shifts[longest].end) - minutes(shifts[longest].start)) longest = i;
  });
  const s = shifts[longest];
  const half = splitShifts(s.start, s.end, 2);
  return half.length < 2 ? shifts : [...shifts.slice(0, longest), ...half, ...shifts.slice(longest + 1)];
}

/** The part of start–end no shift covers, if any ("1:00 PM"–"2:00 PM"), for the warning under the shifts. */
export function uncovered(shifts: { start: string; end: string }[], start: string, end: string): { start: string; end: string } | null {
  if (!shifts.length || !start || !end) return null;
  const first = shifts.reduce((m, s) => (s.start < m ? s.start : m), shifts[0].start);
  const last = shifts.reduce((m, s) => (s.end > m ? s.end : m), shifts[0].end);
  if (first > start) return { start, end: first };
  if (last < end) return { start: last, end };
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Season parts: "3:20–5:00 · Sat 10:00–2:00" and "1 · Sat 2"
// ---------------------------------------------------------------------------------------------------------

/** "3:20" -> "15:20". School times: 1 to 7 are afternoon, 8 to 12 morning (the way the team writes them). */
function schoolTime(text: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  if (h < 1 || h > 12 || min > 59) return null;
  return clock((h <= 7 ? h + 12 : h) * 60 + min);
}

/** "Sat 10:00–2:00" -> { days: [6], value: "10:00–2:00" }; "3:20–5:00" -> { days: null, ... } */
function segments(text: string): { days: number[] | null; value: string }[] {
  return text.split("·").map((part) => part.trim()).filter(Boolean).map((part) => {
    const m = /^((?:(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*[\s,&]*)+)\s+(.*)$/i.exec(part);
    if (!m) return { days: null, value: part };
    const days = [...m[1].matchAll(/sun|mon|tue|wed|thu|fri|sat/gi)].map((d) => WEEKDAYS.findIndex((w) => w.toLowerCase() === d[0].toLowerCase()));
    return { days, value: m[2].trim() };
  });
}

/** The season part form's Days, Times and Shifts -> one PartDay per chosen weekday. */
export function parsePattern(days: number[], times: string, shifts: string): PartDay[] {
  if (!days.length) throw new PlanError("Choose at least one day.");
  const timeFor = new Map<number | null, { start: string; end: string }>();
  for (const s of segments(times)) {
    const [a, b] = s.value.split(/[-–]/);
    const start = a && schoolTime(a), end = b && schoolTime(b);
    if (!start || !end || start >= end) throw new PlanError(`Times: '${s.value}' isn't a start and end time, like 3:20–5:00.`);
    for (const d of s.days ?? [null]) timeFor.set(d, { start, end });
  }
  const countFor = new Map<number | null, number>();
  for (const s of segments(shifts)) {
    const n = Number(s.value);
    if (!Number.isInteger(n) || n < 0 || n > MAX_SHIFTS) throw new PlanError(`Supervision shifts: '${s.value}' should be a number from 0 to ${MAX_SHIFTS}.`);
    for (const d of s.days ?? [null]) countFor.set(d, n);
  }
  return [...days].sort().map((day) => {
    const t = timeFor.get(day) ?? timeFor.get(null);
    if (!t) throw new PlanError(`Times: add a time for ${WEEKDAYS[day]}.`);
    return { day, ...t, shifts: countFor.get(day) ?? countFor.get(null) ?? 1 };
  });
}

/** The other way: PartDay[] -> the form's texts. The most common time and count are written without a day. */
export function patternText(pattern: PartDay[]): { days: number[]; times: string; shifts: string } {
  const short = (t: string) => `${Number(t.slice(0, 2)) % 12 || 12}:${t.slice(3)}`;
  const write = (key: (p: PartDay) => string, show: (p: PartDay) => string) => {
    const counts = new Map<string, number>();
    for (const p of pattern) counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
    const usual = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const first = pattern.find((p) => key(p) === usual);
    const others = new Map<string, number[]>();
    for (const p of pattern) if (key(p) !== usual) others.set(key(p), [...(others.get(key(p)) ?? []), p.day]);
    return [first ? show(first) : "", ...[...others].map(([k, ds]) => `${ds.map((d) => WEEKDAYS[d]).join(", ")} ${show(pattern.find((p) => key(p) === k)!)}`)].filter(Boolean).join(" · ");
  };
  return {
    days: pattern.map((p) => p.day),
    times: write((p) => `${p.start}-${p.end}`, (p) => `${short(p.start)}–${short(p.end)}`),
    shifts: write((p) => String(p.shifts), (p) => String(p.shifts)),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Checking an event
// ---------------------------------------------------------------------------------------------------------

function str(value: unknown, name: string, max: number, required = false): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (required && !s) throw new PlanError(`Missing ${name}.`);
  if (s.length > max) throw new PlanError(`${name} is too long.`);
  return s;
}

function date(value: unknown, name: string): string {
  if (typeof value !== "string" || !DATE.test(value)) throw new PlanError(`${name} must be a date.`);
  return value;
}

function time(value: unknown, name: string): string {
  if (value === "" || value === undefined || value === null) return "";
  if (typeof value !== "string" || !TIME.test(value)) throw new PlanError(`${name} must be a time.`);
  return value;
}

/** What the browser sent -> a clean event (subteam names are checked separately, by the caller). */
export function cleanEvent(input: Record<string, unknown>, before: CalEvent | null): CalEvent {
  const type = (before?.type ?? input.type) as CalEventType;
  if (!TYPES.includes(type)) throw new PlanError("Unknown kind of event.");
  const startDate = date(input.startDate, "The date");
  const endDate = type === "meeting" ? startDate : date(input.endDate ?? startDate, "The last day");
  if (endDate < startDate) throw new PlanError("The last day is before the first day.");
  const startTime = type === "break" || type === "part" ? "" : time(input.startTime, "The start time");
  const endTime = type === "break" || type === "part" ? "" : time(input.endTime, "The end time");
  if (type === "meeting" && (!startTime || !endTime)) throw new PlanError("A meeting needs a start and end time.");
  if (startTime && endTime && endTime <= startTime && startDate === endDate) throw new PlanError("The end time is before the start time.");
  const event: CalEvent = {
    ...(before ?? {}),
    _id: before?._id ?? (typeof input._id === "string" && input._id ? input._id : newId()),
    type,
    title: str(input.title, "The title", 100, type !== "meeting"),
    startDate,
    endDate,
    startTime,
    endTime,
    location: str(input.location, "Where", 100),
    notes: str(input.notes, "Notes", 2000),
    mandatory: type === "meeting" && input.mandatory === true,
    subteams: Array.isArray(input.subteams) ? input.subteams.map(String) : (before?.subteams ?? []),
    public: before ? before.public : type !== "event",
    cancelled: false,
  };
  if (type === "competition" && typeof input.setupDate === "string" && input.setupDate) event.setupDate = date(input.setupDate, "The set-up day");
  if (type === "break") event.skipMeetings = input.skipMeetings === true;
  if (type === "part") {
    if (!Array.isArray(input.pattern) || !input.pattern.length) throw new PlanError("A season part needs at least one day.");
    event.pattern = input.pattern.map((p: Record<string, unknown>) => {
      const day = Number(p.day), shifts = Number(p.shifts);
      const start = time(p.start, "The start time"), end = time(p.end, "The end time");
      if (!Number.isInteger(day) || day < 0 || day > 6 || !start || !end || end <= start) throw new PlanError("A day of the season part has bad times.");
      if (!Number.isInteger(shifts) || shifts < 0 || shifts > MAX_SHIFTS) throw new PlanError(`Supervision shifts must be 0 to ${MAX_SHIFTS}.`);
      return { day, start, end, shifts };
    });
  }
  if (before?.partId) Object.assign(event, { edited: true, partDate: before.partDate ?? before.startDate }); // changed for this day only
  return event;
}

// ---------------------------------------------------------------------------------------------------------
// Saving one event and its shifts
// ---------------------------------------------------------------------------------------------------------

/** The rows to save for an event with these shifts (null: keep the ones it has). Supervisors keep a shift whose times
 *  are unchanged; shifts no longer wanted are cancelled. Only meetings have shifts. */
export function eventRows(event: CalEvent, wanted: { start: string; end: string }[] | null, current: Shift[]): Shift[] {
  if (wanted === null) wanted = current.filter((s) => !s.cancelled).map((s) => ({ start: s.start, end: s.end }));
  if (event.type !== "meeting") wanted = [];
  if (wanted.length > MAX_SHIFTS) throw new PlanError(`A meeting can have at most ${MAX_SHIFTS} shifts.`);
  const left = current.filter((s) => !s.cancelled);
  const rows: Shift[] = [];
  for (const w of wanted) {
    const start = time(w.start, "A shift's start"), end = time(w.end, "A shift's end");
    if (!start || !end || end <= start) throw new PlanError("A shift ends before it starts.");
    const same = left.findIndex((s) => s.start === start && s.end === end);
    if (same >= 0) rows.push(left.splice(same, 1)[0]);
    else rows.push({ _id: newId(), eventId: event._id, start, end, memberId: "", name: "", signedUpAt: "" });
  }
  return [...rows, ...left.map((s) => ({ ...s, cancelled: true }))];
}

/** Removing an event: it and its shifts are cancelled. A meeting from a season part stays marked as edited, so saving
 *  the schedule doesn't bring it back. */
export function removedRows(event: CalEvent, shifts: Shift[]): { event: CalEvent; shifts: Shift[] } {
  return {
    event: { ...event, cancelled: true, ...(event.partId ? { edited: true, partDate: event.partDate ?? event.startDate } : {}) },
    shifts: shifts.filter((s) => !s.cancelled).map((s) => ({ ...s, cancelled: true })),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Meeting schedule
// ---------------------------------------------------------------------------------------------------------

export interface ScheduleResult {
  events: CalEvent[];
  shifts: Shift[];
  added: number;
  moved: number;
  removed: number;
  /** Supervisors taken off a shift that moved or went away (for their notification). */
  bumped: Shift[];
}

/**
 * Makes the meetings the season parts call for, from the day after `today` on. `events` and `shifts` are everything
 * stored, with the new parts and breaks already in `events`. Returns only the rows that change.
 */
export function scheduleRows(events: CalEvent[], shifts: Shift[], today: string): ScheduleResult {
  const from = addDays(today, 1);
  const live = events.filter((e) => !e.cancelled);
  const parts = live.filter((e) => e.type === "part" && e.pattern?.length).sort((a, b) => a.startDate.localeCompare(b.startDate));
  // No meetings from the schedule on these days: breaks from Meeting schedule, and competitions.
  const skipped = live.filter((e) => (e.type === "break" && e.skipMeetings) || e.type === "competition");
  // Days the schedule must leave alone: a meeting added by hand, or one a lead changed or removed for that day.
  const fixed = new Set<string>();
  for (const e of events) {
    if (e.type !== "meeting") continue;
    if (!e.partId && !e.cancelled) fixed.add(e.startDate);
    if (e.partId && e.edited) {
      if (!e.cancelled) fixed.add(e.startDate);
      fixed.add(e.partDate ?? e.startDate);
    }
  }

  const wanted = new Map<string, { part: CalEvent; slot: PartDay }>();
  for (const part of parts) {
    for (const day of eachDay(part.startDate > from ? part.startDate : from, part.endDate)) {
      const slot = part.pattern!.find((p) => p.day === weekday(day));
      if (!slot || fixed.has(day) || skipped.some((b) => b.startDate <= day && day <= b.endDate)) continue;
      wanted.set(day, { part, slot }); // a later part wins where two overlap
    }
  }

  const result: ScheduleResult = { events: [], shifts: [], added: 0, moved: 0, removed: 0, bumped: [] };
  const shiftsOf = (id: string) => shifts.filter((s) => s.eventId === id && !s.cancelled);
  const replaceShifts = (meeting: CalEvent, slot: PartDay) => {
    const rows = eventRows(meeting, splitShifts(slot.start, slot.end, slot.shifts), shiftsOf(meeting._id));
    result.bumped.push(...rows.filter((s) => s.cancelled && s.memberId));
    result.shifts.push(...rows.filter((s) => !shifts.includes(s)));
  };
  for (const meeting of live) {
    if (meeting.type !== "meeting" || !meeting.partId || meeting.edited || meeting.startDate < from) continue;
    const want = wanted.get(meeting.startDate);
    wanted.delete(meeting.startDate);
    if (!want) {
      const gone = removedRows(meeting, shiftsOf(meeting._id));
      result.events.push({ ...gone.event, edited: false });
      result.shifts.push(...gone.shifts);
      result.bumped.push(...gone.shifts.filter((s) => s.memberId));
      result.removed++;
    } else if (meeting.startTime !== want.slot.start || meeting.endTime !== want.slot.end || meeting.partId !== want.part._id) {
      const moved = { ...meeting, startTime: want.slot.start, endTime: want.slot.end, partId: want.part._id };
      result.events.push(moved);
      replaceShifts(moved, want.slot);
      result.moved++;
    } else if (shiftsOf(meeting._id).length !== want.slot.shifts) {
      replaceShifts(meeting, want.slot);
      result.moved++;
    }
  }
  for (const [day, { part, slot }] of wanted) {
    const meeting: CalEvent = {
      _id: newId(), type: "meeting", title: "", startDate: day, endDate: day, startTime: slot.start, endTime: slot.end,
      location: "", notes: "", mandatory: false, subteams: [], public: true, cancelled: false, partId: part._id,
    };
    result.events.push(meeting);
    replaceShifts(meeting, slot);
    result.added++;
  }
  return result;
}

/** Saving Meeting schedule: the parts and breaks as they are now. Ones left out are removed. */
export function scheduleSave(
  events: CalEvent[],
  shifts: Shift[],
  parts: Record<string, unknown>[],
  breaks: Record<string, unknown>[],
  today: string,
): ScheduleResult {
  const byId = new Map(events.map((e) => [e._id, e]));
  const keep = (input: Record<string, unknown>, type: CalEventType) => {
    const before = typeof input._id === "string" ? byId.get(input._id) : undefined;
    if (before && before.type !== type) throw new PlanError("That isn't a season part or a break.");
    return cleanEvent({ ...input, type, ...(type === "break" ? { skipMeetings: true } : {}) }, before && !before.cancelled ? before : null);
  };
  const saved = [...parts.map((p) => keep(p, "part")), ...breaks.map((b) => keep(b, "break"))];
  const savedIds = new Set(saved.map((e) => e._id));
  const dropped = events.filter((e) => !e.cancelled && !savedIds.has(e._id) && (e.type === "part" || (e.type === "break" && e.skipMeetings))).map((e) => ({ ...e, cancelled: true }));
  const merged = [...events.filter((e) => !savedIds.has(e._id) && !dropped.some((d) => d._id === e._id)), ...saved, ...dropped];
  const result = scheduleRows(merged, shifts, today);
  return { ...result, events: [...saved, ...dropped, ...result.events] };
}

/** Assign meetings to subteams: { id, subteams, mandatory } for each meeting that changed. */
export function assignRows(events: CalEvent[], changes: { id: unknown; subteams: unknown; mandatory: unknown }[]): CalEvent[] {
  if (changes.length > 200) throw new PlanError("That's too many meetings at once.");
  return changes.map((c) => {
    const meeting = events.find((e) => e._id === c.id && !e.cancelled);
    if (!meeting || meeting.type !== "meeting") throw new PlanError("One of those meetings doesn't exist any more. Reload the page.");
    return { ...meeting, subteams: Array.isArray(c.subteams) ? c.subteams.map(String) : [], mandatory: c.mandatory === true };
  });
}
