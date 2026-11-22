// /apps/calendar: the team calendar. One component for every Calendar page; `screen` says which one.
//   month    (/apps/calendar)         the month grid
//   year     (/apps/calendar/year)    the whole school year at a glance
//   agenda   (/apps/calendar/agenda)  Coming up: the next two weeks, in order
//   event    (/apps/calendar/event?id=...)  one meeting with its shifts, or a competition, break or event
// Leads, mentors and boosters:
//   new      (/apps/calendar/new?type=&date=)  New event or New break
//   edit     (/apps/calendar/edit?id=...)      one day's meeting, or any event
//   schedule (/apps/calendar/schedule)         Meeting schedule: season parts and breaks
//   part     (/apps/calendar/part?from=&to=)   New season part, from the calendar
// Leads:
//   assign   (/apps/calendar/assign)           Assign meetings to subteams (#291)
//   member   (/apps/calendar/member)           View as a member
import { useEffect, useState, type ReactNode } from "react";
import { auth, calendar, ops, type CalendarData, type Me } from "@team6220/data";
import { Btn, Note, PageHeader, Screen } from "@team6220/ui";
import { Agenda } from "./Agenda";
import { Assign, MemberPreview } from "./Assign";
import { EventForm } from "./EventForm";
import { EventPage } from "./EventPage";
import { Month } from "./Month";
import { NewPart, Schedule } from "./Schedule";
import { Year } from "./Year";

export type CalendarScreen = "month" | "year" | "agenda" | "event" | "new" | "edit" | "schedule" | "part" | "assign" | "member";

/** What every screen gets. */
export interface CalendarView {
  data: CalendarData;
  me: Me;
  /** Every subteam, in the team's order. */
  subteams: string[];
  today: string;
  /** Loads the calendar again after a change. */
  reload: () => Promise<void>;
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
      const { me, subteams } = viewer;
      const reload = async () => setState({ kind: "ready", view: { data: await calendar.load(), me, subteams, today: calendar.today(), reload } });
      await reload();
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
  const page = pageFor(screen, state.view);
  return <>{notice && <div className="cal-demo"><Note tone="blue">{notice}</Note></div>}{page}</>;
}

function pageFor(screen: CalendarScreen, view: CalendarView): ReactNode {
  const { roles } = view.me;
  const only = (allowed: boolean, who: string, page: ReactNode) =>
    allowed ? page : <Screen><PageHeader title="Calendar" back={{ label: "Calendar", href: "/apps/calendar" }} /><Note>Only {who} can do this.</Note></Screen>;
  switch (screen) {
    case "year": return <Year view={view} />;
    case "agenda": return <Agenda view={view} />;
    case "event": return <EventPage view={view} />;
    case "new": return only(roles.scheduler, "leads, mentors, and boosters", <EventForm view={view} mode="new" />);
    case "edit": return only(roles.scheduler, "leads, mentors, and boosters", <EventForm view={view} mode="edit" />);
    case "schedule": return only(roles.scheduler, "leads, mentors, and boosters", <Schedule view={view} />);
    case "part": return only(roles.scheduler, "leads, mentors, and boosters", <NewPart view={view} />);
    case "assign": return only(roles.lead, "leads", <Assign view={view} />);
    case "member": return only(roles.lead, "leads", <MemberPreview view={view} />);
    default: return <Month view={view} />;
  }
}
