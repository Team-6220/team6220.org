// Comps & More: competitions, kickoff and other special events like scrimmages. Everything except the main meetings and
// breaks. Upcoming ones first, soonest first, then the ones that are done.
import { calendar, type CalEvent } from "@team6220/data";
import { Btn, DataTable, PageHeader, Pill, Screen, type Tone } from "@team6220/ui";
import type { CalendarView } from "./Calendar";
import { PublicNote } from "./PublicNote";
import { eventHref } from "./shared";

interface Row { event: CalEvent; when: string; status: { label: string; tone: Tone } }

export function Comps({ view }: { view: CalendarView }) {
  const { data, me, today } = view;
  const all = calendar.compsAndMore(data.events).filter((e) => calendar.isForMe(e, me));
  const upcoming = all.filter((e) => e.endDate >= today);
  const done = all.filter((e) => e.endDate < today).reverse();
  const next = upcoming[0];
  const row = (e: CalEvent): Row => {
    const days = calendar.daysBetween(today, e.startDate);
    const status: Row["status"] = e.endDate < today ? { label: "Done", tone: "ok" } : e === next ? { label: days > 0 ? `${days} ${days === 1 ? "day" : "days"}` : "Now", tone: "blue" } : { label: e.type === "competition" ? "Competition" : "Event", tone: "calm" };
    return { event: e, when: e.startDate === e.endDate ? calendar.shortDay(e.startDate) : calendar.dayRange(e.startDate, e.endDate), status };
  };
  const rows = [...upcoming, ...done].map(row);
  return (
    <Screen>
      <PageHeader
        title="Comps & More"
        sub="Competitions, kickoff, and special events like scrimmages. Everything except the main meetings and breaks."
        actions={<Btn href="https://www.thebluealliance.com/events">Look up on TBA</Btn>}
      />
      <PublicNote view={view} />
      <DataTable<Row>
        columns={[
          { key: "event", label: "Event", width: "minmax(0, 2fr)", render: (r) => <a className="k-link" href={eventHref(r.event)}>{calendar.titleOf(r.event)}</a> },
          { key: "when", label: "When", width: "minmax(0, 1fr)" },
          { key: "where", label: "Where", width: "minmax(0, 1.5fr)", render: (r) => r.event.location || "—" },
          { key: "status", label: "", width: "130px", render: (r) => <Pill tone={r.status.tone}>{r.status.label}</Pill> },
        ]}
        rows={rows}
        rowKey={(r) => r.event._id}
        statusKey="status"
        onRowClick={(r) => location.assign(eventHref(r.event))}
        empty="No competitions or events on the calendar yet."
      />
    </Screen>
  );
}
