// Small things every Calendar screen uses: links between pages, and the view toggles each person keeps.
import { useState } from "react";
import type { CalEvent } from "@team6220/data";

export const eventHref = (e: Pick<CalEvent, "_id">) => `/apps/calendar/event?id=${encodeURIComponent(e._id)}`;
export const monthHref = (month: string) => `/apps/calendar?month=${month}`;
/** New event, break or meeting; `end` for a break dragged over several days. */
export const newHref = (type: "meeting" | "event" | "break", date: string, end = date) => `/apps/calendar/new?type=${type}&date=${date}${end !== date ? `&end=${end}` : ""}`;
export const editHref = (e: Pick<CalEvent, "_id">) => `/apps/calendar/edit?id=${encodeURIComponent(e._id)}`;
export const partHref = (from: string, to = from) => `/apps/calendar/part?from=${from}&to=${to}`;
export const SCHEDULE_HREF = "/apps/calendar/schedule";

/** A page's ?name= value. */
export const param = (name: string) => new URLSearchParams(location.search).get(name) ?? "";

export interface CalendarPrefs {
  /** Leads, mentors and boosters: click or drag on days to add things. */
  edit: boolean;
  shifts: boolean;
  tasks: boolean;
  others: boolean;
}

const KEY = "team6220.calendar";
const DEFAULTS: CalendarPrefs = { edit: false, shifts: true, tasks: false, others: true };

/** The month view's toggles, remembered in this browser. */
export function usePrefs(): [CalendarPrefs, (change: Partial<CalendarPrefs>) => void] {
  const [prefs, setPrefs] = useState<CalendarPrefs>(() => {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    } catch {
      return DEFAULTS;
    }
  });
  const update = (change: Partial<CalendarPrefs>) => {
    const next = { ...prefs, ...change };
    setPrefs(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // private window: the toggles still work for this visit
    }
  };
  return [prefs, update];
}
