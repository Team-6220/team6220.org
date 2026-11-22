// Account → Notifications: link your Discord account, choose which notifications also come to Discord (and, later, push),
// and set quiet hours. Everything still lands in the inbox on Home, whatever is chosen here.
//
// The table has no sort or group menus (UX rule 3): it is a fixed list of settings, already grouped by app.
import { useEffect, useState } from "react";
import { notifications, ops, type NotificationPrefs } from "@team6220/data";
import { Btn, Note, Section, Toggle } from "@team6220/ui";

const APPS = [...new Set(notifications.NOTIFICATION_KINDS.filter((k) => !k.channel).map((k) => k.app))];

const LINK_RESULT: Record<string, { tone: "ok" | "bad" | "warn"; text: string }> = {
  linked: { tone: "ok", text: "Discord is linked." },
  failed: { tone: "bad", text: "Discord didn't link. Try again, or use a /link code." },
  "not-set-up": { tone: "warn", text: "Link with Discord isn't set up on the site yet. Use a /link code instead." },
};

function DiscordLink({ linked, onChange }: { linked: { name: string } | null; onChange: (v: { name: string } | null) => void }) {
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState("");
  const result = LINK_RESULT[new URLSearchParams(location.search).get("discord") ?? ""];

  if (linked) {
    return (
      <div className="k-row dash-discord">
        <span>Linked as <strong>@{linked.name}</strong></span>
        <Btn small onClick={() => notifications.unlinkDiscord().then(() => onChange(null), () => setError("That didn't work. Try again."))}>Unlink</Btn>
        {error && <span className="k-hint" role="alert">{error}</span>}
      </div>
    );
  }
  return (
    <div className="k-stack dash-discord">
      {result && <Note tone={result.tone}>{result.text}</Note>}
      <p className="k-hint" style={{ margin: 0 }}>Link your Discord account to get notifications as DMs from Apollo. Required for students.</p>
      <div className="k-row">
        <Btn kind="primary" href={ops.isDemo() ? undefined : notifications.DISCORD_LINK_URL} onClick={ops.isDemo() ? () => onChange({ name: "demolead" }) : undefined}>Link with Discord</Btn>
        <Btn onClick={() => notifications.startDiscordLink().then(setCode, () => setError("Couldn't make a code. Try again."))}>Use a code instead</Btn>
      </div>
      {code && (
        <div className="k-box dash-code">
          <span className="k-hint">Discord on another device? In any team channel, type</span>
          <code className="dash-code-cmd">/link {code.code}</code>
          <span className="k-hint">The code works for 10 minutes. Reload this page after.</span>
        </div>
      )}
      {error && <span className="k-hint" role="alert">{error}</span>}
    </div>
  );
}

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [discord, setDiscord] = useState<{ name: string } | null>(null);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    notifications.getSettings().then((s) => {
      setPrefs(s.prefs ?? { ways: {}, quietHours: notifications.DEFAULT_QUIET_HOURS });
      setDiscord(s.discord);
    }, () => setPrefs({ ways: {}, quietHours: notifications.DEFAULT_QUIET_HOURS }));
  }, []);
  if (!prefs) return null;

  const set = (next: NotificationPrefs) => {
    setPrefs(next);
    setSaved("");
  };
  const setWay = (id: string, way: "discord" | "push", on: boolean) => {
    const kind = notifications.KIND_BY_ID[id];
    const now = notifications.waysFor(kind, prefs);
    set({ ...prefs, ways: { ...prefs.ways, [id]: { ...now, [way]: on } } });
  };
  const save = () => notifications.savePrefs(prefs).then(() => setSaved("Saved"), () => setSaved("That didn't save. Try again."));

  return (
    <Section id="notifications" title="Notifications">
      <div className="k-box k-form">
        <div className="k-label">Discord</div>
        <DiscordLink linked={discord} onChange={setDiscord} />
      </div>
      <div className="k-box dash-notif" role="table" aria-label="Where each notification goes">
        <div className="dash-notif-row dash-notif-head" role="row">
          <span role="columnheader">Everything goes to your inbox on Home. Also send it to:</span>
          <span role="columnheader">Discord</span>
          <span role="columnheader" title="Push notifications come later, with the team app on your phone's home screen">Push</span>
        </div>
        {APPS.map((app) => (
          <div key={app} role="rowgroup">
            <div className="dash-notif-app k-label">{app}</div>
            {notifications.NOTIFICATION_KINDS.filter((k) => k.app === app && !k.channel).map((k) => {
              const ways = notifications.waysFor(k, prefs);
              return (
                <div key={k.id} className="dash-notif-row" role="row">
                  <span role="cell">{k.label}{k.mandatory && <span title="One of Discord and push must stay on"> ★</span>}<br /><span className="k-hint">{k.who}</span></span>
                  {k.inboxOnly ? (
                    <span role="cell" className="k-hint dash-notif-only">Inbox only</span>
                  ) : (
                    <>
                      <span role="cell"><input type="checkbox" aria-label={`${k.label} on Discord`} checked={ways.discord} disabled={k.mandatory && !ways.push && ways.discord} onChange={(e) => setWay(k.id, "discord", e.target.checked)} /></span>
                      <span role="cell"><input type="checkbox" aria-label={`${k.label} as push`} checked={false} disabled title="Push notifications come later" /></span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="k-box k-form">
        <Toggle label="Quiet hours" checked={prefs.quietHours.on} onChange={(on) => set({ ...prefs, quietHours: { ...prefs.quietHours, on } })} />
        <div className={`k-row${prefs.quietHours.on ? "" : " dash-kb-off"}`}>
          <label className="k-field dash-time">From<input className="k-input" type="time" value={prefs.quietHours.from} onChange={(e) => set({ ...prefs, quietHours: { ...prefs.quietHours, from: e.target.value } })} /></label>
          <label className="k-field dash-time">To<input className="k-input" type="time" value={prefs.quietHours.to} onChange={(e) => set({ ...prefs, quietHours: { ...prefs.quietHours, to: e.target.value } })} /></label>
        </div>
        <p className="k-hint" style={{ margin: 0 }}>Discord messages wait during quiet hours, then come as one message when they end. The inbox still updates right away.</p>
        <div className="k-row"><Btn kind="primary" onClick={save}>Save</Btn>{saved && <span className="k-hint" role="status">{saved}</span>}</div>
      </div>
    </Section>
  );
}
