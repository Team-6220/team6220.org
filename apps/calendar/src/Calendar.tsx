// /apps/calendar: the team calendar. One component for every Calendar page; `screen` says which one.
//   month    (/apps/calendar)         the month grid
//   year     (/apps/calendar/year)    the whole school year at a glance
//   agenda   (/apps/calendar/agenda)  Coming up: the next two weeks, in order
//   event    (/apps/calendar/event?id=...)  one meeting with its shifts, or a competition, break or event
import { useEffect, useState } from "react";
import { auth, calendar, ops, type CalendarData, type Me } from "@team6220/data";
import { Btn, Note, PageHeader, Screen } from "@team6220/ui";
import { Agenda } from "./Agenda";
import { EventPage } from "./EventPage";
import { Month } from "./Month";
import { Year } from "./Year";

export type CalendarScreen = "month" | "year" | "agenda" | "event";

/** What every screen gets. */
export interface CalendarView {
  data: CalendarData;
  me: Me;
  today: string;
}

type State = { kind: "loading" } | { kind: "signed-out" } | { kind: "pending" } | { kind: "error"; message: string } | { kind: "ready"; view: CalendarView };

export default function Calendar({ screen = "month" }: { screen?: CalendarScreen }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    ops.readDemoFromUrl();
    (async () => {
      const viewer = await ops.getViewer();
      if (viewer.kind === "signed-out") return setState({ kind: "signed-out" });
      if (viewer.kind !== "member") return setState({ kind: "pending" });
      setState({ kind: "ready", view: { data: await calendar.load(), me: viewer.me, today: calendar.today() } });
    })().catch((err) => setState({ kind: "error", message: err instanceof Error ? err.message : "We couldn't load the calendar." }));
  }, []);

  if (state.kind === "loading") return <Screen><p className="k-hint" role="status">Loading the calendar…</p></Screen>;
  if (state.kind === "signed-out") {
    return (
      <Screen>
        <PageHeader title="Calendar" />
        <Note>Sign in to see the team calendar.</Note>
        <div><Btn kind="primary" onClick={() => auth.login(location.pathname + location.search)}>Sign in with Google</Btn></div>
      </Screen>
    );
  }
  if (state.kind === "pending") return <Screen><PageHeader title="Calendar" /><Note tone="warn">The calendar opens once a web admin approves your account.</Note></Screen>;
  if (state.kind === "error") return <Screen><PageHeader title="Calendar" /><Note tone="bad">{state.message}</Note></Screen>;

  const notice = ops.demoNotice();
  const page = screen === "year" ? <Year view={state.view} /> : screen === "agenda" ? <Agenda view={state.view} /> : screen === "event" ? <EventPage view={state.view} /> : <Month view={state.view} />;
  return <>{notice && <div className="cal-demo"><Note tone="blue">{notice}</Note></div>}{page}</>;
}
