// The month grid: meetings with their times, supervision shifts, competitions, breaks and (optionally) your Icarus
// tasks. Click a meeting or a competition to open it. ‹ › move a month; Today comes back.
import { useEffect, useState, type ReactNode } from "react";
import { calendar, icarus, type CalEvent, type Task } from "@team6220/data";
import { Btn, PageHeader, Screen, Toggle } from "@team6220/ui";
import type { CalendarView } from "./Calendar";
import { eventHref, monthHref, usePrefs } from "./shared";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function Month({ view }: { view: CalendarView }) {
  const { data, me, today } = view;
  const [month, setMonth] = useState(() => new URLSearchParams(location.search).get("month") ?? today.slice(0, 7));
  const [prefs, setPrefs] = usePrefs();
  const [tasks, setTasks] = useState<Task[]>([]);
  const isMember = me.roles.team;

  useEffect(() => {
    if (!prefs.tasks || !isMember || tasks.length) return;
    icarus.loadAll().then((d) => setTasks(d.tasks.filter((t) => t.ownerIds.includes(me.id) && t.dueDate && t.status !== "done")), () => undefined);
  }, [prefs.tasks, isMember]);

  const go = (next: string) => {
    setMonth(next);
    history.replaceState(null, "", monthHref(next));
  };
  const weeks = calendar.monthWeeks(month);
  const first = weeks[0][0], last = weeks[weeks.length - 1][6];
  const inView = data.events.filter((e) => e.endDate >= first && e.startDate <= last);
  const visible = inView.filter((e) => prefs.others || calendar.isForMe(e, me));
  const openShifts = data.shifts.filter((s) => !s.name && !s.memberId && inView.some((e) => e._id === s.eventId && e.startDate >= today && e.startDate.slice(0, 7) === month)).length;
  const comps = inView.filter((e) => e.type === "competition" && e.startDate.slice(0, 7) <= month && e.endDate.slice(0, 7) >= month);

  return (
    <Screen>
      <PageHeader
        title={calendar.monthTitle(month)}
        sub={`Meetings, competitions, and events${openShifts ? ` · ${openShifts} ${openShifts === 1 ? "shift still needs" : "shifts still need"} a supervisor` : ""} · ★ mandatory meeting · ✦ competition or event`}
        actions={<>
          <Btn title="Previous month" onClick={() => go(calendar.shiftMonth(month, -1))}>‹</Btn>
          <Btn title="Next month" onClick={() => go(calendar.shiftMonth(month, 1))}>›</Btn>
          <Btn onClick={() => go(today.slice(0, 7))}>Today</Btn>
        </>}
      />
      <div className="k-row cal-toggles">
        <Toggle label="Show shifts" checked={prefs.shifts} onChange={(shifts) => setPrefs({ shifts })} />
      </div>
      {comps.map((c) => (
        <a key={c._id} className="cal-banner" href={eventHref(c)}>
          <strong>{calendar.titleOf(c)}</strong>
          {c.setupDate ? ` set-up ${calendar.shortDay(c.setupDate)} · ` : " "}competition {calendar.dayRange(c.startDate, c.endDate)}{c.location ? ` · ${c.location}` : ""}
        </a>
      ))}
      <div className="cal-grid" role="grid" aria-label={calendar.monthTitle(month)}>
        <div className="cal-head" role="row">{WEEKDAYS.map((d) => <span key={d} role="columnheader">{d}</span>)}</div>
        {weeks.map((week) => (
          <div key={week[0]} className="cal-week" role="row">
            {week.map((day) => (
              <DayCell key={day} day={day} week={week} month={month} today={today} events={calendar.eventsOn(visible, day)} view={view} showShifts={prefs.shifts}
                tasks={prefs.tasks ? tasks.filter((t) => t.dueDate === day) : []} />
            ))}
          </div>
        ))}
      </div>
      <div className="k-box k-form cal-options">
        {isMember && <Toggle label="Show tasks" checked={prefs.tasks} onChange={(t) => setPrefs({ tasks: t })} />}
        {isMember && <span className="k-hint cal-option-hint">Your Icarus tasks with due dates.</span>}
        <Toggle label="Show other subteams' meetings" checked={prefs.others} onChange={(others) => setPrefs({ others })} />
        <span className="k-hint cal-option-hint">Meetings for other subteams are hidden unless you turn this on, then they show dimmed. Leads see everything.</span>
      </div>
    </Screen>
  );
}

function DayCell({ day, week, month, today, events, view, showShifts, tasks }: {
  day: string; week: string[]; month: string; today: string; events: CalEvent[]; view: CalendarView; showShifts: boolean; tasks: Task[];
}) {
  const { data, me } = view;
  const outside = day.slice(0, 7) !== month;
  const brk = events.find((e) => e.type === "break");
  const items: ReactNode[] = [];
  for (const e of events) {
    const mine = calendar.isForMe(e, me);
    if (e.type === "meeting") {
      items.push(
        <a key={e._id} className={`cal-meeting${mine ? "" : " is-other"}`} href={eventHref(e)}>
          <span className="cal-meeting-time">{e.mandatory && <span className="cal-star" aria-label="Mandatory">★ </span>}<span className="cal-word">Meeting </span>{calendar.timeRange(e.startTime, e.endTime)}</span>
          {e.subteams.length > 0 && <span className="cal-for">For {e.subteams.join(", ")}</span>}
        </a>,
      );
      if (showShifts) {
        for (const s of calendar.shiftsOf(data.shifts, e._id)) {
          const yours = !!s.memberId && s.memberId === me.id;
          const open = !s.name && !s.memberId;
          items.push(
            <a key={s._id} className={`cal-shift${open ? " is-open" : yours ? " is-mine" : ""}${mine ? "" : " is-other"}`} href={eventHref(e)}>
              <span>Shift {calendar.compactRange(s.start, s.end)}</span><span className="cal-shift-who">{open ? "Open" : yours ? "You" : s.name}</span>
            </a>,
          );
        }
      }
    } else if (e.type === "competition" || e.type === "event") {
      // Shown on its first day in this week; it reads across the days it lasts.
      if (day !== e.startDate && day !== week[0]) continue;
      items.push(
        <a key={e._id} className="cal-comp" href={eventHref(e)}>
          <strong>✦ {calendar.titleOf(e)}</strong>
          <span>{e.type === "competition" ? "competition" : calendar.timeRange(e.startTime, e.endTime) || "event"}{e.location ? ` · ${e.location}` : ""}</span>
        </a>,
      );
    }
  }
  const breakStartsHere = brk && (day === brk.startDate || day === week[0]);
  const span = brk && breakStartsHere ? week.filter((d) => d >= day && d <= brk.endDate).length : 0;
  const [first, ...rest] = items;
  const meetingFirst = events.some((e) => e.type === "meeting") && first;
  return (
    <div role="gridcell" className={`cal-day${outside ? " is-outside" : ""}${day === today ? " is-today" : ""}${brk ? " is-break" : ""}`} aria-label={calendar.longDay(day)}>
      <div className="cal-top"><span className="cal-num">{Number(day.slice(8))}</span>{meetingFirst}</div>
      {brk && breakStartsHere && (
        <span className="cal-break" style={{ width: `calc(${span * 100}% - 12px + ${span - 1}px)` }}>{calendar.titleOf(brk)} · {calendar.dayRange(brk.startDate, brk.endDate)}</span>
      )}
      <div className="cal-items">{meetingFirst ? rest : items}</div>
      {tasks.map((t) => <a key={t._id} className="cal-task" href={`/apps/icarus?task=${t._id}`}>t{t.number}</a>)}
    </div>
  );
}
