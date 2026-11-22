// Small things every Attendance screen uses.
import { OpsError } from "@team6220/data";

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof OpsError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Short time like "3:45 PM" from an ISO timestamp, in the team's time zone. */
export function formatTime(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
}

/** "Sat Nov 14" for a yyyy-mm-dd date. */
export function shortDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).replace(",", "");
}

/** "Nov 14" */
export function monthDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

/** "Saturday, November 14" */
export function longDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
}

/** "Design · Manufacturing" */
export const subteamText = (subteams: string[]) => subteams.join(" · ") || "—";

/** "71 h" */
export const hoursText = (hours: number) => `${hours} h`;

/** "Aug", "Sep" ... for yyyy-mm. */
export const monthShort = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short" });
export const monthLong = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long" });
