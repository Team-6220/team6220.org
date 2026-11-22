// /apps/rsvp: who is coming to competitions and events. One component for every RSVP page; `screen` says which one.
//   open       (/apps/rsvp)                     Open forms: the forms you can answer
//   answer     (/apps/rsvp/answer?id=)          answering one form
//   results    (/apps/rsvp/results?id=)         Who's coming
// Leads only:
//   manage     (/apps/rsvp/manage)              Manage forms
//   new        (/apps/rsvp/new?id=)             New form (or change one)
//   reminders  (/apps/rsvp/reminders)           the reminder schedule
// Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-RSVP
import { useEffect, useState, type ReactNode } from "react";
import { auth, ops, type Me } from "@team6220/data";
import { Btn, Note, PageHeader, Screen } from "@team6220/ui";
import { Answer } from "./Answer";
import { FormEditor } from "./FormEditor";
import { Manage } from "./Manage";
import { OpenForms } from "./OpenForms";
import { Reminders } from "./Reminders";
import { Results } from "./Results";

export type RsvpScreen = "open" | "answer" | "results" | "manage" | "new" | "reminders";

type State = { kind: "loading" } | { kind: "signed-out" } | { kind: "pending" } | { kind: "error"; message: string } | { kind: "ready"; me: Me };

export default function RSVP({ screen = "open" }: { screen?: RsvpScreen }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    ops.readDemoFromUrl();
    ops.getViewer().then(
      (viewer) => setState(viewer.kind === "member" && viewer.me.roles.team ? { kind: "ready", me: viewer.me } : viewer.kind === "signed-out" ? { kind: "signed-out" } : { kind: "pending" }),
      (err) => setState({ kind: "error", message: err instanceof Error ? err.message : "We couldn't load RSVP." }),
    );
  }, []);

  if (state.kind === "loading") return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;
  if (state.kind === "signed-out") {
    return (
      <Screen>
        <PageHeader title="RSVP" />
        <Note>Sign in to see the forms for competitions and events.</Note>
        <div><Btn kind="primary" onClick={() => auth.login(location.pathname + location.search)}>Sign in with Google</Btn></div>
      </Screen>
    );
  }
  if (state.kind === "pending") return <Screen><PageHeader title="RSVP" /><Note tone="warn">RSVP opens once a web admin approves your account and you have the Team Member badge.</Note></Screen>;
  if (state.kind === "error") return <Screen><PageHeader title="RSVP" /><Note tone="bad">{state.message}</Note></Screen>;

  const notice = ops.demoNotice();
  return <>{notice && <div className="rsvp-demo"><Note tone="blue">{notice}</Note></div>}{pageFor(screen, state.me)}</>;
}

function pageFor(screen: RsvpScreen, me: Me): ReactNode {
  const lead = (page: ReactNode) => (me.roles.lead ? page : <Screen><PageHeader title="RSVP" back={{ label: "Open forms", href: "/apps/rsvp" }} /><Note>Only leads can do this.</Note></Screen>);
  switch (screen) {
    case "answer": return <Answer />;
    case "results": return <Results me={me} />;
    case "manage": return lead(<Manage />);
    case "new": return lead(<FormEditor />);
    case "reminders": return lead(<Reminders />);
    default: return <OpenForms />;
  }
}
