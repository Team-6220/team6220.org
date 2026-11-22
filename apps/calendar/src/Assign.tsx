// Assign meetings to subteams (/apps/calendar/assign), Leads only (#291), and View as a member (/apps/calendar/member),
// which shows a lead the next four weeks the way someone on one subteam sees them.
import { useMemo, useState } from "react";
import { calendar, type CalEvent } from "@team6220/data";
import { Btn, DataTable, Note, PageHeader, Pill, Screen, Toggle, type Column } from "@team6220/ui";
import type { CalendarView } from "./Calendar";

const WEEKS = 4;

const nextMeetings = (view: CalendarView) =>
  view.data.events.filter((e) => e.type === "meeting" && e.startDate >= view.today && e.startDate < calendar.addDays(view.today, WEEKS * 7));

const when = (e: CalEvent) => `${calendar.shortDay(e.startDate)} · ${calendar.timeRange(e.startTime, e.endTime)}`;

export function Assign({ view }: { view: CalendarView }) {
  const meetings = useMemo(() => nextMeetings(view), [view]);
  const [rows, setRows] = useState(() => new Map(meetings.map((m) => [m._id, { subteams: m.subteams, mandatory: m.mandatory }])));
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (id: string, change: Partial<{ subteams: string[]; mandatory: boolean }>) => setRows(new Map(rows).set(id, { ...rows.get(id)!, ...change }));
  const tick = (id: string, name: string) => {
    const now = rows.get(id)!.subteams;
    set(id, { subteams: view.subteams.filter((s) => (s === name ? !now.includes(s) : now.includes(s))) });
  };

  const save = async () => {
    const changes = meetings
      .filter((m) => { const r = rows.get(m._id)!; return r.mandatory !== m.mandatory || r.subteams.join() !== m.subteams.join(); })
      .map((m) => ({ id: m._id, ...rows.get(m._id)! }));
    setBusy(true);
    try {
      const saved = changes.length ? await calendar.assignMeetings(changes) : 0;
      await view.reload();
      setMessage({ tone: "ok", text: saved ? `Saved ${saved} ${saved === 1 ? "meeting" : "meetings"}.` : "Nothing changed." });
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : "Couldn't save. Try again." });
    }
    setBusy(false);
  };

  const check = (on: boolean, label: string, change: () => void) => <input type="checkbox" className="cal-tick" aria-label={label} checked={on} onChange={change} />;
  const columns: Column<CalEvent>[] = [
    { key: "mandatory", label: "Mandatory", width: "88px", render: (m) => check(rows.get(m._id)!.mandatory, `Mandatory: ${when(m)}`, () => set(m._id, { mandatory: !rows.get(m._id)!.mandatory })) },
    { key: "when", label: "Meeting", width: "minmax(190px, 1.6fr)", render: when },
    { key: "everyone", label: "Everyone", render: (m) => check(!rows.get(m._id)!.subteams.length, `Everyone: ${when(m)}`, () => set(m._id, { subteams: [] })) },
    ...view.subteams.map((name): Column<CalEvent> => ({
      key: name, label: name, render: (m) => check(rows.get(m._id)!.subteams.includes(name), `${name}: ${when(m)}`, () => tick(m._id, name)),
    })),
  ];

  return (
    <Screen>
      <PageHeader title="Assign meetings to subteams" sub="Leads only. Pick who each meeting is for and which ones are mandatory. Shows every meeting in the next four weeks."
        actions={<><Btn href="/apps/calendar">Cancel</Btn><Btn kind="primary" onClick={save} disabled={busy}>Save</Btn></>} />
      <Note>"Everyone" is the default. A meeting for some subteams only appears on those members' calendars, and only they are expected to attend and sign in (attendance and the mandatory list follow it). If you tick no subteams, it is the same as Everyone. Other subteams can still see it if they turn on "Show other subteams' meetings". A ticked Mandatory box puts a ★ on the calendar. Use Edit mode or Meeting schedule to set a whole weekday at once.</Note>
      {message && <Note tone={message.tone}>{message.text}</Note>}
      <div className="cal-assign"><DataTable columns={columns} rows={meetings} rowKey={(m) => m._id} empty="No meetings in the next four weeks." /></div>
    </Screen>
  );
}

export function MemberPreview({ view }: { view: CalendarView }) {
  const [subteam, setSubteam] = useState(view.subteams.includes("Programming") ? "Programming" : (view.subteams[0] ?? ""));
  const [others, setOthers] = useState(false);
  const pretend = { ...view.me, subteams: [subteam], roles: { ...view.me.roles, lead: false } };
  const rows = nextMeetings(view).filter((m) => others || calendar.isForMe(m, pretend));
  const columns: Column<CalEvent>[] = [
    { key: "when", label: "When", render: (m) => <span className={calendar.isForMe(m, pretend) ? "" : "is-other"}>{m.mandatory && "★ "}{when(m)}</span> },
    { key: "for", label: "Meeting for", render: (m) => <span className={calendar.isForMe(m, pretend) ? "" : "is-other"}>{calendar.audience(m)}</span> },
    { key: "pill", label: "", width: "170px", render: (m) => (calendar.isForMe(m, pretend) ? <Pill tone="ok">For you</Pill> : <Pill>Not your subteam</Pill>) },
  ];
  return (
    <Screen>
      <PageHeader title="Calendar as a member" sub={`A preview of what a ${subteam} subteam member sees. Not a real page.`} />
      <div className="cal-preview-as">
        <span>You are previewing as a <strong>{subteam} · Member</strong>. Leads see this same list, plus the Assign tool.</span>
        <select className="k-input" aria-label="Subteam to preview" value={subteam} onChange={(e) => setSubteam(e.target.value)}>
          {view.subteams.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(m) => m._id} empty="No meetings for this subteam in the next four weeks." />
      <div className="k-box k-form">
        <Toggle label="Show other subteams' meetings" checked={others} onChange={setOthers} />
        <span className="k-hint cal-option-hint">Meetings for other subteams are hidden unless you turn this on, then they show dimmed.</span>
      </div>
    </Screen>
  );
}
