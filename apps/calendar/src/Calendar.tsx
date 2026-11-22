// /apps/calendar: the team calendar. One component for every Calendar page; `screen` says which one.
//   month    (/apps/calendar)         the month grid
//   year     (/apps/calendar/year)    the whole school year at a glance
//   agenda   (/apps/calendar/agenda)  Coming up: the next two weeks, in order
//   comps    (/apps/calendar/comps)   Comps & More: competitions, kickoff and other events
//   event    (/apps/calendar/event?id=...)  one meeting with its shifts, or a competition, break or event
// Month, Year, Coming up, Comps & More and a meeting or competition also open for anyone, signed in or not, as the
// public calendar: only the public meetings, competitions, events and breaks, never shifts or supervisors.
// Leads, mentors and boosters:
//   new      (/apps/calendar/new?type=&date=)  New event or New break
//   edit     (/apps/calendar/edit?id=...)      one day's meeting, or any event
//   schedule (/apps/calendar/schedule)         Meeting schedule: season parts and breaks
//   part     (/apps/calendar/part?from=&to=)   New season part, from the calendar
// Supervision:
//   myshifts    (/apps/calendar/myshifts)     your shifts, with Withdraw
//   open        (/apps/calendar/open)         shifts with no supervisor in the next four weeks
//   supervisors (/apps/calendar/supervisors)  the supervisor list (leads, mentors and boosters)
//   become      (/apps/calendar/become)       Become a supervisor (anyone signed in, approved or not)
// Leads:
//   assign   (/apps/calendar/assign)           Assign meetings to subteams (#291)
//   member   (/apps/calendar/member)           View as a member
import { useEffect, useState, type ReactNode } from "react";
import { auth, calendar, ops, type CalendarData, type Me, type Supervisor } from "@team6220/data";
import { Btn, Note, PageHeader, Screen } from "@team6220/ui";
import { Agenda } from "./Agenda";
import { Comps } from "./Comps";
import { Assign, MemberPreview } from "./Assign";
import { EventForm } from "./EventForm";
import { EventPage } from "./EventPage";
import { Month } from "./Month";
import { NewPart, Schedule } from "./Schedule";
import { Become, MyShifts, OpenShifts, Supervisors } from "./Supervision";
import { Year } from "./Year";

export type CalendarScreen = "month" | "year" | "agenda" | "comps" | "event" | "new" | "edit" | "schedule" | "part" | "assign" | "member" | "myshifts" | "open" | "supervisors" | "become";

/** What every screen gets. */
export interface CalendarView {
  data: CalendarData;
  me: Me;
  /** Every subteam, in the team's order. */
  subteams: string[];
  today: string;
  /** Not a team member: signed out, waiting for approval, a guest or an alumnus. They get the public calendar. */
  visitor: null | "signed-out" | "pending" | "guest";
  /** Loads the calendar again after a change. */
  reload: () => Promise<void>;
}

type State = { kind: "loading" } | { kind: "become"; row: Supervisor | null } | { kind: "signed-out" } | { kind: "pending" } | { kind: "error"; message: string } | { kind: "ready"; view: CalendarView };

/** The screens anyone may open. */
const PUBLIC_SCREENS: CalendarScreen[] = ["month", "year", "agenda", "comps", "event"];

/** Who a visitor is as far as the screens go: no roles, no subteams. */
const VISITOR_ME: Me = { id: "", name: "", badges: [], subteams: [], roles: ops.rolesFor([]) };

export default function Calendar({ screen = "month" }: { screen?: CalendarScreen }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    ops.readDemoFromUrl();
    (async () => {
      const viewer = await ops.getViewer();
      // Become a supervisor works before a web admin approves the account: a parent signs up there first.
      if (viewer.kind !== "member" && viewer.kind !== "signed-out" && screen === "become") return setState({ kind: "become", row: await calendar.mySupervisorRow() });
      if (viewer.kind !== "member") {
        if (!PUBLIC_SCREENS.includes(screen)) return setState({ kind: viewer.kind === "signed-out" ? "signed-out" : "pending" });
        const visitor = viewer.kind;
        const reload = async () => setState({ kind: "ready", view: { data: await calendar.loadPublic(), me: VISITOR_ME, subteams: [], today: calendar.today(), visitor, reload } });
        return await reload();
      }
      const { me, subteams } = viewer;
      const reload = async () => setState({ kind: "ready", view: { data: await calendar.load(), me, subteams, today: calendar.today(), visitor: null, reload } });
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
  if (state.kind === "become") return <Become row={state.row} />;
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
    case "comps": return <Comps view={view} />;
    case "event": return <EventPage view={view} />;
    case "new": return only(roles.scheduler, "leads, mentors, and boosters", <EventForm view={view} mode="new" />);
    case "edit": return only(roles.scheduler, "leads, mentors, and boosters", <EventForm view={view} mode="edit" />);
    case "schedule": return only(roles.scheduler, "leads, mentors, and boosters", <Schedule view={view} />);
    case "part": return only(roles.scheduler, "leads, mentors, and boosters", <NewPart view={view} />);
    case "myshifts": return <MyShifts view={view} />;
    case "open": return <OpenShifts view={view} />;
    case "supervisors": return only(roles.scheduler, "leads, mentors, and boosters", <Supervisors view={view} />);
    case "become": return <Become row={calendar.supervisorFor(view.data.supervisors, view.me.id) ?? null} />;
    case "assign": return only(roles.lead, "leads", <Assign view={view} />);
    case "member": return only(roles.lead, "leads", <MemberPreview view={view} />);
    default: return <Month view={view} />;
  }
}
