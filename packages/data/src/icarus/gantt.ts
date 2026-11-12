// Works out what the Gantt chart shows. No drawing happens here: Gantt.tsx turns this into a grid.
//
// The chart copies the team's Gantt sheets: one column per day of the season; above the days, a "days left"
// row and a "weeks left" row counting down to the season's end, then month, date and weekday; tasks grouped
// under a heading per subteam; events and whole-team target dates as lines down the whole chart.
import { daysBetween, eachDay, MONTH_NAMES, weekday, WEEKDAY_LETTERS } from "./dates";
import type { Milestone, Season, Task, TeamEvent } from "./types";

/** The group for tasks and milestones that belong to no subteam (the sheet template calls it "General"). */
export const GENERAL = "General";

export interface GanttDay {
  date: string;
  /** Days until the season's end date (0 on the last day). */
  daysLeft: number;
  /** Whole weeks until the season's end date. */
  weeksLeft: number;
  month: string;
  dayOfMonth: number;
  weekdayLetter: string;
  isSaturday: boolean;
  isToday: boolean;
}

export interface GanttRow {
  task: Task;
  /** 0 for a task, 1 for a subtask, 2 below that. */
  depth: number;
  /** The first and last day columns of the bar (0 = the season's first day), or null when there is no bar. */
  bar: { from: number; to: number } | null;
  /** Due before today and not done or cancelled. */
  overdue: boolean;
  /** Waiting on another task that isn't done yet. */
  blocked: boolean;
}

export interface GanttGroup {
  name: string;
  rows: GanttRow[];
  /** Target dates for this subteam: the day column and the name. */
  milestones: { column: number; name: string }[];
}

/** A line down the whole chart: an event, or a whole-team target date. */
export interface GanttLine {
  column: number;
  /** How many days it covers (events can last several). */
  span: number;
  label: string;
  kind: "event" | "milestone";
}

export interface Gantt {
  days: GanttDay[];
  groups: GanttGroup[];
  lines: GanttLine[];
  /** Tasks of this season with no start or due date. They are listed under the chart. */
  unscheduled: Task[];
}

interface GanttInput {
  season: Season;
  tasks: Task[];
  milestones: Milestone[];
  events: TeamEvent[];
  /** Every subteam, in the team's order. */
  subteams: string[];
  today: string;
}

export function buildGantt({ season, tasks, milestones, events, subteams, today }: GanttInput): Gantt {
  const dates = eachDay(season.startDate, season.endDate);
  const last = dates.length - 1;
  /** A date's column, kept inside the chart. Null when the date is empty. */
  const column = (date: string) => (date ? Math.min(last, Math.max(0, daysBetween(season.startDate, date))) : null);
  const inSeason = (date: string) => date >= season.startDate && date <= season.endDate;

  const days: GanttDay[] = dates.map((date) => {
    const daysLeft = daysBetween(date, season.endDate);
    return {
      date,
      daysLeft,
      weeksLeft: Math.floor(daysLeft / 7),
      month: MONTH_NAMES[Number(date.slice(5, 7)) - 1],
      dayOfMonth: Number(date.slice(8, 10)),
      weekdayLetter: WEEKDAY_LETTERS[weekday(date)],
      isSaturday: weekday(date) === 6,
      isToday: date === today,
    };
  });

  const mine = tasks.filter((t) => t.seasonId === season._id);
  const byId = new Map(mine.map((t) => [t._id, t]));
  const isOpen = (t: Task) => t.status !== "done" && t.status !== "cancelled";

  function row(task: Task, depth: number): GanttRow {
    const from = column(task.startDate || task.dueDate);
    const to = column(task.dueDate || task.startDate);
    return {
      task,
      depth,
      bar: from === null || to === null ? null : { from: Math.min(from, to), to: Math.max(from, to) },
      overdue: !!task.dueDate && task.dueDate < today && isOpen(task),
      blocked: isOpen(task) && task.blockedBy.some((id) => byId.has(id) && isOpen(byId.get(id)!)),
    };
  }

  /** A task followed by its subtasks, and theirs, in number order. */
  function withSubtasks(task: Task, depth: number): GanttRow[] {
    const children = mine.filter((t) => t.parentId === task._id).sort(byNumber);
    return [row(task, depth), ...children.flatMap((child) => withSubtasks(child, depth + 1))];
  }

  const scheduled = (t: Task) => !!(t.startDate || t.dueDate);
  const topLevel = mine.filter((t) => !t.parentId || !byId.has(t.parentId));
  const groups: GanttGroup[] = [GENERAL, ...subteams].map((name) => {
    // A task on two subteams appears under the first one, so it is never drawn twice.
    const belongs = (t: Task) => (name === GENERAL ? t.subteams.length === 0 : t.subteams[0] === name);
    return {
      name,
      rows: topLevel.filter((t) => belongs(t) && scheduled(t)).sort(byStart).flatMap((t) => withSubtasks(t, 0)),
      milestones: milestones
        .filter((m) => m.seasonId === season._id && m.subteams.includes(name) && inSeason(m.date))
        .map((m) => ({ column: column(m.date)!, name: m.name })),
    };
  });

  const lines: GanttLine[] = [
    ...events
      .filter((e) => season.eventIds.includes(e._id) && e.endDate >= season.startDate && e.startDate <= season.endDate)
      .map((e) => ({
        column: column(e.startDate)!,
        span: column(e.endDate)! - column(e.startDate)! + 1,
        label: e.displayName,
        kind: "event" as const,
      })),
    ...milestones
      .filter((m) => m.seasonId === season._id && m.subteams.length === 0 && inSeason(m.date))
      .map((m) => ({ column: column(m.date)!, span: 1, label: m.name, kind: "milestone" as const })),
  ].sort((a, b) => a.column - b.column);

  return { days, groups, lines, unscheduled: topLevel.filter((t) => !scheduled(t)).sort(byNumber) };
}

/** "42.2" before "42.10": compares each part as a number. */
export function byNumber(a: Pick<Task, "number">, b: Pick<Task, "number">): number {
  const pa = a.number.split(".").map(Number);
  const pb = b.number.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? -1) !== (pb[i] ?? -1)) return (pa[i] ?? -1) - (pb[i] ?? -1);
  }
  return 0;
}

function byStart(a: Task, b: Task): number {
  return (a.startDate || a.dueDate).localeCompare(b.startDate || b.dueDate) || byNumber(a, b);
}

export const STATUS_LABELS: Record<Task["status"], string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  done: "Done",
  cancelled: "Cancelled",
};
/** The icons the team's Gantt sheets use in the STATUS column. */
export const STATUS_ICONS: Record<Task["status"], string> = {
  "not-started": "🗒️",
  "in-progress": "✏️",
  done: "✅",
  cancelled: "🚫",
};
