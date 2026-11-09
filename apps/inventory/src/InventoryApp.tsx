// Inventory app root, mounted at /apps/inventory (src/pages/apps/inventory/index.astro).
// Signed-out visitors are sent to /apps to sign in. Data comes from @team6220/data (mock or Wix).
import { useEffect, useState } from "react";
import {
  INVENTORY_SECTIONS,
  connectInventory,
  getInventorySession,
  inventoryBackend,
  type InventorySection,
  type InventoryService,
  type MemberSession,
  type Snapshot,
} from "@team6220/data/inventory";
import { AppProvider, errorMessage, useApp } from "./context.tsx";
import { SECTIONS } from "./sections.ts";
import { SectionPage } from "./views/SectionPage.tsx";
import { AuditsPage } from "./views/AuditsPage.tsx";
import { PackingPage } from "./views/PackingPage.tsx";
import { SettingsPage } from "./views/SettingsPage.tsx";

type View = InventorySection | "audits" | "packing" | "settings";
const OTHER_VIEWS: { id: View; label: string }[] = [
  { id: "audits", label: "Inventory Audits" },
  { id: "packing", label: "Packing List" },
  { id: "settings", label: "Settings" },
];
const ALL_VIEWS = [...INVENTORY_SECTIONS, ...OTHER_VIEWS.map((v) => v.id)] as View[];

function viewFromHash(): View {
  const h = (typeof location !== "undefined" ? location.hash : "").replace(/^#\/?/, "");
  return (ALL_VIEWS as string[]).includes(h) ? (h as View) : "parts";
}

type LoadState =
  | { state: "loading" }
  | { state: "signed-out" }
  | { state: "error"; message: string }
  | { state: "ready"; session: MemberSession; svc: InventoryService; snap: Snapshot };

export default function InventoryApp() {
  const [load, setLoad] = useState<LoadState>({ state: "loading" });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const session = await getInventorySession();
        if (!session.loggedIn) {
          if (alive) setLoad({ state: "signed-out" });
          return;
        }
        const svc = await connectInventory(session);
        const snap = await svc.loadAll();
        if (alive) setLoad({ state: "ready", session, svc, snap });
      } catch (e) {
        console.warn(e);
        if (alive) setLoad({ state: "error", message: errorMessage(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (load.state === "loading") {
    return (
      <div className="inv-center">
        <div className="inv-spinner" aria-hidden="true" />
        Loading inventory…
      </div>
    );
  }
  if (load.state === "signed-out") {
    return (
      <div className="inv-center inv-signin">
        <h1>
          Inventory <span>6220</span>
        </h1>
        <p>The team inventory is for signed-in team members.</p>
        <a className="inv-btn primary" href="/apps">
          Sign in at /apps
        </a>
      </div>
    );
  }
  if (load.state === "error") {
    return (
      <div className="inv-center">
        <p>Couldn’t load the inventory: {load.message}</p>
        <button type="button" className="inv-btn" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <AppProvider svc={load.svc} session={load.session} initial={load.snap} demo={inventoryBackend() === "mock"}>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { svc, replaceSnapshot, saving, demo, session, perms, L } = useApp();
  const [view, setView] = useState<View>(viewFromHash);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const onHash = () => {
      setView(viewFromHash());
      setNavOpen(false);
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  // Pick up other people's changes: every 60 s (20 s while an audit is running), only while the tab is visible.
  const auditRunning = L.tables.auditSessions.some((s) => s.status === "active");
  useEffect(() => {
    if (demo) return;
    const ms = auditRunning && view === "audits" ? 20000 : 60000;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible" || saving > 0) return;
      svc.loadAll().then(replaceSnapshot, (e) => console.warn("refresh failed", e));
    }, ms);
    return () => clearInterval(t);
  }, [svc, replaceSnapshot, demo, auditRunning, view, saving]);

  const counts = (k: InventorySection) => L.rows(k).length;
  return (
    <div className="inv-app">
      <header className="inv-topbar">
        <button type="button" className="inv-icon-btn inv-menu-btn" aria-label="Menu" aria-expanded={navOpen} onClick={() => setNavOpen((o) => !o)}>
          ☰
        </button>
        <a className="inv-brand" href="#/parts">
          Inventory <span>6220</span>
        </a>
        <span className={`inv-save ${saving ? "saving" : ""}`} aria-live="polite">
          {saving ? "Saving…" : "All changes saved"}
        </span>
        <span className="inv-who">
          {session.name ?? "Signed in"}
          {perms.manage ? " · Inventory Manager" : ""}
        </span>
      </header>
      {demo && (
        <div className="inv-demo-banner" role="note">
          Demo data: changes are not saved and reset when you reload. The real inventory moves here once the Wix collections are set up.
        </div>
      )}
      <div className="inv-layout">
        <nav className={`inv-nav ${navOpen ? "open" : ""}`} aria-label="Inventory sections">
          <div className="inv-nav-group">Inventory</div>
          {INVENTORY_SECTIONS.map((k) => (
            <a key={k} href={`#/${k}`} aria-current={view === k ? "page" : undefined}>
              <span>{SECTIONS[k].title}</span>
              <span className="inv-count">{counts(k)}</span>
            </a>
          ))}
          <div className="inv-nav-group">Team</div>
          {OTHER_VIEWS.map((v) => (
            <a key={v.id} href={`#/${v.id}`} aria-current={view === v.id ? "page" : undefined}>
              <span>{v.label}</span>
              {v.id === "audits" && auditRunning && <span className="inv-dot" title="Audit in progress" />}
            </a>
          ))}
          <a className="inv-nav-back" href="/apps">
            ← All apps
          </a>
        </nav>
        <main className="inv-main" id="inv-main">
          {(INVENTORY_SECTIONS as readonly string[]).includes(view) && <SectionPage key={view} cfg={SECTIONS[view as InventorySection]} />}
          {view === "audits" && <AuditsPage />}
          {view === "packing" && <PackingPage />}
          {view === "settings" && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}
