// Coming up: everything in the next two weeks, in order, with who is supervising.
// The table keeps time order on purpose (no sort or group menus, UX rule 3): it is a "what's next" list.
import { calendar, type CalEvent } from "@team6220/data";
import { DataTable, PageHeader, Pill, Screen, type Tone } from "@team6220/ui";
import type { CalendarView } from "./Calendar";
import { PublicNote } from "./PublicNote";
import { eventHref } from "./shared";

interface Row { event: CalEvent; when: string; where: string; who: string; status: { label: string; tone: Tone } | null }

export function Agenda({ view }: { view: CalendarView }) {
  const { data, me, today } = view;
  const rows: Row[] = calendar.upcoming(data.events, today).filter((e) => calendar.isForMe(e, me)).map((e) => {
    const shifts = calendar.shiftsOf(data.shifts, e._id);
    const open = shifts.filter((s) => !s.name && !s.memberId).length;
    const mine = shifts.some((s) => s.memberId === me.id);
    const time = calendar.timeRange(e.startTime, e.endTime);
    const what = e.type === "meeting" ? `Meeting ${time}` : `${calendar.titleOf(e)}${time ? ` ${time}` : ""}`;
    const day = e.startDate === e.endDate ? calendar.shortDay(e.startDate).replace(/ \w+ /, " ") : calendar.dayRange(e.startDate, e.endDate);
    return {
      event: e,
      when: `${e.mandatory ? "★ " : ""}${day} · ${what}`,
      where: e.location || "—",
      who: shifts.length ? shifts.map((s) => (s.memberId === me.id ? "You" : s.name || "Open")).join(" · ") : "",
      status: e.startDate <= today && today <= e.endDate ? { label: "Today", tone: "white" } : mine ? { label: "Your shift", tone: "ok" } : open ? { label: `Needs ${open}`, tone: "warn" } : e.type === "break" ? { label: "Break", tone: "calm" } : null,
    };
  });
  return (
    <Screen>
      <PageHeader title="Coming up" sub="Everything in the next two weeks, in order" />
      <PublicNote view={view} />
      <DataTable<Row>
        columns={[
          { key: "when", label: "When", width: "minmax(0, 2fr)", render: (r) => <a className="k-link" href={eventHref(r.event)}>{r.when}</a> },
          { key: "where", label: "Where", width: "minmax(0, 1.2fr)" },
          ...(view.visitor ? [] : [{ key: "who", label: "Supervisors", width: "minmax(0, 1fr)" }]),
          { key: "status", label: "", width: "120px", render: (r) => (r.status ? <Pill tone={r.status.tone}>{r.status.label}</Pill> : null) },
        ]}
        rows={rows}
        rowKey={(r) => r.event._id}
        statusKey="status"
        onRowClick={(r) => location.assign(eventHref(r.event))}
        empty="Nothing on the calendar in the next two weeks."
      />
    </Screen>
  );
}
