// Dates in Icarus are plain "yyyy-mm-dd" text (no time, no time zone), which sorts correctly as text.
// These helpers do the arithmetic in UTC so daylight saving never shifts a day.

const DAY_MS = 24 * 3600 * 1000;
const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

export function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toMs(value));
}

/** addDays("2027-01-30", 3) -> "2027-02-02" */
export function addDays(date: string, days: number): string {
  return new Date(toMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** How many days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

/** Every date from `first` to `last`, both included. */
export function eachDay(first: string, last: string): string[] {
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  return days;
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(date: string): number {
  return new Date(toMs(date)).getUTCDay();
}

/** Today's date where the person is. */
export function today(): string {
  return new Date().toLocaleDateString("en-CA"); // en-CA writes yyyy-mm-dd
}

export const WEEKDAY_LETTERS = ["SU", "M", "T", "W", "TH", "F", "S"]; // as the team's Gantt sheets write them
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
];
