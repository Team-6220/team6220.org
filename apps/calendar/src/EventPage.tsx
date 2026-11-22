// One thing on the calendar: a meeting with its supervision shifts, or a competition, event or break.
import { useEffect, useState } from "react";
import { calendar, icarus, type EventLinks, type Shift } from "@team6220/data";
import { Btn, DataTable, KeyValue, Note, PageHeader, Pill, Screen, Section, Split } from "@team6220/ui";
import type { CalendarView } from "./Calendar";
import { ExportOne } from "./Export";
import { editHref, monthHref } from "./shared";
import { ShiftAction } from "./Supervision";

export function EventPage({ view }: { view: CalendarView }) {
  const { data, me } = view;
  const id = new URLSearchParams(location.search).get("id");
  const event = data.events.find((e) => e._id === id);
  // A competition's links to The Blue Alliance and FIRST come from the event Icarus saved for it (team members only).
  const [links, setLinks] = useState<EventLinks | null>(null);
  useEffect(() => {
    if (event?.type !== "competition") return;
    if (view.visitor) return setLinks(calendar.eventLinks(event, []));
    icarus.loadAll().then((d) => setLinks(calendar.eventLinks(event, d.events)), () => setLinks(calendar.eventLinks(event, [])));
  }, [event?._id]);
  const back = { label: "Calendar", href: event ? monthHref(event.startDate.slice(0, 7)) : "/apps/calendar" };
  if (!event) return <Screen><PageHeader title="Not found" back={back} /><Note>That isn't on the calendar any more.</Note></Screen>;

  const shifts = calendar.shiftsOf(data.shifts, event._id);
  const days = event.startDate === event.endDate ? calendar.longDay(event.startDate) : `${calendar.longDay(event.startDate)} – ${calendar.longDay(event.endDate)}`;
  const time = event.startTime && event.endTime ? `${calendar.longTime(event.startTime)} – ${calendar.longTime(event.endTime)}` : "";
  const sub = [days, time, event.location].filter(Boolean).join(" · ");
  const details: [string, React.ReactNode][] = [];
  if (shifts.length && !view.visitor) details.push(["Shifts", shifts.map((s) => calendar.timeRange(s.start, s.end)).join(" and ")]);
  if (event.setupDate) details.push(["Set-up", calendar.longDay(event.setupDate)]);
  if (event.notes) details.push(["Notes", event.notes]);
  details.push(["Who it's for", calendar.audience(event)]);
  details.push(["Who can see it", event.public ? "Anyone (shifts and supervisors are for the team only)" : "Team members, boosters, and approved supervisors"]);

  const info = <KeyValue items={details} />;
  const exportItem = calendar.eventItems([event])[0];
  const actions = (
    <>
      {event.type === "competition" && links && <><Btn href={links.tba}>{links.code ? "Open on TBA" : "Look up on TBA"}</Btn>{links.code && <Btn href={links.first}>Open on FIRST</Btn>}</>}
      {exportItem && <ExportOne item={exportItem} />}
      {me.roles.scheduler && <Btn icon="edit" title="Edit" href={editHref(event)} />}
    </>
  );
  if (event.type === "competition") {
    // Venue, dates and set-up as the lead entered them. Team size, address and the day-by-day plan aren't kept yet.
    const eventInfo: [string, React.ReactNode][] = [["Venue", event.location || "—"], ["Dates", calendar.dayRange(event.startDate, event.endDate)]];
    if (event.setupDate) eventInfo.push(["Set-up", calendar.longDay(event.setupDate)]);
    if (time) eventInfo.push(["Our times", time]);
    if (event.notes) eventInfo.push(["Notes", event.notes]);
    return (
      <Screen>
        <PageHeader title={calendar.titleOf(event)} sub={sub} back={{ label: "Comps & More", href: "/apps/calendar/comps" }} actions={actions} />
        {event.mandatory && <Note tone="warn">★ Mandatory for {calendar.audience(event).toLowerCase()}.</Note>}
        <Split
          left={<Section title="Event info"><KeyValue items={eventInfo} /></Section>}
          right={<Section title="Who can see it"><KeyValue items={[["Who it's for", calendar.audience(event)], ["Who can see it", event.public ? "Anyone" : "Team members, boosters, and approved supervisors"]]} /></Section>}
        />
      </Screen>
    );
  }
  if (event.type !== "meeting" || view.visitor) {
    return (
      <Screen>
        <PageHeader title={`${event.mandatory ? "★ " : ""}${calendar.titleOf(event)}`} sub={sub} back={back} actions={actions} />
        {event.mandatory && <Note tone="warn">★ Mandatory for {calendar.audience(event).toLowerCase()}.</Note>}
        {info}
      </Screen>
    );
  }
  return (
    <Screen>
      <PageHeader title={`${event.mandatory ? "★ " : ""}${calendar.titleOf(event)}`} sub={sub} back={back} actions={actions} />
      <Split
        left={
          <Section title="Supervision shifts">
            <DataTable<Shift>
              columns={[
                { key: "time", label: "Shift", width: "160px", value: (s) => s.start, render: (s) => calendar.timeRange(s.start, s.end) },
                { key: "who", label: "Supervisor", width: "minmax(0, 1fr)", value: (s) => s.name, render: (s) => (s.memberId === me.id ? "You" : s.name || "Open") },
                { key: "status", label: "", width: "120px", render: (s) => (s.memberId === me.id ? <Pill tone="ok">Yours</Pill> : !s.name && !s.memberId ? <Pill tone="warn">Open</Pill> : null) },
              ]}
              rows={shifts}
              rowKey={(s) => s._id}
              statusKey="status"
              actions={event.startDate >= view.today ? (s) => <ShiftAction view={view} shift={s} /> : undefined}
              empty="No supervision shifts on this meeting."
            />
            <Note>Only school-approved supervisors can sign up. Leads, mentors, and boosters can put any approved supervisor in a shift. If you can't make your shift, <strong>Withdraw</strong> takes you off the shift and reopens it; the leads and other supervisors are told so someone else can sign up.</Note>
          </Section>
        }
        right={info}
      />
    </Screen>
  );
}
