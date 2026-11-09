import { useCallback, useEffect, useState } from "react";
import { attendance, auth, type Viewer } from "@team6220/data";
import Kiosk from "./Kiosk";
import MemberView from "./MemberView";
import { errorMessage } from "./util";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "viewer"; viewer: Viewer }
  | { kind: "kiosk"; name: string };

/** Reads ?demo=admin|member|pending|signed-out (or ?demo=off) and switches demo mode for this tab. */
function applyDemoParam() {
  const url = new URL(window.location.href);
  const demo = url.searchParams.get("demo");
  if (demo === null) return;
  attendance.setDemoRole(demo === "off" ? null : (demo as attendance.DemoRole));
  url.searchParams.delete("demo");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export default function Attendance() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async () => {
    try {
      const viewer = await attendance.getViewer();
      if (viewer.kind === "member" && viewer.isAdmin && attendance.currentKiosk()) {
        setState({ kind: "kiosk", name: viewer.name });
      } else {
        setState({ kind: "viewer", viewer });
      }
    } catch (err) {
      console.warn("Couldn't load the signed-in member", err);
      setState({ kind: "error", message: errorMessage(err, "We couldn't reach the team login service.") });
    }
  }, []);

  useEffect(() => {
    applyDemoParam();
    void load();
  }, [load]);

  if (state.kind === "kiosk") {
    return (
      <Kiosk
        adminName={state.name}
        onClosed={(message) => {
          setNotice(message);
          void load();
        }}
      />
    );
  }

  const demo = attendance.demoRole();
  return (
    <main className="att">
      {demo && (
        <p className="att__demo" role="note">
          Demo mode ({demo}): made-up data, nothing is saved to the real attendance sheet.{" "}
          <a href="?demo=off">Leave demo</a>
        </p>
      )}
      <header className="att__header">
        <div>
          <p className="att__eyebrow">Los Al Robotics</p>
          <h1 className="att__title">Attendance</h1>
        </div>
        <nav className="att__nav">
          {state.kind === "viewer" && state.viewer.kind !== "signed-out" && (
            <span className="att__who">{state.viewer.name}</span>
          )}
          <a className="t-button t-button--quiet" href="/">
            Team site
          </a>
          <a className="t-button t-button--quiet" href="/apps">
            Team apps
          </a>
        </nav>
      </header>

      {notice && (
        <p className="att__flash" role="status">
          {notice}
        </p>
      )}
      {state.kind === "loading" && (
        <p className="att__muted" role="status">
          Checking sign-in…
        </p>
      )}
      {state.kind === "error" && (
        <div className="att__panel" role="alert">
          <p>{state.message} Try again in a minute.</p>
          <button type="button" className="t-button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}
      {state.kind === "viewer" && state.viewer.kind === "signed-out" && <SignedOut />}
      {state.kind === "viewer" && state.viewer.kind === "pending" && (
        <div className="att__panel att__panel--notice">
          <h2>Waiting for approval</h2>
          <p>
            You're signed in, but a web admin hasn't approved your account or given you the <b>Team Member</b> badge
            yet. Ask a team lead, then reload this page.
          </p>
        </div>
      )}
      {state.kind === "viewer" && state.viewer.kind === "member" && (
        <MemberView
          isAdmin={state.viewer.isAdmin}
          onKioskOpened={() => {
            setNotice(undefined);
            setState({ kind: "kiosk", name: (state.viewer as { name: string }).name });
          }}
        />
      )}
    </main>
  );
}

function SignedOut() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div className="att__panel">
      <h2>Sign in to see attendance</h2>
      <p>
        Attendance is for team members. Sign in on the <a href="/apps">team apps page</a> with Google, then come back
        here.
      </p>
      <p className="att__actions">
        <button
          type="button"
          className="t-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            if (attendance.demoRole()) {
              window.location.assign("?demo=member");
              return;
            }
            try {
              await auth.login("/apps/attendance");
            } catch (err) {
              setError(errorMessage(err, "Couldn't start sign-in."));
              setBusy(false);
            }
          }}
        >
          {busy ? "Opening sign-in…" : "Sign in"}
        </button>
        <a className="t-button t-button--quiet" href="/apps">
          Go to team apps
        </a>
      </p>
      {error && (
        <p className="att__error" role="alert">
          {error}
        </p>
      )}
      <p className="att__muted">Signing in at a meeting? Use the kiosk at the door; you don't need to sign in here.</p>
    </div>
  );
}
