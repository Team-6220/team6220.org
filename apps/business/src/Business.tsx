// /apps/business: one component for every Business page; `screen` says which one. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Business
//   Trackers:  sponsor-tracker, grant-tracker (everyone on the team; Operations, leads, mentors and boosters edit), stats (everyone on the team)
import { useEffect, useState, type ReactNode } from "react";
import { auth, ops, type Me } from "@team6220/data";
import { Btn, Note, PageHeader, Screen } from "@team6220/ui";
import { GrantTracker } from "./GrantTracker";
import { SponsorTracker } from "./SponsorTracker";
import { Stats } from "./Stats";

export type BusinessScreen = "sponsor-tracker" | "grant-tracker" | "stats";

type State = { kind: "loading" } | { kind: "signed-out" } | { kind: "pending" } | { kind: "error"; message: string } | { kind: "ready"; me: Me };

export default function Business({ screen = "sponsor-tracker" }: { screen?: BusinessScreen }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    ops.readDemoFromUrl();
    ops.getViewer().then(
      (viewer) => setState(viewer.kind === "member" && viewer.me.roles.team ? { kind: "ready", me: viewer.me } : viewer.kind === "signed-out" ? { kind: "signed-out" } : { kind: "pending" }),
      (err) => setState({ kind: "error", message: err instanceof Error ? err.message : "We couldn't load Business." }),
    );
  }, []);

  if (state.kind === "loading") return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;
  if (state.kind === "signed-out") {
    return (
      <Screen>
        <PageHeader title="Business" />
        <Note>Sign in to see the sponsor and grant trackers.</Note>
        <div><Btn kind="primary" onClick={() => auth.login(location.pathname + location.search)}>Sign in with Google</Btn></div>
      </Screen>
    );
  }
  if (state.kind === "pending") return <Screen><PageHeader title="Business" /><Note tone="warn">Business opens once a web admin approves your account and you have the Team Member badge.</Note></Screen>;
  if (state.kind === "error") return <Screen><PageHeader title="Business" /><Note tone="bad">{state.message}</Note></Screen>;

  const notice = ops.demoNotice();
  return <>{notice && <div className="biz-demo"><Note tone="blue">{notice}</Note></div>}{pageFor(screen, state.me)}</>;
}

function pageFor(screen: BusinessScreen, me: Me): ReactNode {
  switch (screen) {
    case "grant-tracker": return <GrantTracker me={me} />;
    case "stats": return <Stats />;
    default: return <SponsorTracker me={me} />;
  }
}
