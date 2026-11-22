// Dates are "yyyy-mm-dd" text and times "HH:MM" (24-hour), both in team time, so they sort as text and never shift
// with time zones. The arithmetic is shared with Icarus (../icarus/dates.ts).
import { addDays, daysBetween, eachDay, weekday } from "../icarus/dates";

export { addDays, daysBetween, eachDay, weekday };

/** Today in team time. */
export function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

/** "15:20" -> "3:20" (the team writes school times without a.m./p.m.). */
export function shortTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}`;
}

/** "15:20" -> "3:20 PM" */
export function longTime(hhmm: string): string {
  const [h] = hhmm.split(":").map(Number);
  return `${shortTime(hhmm)} ${h < 12 ? "AM" : "PM"}`;
}

/** "3:20–5:00" */
export function timeRange(start: string, end: string): string {
  return start && end ? `${shortTime(start)}–${shortTime(end)}` : "";
}

const fmt = (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...options });

/** "10–12" for whole hours, else like timeRange ("3:20–5:00"): the shift chips on the month grid. */
export function compactRange(start: string, end: string): string {
  const short = (t: string) => (t.endsWith(":00") ? shortTime(t).slice(0, -3) : shortTime(t));
  return start.endsWith(":00") && end.endsWith(":00") ? `${short(start)}–${short(end)}` : timeRange(start, end);
}

/** "Saturday, November 21" */
export const longDay = (date: string) => fmt(date, { weekday: "long", month: "long", day: "numeric" });
/** "Sat Nov 21" */
export const shortDay = (date: string) => fmt(date, { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
/** "Nov 21" */
export const monthDay = (date: string) => fmt(date, { month: "short", day: "numeric" });
/** "November 2026" */
export const monthTitle = (month: string) => fmt(`${month}-01`, { month: "long", year: "numeric" });

/** "Nov 26–27", "Oct 31 – Nov 1", or one day. */
export function dayRange(start: string, end: string): string {
  if (start === end) return monthDay(start);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${monthDay(start)}–${Number(end.slice(8))}`;
  return `${monthDay(start)} – ${monthDay(end)}`;
}

/** The weeks of a month's calendar grid (Sunday first), each 7 dates, padded with the days around it. */
export function monthWeeks(month: string): string[][] {
  const first = `${month}-01`;
  const start = addDays(first, -weekday(first));
  const weeks: string[][] = [];
  for (let d = start; d.slice(0, 7) <= month || weeks.length === 0; d = addDays(d, 7)) {
    if (d.slice(0, 7) > month) break;
    weeks.push(eachDay(d, addDays(d, 6)));
  }
  return weeks;
}

/** "2026-11" -> "2026-12" (or -1 for the month before). */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** The school year a date belongs to, August to July: "2026-11-21" -> ["2026-08", ..., "2027-07"]. */
export function schoolYear(date: string): string[] {
  const [y, m] = date.split("-").map(Number);
  const startYear = m >= 8 ? y : y - 1;
  return Array.from({ length: 12 }, (_, i) => shiftMonth(`${startYear}-08`, i));
}
