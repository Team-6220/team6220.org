import { useCallback, useEffect, useMemo, useState } from "react";
import { auth, site } from "@team6220/data";
import { Icon } from "@team6220/ui";
import Editor from "./Editor";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "viewer"; viewer: site.SiteViewer };

/** ?demo=admin turns on demo mode for this tab (no sign-in, nothing real is touched); ?demo=off leaves it. */
function applyDemoParam() {
  const url = new URL(window.location.href);
  const demo = url.searchParams.get("demo");
  if (demo === null) return;
  site.setDemoMode(demo === "admin");
  url.searchParams.delete("demo");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export default function Site() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [areaId, setAreaId] = useState<site.AreaId>("summer-camp");

  const load = useCallback(async () => {
    try {
      setState({ kind: "viewer", viewer: await site.getViewer() });
    } catch (err) {
      console.warn("Couldn't load the signed-in member", err);
      setState({ kind: "error", message: "We couldn't reach the team login service." });
    }
  }, []);

  useEffect(() => {
    applyDemoParam();
    void load();
  }, [load]);

  const areas = useMemo(() => Object.values(site.AREAS), []);
  const demo = site.demoMode();
  const real = site.opensRealPullRequests();

  return (
    <main className="t-page site">
      {!real && (
        <p className="t-demo" role="note">
          Demo: {demo ? "you're in demo mode, " : ""}no pull request is opened. Submitting only shows what would happen.
          {demo && (
            <>
              {" "}
              <a href="?demo=off">Leave demo</a>
            </>
          )}
        </p>
      )}
      <header className="t-header">
        <div>
          <p className="t-eyebrow">Los Al Robotics</p>
          <h1 className="t-title">Site Manager</h1>
        </div>
        <nav className="t-nav">
          {state.kind === "viewer" && state.viewer.kind !== "signed-out" && <span className="t-who">{state.viewer.name}</span>}
          <a className="t-button t-button--quiet" href="/apps">
            Team apps
          </a>
        </nav>
      </header>

      {state.kind === "loading" && (
        <p className="t-muted" role="status">
          Checking sign-in…
        </p>
      )}
      {state.kind === "error" && (
        <div className="t-panel" role="alert">
          <p>{state.message} Try again in a minute.</p>
          <button type="button" className="t-button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}
      {state.kind === "viewer" && state.viewer.kind === "signed-out" && <SignedOut />}
      {state.kind === "viewer" && state.viewer.kind === "pending" && (
        <div className="t-panel t-panel--notice">
          <h2>Waiting for approval</h2>
          <p>
            You're signed in, but a web admin hasn't approved your account or given you the <b>Team Member</b> badge yet.
          </p>
        </div>
      )}
      {state.kind === "viewer" && state.viewer.kind === "member" && (
        <div className="t-panel t-panel--notice">
          <h2>Web Admins only</h2>
          <p>
            The Site Manager changes what the public website says, so it needs the <b>Web Admin</b> badge. Ask a Web Admin if you need a
            change made.
          </p>
        </div>
      )}
      {state.kind === "viewer" && state.viewer.kind === "admin" && (
        <>
          <div className="site__bar">
            <label>
              <b>Part of the site</b>{" "}
              <select value={areaId} onChange={(e) => setAreaId(e.target.value as site.AreaId)}>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <a className="site__link" href={site.openPullRequestsUrl()} target="_blank" rel="noopener">
              Open Site Manager pull requests on GitHub <Icon name="external" inline />
            </a>
          </div>
          <Editor key={areaId} areaId={areaId} />
        </>
      )}
    </main>
  );
}

function SignedOut() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div className="t-panel">
      <h2>Sign in to use the Site Manager</h2>
      <p>
        The Site Manager is for Web Admins. Sign in with Google, then come back here. (Developers can try it without signing in at{" "}
        <a href="?demo=admin">?demo=admin</a>.)
      </p>
      <p className="site__actions">
        <button
          type="button"
          className="t-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              await auth.login("/apps/site");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't start sign-in.");
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
        <p className="site__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
