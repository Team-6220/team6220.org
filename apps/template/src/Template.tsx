import { useEffect, useState } from "react";
import { auth, type Member } from "@team6220/data";

// The same four states every app has: still loading, signed out, signed in but not approved yet, approved.
type View =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "pending"; member: Member }
  | { kind: "approved"; member: Member }
  | { kind: "error"; message: string };

export default function Template() {
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const member = await auth.getMember();
        if (!member) return setView({ kind: "signed-out" });
        const access = await auth.getAccess();
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
    <main className="t-page tpl">
      <header className="t-header">
        <div>
          <p className="t-eyebrow">Los Al Robotics</p>
          <h1 className="t-title">Template app</h1>
        </div>
        <nav className="t-nav">
          {(view.kind === "approved" || view.kind === "pending") && <span className="t-who">{view.member.name}</span>}
          <a className="t-button t-button--quiet" href="/apps/">
            Team apps
          </a>
        </nav>
      </header>

      {view.kind === "loading" && <p className="t-muted">Loading…</p>}

      {view.kind === "error" && (
        <section className="t-panel t-panel--notice" role="alert">
          <h2>Something went wrong</h2>
          <p>{view.message}</p>
        </section>
      )}

      {view.kind === "signed-out" && (
        <section className="t-panel t-panel--notice">
          <h2>Sign in to use this app</h2>
          <p>Team members sign in with Google on the team apps page.</p>
          <button className="t-button" type="button" onClick={() => void auth.login("/apps/template")}>
            Sign in
          </button>
        </section>
      )}

      {view.kind === "pending" && (
        <section className="t-panel t-panel--notice">
          <h2>Waiting for approval</h2>
          <p>A Web Admin needs to approve your account before you can use team apps.</p>
        </section>
      )}

      {view.kind === "approved" && <Examples />}
    </main>
  );
}

/** What an approved member sees: one of each shared piece, then the steps to make it your own. */
function Examples() {
  return (
    <div className="tpl__examples">
      <section className="t-panel">
        <h2>Buttons</h2>
        <div className="tpl__buttons">
          <button className="t-button" type="button">
            Main action
          </button>
          <button className="t-button t-button--quiet" type="button">
            Quiet action
          </button>
          <button className="t-button" type="button" disabled>
            Disabled
          </button>
        </div>
      </section>

      <section className="t-panel">
        <h2>Form fields</h2>
        <label className="t-field">
          Name
          <input type="text" placeholder="Your name" />
          <span className="t-hint">A hint goes under the field.</span>
        </label>
        <label className="t-field">
          Subteam
          <select defaultValue="">
            <option value="" disabled>
              Choose one
            </option>
            <option>Mechanical</option>
            <option>Electrical</option>
            <option>Programming</option>
          </select>
        </label>
      </section>

      <section className="t-panel">
        <h2>Status messages</h2>
        <p className="t-status t-status--ok">Saved. Everything went well.</p>
        <p className="t-status t-status--warn">Heads up. Something needs a look.</p>
        <p className="t-status t-status--error">That didn't work. Try again.</p>
      </section>

      <section className="t-panel">
        <h2>Table</h2>
        <table className="t-table">
          <thead>
            <tr>
              <th>Part</th>
              <th>Location</th>
              <th>Qty</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Bearing</td>
              <td>Drawer A</td>
              <td>12</td>
            </tr>
            <tr>
              <td>Belt</td>
              <td>Shelf 2</td>
              <td>3</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="t-panel">
        <h2>Images and icons</h2>
        <p>Team logos are shared files: use them straight from the shared assets folder.</p>
        <img className="tpl__logo" src="/assets/shared/logos/6220LogoGold.png" alt="Team 6220 logo" />
        <p className="t-muted">
          Icons come from <code>/assets/shared/scripts/icons.js</code>, the sidebar and light/dark button come with the page
          layout, and your own images go in <code>apps/your-app/media/</code>.
        </p>
      </section>

      <section className="t-panel t-panel--notice">
        <h2>Make it yours</h2>
        <ol className="tpl__steps">
          <li>Copy the folder <code>apps/template</code> to <code>apps/your-app</code> and rename the package and files.</li>
          <li>Copy <code>src/pages/apps/template/index.astro</code> to your own page and point it at your app.</li>
          <li>Add the app to <code>packages/assets/data/apps.json</code> so the dashboard and sidebar list it.</li>
          <li>Replace the examples above with your screens. Keep the four sign-in states.</li>
        </ol>
        <p>The full steps are in <code>docs/ADD-AN-APP.md</code>.</p>
      </section>
    </div>
  );
}
