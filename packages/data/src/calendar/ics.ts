// Calendar export: events as an .ics file, which Google Calendar, Apple Calendar and Outlook all open. Plain functions
// on lists, so they work in the browser and in tests. Dates and times are team time (America/Los_Angeles).
import { addDays, shortTime, timeRange } from "./dates";
import type { CalEvent, Shift } from "./types";

const ZONE = "America/Los_Angeles";
/** Added to every exported event. */
export const ICS_NOTE = "The schedule is subject to change.";

// The zone's rules, so a calendar app doesn't have to know them (US Pacific time since 2007).
const TIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${ZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** One thing to put on a calendar. Dates yyyy-mm-dd, times HH:MM; no times means an all-day thing. */
export interface IcsItem {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
}

const escapeText = (text: string) => text.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
const compactDate = (date: string) => date.replace(/-/g, "");
const compactTime = (time: string) => `${time.replace(":", "")}00`;

/** Lines longer than 75 bytes continue on the next line, which starts with a space. */
function fold(line: string): string[] {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.map((p, i) => (i ? ` ${p}` : p));
}

function itemLines(item: IcsItem, stamp: string): string[] {
  // Something over several days is shown as all-day days; its daily times are in the description.
  const timed = !!item.startTime && !!item.endTime && item.startDate === item.endDate;
  const start = timed ? `DTSTART;TZID=${ZONE}:${compactDate(item.startDate)}T${compactTime(item.startTime!)}` : `DTSTART;VALUE=DATE:${compactDate(item.startDate)}`;
  // An all-day thing ends the day after its last day.
  const end = timed ? `DTEND;TZID=${ZONE}:${compactDate(item.endDate)}T${compactTime(item.endTime!)}` : `DTEND;VALUE=DATE:${compactDate(addDays(item.endDate, 1))}`;
  const description = [item.description, ICS_NOTE].filter(Boolean).join("\n\n");
  return [
    "BEGIN:VEVENT",
    `UID:${item.id}@team6220.org`,
    `DTSTAMP:${stamp}`,
    start,
    end,
    `SUMMARY:${escapeText(item.title)}`,
    ...(item.location ? [`LOCATION:${escapeText(item.location)}`] : []),
    `DESCRIPTION:${escapeText(description)}`,
    "END:VEVENT",
  ];
}

/** The text of an .ics file. `now` is the moment it was made (DTSTAMP). */
export function icsText(items: IcsItem[], name: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Team 6220//Calendar//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${escapeText(name)}`, `X-WR-TIMEZONE:${ZONE}`, ...TIMEZONE];
  for (const item of items) lines.push(...itemLines(item, stamp));
  lines.push("END:VCALENDAR");
  return lines.flatMap(fold).join("\r\n") + "\r\n";
}

const titleOf = (e: CalEvent) => e.title || (e.type === "meeting" ? "Team meeting" : "Event");

/** Meetings, competitions, events and breaks as items (season parts are only the schedule's recipe, so they're left out).
 *  A competition's set-up day comes along as its own all-day item. */
export function eventItems(events: CalEvent[]): IcsItem[] {
  const items: IcsItem[] = [];
  for (const e of events) {
    if (e.cancelled || e.type === "part") continue;
    const daily = e.startDate !== e.endDate && e.startTime && e.endTime ? `Each day ${timeRange(e.startTime, e.endTime)}.` : "";
    const notes = [e.mandatory ? "Mandatory." : "", daily, e.notes].filter(Boolean).join(" ");
    items.push({ id: e._id, title: `${e.mandatory ? "★ " : ""}${titleOf(e)}`, startDate: e.startDate, endDate: e.endDate, startTime: e.startTime, endTime: e.endTime, location: e.location, description: notes });
    if (e.type === "competition" && e.setupDate) items.push({ id: `${e._id}-setup`, title: `${titleOf(e)} set-up`, startDate: e.setupDate, endDate: e.setupDate, location: e.location });
  }
  return items;
}

/** Supervision shifts as items, each on its meeting's day. Shifts whose meeting isn't in `events` are left out. */
export function shiftItems(shifts: Shift[], events: CalEvent[]): IcsItem[] {
  const items: IcsItem[] = [];
  for (const s of shifts) {
    const e = events.find((x) => x._id === s.eventId);
    if (!e || e.cancelled || s.cancelled) continue;
    items.push({ id: s._id, title: `Supervise ${titleOf(e)} ${timeRange(s.start, s.end)}`, startDate: e.startDate, endDate: e.startDate, startTime: s.start, endTime: s.end, location: e.location, description: `Your supervision shift, ${shortTime(s.start)}–${shortTime(s.end)}.` });
  }
  return items;
}

/** A link that adds one item to Google Calendar (it opens with the details filled in). */
export function googleLink(item: IcsItem): string {
  const timed = !!item.startTime && !!item.endTime && item.startDate === item.endDate;
  const dates = timed
    ? `${compactDate(item.startDate)}T${compactTime(item.startTime!)}/${compactDate(item.endDate)}T${compactTime(item.endTime!)}`
    : `${compactDate(item.startDate)}/${compactDate(addDays(item.endDate, 1))}`;
  const params = new URLSearchParams({ action: "TEMPLATE", text: item.title, dates, ctz: ZONE, details: [item.description, ICS_NOTE].filter(Boolean).join("\n\n") });
  if (item.location) params.set("location", item.location);
  return `https://calendar.google.com/calendar/render?${params}`;
}
