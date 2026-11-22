// /apps/attendance: meeting attendance. One component for every Attendance page; `screen` says which one.
//   today  (/apps/attendance)           who is here and who isn't, today
//   mine   (/apps/attendance/mine)      Did I sign in?
//   hours  (/apps/attendance/hours)     My hours and my attendance
//   past   (/apps/attendance/past)      every past meeting, with who missed it
//   stats  (/apps/attendance/stats)     the season's numbers
//   kiosk  (/apps/attendance/kiosk)     Attendance Admins: the sign-in kiosk
// Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Attendance
import { useEffect, useState, type ReactNode } from "react";
import { auth, ops, type Me } from "@team6220/data";
import { Btn, Note, PageHeader, Screen } from "@team6220/ui";
import { Hours, Mine } from "./Mine";
import { Kiosk } from "./Kiosk";
import { Past } from "./Past";
import { Stats } from "./Stats";
import { Today } from "./Today";

export type AttendanceScreen = "today" | "mine" | "hours" | "past" | "stats" | "kiosk";

type State = { kind: "loading" } | { kind: "signed-out" } | { kind: "pending" } | { kind: "error"; message: string } | { kind: "ready"; me: Me };

export default function Attendance({ screen = "today" }: { screen?: AttendanceScreen }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    ops.readDemoFromUrl();
    ops.getViewer().then(
      (viewer) => setState(viewer.kind === "member" && viewer.me.roles.attendance ? { kind: "ready", me: viewer.me } : viewer.kind === "signed-out" ? { kind: "signed-out" } : { kind: "pending" }),
      (err) => setState({ kind: "error", message: err instanceof Error ? err.message : "We couldn't load attendance." }),
    );
  }, []);

  if (state.kind === "loading") return <Screen><p className="k-hint" role="status">Loading attendance…</p></Screen>;
  if (state.kind === "signed-out") {
    return (
      <Screen>
        <PageHeader title="Attendance" />
        <Note>Sign in to see meeting attendance.</Note>
        <div><Btn kind="primary" onClick={() => auth.login(location.pathname + location.search)}>Sign in with Google</Btn></div>
      </Screen>
    );
  }
  if (state.kind === "pending") return <Screen><PageHeader title="Attendance" /><Note tone="warn">Attendance opens once a web admin approves your account and you have the Team Member badge.</Note></Screen>;
  if (state.kind === "error") return <Screen><PageHeader title="Attendance" /><Note tone="bad">{state.message}</Note></Screen>;

  const notice = ops.demoNotice();
  return <>{notice && <div className="att-demo"><Note tone="blue">{notice}</Note></div>}{pageFor(screen, state.me)}</>;
}

function pageFor(screen: AttendanceScreen, me: Me): ReactNode {
  switch (screen) {
    case "mine": return <Mine />;
    case "hours": return <Hours />;
    case "past": return <Past me={me} />;
    case "stats": return <Stats />;
    case "kiosk":
      return me.roles.attendanceAdmin ? <Kiosk /> : <Screen><PageHeader title="Kiosk" back={{ label: "Attendance", href: "/apps/attendance" }} /><Note>Only Attendance Admins can open the kiosk.</Note></Screen>;
    default: return <Today me={me} />;
  }
}
