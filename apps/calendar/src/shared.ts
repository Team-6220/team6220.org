// Small things every Calendar screen uses: links between pages, and the view toggles each person keeps.
import { useState } from "react";
import type { CalEvent } from "@team6220/data";

export const eventHref = (e: Pick<CalEvent, "_id">) => `/apps/calendar/event?id=${encodeURIComponent(e._id)}`;
export const monthHref = (month: string) => `/apps/calendar?month=${month}`;

export interface CalendarPrefs {
  shifts: boolean;
  tasks: boolean;
  others: boolean;
}

const KEY = "team6220.calendar";
const DEFAULTS: CalendarPrefs = { shifts: true, tasks: false, others: true };

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
