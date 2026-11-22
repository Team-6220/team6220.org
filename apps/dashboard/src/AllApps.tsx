// All apps: every app in its section. Drag apps to put them in your order inside their section, and drag a section by
// its ⋮⋮ to move the whole section (apps never move between sections). The order is also the rail's order, so
// Shift + 1 ... follow it. Right-click an app (long-press on a phone) to hide it; Hide section hides a whole section.
import { useRef, useState } from "react";
import { Btn, Card, PageHeader, Screen, useFramePrefs } from "@team6220/ui";
import { APPS, CATEGORY_TITLES, type AppEntry } from "./apps";
import type { DashView } from "./Dashboard";

const CATS = ["Operations", "Mechanical", "Strategy", "Fun", "Admin"];

function allowed(a: AppEntry, view: Extract<DashView, { kind: "approved" | "guest" }>) {
  if (view.kind === "guest") return a.status === "live" && (a.guests || a.access === "public");
  return a.access !== "web-admin" || view.isWebAdmin;
}

export function AllApps({ view }: { view: Extract<DashView, { kind: "approved" | "guest" }> }) {
  const [prefs, setPrefs] = useFramePrefs();
  const [menu, setMenu] = useState<string | null>(null);
  const dragApp = useRef<string | null>(null);
  const dragCat = useRef<string | null>(null);
  if (!prefs) return <Screen><p className="k-hint">Loading…</p></Screen>;

  const catOrder = CATS.slice().sort((a, b) => (prefs.catOrder.indexOf(a) + 99) % 99 - (prefs.catOrder.indexOf(b) + 99) % 99);
  const appsIn = (cat: string) => {
    const order = prefs.appOrder[cat] ?? [];
    return APPS.filter((a) => a.category === cat && allowed(a, view))
      .sort((a, b) => ((order.indexOf(a.id) + 999) % 999) - ((order.indexOf(b.id) + 999) % 999));
  };
  const hidden = APPS.filter((a) => a.category && prefs.hidden.includes(a.id) && allowed(a, view));

  const moveCat = (cat: string, to: number) => {
    const list = catOrder.filter((c) => c !== cat);
    list.splice(Math.max(0, Math.min(list.length, to)), 0, cat);
    setPrefs({ catOrder: list });
  };
  const moveApp = (cat: string, id: string, to: number) => {
    const list = appsIn(cat).map((a) => a.id).filter((x) => x !== id);
    list.splice(Math.max(0, Math.min(list.length, to)), 0, id);
    setPrefs({ appOrder: { ...prefs.appOrder, [cat]: list } });
  };
  const hide = (ids: string[]) => setPrefs({ hidden: Array.from(new Set(prefs.hidden.concat(ids))) });
  const show = (id: string) => setPrefs({ hidden: prefs.hidden.filter((h) => h !== id) });

  return (
    <Screen>
      <PageHeader
        title="All apps"
        sub="Drag apps to put them in your order inside their section, and drag a section by ⋮⋮ to move the whole section. Right-click an app to hide it, or use Hide section."
        actions={<Btn onClick={() => setPrefs({ catOrder: CATS.slice(), appOrder: {} })}>Reset order</Btn>}
      />
      <div className="dash-cats">
        {catOrder.map((cat, ci) => {
          const list = appsIn(cat).filter((a) => !prefs.hidden.includes(a.id));
          if (!list.length) return null;
          return (
            <section key={cat} className="k-section dash-cat"
              onDragOver={(e) => { if (dragCat.current) e.preventDefault(); }}
              onDrop={(e) => { if (dragCat.current && dragCat.current !== cat) { e.preventDefault(); moveCat(dragCat.current, ci); } dragCat.current = null; }}>
              <div className="k-section-head dash-cat-head">
                <span className="k-grip dash-cat-grip" draggable title="Drag to move this section" aria-hidden="true"
                  onDragStart={() => { dragCat.current = cat; }} onDragEnd={() => { dragCat.current = null; }}>⋮⋮</span>
                <h3 className="k-label">{CATEGORY_TITLES[cat] ?? cat}</h3>
                <span className="k-section-right k-row">
                  <span className="dash-phone-only k-move">
                    <button type="button" title="Move section up" aria-label="Move section up" onClick={() => moveCat(cat, ci - 1)}>▲</button>
                    <button type="button" title="Move section down" aria-label="Move section down" onClick={() => moveCat(cat, ci + 1)}>▼</button>
                  </span>
                  <Btn small onClick={() => hide(list.map((a) => a.id))}>Hide section</Btn>
                </span>
              </div>
              <div className="k-cards" style={{ "--k-cols": 3 } as React.CSSProperties}>
                {list.map((a, i) => (
                  <div key={a.id} className="dash-app" draggable
                    onDragStart={(e) => { e.stopPropagation(); dragApp.current = a.id; }}
                    onDragEnd={() => { dragApp.current = null; }}
                    onDragOver={(e) => { if (dragApp.current && appsIn(cat).some((x) => x.id === dragApp.current)) { e.preventDefault(); e.stopPropagation(); } }}
                    onDrop={(e) => { if (dragApp.current && dragApp.current !== a.id) { e.preventDefault(); e.stopPropagation(); moveApp(cat, dragApp.current, i); } }}
                    onContextMenu={(e) => { e.preventDefault(); setMenu(menu === a.id ? null : a.id); }}>
                    <Card
                      grip
                      icon={a.icon}
                      title={a.name}
                      href={a.status === "live" ? a.href : undefined}
                      pill={a.status !== "live" ? { label: "Coming soon", tone: "calm" } : a.access === "public" ? { label: "Public", tone: "gold" } : a.access === "web-admin" ? { label: "Web Admins only", tone: "calm" } : undefined}
                      lines={[a.description, ...(a.note ? [a.note] : [])]}
                    />
                    {menu === a.id && (
                      <div className="k-menu dash-app-menu" role="menu" aria-label={`${a.name} options`}>
                        {a.status === "live" && <a role="menuitem" className="dash-menu-item" href={a.href}>Open</a>}
                        <button type="button" role="menuitem" onClick={() => { moveApp(cat, a.id, 0); setMenu(null); }}>Move to the top</button>
                        <button type="button" role="menuitem" className="dash-danger" onClick={() => { hide([a.id]); setMenu(null); }}>Hide app</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {hidden.length > 0 && (
        <details>
          <summary className="k-btn dash-hidden-btn">Show hidden apps ({hidden.length})</summary>
          <div className="k-cards" style={{ "--k-cols": 3, marginTop: 12 } as React.CSSProperties}>
            {hidden.map((a) => (
              <Card key={a.id} dim icon={a.icon} title={a.name} lines={[a.description]} actions={<Btn onClick={() => show(a.id)}>Show again</Btn>} />
            ))}
          </div>
        </details>
      )}
    </Screen>
  );
}
