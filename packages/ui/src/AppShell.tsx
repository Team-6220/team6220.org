// The page frame every operations app uses: the header, and the screens for "loading", "signed out",
// "waiting for approval" and "something went wrong". The app's own screens go inside as children.
//
//   <AppShell title="BOM" state={state} who={name} onSignIn={() => auth.login("/apps/bom")}>
//     ...the app, shown only when state is "ready"...
//   </AppShell>
import type { ReactNode } from "react";

export type AppShellState = "loading" | "signed-out" | "pending" | "error" | "ready";

interface AppShellProps {
  title: string;
  state: AppShellState;
  /** The signed-in person's name, shown in the header. */
  who?: string;
  /** Shown when state is "error". */
  errorMessage?: string;
  /** A line under the header, for example "Demo data: nothing here is saved". */
  notice?: ReactNode;
  /** Extra links or buttons in the header. */
  nav?: ReactNode;
  onSignIn: () => void;
  children: ReactNode;
}

export function AppShell({ title, state, who, errorMessage, notice, nav, onSignIn, children }: AppShellProps) {
  return (
    <main className="t-page">
      <header className="t-header">
        <div>
          <p className="t-eyebrow">Los Al Robotics</p>
          <h1 className="t-title">{title}</h1>
        </div>
        <nav className="t-nav">
          {who && <span className="t-who">{who}</span>}
          {nav}
          <a className="t-button t-button--quiet" href="/apps/">
            Team apps
          </a>
        </nav>
      </header>

      {notice && <p className="t-demo">{notice}</p>}
      {state === "loading" && <p className="t-muted">Loading…</p>}
      {state === "error" && (
        <section className="t-panel t-panel--notice" role="alert">
          <h2>Something went wrong</h2>
          <p>{errorMessage ?? "We couldn't reach the team server."}</p>
        </section>
      )}
      {state === "signed-out" && (
        <section className="t-panel t-panel--notice">
          <h2>Sign in to use {title}</h2>
          <p>Team members sign in with Google on the team apps page.</p>
          <button className="t-button" type="button" onClick={onSignIn}>
            Sign in
          </button>
        </section>
      )}
      {state === "pending" && (
        <section className="t-panel t-panel--notice">
          <h2>Waiting for approval</h2>
          <p>A Web Admin needs to approve your account before you can use team apps.</p>
        </section>
      )}
      {state === "ready" && children}
    </main>
  );
}
