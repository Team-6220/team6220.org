// Getting the calendar onto your own: Export calendar on Month, and Export ▾ on a meeting, a competition and each of My
// shifts. The feed (Google Calendar's "Add & sync", Apple Calendar's "Subscribe") is the public calendar and keeps itself
// current; the .ics download is a one-time copy that can include more (team-only meetings, your shifts).
import { useState } from "react";
import { calendar, type CalEvent, type IcsItem } from "@team6220/data";
import { Btn } from "@team6220/ui";
import { downloadIcs, feedLinks } from "./shared";

/** Month: Export calendar ▾ with the feed, and a download of this month or the rest of the season. */
export function ExportCalendar({ events, month, today }: { events: CalEvent[]; month: string; today: string }) {
  const [range, setRange] = useState<"month" | "season">("month");
  const links = feedLinks();
  const download = () => {
    const [from, to] = range === "month" ? [`${month}-01`, `${month}-31`] : [today, calendar.schoolYear(today).slice(-1)[0] + "-31"];
    const chosen = events.filter((e) => e.endDate >= from && e.startDate <= to);
    downloadIcs(range === "month" ? `team6220-${month}.ics` : "team6220-season.ics", calendar.icsText(calendar.eventItems(chosen), "Team 6220 calendar"));
  };
  return (
    <details className="cal-export">
      <summary className="k-btn k-btn--quiet k-btn--small">Export calendar ▾</summary>
      <div className="k-box cal-export-list">
        <div className="cal-export-row">
          <div><strong>Google Calendar</strong><span className="k-hint">Adds the team calendar to your account and keeps it synced automatically. It has the public meetings, competitions, and events.</span></div>
          <Btn small kind="primary" href={links.google}>Add &amp; sync</Btn>
        </div>
        <div className="cal-export-row">
          <div><strong>Apple Calendar</strong><span className="k-hint">Subscribes on your iPhone or Mac and keeps it synced automatically.</span></div>
          <Btn small kind="primary" href={links.apple}>Subscribe</Btn>
        </div>
        <div className="cal-export-row">
          <div>
            <strong>Download .ics file</strong>
            <span className="k-hint">A one-time copy for any calendar app. Choose what to include.</span>
            <label className="k-toggle"><input type="radio" name="cal-range" checked={range === "month"} onChange={() => setRange("month")} />Current month</label>
            <label className="k-toggle"><input type="radio" name="cal-range" checked={range === "season"} onChange={() => setRange("season")} />Rest of the season</label>
            <span className="k-hint">{calendar.ICS_NOTE}</span>
          </div>
          <Btn small kind="primary" onClick={download}>Download</Btn>
        </div>
      </div>
    </details>
  );
}

/** One thing (a meeting, a competition, a shift): Export ▾ with Export just this day. */
export function ExportOne({ item, small = false }: { item: IcsItem; small?: boolean }) {
  return (
    <details className="cal-export cal-export-one">
      <summary className={`k-btn k-btn--quiet${small ? " k-btn--small" : ""}`}>Export ▾</summary>
      <div className="k-menu cal-export-menu">
        <p className="cal-menu-title">Export just this day</p>
        <a role="menuitem" href={calendar.googleLink(item)} target="_blank" rel="noreferrer">Google Calendar</a>
        <button type="button" role="menuitem" onClick={() => downloadIcs("team6220.ics", calendar.icsText([item], "Team 6220"))}>Apple Calendar</button>
        <button type="button" role="menuitem" onClick={() => downloadIcs("team6220.ics", calendar.icsText([item], "Team 6220"))}>Download .ics file</button>
      </div>
    </details>
  );
}
