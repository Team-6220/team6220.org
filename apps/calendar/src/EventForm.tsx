// New event / New break (/apps/calendar/new?type=&date=) and Edit (/apps/calendar/edit?id=): one form for both.
// Leads, mentors and boosters. Editing a meeting from Meeting schedule changes that day only.
import { useState, type FormEvent } from "react";
import { calendar, type CalEvent, type ShiftTimes } from "@team6220/data";
import { Btn, Field, Fields, Note, PageHeader, Screen } from "@team6220/ui";
import type { CalendarView } from "./Calendar";
import { eventHref, monthHref, param } from "./shared";

type Kind = "meeting" | "event" | "break";
const KINDS: { id: Kind; label: string }[] = [
  { id: "meeting", label: "Team meeting (with supervision shifts)" },
  { id: "event", label: "Event" },
  { id: "break", label: "Break (start and end date)" },
];

export function EventForm({ view, mode }: { view: CalendarView; mode: "new" | "edit" }) {
  const { data, today } = view;
  const before = mode === "edit" ? data.events.find((e) => e._id === param("id")) : undefined;
  const firstDay = param("date") || today;
  const [draft, setDraft] = useState<Partial<CalEvent>>(() =>
    before ?? {
      type: (["meeting", "event", "break"].includes(param("type")) ? param("type") : "meeting") as Kind,
      title: param("type") === "break" ? "Break" : "",
      startDate: firstDay,
      endDate: param("end") || firstDay,
      startTime: "15:20",
      endTime: "17:00",
      location: "",
      notes: "",
      mandatory: false,
    },
  );
  const [shifts, setShifts] = useState<ShiftTimes[]>(() => (before ? calendar.shiftsOf(data.shifts, before._id).map(({ start, end }) => ({ start, end })) : []));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (mode === "edit" && !before) return <Screen><PageHeader title="Edit" back={{ label: "Calendar", href: "/apps/calendar" }} /><Note tone="bad">That event isn't on the calendar any more.</Note></Screen>;

  const set = (change: Partial<CalEvent>) => setDraft((d) => ({ ...d, ...change }));
  const type = draft.type ?? "meeting";
  const isMeeting = type === "meeting";
  const spansDays = type === "break" || type === "competition";
  const back = before ? eventHref(before) : monthHref((draft.startDate ?? today).slice(0, 7));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = await calendar.saveEvent({ ...draft, endDate: spansDays ? draft.endDate : draft.startDate }, isMeeting ? shifts : []);
      location.assign(saved.type === "break" ? monthHref(saved.startDate.slice(0, 7)) : eventHref(saved));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!before || !confirm(`Remove ${calendar.titleOf(before)} on ${calendar.shortDay(before.startDate)}?`)) return;
    setBusy(true);
    try {
      await calendar.removeEvent(before._id);
      location.assign(monthHref(before.startDate.slice(0, 7)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove it. Try again.");
      setBusy(false);
    }
  };

  const shiftsBox = isMeeting && <ShiftEditor shifts={shifts} onChange={setShifts} start={draft.startTime ?? ""} end={draft.endTime ?? ""} />;
  const mandatory = isMeeting && (
    <label className="k-toggle cal-check">
      <input type="checkbox" checked={!!draft.mandatory} onChange={(e) => set({ mandatory: e.target.checked })} />
      <span>Mandatory meeting <span className="k-hint">Shows a gold star on the calendar and puts it on the mandatory meeting list</span></span>
    </label>
  );

  if (before) {
    const fromSchedule = !!before.partId;
    return (
      <Screen>
        <PageHeader title="Edit" back={{ label: "Calendar", href: back }}
          sub={`${calendar.titleOf(before)} · ${calendar.shortDay(before.startDate)}${fromSchedule ? " · only this day changes; the weekly schedule stays as it is" : ""}`} />
        <Note>Right-clicking any meeting or event on the calendar (long-press on a phone) opens this, even for meetings that come from the normal schedule. To change every week, use Meeting schedule. Leads, mentors, and boosters can do this.</Note>
        {isMeeting && <><h2 className="cal-label">Supervision shifts</h2>{shiftsBox}<Note>People already signed up keep their shift if it still exists after your change.</Note></>}
        <form className="k-box k-form" onSubmit={submit}>
          <Fields>
            <Field label="Title"><input className="k-input" value={draft.title ?? ""} placeholder={isMeeting ? "Team meeting" : ""} onChange={(e) => set({ title: e.target.value })} /></Field>
            <Field label={spansDays ? "First day" : "Date"}><input className="k-input" type="date" required value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
            {spansDays && <Field label="Last day"><input className="k-input" type="date" required value={draft.endDate} onChange={(e) => set({ endDate: e.target.value })} /></Field>}
            {type !== "break" && <Field label="Start time"><input className="k-input" type="time" required={isMeeting} value={draft.startTime} onChange={(e) => set({ startTime: e.target.value })} /></Field>}
            {type !== "break" && <Field label="End time"><input className="k-input" type="time" required={isMeeting} value={draft.endTime} onChange={(e) => set({ endTime: e.target.value })} /></Field>}
            {type !== "break" && <Field label="Where"><input className="k-input" value={draft.location ?? ""} onChange={(e) => set({ location: e.target.value })} /></Field>}
            {mandatory || <span />}
            <Field label="Notes"><textarea className="k-input" rows={3} value={draft.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></Field>
          </Fields>
          {error && <Note tone="bad">{error}</Note>}
          <div className="k-row">
            <Btn kind="primary" type="submit" disabled={busy}>{fromSchedule ? "Save for this day only" : "Save"}</Btn>
            <Btn href={back}>Cancel</Btn>
          </div>
        </form>
        <div><Btn icon="remove" title="Remove" onClick={remove} disabled={busy} /></div>
      </Screen>
    );
  }

  const isBreak = type === "break";
  return (
    <Screen>
      <PageHeader title={isBreak ? "New break" : "New event"} back={{ label: "Calendar", href: back }}
        sub={isBreak ? "A break between two dates. Meetings can still happen during it." : "Leads, mentors, and boosters can add and change events"} />
      <Note>
        {isBreak
          ? "A break is just a marked stretch on the calendar. Meetings from the normal schedule still show during it. To cancel meetings on certain days, use Breaks in Meeting schedule."
          : "Competitions and kickoff are not added here: they come from the Icarus Gantt chart. Repeating meetings are set in Meeting schedule."}
      </Note>
      <form className="k-box k-form" onSubmit={submit}>
        <Fields>
          <Field label="Title"><input className="k-input" required={!isMeeting} value={draft.title ?? ""} placeholder={isMeeting ? "Team meeting" : ""} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Type">
            <select className="k-input" value={type} onChange={(e) => set({ type: e.target.value as Kind, title: e.target.value === "break" && !draft.title ? "Break" : draft.title })}>
              {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </Field>
          {isBreak ? (
            <>
              <Field label="First day of break" hint="Meetings can still be added during a break"><input className="k-input" type="date" required value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
              <Field label="Last day of break"><input className="k-input" type="date" required value={draft.endDate} onChange={(e) => set({ endDate: e.target.value })} /></Field>
            </>
          ) : (
            <>
              <Field label="Date"><input className="k-input" type="date" required value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
              <Field label="Start time"><input className="k-input" type="time" required={isMeeting} value={draft.startTime} onChange={(e) => set({ startTime: e.target.value })} /></Field>
              <Field label="End time"><input className="k-input" type="time" required={isMeeting} value={draft.endTime} onChange={(e) => set({ endTime: e.target.value })} /></Field>
              <Field label="Where"><input className="k-input" value={draft.location ?? ""} onChange={(e) => set({ location: e.target.value })} /></Field>
            </>
          )}
        </Fields>
        {mandatory}
        {isMeeting && <><span className="cal-label">Supervision shifts</span>{shiftsBox}</>}
        <Fields><Field label="Notes"><textarea className="k-input" rows={3} value={draft.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></Field></Fields>
        {error && <Note tone="bad">{error}</Note>}
        <div className="k-row">
          <Btn kind="primary" type="submit" disabled={busy}>Save event</Btn>
          <Btn href={back}>Cancel</Btn>
        </div>
      </form>
    </Screen>
  );
}

/** The supervision shifts of one meeting: change any time, remove one, or add one (which splits the longest). */
function ShiftEditor({ shifts, onChange, start, end }: { shifts: ShiftTimes[]; onChange: (s: ShiftTimes[]) => void; start: string; end: string }) {
  const gap = calendar.uncovered(shifts, start, end);
  const change = (i: number, part: Partial<ShiftTimes>) => onChange(shifts.map((s, n) => (n === i ? { ...s, ...part } : s)));
  return (
    <div className="k-box cal-shifts">
      {shifts.map((s, i) => (
        <div key={i} className="cal-shift-row">
          <span className="k-hint">Shift {i + 1}</span>
          <input className="k-input" type="time" aria-label={`Shift ${i + 1} start`} value={s.start} onChange={(e) => change(i, { start: e.target.value })} />
          <span className="k-hint">to</span>
          <input className="k-input" type="time" aria-label={`Shift ${i + 1} end`} value={s.end} onChange={(e) => change(i, { end: e.target.value })} />
          <Btn icon="remove" small title={`Remove shift ${i + 1}`} onClick={() => onChange(shifts.filter((_, n) => n !== i))} />
        </div>
      ))}
      {gap && (
        <Note tone="warn">
          The shifts {gap.start === start ? `start at ${calendar.longTime(gap.end)} but the event starts at ${calendar.longTime(start)}` : `end at ${calendar.longTime(gap.start)} but the event runs until ${calendar.longTime(end)}`}, so {calendar.longTime(gap.start)}–{calendar.longTime(gap.end)} has no supervisor. You can still save.
        </Note>
      )}
      {shifts.length < calendar.MAX_SHIFTS && (
        <button type="button" className="cal-add-shift" onClick={() => onChange(calendar.addShift(shifts, start, end))}>+ Add supervision shift</button>
      )}
      <span className="k-hint">The first click adds one shift for the whole event. Each click after that splits the longest shift in half. Change any start or end time. Supervisors sign up for each shift, one supervisor per shift.</span>
    </div>
  );
}
