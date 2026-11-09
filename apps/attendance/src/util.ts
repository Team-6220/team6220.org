import { AttendanceError } from "@team6220/data";

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof AttendanceError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** "Mon, Nov 9" for a yyyy-MM-dd date (read as a calendar date, no time zone shift). */
export function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/** Short time like "3:45 PM" from an ISO timestamp, in the team's time zone. */
export function formatTime(iso: string, fallback = ""): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return fallback;
  return new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
}

/** Student IDs are exactly 10 digits (same rule as the server). */
export const STUDENT_ID = /^\d{10}$/;
