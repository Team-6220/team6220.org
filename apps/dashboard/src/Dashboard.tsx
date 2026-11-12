import { useEffect, useState } from "react";
import { auth, BADGES, type Member } from "@team6220/data";
import { APPS, type AppEntry } from "./apps";

type View =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "pending"; member: Member }
  | { kind: "approved"; member: Member }
  | { kind: "error"; message: string };

export default function Dashboard() {
  const [view, setView] = useState<View>({ kind: "loading" });
  // Cosmetic: only decides whether the Web Admin cards are shown. The apps and their servers check the badge for real.
  const [isWebAdmin, setIsWebAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const member = await auth.getMember();
        if (!member) return setView({ kind: "signed-out" });
        const access = await auth.getAccess();
        if (access === "approved") setIsWebAdmin(await auth.hasBadge(BADGES.webAdmin).catch(() => false));
        setView(access === "approved" ? { kind: "approved", member } : { kind: "pending", member });
      } catch (err) {
        console.warn("Couldn't load the signed-in member", err);
        if (!cancelled) setView({ kind: "error", message: "We couldn't reach the team login service." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="dash">
      <header className="dash__header">
        <div>
          <p className="dash__eyebrow">Los Al Robotics</p>
          <h1 className="dash__title">Team apps</h1>
        </div>
        {"member" in view && <MemberBadge member={view.member} />}
      </header>

      {view.kind === "loading" && <p className="dash__status" role="status">Checking sign-in…</p>}
      {view.kind === "signed-out" && <SignInPrompt />}
      {view.kind === "pending" && <PendingNotice />}
      {view.kind === "error" && (
        <div className="dash__panel" role="alert">
          <p>{view.message} Try again in a minute.</p>
          <SignInButton label="Sign in again" />
        </div>
      )}

      {view.kind === "approved" && <AppGrid apps={APPS.filter((a) => a.access !== "web-admin" || isWebAdmin)} />}
      {(view.kind === "signed-out" || view.kind === "pending" || view.kind === "error") && (
        <>
          <h2 className="dash__section">Open to everyone</h2>
          <AppGrid apps={APPS.filter((a) => a.access === "public" && a.status === "live")} />
        </>
      )}
    </main>
  );
}

function MemberBadge({ member }: { member: Member }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="dash__member">
      {member.photoUrl ? (
        <img className="dash__avatar" src={member.photoUrl} alt="" width={36} height={36} referrerPolicy="no-referrer" />
      ) : (
        <span className="dash__avatar dash__avatar--blank" aria-hidden="true">
          {member.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="dash__name">{member.name}</span>
      <button
        type="button"
        className="t-button t-button--quiet"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void auth.logout();
        }}
      >
        Sign out
      </button>
    </div>
  );
}

function SignInButton({ label = "Sign in" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <>
      <button
        type="button"
        className="t-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            await auth.login("/apps");
          } catch (err) {
            console.warn("Sign-in failed to start", err);
            setError(err instanceof Error ? err.message : "Couldn't start sign-in.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening sign-in…" : label}
      </button>
      {error && (
        <p className="dash__error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function SignInPrompt() {
  return (
    <div className="dash__panel">
      <h2>Sign in to use team apps</h2>
      <p>
        Team members sign in with Google. New accounts wait for a web admin to approve them, so sign in once and
        then ask a lead to approve you.
      </p>
      <SignInButton />
    </div>
  );
}

function PendingNotice() {
  return (
    <div className="dash__panel dash__panel--notice">
      <h2>Waiting for approval</h2>
      <p>
        You're signed in, but a web admin hasn't approved your account or given you the <b>Team Member</b> badge
        yet. Ask a team lead to approve you, then reload this page.
      </p>
    </div>
  );
}

function AppGrid({ apps }: { apps: AppEntry[] }) {
  return (
    <ul className="dash__grid">
      {apps.map((app) => (
        <li key={app.id}>
          <AppCard app={app} />
        </li>
      ))}
    </ul>
  );
}

function AppCard({ app }: { app: AppEntry }) {
  const planned = app.status === "planned" || !app.href;
  const body = (
    <>
      {app.icon && <img className="card__icon" src={app.icon} alt="" width={40} height={40} />}
      <span className="card__name">{app.name}</span>
      <span className="card__desc">{app.description}</span>
      {app.note && !planned && <span className="card__note">{app.note}</span>}
      {planned && <span className="card__tag">Planned</span>}
      {!planned && app.access === "public" && <span className="card__tag card__tag--public">Public</span>}
    </>
  );
  return planned ? (
    <div className="card card--planned" aria-disabled="true">
      {body}
    </div>
  ) : (
    <a className="card" href={app.href}>
      {body}
    </a>
  );
}
