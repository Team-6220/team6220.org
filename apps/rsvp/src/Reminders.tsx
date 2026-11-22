// Reminders (leads): the schedule reminders follow, and what is sent. Members choose how they get them (Discord, the badge,
// push) in Account → Notifications. Each form can turn reminders off.
import { useEffect, useState } from "react";
import { rsvp, type RsvpSettings } from "@team6220/data";
import { Btn, DataTable, Note, PageHeader, Screen, Section, Toggle } from "@team6220/ui";

const when = (n: number) => (n === 0 ? "The morning it is due" : n === 1 ? "The day before" : `${n} days before`);

export function Reminders() {
  const [settings, setSettings] = useState<RsvpSettings | null>(null);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [add, setAdd] = useState("");
  useEffect(() => {
    rsvp.settings().then(setSettings, (err) => setError(err instanceof Error ? err.message : "We couldn't load the schedule."));
  }, []);
  if (!settings) return <Screen><p className="k-hint" role="status">{error || "Loading…"}</p></Screen>;

  const save = async () => {
    setError("");
    try {
      setSettings(await rsvp.saveSettings(settings));
      setSaved("Saved");
      setTimeout(() => setSaved(""), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save.");
    }
  };
  const rows: { key: string; when: string; repeat: string; days?: number }[] = [
    ...[...settings.before].sort((a, b) => b - a).map((n) => ({ key: `b${n}`, when: when(n), repeat: "Once", days: n })),
    ...(settings.afterEvery > 0 ? [{ key: "after", when: "After the date", repeat: `Every ${settings.afterEvery} days, until they finish` }] : []),
  ];
  const addDays = () => {
    const n = Number(add);
    if (Number.isInteger(n) && n >= 0 && n <= 60 && !settings.before.includes(n)) setSettings({ ...settings, before: [...settings.before, n] });
    setAdd("");
  };
  return (
    <Screen>
      <PageHeader title="Reminders" sub="Leads choose what is sent. Members choose how they get it in their account settings." actions={<>{saved && <span className="k-hint" role="status">{saved}</span>}<Btn kind="primary" onClick={save}>Save</Btn></>} />
      {error && <Note tone="bad">{error}</Note>}
      <Section title="When">
        <DataTable<(typeof rows)[number]>
          columns={[
            { key: "when", label: "When", width: "minmax(0, 2fr)" },
            { key: "repeat", label: "Repeat", width: "minmax(0, 2fr)" },
          ]}
          rows={rows}
          rowKey={(r) => r.key}
          actions={(r) => (r.days === undefined ? null : <Btn icon="remove" title="Remove" onClick={() => setSettings({ ...settings, before: settings.before.filter((n) => n !== r.days) })} />)}
          empty="No reminders."
        />
        <div className="k-row rsvp-add">
          <input className="k-input" type="number" min={0} max={60} placeholder="Days before" aria-label="Days before the answer-by date" value={add} onChange={(e) => setAdd(e.target.value)} />
          <Btn onClick={addDays}>+ Add a reminder</Btn>
          <label className="k-row rsvp-after">After the date, remind every<input className="k-input" type="number" min={0} max={30} aria-label="Days between reminders after the date" value={settings.afterEvery} onChange={(e) => setSettings({ ...settings, afterEvery: Number(e.target.value) })} />days (0 turns it off)</label>
        </div>
      </Section>
      <Section title="Who">
        <div className="k-box k-form">
          <p>Only people who have not finished the form (including Maybe).</p>
          <Toggle label="Include a link that opens the form" checked={settings.includeLink} onChange={(includeLink) => setSettings({ ...settings, includeLink })} />
          <Toggle label="Tell leads a summary the morning of the deadline" checked={settings.leadSummary} onChange={(leadSummary) => setSettings({ ...settings, leadSummary })} />
        </div>
      </Section>
      <Section title="How">
        <div className="k-box k-form">
          <p><strong>Discord message</strong> <span className="k-hint">Sent to the Discord username on the account.</span></p>
          <p><strong>Badge on the RSVP app and on Apps home</strong></p>
          <p><strong>Push notification</strong> <span className="k-hint">On the phone apps, and in the browser on desktop.</span></p>
          <p className="k-hint">Each person turns these on or off in Account → Notifications. Reminders run once a day, in the morning.</p>
        </div>
      </Section>
      <Section title="Preview">
        <div className="k-box rsvp-preview"><strong>Regional RSVP</strong> · Please answer by Sat Nov 28. It takes about a minute. {settings.includeLink && <span className="rsvp-link">[Open the form]</span>}</div>
      </Section>
    </Screen>
  );
}
