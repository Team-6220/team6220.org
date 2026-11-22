// /apps/business: one component for every Business page; `screen` says which one. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Business
//   1-2-3-100:  my, restaurant, grants, pitches, merch (every team member)
//   Trackers:   sponsor-tracker, grant-tracker (everyone on the team; Operations, leads, mentors and boosters edit), stats (everyone)
//   Operations: approvals, review, status, settings (Operations, leads, mentors, boosters; only Operations and leads approve; leads change settings)
import { useEffect, useState, type ReactNode } from "react";
import { auth, ops, type Me } from "@team6220/data";
import { Btn, Note, PageHeader, Screen } from "@team6220/ui";
import { Approvals } from "./Approvals";
import { GrantTracker } from "./GrantTracker";
import { Merch } from "./Merch";
import { My } from "./My";
import { Pitches } from "./Pitches";
import { Restaurant } from "./Restaurant";
import { Review } from "./Review";
import { Settings } from "./Settings";
import { Status } from "./Status";
import { StudentGrants } from "./StudentGrants";
import { SponsorTracker } from "./SponsorTracker";
import { Stats } from "./Stats";

export type BusinessScreen = "my" | "restaurant" | "grants" | "pitches" | "merch" | "sponsor-tracker" | "grant-tracker" | "stats" | "approvals" | "review" | "status" | "settings";

type State = { kind: "loading" } | { kind: "signed-out" } | { kind: "pending" } | { kind: "error"; message: string } | { kind: "ready"; me: Me };

export default function Business({ screen = "my" }: { screen?: BusinessScreen }) {
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
  const only = (title: string, page: ReactNode) => (me.roles.business ? page : <Screen><PageHeader title={title} /><Note>Only Operations, leads, mentors and boosters can see this.</Note></Screen>);
  switch (screen) {
    case "restaurant": return <Restaurant />;
    case "grants": return <StudentGrants />;
    case "pitches": return <Pitches me={me} />;
    case "merch": return <Merch />;
    case "sponsor-tracker": return <SponsorTracker me={me} />;
    case "grant-tracker": return <GrantTracker me={me} />;
    case "stats": return <Stats />;
    case "approvals": return only("Approvals", <Approvals />);
    case "review": return only("Review", <Review me={me} />);
    case "status": return only("Everyone's status", <Status me={me} />);
    case "settings": return only("1-2-3-100 settings", <Settings me={me} />);
    default: return <My me={me} />;
  }
}
