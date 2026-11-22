// Competitions: links to The Blue Alliance and FIRST. A competition on the calendar is matched with the event Icarus
// saved from The Blue Alliance by its dates, because that event has the official code the links need.
import type { TeamEvent } from "../icarus/types";
import type { CalEvent } from "./types";

export interface EventLinks {
  tba: string;
  first: string;
  /** The official code ("2027casd"), when the calendar's competition matched one. */
  code: string;
}

/** Where to look a competition up. Without a match: The Blue Alliance's event list. */
export function eventLinks(event: Pick<CalEvent, "startDate" | "endDate">, saved: TeamEvent[]): EventLinks {
  const match = saved.find((e) => e.source !== "manual" && /^\d{4}\w+$/.test(e.code) && e.startDate === event.startDate && e.endDate === event.endDate);
  if (!match) return { tba: "https://www.thebluealliance.com/events", first: "https://frc-events.firstinspires.org/", code: "" };
  return {
    tba: `https://www.thebluealliance.com/event/${match.code}`,
    first: `https://frc-events.firstinspires.org/${match.code.slice(0, 4)}/${match.code.slice(4)}`,
    code: match.code,
  };
}
