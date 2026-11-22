// The month grid: meetings with their times, supervision shifts, competitions, breaks and (optionally) your Icarus
// tasks. Click a meeting or a competition to open it. ‹ › move a month; Today comes back.
// Leads, mentors and boosters: right-click a meeting to change that day, or a day to add something. With Edit mode on,
// clicking a day adds something too, and dragging over several days adds a season part or a break.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { calendar, icarus, type CalEvent, type Task } from "@team6220/data";
import { Btn, Note, PageHeader, Screen, Toggle } from "@team6220/ui";
import type { CalendarView } from "./Calendar";
import { ExportCalendar } from "./Export";
import { PublicNote } from "./PublicNote";
import { editHref, eventHref, monthHref, newHref, partHref, usePrefs } from "./shared";

/** The menu or popup open on the grid, where the pointer was. */
type Menu =
  | { kind: "day"; x: number; y: number; day: string }
  | { kind: "range"; x: number; y: number; from: string; to: string }
  | { kind: "event"; x: number; y: number; event: CalEvent };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function Month({ view }: { view: CalendarView }) {
  const { data, me, today } = view;
  const [month, setMonth] = useState(() => new URLSearchParams(location.search).get("month") ?? today.slice(0, 7));
  const [prefs, setPrefs] = usePrefs();
  const [tasks, setTasks] = useState<Task[]>([]);
  const isMember = me.roles.team;
  const canEdit = me.roles.scheduler;
  const editing = canEdit && prefs.edit;
  const [drag, setDrag] = useState<{ from: string; to: string } | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState("");

  // Letting go of a drag: one day opens the day's menu, several open "add a season part or a break".
  useEffect(() => {
    if (!drag) return;
    const up = (e: MouseEvent) => {
      const [from, to] = drag.from <= drag.to ? [drag.from, drag.to] : [drag.to, drag.from];
      setMenu(from === to ? { kind: "day", x: e.clientX, y: e.clientY, day: from } : { kind: "range", x: e.clientX, y: e.clientY, from, to });
      setDrag(null);
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [drag]);

  const grid = canEdit
    ? {
        onDown: (day: string, e: ReactMouseEvent) => {
          if (!editing || e.button !== 0 || (e.target as HTMLElement).closest("a")) return;
          e.preventDefault();
          setDrag({ from: day, to: day });
        },
        onEnter: (day: string) => drag && setDrag({ ...drag, to: day }),
        onDayMenu: (day: string, e: ReactMouseEvent) => {
          e.preventDefault();
          setMenu({ kind: "day", x: e.clientX, y: e.clientY, day });
        },
        onEventMenu: (event: CalEvent, e: ReactMouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ kind: "event", x: e.clientX, y: e.clientY, event });
        },
        // The days being dragged over, and then the ones the popup is for.
        selected: (day: string) =>
          drag ? day >= (drag.from <= drag.to ? drag.from : drag.to) && day <= (drag.from <= drag.to ? drag.to : drag.from) : menu?.kind === "range" && day >= menu.from && day <= menu.to,
      }
    : undefined;

  const toggleMandatory = async (event: CalEvent) => {
    setMenu(null);
    try {
      await calendar.saveEvent({ ...event, mandatory: !event.mandatory });
      await view.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    }
  };
  const remove = async (event: CalEvent) => {
    setMenu(null);
    if (!confirm(`Remove ${calendar.titleOf(event)} on ${calendar.shortDay(event.startDate)}?`)) return;
    try {
      await calendar.removeEvent(event._id);
      await view.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove it. Try again.");
    }
  };

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
        sub={`${view.visitor ? "Meetings and events" : "Meetings, competitions, and events"}${openShifts ? ` · ${openShifts} ${openShifts === 1 ? "shift still needs" : "shifts still need"} a supervisor` : ""}${editing ? " · right-click a meeting to edit just that day, or an empty day to add something" : ""} · ★ mandatory meeting · ✦ Competition or event`}
        actions={<>
          <Btn title="Previous month" onClick={() => go(calendar.shiftMonth(month, -1))}>‹</Btn>
          <Btn title="Next month" onClick={() => go(calendar.shiftMonth(month, 1))}>›</Btn>
          <Btn onClick={() => go(today.slice(0, 7))}>Today</Btn>
        </>}
      />
      <PublicNote view={view} />
      {canEdit && <div className="k-row cal-toggles">
        {canEdit && <Toggle label="Edit mode" checked={prefs.edit} onChange={(edit) => setPrefs({ edit })} />}
        {editing && <span className="k-hint">For leads, mentors, and boosters. Click a day to add an event. Click and drag over several days to add a season part or a break. Click a meeting or event to edit it.</span>}
      </div>}
      {error && <Note tone="bad">{error}</Note>}
      {comps.map((c) => (
        <a key={c._id} className="cal-banner" href={eventHref(c)}>
          <strong>{calendar.titleOf(c)}</strong>
          {c.setupDate ? ` Set-up ${calendar.shortDay(c.setupDate)} · ` : " "}Competition {calendar.dayRange(c.startDate, c.endDate)}{c.location ? ` · ${c.location}` : ""}
        </a>
      ))}
      <div className={`cal-grid${editing ? " is-editing" : ""}`} role="grid" aria-label={calendar.monthTitle(month)}>
        <div className="cal-head" role="row">{WEEKDAYS.map((d) => <span key={d} role="columnheader">{d}</span>)}</div>
        {weeks.map((week) => (
          <WeekRow key={week[0]} week={week} month={month} today={today} events={visible} view={view} showShifts={prefs.shifts}
            tasks={prefs.tasks ? tasks : []} grid={grid} editing={editing} />
        ))}
      </div>
      {!view.visitor && <div className="k-box k-form cal-options">
        <Toggle label="Show shifts" checked={prefs.shifts} onChange={(shifts) => setPrefs({ shifts })} />
        <span className="k-hint cal-option-hint">Supervision shifts under each meeting.</span>
        {isMember && <Toggle label="Show tasks" checked={prefs.tasks} onChange={(t) => setPrefs({ tasks: t })} />}
        {isMember && <span className="k-hint cal-option-hint">Your Icarus tasks with due dates.</span>}
        <Toggle label="Show other subteams' meetings" checked={prefs.others} onChange={(others) => setPrefs({ others })} />
        <span className="k-hint cal-option-hint">Meetings for other subteams are hidden unless you turn this on, then they show dimmed. Leads see everything.</span>
      </div>}
      <ExportCalendar events={visible} month={month} today={today} />
      {menu && <GridMenu menu={menu} close={() => setMenu(null)} onMandatory={toggleMandatory} onRemove={remove} />}
    </Screen>
  );
}

type Grid = {
  onDown: (day: string, e: ReactMouseEvent) => void;
  onEnter: (day: string) => void;
  onDayMenu: (day: string, e: ReactMouseEvent) => void;
  onEventMenu: (event: CalEvent, e: ReactMouseEvent) => void;
  selected: (day: string) => boolean;
};

/** The day menu, the "you dragged over N days" popup, and a meeting's or event's menu. */
function GridMenu({ menu, close, onMandatory, onRemove }: { menu: Menu; close: () => void; onMandatory: (e: CalEvent) => void; onRemove: (e: CalEvent) => void }) {
  // Opens where the pointer was, then moves in so all of it stays inside the window.
  const box = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ left: menu.x, top: menu.y, visibility: "hidden" });
  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setStyle({ left: Math.max(8, Math.min(menu.x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(menu.y, window.innerHeight - r.height - 8)) });
  }, [menu]);
  let body: ReactNode;
  if (menu.kind === "day") {
    body = (
      <div ref={box} className="k-menu cal-menu" role="menu" style={style}>
        <p className="cal-menu-title">{calendar.longDay(menu.day)}</p>
        <a role="menuitem" href={newHref("meeting", menu.day)} autoFocus>New event</a>
        <a role="menuitem" href={partHref(menu.day)}>New season part</a>
        <a role="menuitem" href={newHref("break", menu.day)}>New break</a>
      </div>
    );
  } else if (menu.kind === "range") {
    const days = calendar.daysBetween(menu.from, menu.to) + 1;
    body = (
      <div ref={box} className="k-box cal-popup" role="dialog" aria-label="Add to the calendar" style={style}>
        <p className="cal-menu-title">{calendar.shortDay(menu.from).slice(0, 3)} {calendar.monthDay(menu.from)} – {calendar.shortDay(menu.to).slice(0, 3)} {calendar.monthDay(menu.to)}</p>
        <p className="k-hint">You dragged over {days} days. Add:</p>
        <Btn kind="primary" full href={partHref(menu.from, menu.to)}>New season part</Btn>
        <Btn kind="primary" full href={newHref("break", menu.from, menu.to)}>New break</Btn>
        <Btn full onClick={close}>Cancel</Btn>
      </div>
    );
  } else {
    const e = menu.event;
    body = (
      <div ref={box} className="k-menu cal-menu" role="menu" style={style}>
        <p className="cal-menu-title">{calendar.titleOf(e)} · {calendar.shortDay(e.startDate)}</p>
        <a role="menuitem" href={editHref(e)} autoFocus>Edit</a>
        {e.type === "meeting" && <button type="button" role="menuitem" onClick={() => onMandatory(e)}>★ {e.mandatory ? "Not mandatory" : "Mark as mandatory"}</button>}
        <button type="button" role="menuitem" className="cal-menu-bad" onClick={() => onRemove(e)}>Remove</button>
      </div>
    );
  }
  return (
    <>
      {/* Clicking anywhere else closes it. */}
      <button type="button" className="cal-menu-backdrop" aria-label="Close" onClick={close} onContextMenu={(e) => (e.preventDefault(), close())} />
      <div onKeyDown={(e) => e.key === "Escape" && close()}>{body}</div>
    </>
  );
}

/** One week of the grid. Each day is a background cell under three rows: the day's number and first meeting, a row
 *  per break (a bar across the days it covers, whose text can wrap), then the rest of the day. */
function WeekRow({ week, month, today, events, view, showShifts, tasks, grid, editing }: {
  week: string[]; month: string; today: string; events: CalEvent[]; view: CalendarView; showShifts: boolean; tasks: Task[]; grid?: Grid; editing: boolean;
}) {
  const breaks = events.filter((e) => e.type === "break" && e.endDate >= week[0] && e.startDate <= week[6]);
  const itemsRow = breaks.length + 2;
  const dayHandlers = (day: string) => (grid ? {
    onMouseDown: (e: ReactMouseEvent) => grid.onDown(day, e),
    onMouseEnter: () => grid.onEnter(day),
    onContextMenu: (e: ReactMouseEvent) => grid.onDayMenu(day, e),
  } : {});
  const menuFor = (e: CalEvent) => (grid ? { onContextMenu: (m: ReactMouseEvent) => grid.onEventMenu(e, m) } : {});
  // In edit mode a click opens the thing's Edit page; otherwise its own page.
  const hrefFor = (e: CalEvent) => (editing ? editHref(e) : eventHref(e));
  return (
    <div className="cal-week" role="row" style={{ gridTemplateRows: `auto ${"auto ".repeat(breaks.length)}1fr` }}>
      {week.map((day, i) => (
        <div key={day} role="gridcell" aria-label={calendar.longDay(day)} style={{ gridColumn: i + 1 }} {...dayHandlers(day)}
          className={`cal-day${day.slice(0, 7) !== month ? " is-outside" : ""}${day === today ? " is-today" : ""}${grid?.selected(day) ? " is-picked" : ""}`} />
      ))}
      {breaks.map((b, k) => {
        const from = b.startDate > week[0] ? b.startDate : week[0];
        const to = b.endDate < week[6] ? b.endDate : week[6];
        return (
          <a key={b._id} href={hrefFor(b)} {...menuFor(b)} style={{ gridColumn: `${week.indexOf(from) + 1} / span ${week.indexOf(to) - week.indexOf(from) + 1}`, gridRow: k + 2 }}
            className={`cal-break${from === b.startDate ? " is-start" : ""}${to === b.endDate ? " is-end" : ""}`}>
            {calendar.titleOf(b)} · {calendar.dayRange(b.startDate, b.endDate)}
          </a>
        );
      })}
      {week.map((day, i) => (
        <DayContent key={day} day={day} column={i + 1} topClass={`${day.slice(0, 7) !== month ? " is-outside" : ""}${day === today ? " is-today" : ""}`} itemsRow={itemsRow} week={week} events={calendar.eventsOn(events, day)} view={view} showShifts={showShifts}
          tasks={tasks.filter((t) => t.dueDate === day)} handlers={dayHandlers(day)} menuFor={menuFor} hrefFor={hrefFor} />
      ))}
    </div>
  );
}

function DayContent({ day, column, topClass, itemsRow, week, events, view, showShifts, tasks, handlers, menuFor, hrefFor }: {
  day: string; column: number; topClass: string; itemsRow: number; week: string[]; events: CalEvent[]; view: CalendarView; showShifts: boolean; tasks: Task[];
  handlers: object; menuFor: (e: CalEvent) => object; hrefFor: (e: CalEvent) => string;
}) {
  const { data, me } = view;
  const items: ReactNode[] = [];
  for (const e of events) {
    const mine = calendar.isForMe(e, me);
    if (e.type === "meeting") {
      items.push(
        <a key={e._id} className={`cal-meeting${mine ? "" : " is-other"}`} href={hrefFor(e)} {...menuFor(e)}>
          <span className="cal-meeting-time">{e.mandatory && <span className="cal-star" aria-label="Mandatory">★ </span>}<span className="cal-word">Meeting </span>{calendar.timeRange(e.startTime, e.endTime)}</span>
          {e.subteams.length > 0 && <span className="cal-for">For {e.subteams.join(", ")}</span>}
        </a>,
      );
      if (showShifts) {
        for (const s of calendar.shiftsOf(data.shifts, e._id)) {
          const yours = !!s.memberId && s.memberId === me.id;
          const open = !s.name && !s.memberId;
          items.push(
            <a key={s._id} className={`cal-shift${open ? " is-open" : yours ? " is-mine" : ""}${mine ? "" : " is-other"}`} href={hrefFor(e)} {...menuFor(e)}>
              <span>Shift {calendar.compactRange(s.start, s.end)}</span><span className="cal-shift-who">{open ? "Open" : yours ? "You" : s.name}</span>
            </a>,
          );
        }
      }
    } else if (e.type === "competition" || e.type === "event") {
      // Shown on its first day in this week; it reads across the days it lasts.
      if (day !== e.startDate && day !== week[0]) continue;
      items.push(
        <a key={e._id} className="cal-comp" href={hrefFor(e)} {...menuFor(e)}>
          <strong>✦ {calendar.titleOf(e)}</strong>
          <span>{e.type === "competition" ? "Competition" : calendar.timeRange(e.startTime, e.endTime) || "Event"}{e.location ? ` · ${e.location}` : ""}</span>
        </a>,
      );
    }
  }
  const [first, ...rest] = items;
  const meetingFirst = events.some((e) => e.type === "meeting") && first;
  return (
    <>
      <div className={`cal-top${topClass}`} style={{ gridColumn: column, gridRow: 1 }} {...handlers}><span className="cal-num">{Number(day.slice(8))}</span>{meetingFirst}</div>
      <div className="cal-items" style={{ gridColumn: column, gridRow: itemsRow }} {...handlers}>
        {meetingFirst ? rest : items}
        {tasks.map((t) => <a key={t._id} className="cal-task" href={`/apps/icarus?task=${t._id}`}>t{t.number}</a>)}
      </div>
    </>
  );
}
