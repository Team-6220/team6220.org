// Account → Keybinds: every shortcut in one pop-up. Click a keybind, then press the keys you want (Esc cancels).
// Conflicts inside one group show in red. Keys belong to places, not apps: App 1 is the first place in the rail.
import { useMemo, useState } from "react";
import { Btn, frame, useFramePrefs } from "@team6220/ui";

interface Row { action: string; label: string; note?: string; arrows?: boolean }
const n10 = (prefix: string, label: (i: number) => string): Row[] => Array.from({ length: 10 }, (_, i) => ({ action: `${prefix}${i + 1}`, label: label(i + 1) }));

const SITE: { title: string; groups: { sub?: string; rows: Row[]; note?: string }[] }[] = [
  { title: "General", groups: [{ rows: [
    { action: "pins", label: "Open the pins menu", note: "Opens under your mouse pointer. Clicking the pin icon opens it next to the icon." },
    { action: "close", label: "Close the open menu or pop-up" },
    { action: "search", label: "Search" },
    { action: "task", label: "New task" },
    { action: "project", label: "New project" },
    { action: "panel", label: "Hide or show the menu panel" },
    { action: "rail", label: "Hide or show the app rail" },
    { action: "fullscreen", label: "Full screen anywhere", note: "Hides the panel and the rail; press it again to bring them back. Ctrl + F stays the browser's Find." },
  ] }] },
  { title: "Apps", groups: [
    { sub: "Jump to an app by its place in your rail", rows: n10("app", (i) => `App ${i}${i === 1 ? " (Home)" : ""}`),
      note: "The keys follow the position, not the app: move an app in your rail and it gets that position's key. A number past your last app opens the last one." },
    { sub: "Move between apps", rows: [{ action: "nextApp", label: "Next app", arrows: true }, { action: "prevApp", label: "Previous app", arrows: true }] },
  ] },
  { title: "Sidebar screens", groups: [
    { sub: "Jump to a screen of the open app", rows: n10("screen", (i) => `Screen ${i}`),
      note: "Numbers open the sidebar screens in order, unless the pins menu is open. A number past the last screen opens the last one." },
    { sub: "Move between screens", rows: [{ action: "nextScreen", label: "Next screen", arrows: true }, { action: "prevScreen", label: "Previous screen", arrows: true }] },
  ] },
];

/** GoldSim's keys, saved with the rest (GoldSim reads them once it sits inside the frame; until then it uses these defaults). */
const GOLDSIM: { sub: string; rows: [string, string][] }[] = [
  { sub: "Driving a robot", rows: [["Drive forward", "W"], ["Drive back", "S"], ["Strafe left", "A"], ["Strafe right", "D"], ["Turn left", "Q"], ["Turn right", "E"], ["Intake", "Shift"], ["Shoot", "Space"], ["Climb", "C"], ["Deploy", "X"], ["Place", "F"], ["Climb level 1", "1"], ["Climb level 2", "2"], ["Climb level 3", "3"], ["Climb level off", "0"]] },
  { sub: "Match and replay", rows: [["Pause or resume the match", "P"], ["Rotate the field view", "R"], ["Rotate the field view back", "Shift + R"], ["Play or pause a replay", "Space"], ["Back 2 seconds in a replay", "←"], ["Forward 2 seconds in a replay", "→"]] },
  { sub: "Robot editor", rows: [["Zoom in", "="], ["Zoom out", "−"], ["Reset the view", "0"], ["Copy", "Ctrl + C"], ["Paste", "Ctrl + V"], ["Duplicate", "Ctrl + D"], ["Nudge up", "↑"], ["Nudge down", "↓"], ["Nudge left", "←"], ["Nudge right", "→"], ["Rotate left", "Q"], ["Rotate right", "E"], ["Delete", "Delete"], ["Deselect", "Esc"]] },
];

export function Keybinds() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useFramePrefs();
  const [listening, setListening] = useState<string | null>(null);
  const defaults = useMemo(() => frame().defaultKeys?.() ?? {}, []);
  if (!prefs) return null;
  const keyOf = (a: string) => prefs.keys[a] ?? defaults[a] ?? "";
  const pins = frame().pins?.() ?? [];

  const clashes = (actions: string[]) => {
    const seen = new Map<string, number>();
    actions.forEach((a) => { const k = keyOf(a); if (k) seen.set(k, (seen.get(k) ?? 0) + 1); });
    return (a: string) => (seen.get(keyOf(a)) ?? 0) > 1;
  };
  const siteActions = SITE.flatMap((s) => s.groups.flatMap((g) => g.rows.map((r) => r.action)));
  const isClash = clashes(siteActions.filter((a) => !/^(screen|pin)/.test(a)));
  const isScreenClash = clashes(siteActions.filter((a) => /^screen/.test(a)));

  const capture = (action: string, e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (listening !== action) return;
    if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
    e.preventDefault();
    if (e.key === "Escape") return setListening(null);
    const name = frame().keyName?.(e.nativeEvent) ?? "";
    if (!name) return;
    if (action.startsWith("pin:")) setPrefs({ pinKeys: { ...prefs.pinKeys, [action.slice(4)]: name } });
    else setPrefs({ keys: { ...prefs.keys, [action]: name } });
    setListening(null);
  };
  const keyButton = (action: string, value: string, bad = false) => (
    <button type="button" className={`dash-key${listening === action ? " is-on" : ""}${bad ? " is-bad" : ""}`} title={bad ? `Another keybind here uses ${value}` : "Click, then press the keys you want"}
      onClick={() => setListening(action)} onKeyDown={(e) => capture(action, e)} onBlur={() => listening === action && setListening(null)}>
      {listening === action ? "Press a key…" : value || "Unset"}
    </button>
  );

  return (
    <>
      <div className="k-stack" style={{ gap: 8 }}>
        <div><Btn kind="primary" onClick={() => setOpen(true)}>Open keybinds</Btn></div>
        <p className="k-hint" style={{ margin: 0 }}>Every shortcut in one place: the pins menu, search, new task, your apps, your sidebar screens, each pin, and GoldSim. Click a keybind, then press the keys you want.</p>
      </div>
      {open && (
        <div className="dash-modal" role="dialog" aria-label="Keybinds" onKeyDown={(e) => { if (e.key === "Escape" && !listening) setOpen(false); }}>
          <div className="dash-modal-box">
            <div className="dash-modal-head">
              <h2>Keybinds</h2>
              <Btn small onClick={() => setPrefs({ keys: {}, pinKeys: {}, arrows: false })}>Reset all</Btn>
              <button type="button" className="dash-x" aria-label="Close keybinds" title="Close" onClick={() => setOpen(false)}>✕</button>
            </div>
            {SITE.map((sec) => (
              <details key={sec.title} className="dash-kb-sec" open>
                <summary>{sec.title}</summary>
                {sec.groups.map((g) => (
                  <div key={g.sub ?? sec.title} className={g.rows.some((r) => r.arrows) && !prefs.arrows ? "dash-kb-off" : ""}>
                    {g.sub && <div className="k-label dash-kb-sub">{g.sub}</div>}
                    {g.rows.map((r) => (
                      <div key={r.action} className="dash-kb-row">
                        <span>{r.label}{r.note && <><br /><span className="k-hint">{r.note}</span></>}</span>
                        {keyButton(r.action, keyOf(r.action), r.action.startsWith("screen") ? isScreenClash(r.action) : isClash(r.action))}
                      </div>
                    ))}
                    {g.note && <p className="k-hint dash-kb-note">{g.note}</p>}
                  </div>
                ))}
              </details>
            ))}
            <div className="dash-kb-sec dash-kb-arrows">
              <label className="k-toggle">
                <input type="checkbox" checked={prefs.arrows} onChange={(e) => setPrefs({ arrows: e.target.checked })} />
                <span>Use the arrow keys to move between apps and screens<br /><span className="k-hint">Off by default, so the arrow keys scroll the page.</span></span>
              </label>
            </div>
            <details className="dash-kb-sec" open>
              <summary>Pins</summary>
              {pins.map((p, i) => (
                <div key={p.id} className="dash-kb-row">
                  <span>{p.name}<br /><span className="k-hint">{i < 10 ? "Works while the pins menu is open" : "No key by default. Click to give it one."}</span></span>
                  {keyButton(`pin:${p.id}`, p.key)}
                </div>
              ))}
              <p className="k-hint dash-kb-note">A new pin gets the next free key, up to 0 (the tenth). Pins after the tenth get no key by default, but you can give any of them one here.</p>
            </details>
            <details className="dash-kb-sec">
              <summary>GoldSim</summary>
              {GOLDSIM.map((g) => (
                <div key={g.sub}>
                  <div className="k-label dash-kb-sub">{g.sub}</div>
                  {g.rows.map(([label, key]) => {
                    const action = `gs:${g.sub}:${label}`;
                    const value = prefs.keys[action] ?? key;
                    const bad = g.rows.filter(([l, k]) => (prefs.keys[`gs:${g.sub}:${l}`] ?? k) === value).length > 1;
                    return <div key={label} className="dash-kb-row"><span>{label}</span>{keyButton(action, value, bad)}</div>;
                  })}
                </div>
              ))}
            </details>
          </div>
        </div>
      )}
    </>
  );
}
