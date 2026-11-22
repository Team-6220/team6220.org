// Supervision: My shifts (/apps/calendar/myshifts), Open shifts (/apps/calendar/open), Supervisors
// (/apps/calendar/supervisors, leads, mentors and boosters) and Become a supervisor (/apps/calendar/become, anyone signed
// in). ShiftAction is the Sign up / Withdraw button the meeting page uses too.
import { useEffect, useState, type FormEvent } from "react";
import { calendar, ops, type CalEvent, type Shift, type StepStatus, type Supervisor } from "@team6220/data";
import { Btn, DataTable, Field, Fields, Note, PageHeader, Pill, Screen, Section, type Column } from "@team6220/ui";
import type { CalendarView } from "./Calendar";
import { ExportOne } from "./Export";
import { eventHref } from "./shared";

const WEEKS = 4;

type Row = { shift: Shift; event: CalEvent };

/** Every shift with its meeting, for meetings from `from` on, earliest first. */
function shiftRows(view: CalendarView, keep: (s: Shift) => boolean, until?: string): Row[] {
  const { data, today } = view;
  return data.shifts
    .filter(keep)
    .map((shift) => ({ shift, event: data.events.find((e) => e._id === shift.eventId)! }))
    .filter((r) => r.event && r.event.startDate >= today && (!until || r.event.startDate < until))
    .sort((a, b) => a.event.startDate.localeCompare(b.event.startDate) || a.shift.start.localeCompare(b.shift.start));
}

const isOpen = (s: Shift) => !s.name && !s.memberId;
const meetingName = (e: CalEvent) => [calendar.titleOf(e), e.location].filter(Boolean).join(" · ");

/** Sign up (an approved supervisor), Withdraw (your own shift), or, for leads, mentors and boosters, put an approved
 *  supervisor in an open shift or take someone off. */
export function ShiftAction({ view, shift }: { view: CalendarView; shift: Shift }) {
  const { data, me } = view;
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState("");
  const manager = me.roles.scheduler;
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      await view.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "That didn't work. Try again.");
      setBusy(false);
    }
  };
  if (shift.memberId === me.id) return <Btn small disabled={busy} onClick={() => run(() => calendar.withdrawShift(shift._id))}>Withdraw</Btn>;
  if (!isOpen(shift)) {
    return manager ? <Btn small disabled={busy} title={`Take ${shift.name} off this shift`} onClick={() => confirm(`Take ${shift.name} off this shift?`) && run(() => calendar.withdrawShift(shift._id))}>Take off</Btn> : null;
  }
  if (calendar.isApproved(data.supervisors, me.id)) return <Btn small disabled={busy} onClick={() => run(() => calendar.signUpShift(shift._id))}>Sign up</Btn>;
  if (!manager) return null;
  const ready = data.supervisors.filter((s) => s.status === "approved");
  return (
    <span className="cal-put">
      <select className="k-input" aria-label="Supervisor to put in this shift" value={pick} onChange={(e) => setPick(e.target.value)}>
        <option value="">Put in…</option>
        {ready.map((s) => <option key={s.memberId} value={s.memberId}>{s.name}</option>)}
      </select>
      {pick && <Btn small disabled={busy} onClick={() => run(() => calendar.signUpShift(shift._id, pick))}>Add</Btn>}
    </span>
  );
}

export function MyShifts({ view }: { view: CalendarView }) {
  const rows = shiftRows(view, (s) => s.memberId === view.me.id);
  const columns: Column<Row>[] = [
    { key: "date", label: "Date", width: "130px", render: (r) => calendar.shortDay(r.event.startDate) },
    { key: "time", label: "Time", width: "130px", render: (r) => calendar.timeRange(r.shift.start, r.shift.end) },
    { key: "meeting", label: "Meeting", render: (r) => <a className="cal-link" href={eventHref(r.event)}>{meetingName(r.event)}</a> },
    { key: "status", label: "", width: "110px", render: () => <Pill tone="ok">Yours</Pill> },
  ];
  return (
    <Screen>
      <PageHeader title="My shifts" sub="Shifts you signed up for" actions={<Btn kind="primary" href="/apps/calendar/open">Find open shifts</Btn>} />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.shift._id} statusKey="status"
        actions={(r) => <><ShiftAction view={view} shift={r.shift} /><ExportOne small item={calendar.shiftItems([r.shift], [r.event])[0]} /></>}
        empty={calendar.isApproved(view.data.supervisors, view.me.id) ? "You have no shifts coming up." : <>Only approved supervisors take shifts. See <a href="/apps/calendar/become">Become a supervisor</a>.</>} />
    </Screen>
  );
}

export function OpenShifts({ view }: { view: CalendarView }) {
  const rows = shiftRows(view, isOpen, calendar.addDays(view.today, WEEKS * 7));
  const can = calendar.isApproved(view.data.supervisors, view.me.id) || view.me.roles.scheduler;
  const columns: Column<Row>[] = [
    { key: "date", label: "Date", width: "130px", render: (r) => calendar.shortDay(r.event.startDate) },
    { key: "time", label: "Time", width: "130px", render: (r) => calendar.timeRange(r.shift.start, r.shift.end) },
    { key: "meeting", label: "Meeting", render: (r) => <a className="cal-link" href={eventHref(r.event)}>{calendar.titleOf(r.event)}</a> },
    { key: "status", label: "", width: "110px", render: () => <Pill tone="warn">Open</Pill> },
  ];
  return (
    <Screen>
      <PageHeader title="Open shifts" sub={`${rows.length} ${rows.length === 1 ? "shift" : "shifts"} in the next four weeks ${rows.length === 1 ? "has" : "have"} no supervisor`} />
      {!can && <Note>Only approved supervisors can sign up. See <a href="/apps/calendar/become">Become a supervisor</a>.</Note>}
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.shift._id} statusKey="status" actions={(r) => <ShiftAction view={view} shift={r.shift} />}
        empty="Every shift in the next four weeks has a supervisor." />
    </Screen>
  );
}

const STATUS_PILL: Record<Supervisor["status"], { tone: "ok" | "warn" | "calm"; label: string }> = {
  approved: { tone: "ok", label: "Approved" },
  started: { tone: "warn", label: "Paperwork started" },
  inactive: { tone: "calm", label: "Not supervising" },
};

const monthName = (m: string) => (m ? new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "numeric" }) : "—");

export function Supervisors({ view }: { view: CalendarView }) {
  const { data, today } = view;
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Supervisor | "new" | null>(null);
  const list = data.supervisors.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()));
  const approved = data.supervisors.filter((s) => s.status === "approved").length;
  if (editing) return <SupervisorForm view={view} row={editing === "new" ? null : editing} close={() => setEditing(null)} />;
  const columns: Column<Supervisor>[] = [
    { key: "name", label: "Name", menu: ["text"] },
    { key: "approvedMonth", label: "Approved", width: "120px", menu: ["date"], render: (s) => monthName(s.approvedMonth) },
    { key: "supervised", label: "Supervised", width: "170px", value: (s) => calendar.supervised(s, data.shifts, data.events, today).shifts,
      render: (s) => { const n = calendar.supervised(s, data.shifts, data.events, today); return `${n.shifts} ${n.shifts === 1 ? "shift" : "shifts"} / ${n.hours} hours`; } },
    { key: "status", label: "", width: "160px", menu: ["group"], value: (s) => STATUS_PILL[s.status].label, render: (s) => <Pill tone={STATUS_PILL[s.status].tone}>{STATUS_PILL[s.status].label}</Pill> },
  ];
  return (
    <Screen>
      <PageHeader title="Supervisors" sub={`School-approved parents who can supervise meetings · ${approved} approved`}
        actions={<Btn kind="primary" onClick={() => setEditing("new")}>+ Add supervisor</Btn>} />
      <input className="k-input cal-search" type="search" placeholder="Find a supervisor" aria-label="Find a supervisor" value={query} onChange={(e) => setQuery(e.target.value)} />
      <DataTable columns={columns} rows={list} rowKey={(s) => s.memberId} statusKey="status" sort={{ key: "name", dir: "asc" }}
        actions={(s) => <Btn icon="edit" small title={`Change ${s.name}`} onClick={() => setEditing(s)} />} empty="Nobody yet. Parents start from Become a supervisor, or add someone here." />
    </Screen>
  );
}

/** One supervisor's paperwork. Adding someone picks their account: they need to have signed in to the site once. */
function SupervisorForm({ view, row, close }: { view: CalendarView; row: Supervisor | null; close: () => void }) {
  const [memberId, setMemberId] = useState(row?.memberId ?? "");
  const [status, setStatus] = useState<Supervisor["status"]>(row?.status ?? "started");
  const [steps, setSteps] = useState<StepStatus[]>(() => calendar.SUPERVISOR_STEPS.map((_, i) => row?.steps[i] ?? ""));
  const [month, setMonth] = useState(row?.approvedMonth ?? "");
  const [people, setPeople] = useState<{ memberId: string; name: string }[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (row) return;
    const already = new Set(view.data.supervisors.map((s) => s.memberId));
    ops.listPeople().then((list) => setPeople(list.filter((p) => !already.has(p.memberId)).map((p) => ({ memberId: p.memberId, name: p.name }))), () => setPeople([]));
  }, [row]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await calendar.saveSupervisor(memberId, { status, steps, approvedMonth: month });
      await view.reload();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      setBusy(false);
    }
  };
  return (
    <Screen>
      <PageHeader title={row ? row.name : "Add supervisor"} back={{ label: "Supervisors", onClick: close }}
        sub="Approving someone gives them the Supervisor badge, so they can sign up for shifts. Old shifts from the sheet with their exact name move onto their account." />
      <form className="k-box k-form" onSubmit={submit}>
        <Fields>
          {!row && (
            <Field label="Who" hint="They need to have signed in to the site once.">
              <select className="k-input" required value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">{people ? "Pick a person" : "Loading…"}</option>
                {(people ?? []).map((p) => <option key={p.memberId} value={p.memberId}>{p.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Status">
            <select className="k-input" value={status} onChange={(e) => setStatus(e.target.value as Supervisor["status"])}>
              <option value="started">Paperwork started</option>
              <option value="approved">Approved by the school</option>
              <option value="inactive">Not supervising</option>
            </select>
          </Field>
          <Field label="Approved (month)"><input className="k-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        </Fields>
        <span className="cal-label">Steps</span>
        <div className="cal-steps">
          {calendar.SUPERVISOR_STEPS.map((label, i) => (
            <label key={label} className="cal-step">
              <span>{i + 1}. {label}</span>
              <select className="k-input" value={steps[i]} onChange={(e) => setSteps(steps.map((v, n) => (n === i ? (e.target.value as StepStatus) : v)))}>
                <option value="">Not yet</option>
                <option value="waiting">Waiting</option>
                <option value="done">Done</option>
              </select>
            </label>
          ))}
        </div>
        {error && <Note tone="bad">{error}</Note>}
        <div className="k-row">
          <Btn kind="primary" type="submit" disabled={busy || !memberId}>Save</Btn>
          <Btn onClick={close}>Cancel</Btn>
        </div>
      </form>
    </Screen>
  );
}

const STEP_PILL: Record<StepStatus, { tone: "ok" | "warn" | "calm"; label: string }> = {
  done: { tone: "ok", label: "Done" },
  waiting: { tone: "warn", label: "Waiting" },
  "": { tone: "calm", label: "Not yet" },
};

/** Become a supervisor. Works for anyone signed in, before a web admin approves their account. */
export function Become({ row: start }: { row: Supervisor | null }) {
  const [row, setRow] = useState(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ask = async () => {
    setBusy(true);
    try {
      setRow(await calendar.askToSupervise());
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    }
    setBusy(false);
  };
  const steps = calendar.SUPERVISOR_STEPS.map((label, i) => ({ label: `${i + 1}. ${label}`, status: (row?.steps?.[i] ?? "") as StepStatus }));
  return (
    <Screen>
      <PageHeader title="Become a supervisor" sub="Thank you! Every meeting needs enough supervisors." />
      {row?.status === "approved" && <Note tone="ok">You're an approved supervisor. Find a shift in <a href="/apps/calendar/open">Open shifts</a>.</Note>}
      <Section title="Steps">
        <DataTable columns={[
          { key: "label", label: "Step" },
          { key: "status", label: "Status", width: "140px", render: (s) => <Pill tone={STEP_PILL[s.status].tone}>{STEP_PILL[s.status].label}</Pill> },
        ]} rows={steps} rowKey={(s) => s.label} statusKey="status" />
      </Section>
      {!row && <div><Btn kind="primary" disabled={busy} onClick={ask}>I want to supervise</Btn></div>}
      {row && row.status === "started" && <Note>You're on the list. The leads, mentors, and boosters mark each step as you finish it.</Note>}
      {error && <Note tone="bad">{error}</Note>}
      <Note>Once the school approves you, the booster club adds you to the supervisor list and you can sign up for shifts here.</Note>
    </Screen>
  );
}
