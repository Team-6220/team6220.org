// The whole school year (August to July) at a glance: meetings, breaks, competitions and today. Click a month to open it.
import { calendar, type CalEvent } from "@team6220/data";
import { PageHeader, Screen } from "@team6220/ui";
import { PublicNote } from "./PublicNote";
import type { CalendarView } from "./Calendar";
import { monthHref } from "./shared";

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function kindOf(day: string, events: CalEvent[], today: string): string {
  if (day === today) return "y-today";
  const on = calendar.eventsOn(events, day);
  const meeting = on.some((e) => e.type === "meeting");
  const brk = on.some((e) => e.type === "break");
  if (on.some((e) => e.type === "competition" || e.type === "event")) return "y-comp";
  if (meeting && brk) return "y-both";
  return meeting ? "y-meeting" : brk ? "y-break" : "";
}

export function Year({ view }: { view: CalendarView }) {
  const { data, today } = view;
  const months = calendar.schoolYear(today);
  const title = `${months[0].slice(0, 4)}–${months[11].slice(2, 4)}`;
  return (
    <Screen>
      <PageHeader title={title} sub="The whole school year at a glance. Click a month to open it." />
      <PublicNote view={view} />
      <div className="cal-legend">
        <span><i className="y-meeting" />Meeting</span><span><i className="y-break" />Break</span><span><i className="y-both" />Meeting during a break</span>
        <span><i className="y-comp" />Competition or event</span><span><i className="y-today" />Today</span>
      </div>
      <div className="cal-year">
        {months.map((month) => (
          <a key={month} className="k-box cal-mini" href={monthHref(month)} aria-label={`Open ${calendar.monthTitle(month)}`}>
            <strong>{calendar.monthTitle(month)}</strong>
            <span className="cal-mini-grid">
              {LETTERS.map((l, i) => <span key={i} className="cal-mini-head">{l}</span>)}
              {calendar.monthWeeks(month).flat().map((day) =>
                day.slice(0, 7) === month ? <span key={day} className={`cal-mini-day ${kindOf(day, data.events, today)}`}>{Number(day.slice(8))}</span> : <span key={day} />,
              )}
            </span>
          </a>
        ))}
      </div>
    </Screen>
  );
}
