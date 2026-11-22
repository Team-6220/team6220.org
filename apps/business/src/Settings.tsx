// /apps/business/settings: the 1-2-3-100 deadline, reminders, limits and who is exempt. Leads change them; the other roles can read.
import { useEffect, useState } from "react";
import { business, ops, type Me, type Person } from "@team6220/data";
import { Btn, Field, Fields, Note, PageHeader, Screen, Section } from "@team6220/ui";
import { ErrorNote } from "./student";

/** "Every 5 weeks", "Every 2 days", "Every day". */
const every = (days: number) => (days === 1 ? "Every day" : days % 7 === 0 ? `Every ${days / 7 === 1 ? "week" : `${days / 7} weeks`}` : `Every ${days} days`);
const EVERY_CHOICES = [1, 2, 3, 7, 14, 21, 28, 35];
const weeksText = (n: number) => (n >= 1 ? `${n} ${n === 1 ? "week" : "weeks"}` : n > 0 ? `${Math.round(n * 7)} days` : "the due date");

/** Where a reminder step applies: "More than 10 weeks away", "10 to 5 weeks away", "Last 3 weeks", "Last 2 days and the due date". */
function whenText(steps: business.BizSettings["reminders"], i: number): string {
  const above = steps[i].weeks;
  if (i === 0) return `More than ${weeksText(above)} away`;
  const from = steps[i - 1].weeks;
  if (from > 3) return `${from} to ${weeksText(above)} away`;
  if (above === 0 && from < 1) return `Last ${weeksText(from)} and the due date`;
  return from === 1 ? "Last week" : `Last ${weeksText(from)}`;
}

export function Settings({ me }: { me: Me }) {
  const [s, setS] = useState<business.BizSettings | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  useEffect(() => {
    void business.settings().then(setS, (e) => setError(e instanceof Error ? e.message : "We couldn't load the settings."));
    void ops.listPeople().then(setPeople, () => undefined);
  }, []);

  if (!s) return <Screen><PageHeader title="1-2-3-100 settings" />{error ? <ErrorNote message={error} /> : <p className="k-hint" role="status">Loading…</p>}</Screen>;
  const lead = me.roles.lead;
  const up = (changes: Partial<business.BizSettings>) => { setS({ ...s, ...changes }); setSaved(false); };
  const save = async () => {
    setError("");
    try {
      setS(await business.saveSettings({ deadline: s.deadline, reminders: s.reminders, ways: s.ways, followUps: s.followUps, minWords: s.minWords, restaurantLimit: s.restaurantLimit, exempt: s.exempt, pitchCc: s.pitchCc }));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    }
  };
  const nameOf = (id: string) => people.find((p) => p.memberId === id)?.name ?? id;
  const toggle = (key: keyof business.BizSettings["ways"], label: string, note: string) => (
    <label className="biz-way"><input type="checkbox" checked={s.ways[key]} disabled={!lead} onChange={(e) => up({ ways: { ...s.ways, [key]: e.target.checked } })} />{label}<span className="k-hint">{note}</span></label>
  );

  return (
    <Screen>
      <PageHeader title="1-2-3-100 settings" sub={lead ? "Leads only" : "Only leads can change these. You can read them."} actions={lead ? <Btn kind="primary" onClick={() => void save()}>Save</Btn> : undefined} />
      <ErrorNote message={error} />
      {saved && <Note tone="ok">Saved.</Note>}

      <Section title="Deadline">
        <div className="k-box biz-box">
          <Field label="Due date for everyone" hint="One date for the whole team"><input className="k-input biz-narrow" type="date" value={s.deadline} onChange={(e) => up({ deadline: e.target.value })} disabled={!lead} /></Field>
        </div>
      </Section>

      <Section title="Reminders to students">
        <Note>Gentle at first, then more often as the deadline gets close. Add or remove steps as you like.</Note>
        <div className="k-box">
          <div className="biz-remind biz-remind--head"><span>WHEN</span><span>HOW OFTEN</span><span /></div>
          {s.reminders.map((r, i) => (
            <div key={i} className="biz-remind">
              <span>{whenText(s.reminders, i)}</span>
              {editing === i ? (
                <select className="k-input" aria-label="How often" value={r.everyDays} onChange={(e) => up({ reminders: s.reminders.map((x, j) => (j === i ? { ...x, everyDays: Number(e.target.value) } : x)) })}>
                  {[...new Set([...EVERY_CHOICES, r.everyDays])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{every(d)}</option>)}
                </select>
              ) : <span>{every(r.everyDays)}</span>}
              {lead ? (
                <span className="biz-icons">
                  <Btn icon="edit" title={editing === i ? "Done" : "Change how often"} onClick={() => setEditing(editing === i ? null : i)} />
                  {s.reminders.length > 1 && <Btn icon="remove" title="Remove this step" onClick={() => up({ reminders: s.reminders.filter((_, j) => j !== i) })} />}
                </span>
              ) : <span />}
            </div>
          ))}
        </div>
        {lead && <div><Btn onClick={() => up({ reminders: [...s.reminders, { weeks: 0, everyDays: 1 }].sort((a, b) => b.weeks - a.weeks) })}>+ Add a reminder</Btn></div>}
      </Section>

      <Section title="How reminders arrive">
        <div className="k-box biz-box biz-ways">
          {toggle("discord", "Discord message", "")}
          {toggle("badge", "Badge on the Business app and on Apps home", "It also shows on Apps home, so it is hard to miss")}
          {toggle("push", "Push notification", "On the phone apps, and in the browser on desktop")}
        </div>
      </Section>

      <Section title="Limits">
        <div className="k-box biz-box">
          <Fields cols={3}>
            <Field label="Follow-ups per pitch" hint="Only if there is no reply"><input className="k-input" type="number" min={0} max={5} value={s.followUps} onChange={(e) => up({ followUps: Number(e.target.value) })} disabled={!lead} /></Field>
            <Field label={'Fewest words in "Why this company fits us"'} hint="Students cannot send a pitch plan to Operations until they reach this"><input className="k-input" type="number" min={0} max={500} value={s.minWords} onChange={(e) => up({ minWords: Number(e.target.value) })} disabled={!lead} /></Field>
            <Field label="Restaurant fundraiser days allowed this year" hint="A hard limit. When it is reached, nobody can set up another restaurant day. It shows in Stats and on the restaurant page"><input className="k-input" type="number" min={0} max={50} value={s.restaurantLimit} onChange={(e) => up({ restaurantLimit: Number(e.target.value) })} disabled={!lead} /></Field>
          </Fields>
        </div>
      </Section>

      <Section title="Exempt">
        <div className="k-box">
          <div className="biz-remind biz-remind--head"><span>STUDENT</span><span>REASON</span><span /></div>
          {s.exempt.map((x, i) => (
            <div key={x.memberId} className="biz-remind">
              <span>{nameOf(x.memberId)}</span>
              <input className="k-input biz-edit" value={x.reason} aria-label={`Reason for ${nameOf(x.memberId)}`} disabled={!lead} onChange={(e) => up({ exempt: s.exempt.map((y, j) => (j === i ? { ...y, reason: e.target.value } : y)) })} />
              {lead ? <span className="biz-icons"><Btn icon="remove" title="Not exempt any more" onClick={() => up({ exempt: s.exempt.filter((_, j) => j !== i) })} /></span> : <span />}
            </div>
          ))}
          {s.exempt.length === 0 && <p className="k-hint biz-empty">Nobody is exempt.</p>}
        </div>
        {lead && (
          <select className="k-input biz-add-exempt" value="" aria-label="Add an exempt student" onChange={(e) => e.target.value && up({ exempt: [...s.exempt, { memberId: e.target.value, reason: "Exempt this season" }] })}>
            <option value="">+ Add an exempt student</option>
            {people.filter((p) => !s.exempt.some((x) => x.memberId === p.memberId)).map((p) => <option key={p.memberId} value={p.memberId}>{p.name}</option>)}
          </select>
        )}
      </Section>

      <Section title="Pitch emails">
        <div className="k-box biz-box">
          <Field label="Copy these addresses on every pitch" hint="Separate them with commas. They are kept in Wix, not in the code."><input className="k-input" value={s.pitchCc} onChange={(e) => up({ pitchCc: e.target.value })} disabled={!lead} /></Field>
        </div>
      </Section>

      <Section title="Who approves">
        <Note>Everyone in the Operations subteam and every lead. Mentors and boosters can see everything but do not approve here.</Note>
      </Section>
    </Screen>
  );
}
