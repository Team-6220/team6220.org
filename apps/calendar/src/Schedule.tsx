// Meeting schedule (/apps/calendar/schedule) and New season part (/apps/calendar/part?from=&to=). Leads, mentors and
// boosters. The season parts and breaks are changed here as a draft; "Save schedule" saves them all and makes the
// meetings they call for (packages/data/src/calendar/plan.ts). New season part from the calendar saves straight away.
import { useState, type FormEvent } from "react";
import { calendar, type CalEvent, type PartDay } from "@team6220/data";
import { Btn, DataTable, Field, Fields, Note, PageHeader, Screen, type Column } from "@team6220/ui";
import type { CalendarView } from "./Calendar";
import { monthHref, param, SCHEDULE_HREF } from "./shared";

type Draft = Partial<CalEvent> & { key: string };
const asDraft = (e: CalEvent): Draft => ({ ...e, key: e._id });
let made = 0;
const blank = (type: "part" | "break", from: string, to: string): Draft => ({ key: `new-${++made}`, type, title: "", startDate: from, endDate: to, pattern: [] });

/** Only what the server keeps for a part or a break. */
const toSave = ({ key: _key, ...d }: Draft) => d;

export function Schedule({ view }: { view: CalendarView }) {
  const { data, today } = view;
  const [parts, setParts] = useState<Draft[]>(() => data.events.filter((e) => e.type === "part").map(asDraft));
  const [breaks, setBreaks] = useState<Draft[]>(() => data.events.filter((e) => e.type === "break" && e.skipMeetings).map(asDraft));
  const [editing, setEditing] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (editing) {
    const list = editing.type === "part" ? parts : breaks;
    const setList = editing.type === "part" ? setParts : setBreaks;
    const done = (saved: Draft | null) => {
      if (saved) setList(list.some((d) => d.key === saved.key) ? list.map((d) => (d.key === saved.key ? saved : d)) : [...list, saved]);
      setEditing(null);
    };
    const remove = list.some((d) => d.key === editing.key) ? () => (setList(list.filter((d) => d.key !== editing.key)), setEditing(null)) : undefined;
    return editing.type === "part"
      ? <PartForm draft={editing} onDone={done} onRemove={remove} back={{ label: "Meeting schedule", onClick: () => setEditing(null) }} />
      : <BreakForm draft={editing} onDone={done} onRemove={remove} />;
  }

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await calendar.saveSchedule(parts.map(toSave), breaks.map(toSave));
      await view.reload();
      setMessage({ tone: "ok", text: `Saved. ${r.added} ${r.added === 1 ? "meeting" : "meetings"} added, ${r.moved} changed, and ${r.removed} removed.` });
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : "Couldn't save. Try again." });
    }
    setBusy(false);
  };

  const partColumns: Column<Draft>[] = [
    { key: "title", label: "Season part", width: "minmax(0, 1.3fr)", render: (p) => `${p.title}${p.startDate! <= today && today <= p.endDate! ? " (now)" : ""}` },
    { key: "startDate", label: "From", width: "80px", render: (p) => calendar.monthDay(p.startDate!) },
    { key: "endDate", label: "To", width: "80px", render: (p) => calendar.monthDay(p.endDate!) },
    { key: "days", label: "Days", render: (p) => dayList(p.pattern ?? []) },
    { key: "times", label: "Times", width: "minmax(0, 2fr)", render: (p) => calendar.patternText(p.pattern ?? []).times },
    { key: "shifts", label: "Shifts", width: "minmax(0, 1fr)", render: (p) => calendar.patternText(p.pattern ?? []).shifts },
  ];
  const breakColumns: Column<Draft>[] = [
    { key: "startDate", label: "Dates", width: "minmax(0, 1fr)", render: (b) => calendar.dayRange(b.startDate!, b.endDate!) },
    { key: "title", label: "Why", width: "minmax(0, 4fr)" },
  ];
  const pencil = (d: Draft) => <Btn icon="edit" small title={`Change ${d.title}`} onClick={() => setEditing(d)} />;

  return (
    <Screen>
      <PageHeader title="Meeting schedule" sub="The weekly pattern the calendar fills in. Changing it never moves meetings that already happened."
        actions={<>
          <Btn onClick={() => setEditing(blank("part", today, calendar.addDays(today, 30)))}>+ Add a season part</Btn>
          <Btn kind="primary" onClick={save} disabled={busy}>Save schedule</Btn>
        </>} />
      {message && <Note tone={message.tone}>{message.text}</Note>}
      <DataTable columns={partColumns} rows={parts} rowKey={(p) => p.key} actions={pencil} empty="No season parts yet. Meetings added by hand, and the ones loaded from the old sheet, stay as they are." />
      <div className="k-row cal-section-head">
        <h2 className="cal-label cal-caps">Breaks</h2>
        <Btn small onClick={() => setEditing(blank("break", today, today))}>+ Add a break</Btn>
      </div>
      <DataTable columns={breakColumns} rows={breaks} rowKey={(b) => b.key} actions={pencil} empty="No breaks." />
      <Note>If a change moves a meeting, its shifts move with it. People who had signed up for a shift on it are taken off, and each gets a notification on Home (push notifications later): the meeting moved and their shift was removed, with a button to sign up for the new shift. Meetings that already happened are never moved.</Note>
    </Screen>
  );
}

/** "Tue, Fri, Sat" or "Mon–Fri, Sat" */
function dayList(pattern: PartDay[]): string {
  const days = pattern.map((p) => p.day).sort();
  const out: string[] = [];
  for (let i = 0; i < days.length; i++) {
    let j = i;
    while (j + 1 < days.length && days[j + 1] === days[j] + 1) j++;
    out.push(j - i >= 2 ? `${calendar.WEEKDAYS[days[i]]}–${calendar.WEEKDAYS[days[j]]}` : days.slice(i, j + 1).map((d) => calendar.WEEKDAYS[d]).join(", "));
    i = j;
  }
  return out.join(", ");
}

/** New season part from the calendar: saved straight away with the rest of the schedule. */
export function NewPart({ view }: { view: CalendarView }) {
  const { data, today } = view;
  const from = param("from") || today;
  const draft = blank("part", from, param("to") && param("to") !== from ? param("to") : calendar.addDays(from, 30));
  const [error, setError] = useState("");
  const done = async (saved: Draft | null) => {
    if (!saved) return location.assign(monthHref(from.slice(0, 7)));
    try {
      const parts = data.events.filter((e) => e.type === "part");
      const breaks = data.events.filter((e) => e.type === "break" && e.skipMeetings);
      await calendar.saveSchedule([...parts, toSave(saved)], breaks);
      location.assign(monthHref(saved.startDate!.slice(0, 7)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    }
  };
  return <PartForm draft={draft} onDone={done} error={error} back={{ label: "Meeting schedule", href: SCHEDULE_HREF }} />;
}

function PartForm({ draft, onDone, onRemove, back, error: outside = "" }: {
  draft: Draft; onDone: (d: Draft | null) => void; onRemove?: () => void; back: { label: string; href?: string; onClick?: () => void }; error?: string;
}) {
  const start = calendar.patternText(draft.pattern ?? []);
  const [title, setTitle] = useState(draft.title ?? "");
  const [from, setFrom] = useState(draft.startDate ?? "");
  const [to, setTo] = useState(draft.endDate ?? "");
  const [days, setDays] = useState<number[]>(start.days);
  const [times, setTimes] = useState(start.times || "3:20–5:00 · Sat 10:00–2:00");
  const [shifts, setShifts] = useState(start.shifts || "1 · Sat 2");
  const [error, setError] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      if (to < from) throw new Error("The last day is before the first day.");
      onDone({ ...draft, title: title.trim(), startDate: from, endDate: to, pattern: calendar.parsePattern(days, times, shifts) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const toggle = (d: number) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort());

  return (
    <Screen>
      <PageHeader title={draft.title ? draft.title : "New season part"} back={back} sub="Its own days, times, and shifts between two dates. It also appears from the calendar: right-click an empty day." />
      <form className="k-box k-form" onSubmit={submit}>
        <Fields>
          <Field label="Name"><input className="k-input" required value={title} placeholder="Build season" onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="First day"><input className="k-input" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Last day"><input className="k-input" type="date" required value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <div className="k-field">
            Days
            <div className="k-chips" role="group" aria-label="Days">
              {[1, 2, 3, 4, 5, 6].map((d) => <button key={d} type="button" className="k-chip" aria-pressed={days.includes(d)} onClick={() => toggle(d)}>{calendar.WEEKDAYS[d]}</button>)}
            </div>
          </div>
          <Field label="Times" hint="Like 3:20–5:00 · Sat 10:00–2:00"><input className="k-input" required value={times} onChange={(e) => setTimes(e.target.value)} /></Field>
          <Field label="Supervision shifts per meeting" hint="One supervisor per shift"><input className="k-input" required value={shifts} onChange={(e) => setShifts(e.target.value)} /></Field>
        </Fields>
        {(error || outside) && <Note tone="bad">{error || outside}</Note>}
        <div className="k-row">
          <Btn kind="primary" type="submit">Save season part</Btn>
          <Btn onClick={() => onDone(null)}>Cancel</Btn>
        </div>
      </form>
      {onRemove && <div><Btn icon="remove" title="Remove this season part" onClick={onRemove} /></div>}
    </Screen>
  );
}

function BreakForm({ draft, onDone, onRemove }: { draft: Draft; onDone: (d: Draft | null) => void; onRemove?: () => void }) {
  const [title, setTitle] = useState(draft.title ?? "");
  const [from, setFrom] = useState(draft.startDate ?? "");
  const [to, setTo] = useState(draft.endDate ?? "");
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (to < from) return setError("The last day is before the first day.");
    onDone({ ...draft, title: title.trim(), startDate: from, endDate: to });
  };
  return (
    <Screen>
      <PageHeader title={draft.title ? draft.title : "New break"} back={{ label: "Meeting schedule", onClick: () => onDone(null) }} sub="No meetings are made from the season parts on these days. Meetings added by hand stay." />
      <form className="k-box k-form" onSubmit={submit}>
        <Fields>
          <Field label="Why"><input className="k-input" required value={title} placeholder="Winter break" onChange={(e) => setTitle(e.target.value)} /></Field>
          <span />
          <Field label="First day of break"><input className="k-input" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Last day of break"><input className="k-input" type="date" required value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </Fields>
        {error && <Note tone="bad">{error}</Note>}
        <div className="k-row">
          <Btn kind="primary" type="submit">Save break</Btn>
          <Btn onClick={() => onDone(null)}>Cancel</Btn>
        </div>
      </form>
      {onRemove && <div><Btn icon="remove" title="Remove this break" onClick={onRemove} /></div>}
    </Screen>
  );
}
