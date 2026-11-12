// The Gantt chart, laid out like the team's Gantt sheets. icarus.buildGantt (packages/data/src/icarus/gantt.ts)
// works out every number; this file only draws them.
//
// It is one wide table that scrolls sideways with the task column pinned. Each task row has one long cell
// (the "track") holding its bar; bars and lines are placed by day using the --day width from icarus.css.
import { Fragment, useState, type CSSProperties, type MouseEvent } from "react";
import { icarus, type Gantt as GanttData, type GanttRow, type Person, type Task } from "@team6220/data";

/** What can be added by clicking an empty day on the chart. */
export type AddKind = "task" | "milestone" | "event";

interface GanttProps {
  chart: GanttData;
  people: Person[];
  onOpenTask: (task: Task) => void;
  /** Which kinds this person may add (none for viewers). Members add tasks; leads also add target dates and events. */
  canAdd: AddKind[];
  /** Called when someone picks what to add on a day. `group` is the subteam row they clicked ("General" for none). */
  onAdd: (kind: AddKind, date: string, group: string) => void;
}

const ADD_LABELS: Record<AddKind, string> = { task: "New task", milestone: "Target date", event: "Event" };

/** Runs of neighbouring days that share a value, for header cells that span several days (weeks, months). */
function runs<T>(items: T[], key: (item: T) => string | number): { label: string | number; length: number }[] {
  const out: { label: string | number; length: number }[] = [];
  for (const item of items) {
    const label = key(item);
    if (out.length && out[out.length - 1].label === label) out[out.length - 1].length++;
    else out.push({ label, length: 1 });
  }
  return out;
}

/** How many day columns a target date's name needs before the next one starts. */
const NAME_ROOM_DAYS = 8;

/** "2027-01-09" -> "1/9", as the sheets write dates. */
const shortDate = (date: string) => (date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}` : "");

export function Gantt({ chart, people, onOpenTask, canAdd, onAdd }: GanttProps) {
  // The little "add here" menu: where it was opened, and for which day and subteam row.
  const [menu, setMenu] = useState<{ date: string; group: string; x: number; y: number } | null>(null);
  const { days, groups, lines } = chart;
  const todayColumn = days.findIndex((d) => d.isToday);
  const firstSaturday = days.findIndex((d) => d.isSaturday);
  const names = (ids: string[]) => ids.map((id) => people.find((p) => p.memberId === id)?.name.split(" ")[0] ?? "").filter(Boolean).join(", ");
  /** Where a thing starting at day `column` and lasting `span` days sits inside a track. */
  const place = (column: number, span = 1): CSSProperties => ({ left: `calc(${column} * var(--day))`, width: `calc(${span} * var(--day))` });
  // Saturdays are tinted with a repeating background that starts at the first Saturday.
  const trackStyle = { "--first-saturday": firstSaturday } as CSSProperties;
  const trackClass = canAdd.length ? "icr__track icr__track--clickable" : "icr__track";
  const GENERAL = icarus.GENERAL;

  /** Clicking an empty spot in a row's track opens the "add here" menu for that day. */
  const openMenu = (group: string) => (event: MouseEvent<HTMLTableCellElement>) => {
    if (!canAdd.length || (event.target as HTMLElement).closest(".icr__bar, .icr__milestone")) return;
    const box = event.currentTarget.getBoundingClientRect();
    const column = Math.min(days.length - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * days.length)));
    setMenu({ date: days[column].date, group, x: event.clientX, y: event.clientY });
  };

  /** The lines every track shares: today, events and whole-team target dates. */
  const marks = (
    <>
      {todayColumn !== -1 && <span className="icr__mark icr__mark--today" style={place(todayColumn)} />}
      {lines.map((line, i) => (
        <span key={i} className={`icr__mark icr__mark--${line.kind}`} style={place(line.column, line.span)} />
      ))}
    </>
  );

  function taskRow({ task, depth, bar, overdue, blocked }: GanttRow, group: string) {
    return (
      <tr key={task._id} className="icr__task-row">
        <th scope="row" className="icr__pin">
          <button type="button" className="icr__task-button" style={{ paddingLeft: `calc(${depth} * 1rem)` }} onClick={() => onOpenTask(task)}>
            <span className="icr__number">{icarus.taskLabel(task)}</span> {task.title}
            {blocked && <span className="icr__flag" title="Waiting on another task"> ⏳</span>}
          </button>
        </th>
        <td>{names(task.ownerIds)}</td>
        <td title={icarus.STATUS_LABELS[task.status]}>{icarus.STATUS_ICONS[task.status]}</td>
        <td>{shortDate(task.startDate)}</td>
        <td className={overdue ? "icr__overdue" : undefined}>{shortDate(task.dueDate)}</td>
        <td colSpan={days.length} className={trackClass} style={trackStyle} onClick={openMenu(group)}>
          {marks}
          {bar && (
            <span
              role="button"
              tabIndex={0}
              onClick={() => onOpenTask(task)}
              onKeyDown={(e) => e.key === "Enter" && onOpenTask(task)}
              className={`icr__bar icr__bar--${task.status}${overdue ? " icr__bar--overdue" : ""}`}
              style={place(bar.from, bar.to - bar.from + 1)}
              title={`${icarus.taskLabel(task)} ${task.title}: ${shortDate(task.startDate)} to ${shortDate(task.dueDate)}`}
            />
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="icr__gantt" style={{ "--days": days.length } as CSSProperties}>
      <table className="icr__chart">
        <thead>
          <tr className="icr__countdown">
            <th className="icr__pin" colSpan={1}>Days left</th>
            <th colSpan={4} />
            {days.map((d) => (
              <th key={d.date} className={d.isToday ? "icr__day icr__day--today" : "icr__day"}>{d.daysLeft}</th>
            ))}
          </tr>
          <tr className="icr__countdown">
            <th className="icr__pin">Weeks left</th>
            <th colSpan={4} />
            {runs(days, (d) => d.weeksLeft).map((week, i) => (
              <th key={i} colSpan={week.length} className="icr__span">{week.label}</th>
            ))}
          </tr>
          <tr>
            <th className="icr__pin" rowSpan={3}>Task</th>
            <th rowSpan={3}>Owner(s)</th>
            <th rowSpan={3}>Status</th>
            <th rowSpan={3}>Start</th>
            <th rowSpan={3}>Due</th>
            {runs(days, (d) => d.month).map((month, i) => (
              <th key={i} colSpan={month.length} className="icr__span">{month.label}</th>
            ))}
          </tr>
          <tr>
            {days.map((d) => (
              <th key={d.date} className={`icr__day${d.isToday ? " icr__day--today" : ""}${d.isSaturday ? " icr__day--saturday" : ""}`}>{d.dayOfMonth}</th>
            ))}
          </tr>
          <tr>
            {days.map((d) => (
              <th key={d.date} className={`icr__day${d.isToday ? " icr__day--today" : ""}${d.isSaturday ? " icr__day--saturday" : ""}`}>{d.weekdayLetter}</th>
            ))}
          </tr>
          {lines.length > 0 && (
            <tr className="icr__labels-row">
              <th className="icr__pin">Events and team dates</th>
              <th colSpan={4} />
              <td colSpan={days.length} className={`${trackClass} icr__track--labels`} onClick={openMenu(GENERAL)}>
                {lines.map((line, i) => (
                  <span key={i} className={`icr__line-label icr__line-label--${line.kind}`} style={{ left: `calc(${line.column} * var(--day))` }}>
                    {line.label}
                  </span>
                ))}
              </td>
            </tr>
          )}
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.name}>
              <tr className="icr__group">
                <th className="icr__pin" scope="rowgroup">{group.name}</th>
                <td colSpan={4} />
                <td colSpan={days.length} className={trackClass} style={trackStyle} onClick={openMenu(group.name)}>
                  {marks}
                  {group.milestones.map((m, i) => {
                    // When two target dates are close together, only the later one shows its name
                    // (the other keeps its ◆ and shows the name when pointed at), so names never overlap.
                    const next = group.milestones[i + 1];
                    const roomForName = !next || next.column - m.column >= NAME_ROOM_DAYS;
                    return (
                      <span key={i} className="icr__milestone" style={{ left: `calc(${m.column} * var(--day))` }} title={m.name}>
                        ◆{roomForName && ` ${m.name}`}
                      </span>
                    );
                  })}
                </td>
              </tr>
              {group.rows.map((row) => taskRow(row, group.name))}
              {group.rows.length === 0 && (
                <tr className="icr__task-row">
                  <th className="icr__pin icr__empty">No scheduled tasks</th>
                  <td colSpan={4} />
                  <td colSpan={days.length} className={trackClass} style={trackStyle} onClick={openMenu(group.name)}>{marks}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {canAdd.length > 0 && <p className="t-hint icr__gantt-hint">Click an empty day in a row to add a task{canAdd.length > 1 ? ", target date or event" : ""} there. Click a bar to open its task.</p>}

      {menu && (
        <>
          {/* Clicking anywhere else closes the menu. */}
          <button type="button" className="icr__menu-backdrop" aria-label="Close" onClick={() => setMenu(null)} />
          <div className="icr__menu" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 170) }}
            onKeyDown={(e) => e.key === "Escape" && setMenu(null)}>
            <p className="icr__menu-title">
              {shortDate(menu.date)} · {menu.group}
            </p>
            {canAdd.map((kind) => (
              <button key={kind} type="button" role="menuitem" autoFocus={kind === canAdd[0]} onClick={() => (setMenu(null), onAdd(kind, menu.date, menu.group))}>
                + {ADD_LABELS[kind]}
                {kind === "milestone" && (menu.group === GENERAL ? " (whole team)" : ` (${menu.group})`)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
