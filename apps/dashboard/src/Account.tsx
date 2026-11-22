// Account and settings. Everything here follows your account to every device: your profile on the team, your
// subteams, your notifications and Discord link, the frame's layout, which apps you see, your keybinds and your pins.
import { useEffect, useState } from "react";
import { account, ops, type Member, type Profile } from "@team6220/data";
import { Btn, Field, Fields, KeyValue, Note, PageHeader, Screen, Section, Split, frame, useFramePrefs } from "@team6220/ui";
import { APPS } from "./apps";
import { Keybinds } from "./Keybinds";
import { NotificationSettings } from "./NotificationSettings";
import { PhotoField } from "./PhotoField";

const CATS = ["Operations", "Mechanical", "Strategy", "Fun", "Admin"];
const THEME_KEY = "team6220.theme";

export function Account({ member }: { member: Member }) {
  const [prefs, setPrefs] = useFramePrefs();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Partial<Profile>>({});
  const [saved, setSaved] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [subteams, setSubteams] = useState<string[]>([]);
  const [allSubteams, setAllSubteams] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem(THEME_KEY) ?? "dark"; } catch { return "dark"; } });
  const [newPin, setNewPin] = useState<{ name: string; url: string } | null>(null);
  const [deleting, setDeleting] = useState<"" | "ask" | "busy">("");

  useEffect(() => {
    account.getAccount().then((a) => {
      setProfile(a.profile);
      setDraft(a.profile);
      // Settings saved on the server win over this browser's, so they follow the account.
      if (a.prefs) frame().setPrefs?.(a.prefs as never);
    }, () => setError("We couldn't load your account. Try again in a minute."));
    ops.getViewer().then((v) => {
      if (v.kind !== "member") return;
      setRoles(v.me.badges.filter((b) => !b.startsWith("Subteam: ")));
      setSubteams(v.me.subteams);
      setAllSubteams(v.subteams);
    }, () => undefined);
  }, []);

  const student = roles.includes("Team Member") && !!profile?.studentId;
  const saveProfile = async () => {
    setError("");
    try {
      const p = await account.saveProfile({ firstName: draft.firstName, lastName: draft.lastName, githubLogin: draft.githubLogin });
      setProfile(p);
      setSaved("Saved");
      setTimeout(() => setSaved(""), 1500);
    } catch {
      setError("That didn't save. Check your connection and try again.");
    }
  };
  const toggleSubteam = async (name: string) => {
    const next = subteams.includes(name) ? subteams.filter((s) => s !== name) : subteams.concat([name]);
    setSubteams(next);
    try { setSubteams(await ops.setMySubteams(next)); } catch { setError("Your subteams didn't save. Try again."); }
  };
  const pickTheme = (t: string) => {
    setTheme(t);
    try { localStorage.setItem(THEME_KEY, t); } catch { /* still applies for now */ }
    const dark = t === "dark" || (t === "device" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  };

  if (!prefs) return <Screen><p className="k-hint">Loading…</p></Screen>;
  const links = frame().links?.() ?? [];

  return (
    <Screen>
      <PageHeader title="Account" sub="Settings here follow your account to every device." />
      {error && <Note tone="bad">{error}</Note>}
      <Split
        left={<>
          <Section title="You">
            <div className="k-box k-form">
              <Fields cols={1}>
                <Field label="First name"><input className="k-input" value={draft.firstName ?? ""} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} /></Field>
                <Field label="Last name"><input className="k-input" value={draft.lastName ?? ""} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} /></Field>
                <Field label="GitHub username" hint="Only needed when you sync a task with GitHub"><input className="k-input" value={draft.githubLogin ?? ""} onChange={(e) => setDraft({ ...draft, githubLogin: e.target.value })} /></Field>
                {profile && <PhotoField current={profile.photoUrl ?? member.photoUrl} />}
              </Fields>
              <div className="k-row"><Btn kind="primary" onClick={saveProfile}>Save</Btn>{saved && <span className="k-hint" role="status">{saved}</span>}</div>
            </div>
            <Note>Your name starts as your Google name. Once you change it here, it stays what you typed. For students your name and the team roster are the same record: change it here and the roster updates, and if the roster changes, so does this.</Note>
            <KeyValue items={[
              ["Signed in with", `Google${profile?.email ? ` · ${profile.email}` : ""}`],
              ["Roles", roles.join(", ") || "None yet"],
              ...(profile?.grade ? [["Grade", profile.grade] as [string, string]] : []),
              ...(profile?.studentId ? [["Student ID", profile.studentId] as [string, string]] : []),
            ]} />
          </Section>
          {(student || subteams.length > 0 || roles.includes("Team Member")) && allSubteams.length > 0 && (
            <Section title="Subteam · students only">
              <div className="k-box k-form">
                <Fields cols={2}>
                  {allSubteams.map((s) => (
                    <label key={s} className="k-toggle"><input type="checkbox" checked={subteams.includes(s)} onChange={() => toggleSubteam(s)} />{s}</label>
                  ))}
                </Fields>
              </div>
            </Section>
          )}
          <NotificationSettings />
          <Section title="Layout">
            <div className="k-box k-form">
              <Field label="Desktop layout">
                <select className="k-input" value={prefs.layout} onChange={(e) => setPrefs({ layout: e.target.value as "rail" | "split" | "top" })}>
                  <option value="rail">Rail and panel (default)</option>
                  <option value="split">Apps left, options right</option>
                  <option value="top">Apps on top</option>
                </select>
              </Field>
              <label className="k-toggle"><input type="checkbox" checked={prefs.showArrow} onChange={(e) => setPrefs({ showArrow: e.target.checked })} />Show the top arrow next to the app name on mobile</label>
              <Field label="Theme">
                <select className="k-input" value={theme} onChange={(e) => pickTheme(e.target.value)}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="device">Match my device</option>
                </select>
              </Field>
            </div>
          </Section>
        </>}
        right={<>
          <Section title="Visible apps">
            <div className="k-box dash-vis">
              {CATS.map((c) => {
                const list = APPS.filter((a) => a.category === c);
                if (!list.length) return null;
                const allOn = list.every((a) => !prefs.hidden.includes(a.id));
                return (
                  <div key={c} className="dash-vis-group">
                    <label className="k-toggle dash-strong"><input type="checkbox" checked={allOn} onChange={() => {
                      const ids = list.map((a) => a.id);
                      setPrefs({ hidden: allOn ? Array.from(new Set(prefs.hidden.concat(ids))) : prefs.hidden.filter((h) => !ids.includes(h)) });
                    }} />{c} (section)</label>
                    <div className="dash-vis-apps">
                      {list.map((a) => (
                        <label key={a.id} className="k-toggle"><input type="checkbox" checked={!prefs.hidden.includes(a.id)} onChange={() =>
                          setPrefs({ hidden: prefs.hidden.includes(a.id) ? prefs.hidden.filter((h) => h !== a.id) : prefs.hidden.concat([a.id]) })} />{a.name}</label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
          <Section title="Keybinds"><Keybinds /></Section>
          <Section id="pins" title="Pins">
            <div className="k-box k-form" id="pins">
              {links.map((l) => (
                <label key={l.title} className="k-toggle"><input type="checkbox" checked={prefs.pins.includes(l.title)} onChange={() =>
                  setPrefs({ pins: prefs.pins.includes(l.title) ? prefs.pins.filter((p) => p !== l.title) : prefs.pins.concat([l.title]) })} />{l.title}</label>
              ))}
              {prefs.own.map((o, i) => (
                <div key={o.url + i} className="k-row" style={{ justifyContent: "space-between" }}>
                  <label className="k-toggle"><input type="checkbox" checked readOnly />{o.name} <span className="k-hint">Your own · {o.url.replace(/^https?:\/\//, "")}</span></label>
                  <Btn icon="remove" small onClick={() => setPrefs({ own: prefs.own.filter((_, j) => j !== i) })} />
                </div>
              ))}
              <div className="k-row"><Btn kind="dash" onClick={() => setNewPin({ name: "", url: "" })}>+ Add new pin</Btn></div>
              {newPin && (
                <div className="k-box k-form dash-newpin" role="dialog" aria-label="New pin">
                  <strong>New pin</strong>
                  <Field label="Name"><input className="k-input" value={newPin.name} onChange={(e) => setNewPin({ ...newPin, name: e.target.value })} /></Field>
                  <Field label="Link"><input className="k-input" value={newPin.url} placeholder="https://…" onChange={(e) => setNewPin({ ...newPin, url: e.target.value })} /></Field>
                  <div className="k-row" style={{ justifyContent: "flex-end" }}>
                    <Btn onClick={() => setNewPin(null)}>Cancel</Btn>
                    <Btn kind="primary" disabled={!newPin.name.trim() || !/^(https?:\/\/|\/)/.test(newPin.url.trim())}
                      onClick={() => { setPrefs({ own: prefs.own.concat([{ name: newPin.name.trim(), url: newPin.url.trim() }]) }); setNewPin(null); }}>Save</Btn>
                  </div>
                </div>
              )}
            </div>
          </Section>
          <Section title="Account">
            <div className="k-row">
              <Btn href="/apps/logout">Sign out</Btn>
              <Btn kind="danger" onClick={() => setDeleting("ask")}>Delete my account</Btn>
            </div>
            <p className="k-hint">Signed in as {member.name}.</p>
          </Section>
          {deleting && (
            <div className="dash-modal" role="dialog" aria-label="Delete my account" onKeyDown={(e) => { if (e.key === "Escape" && deleting === "ask") setDeleting(""); }}>
              <div className="dash-modal-box">
                <div className="dash-modal-head"><h2>Delete my account?</h2></div>
                <div className="k-stack" style={{ padding: 18 }}>
                  <p style={{ margin: 0 }}>This deletes your sign-in, your badges, your settings, and your picture, and it can't be undone. Your name stays on tasks, orders, and history you were part of. Leaving the team? Ask a lead to make you alumni instead, so you keep your account.</p>
                  <div className="k-row">
                    <Btn onClick={() => setDeleting("")} disabled={deleting === "busy"}>Cancel</Btn>
                    <Btn kind="danger" disabled={deleting === "busy"} onClick={async () => {
                      setDeleting("busy");
                      try { await account.deleteMyAccount(); location.assign("/apps/logout"); } catch { setDeleting(""); setError("Your account wasn't deleted. Try again in a minute."); }
                    }}>{deleting === "busy" ? "Deleting…" : "Delete my account"}</Btn>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>}
      />
    </Screen>
  );
}
