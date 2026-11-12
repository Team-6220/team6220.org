// Shapes of Icarus's records. Plan: docs/operations/ICARUS.md.
import type { Item } from "../ops/types";

export type TaskStatus = "not-started" | "in-progress" | "done" | "cancelled";

/** One piece of work, written t42. A subtask is t42.1 (collection icarus_tasks). */
export interface Task extends Item {
  /** "42" for a task, "42.1" for its first subtask, "42.1.3" below that. */
  number: string;
  /** The _id of the task this is a subtask of, or "". */
  parentId: string;
  title: string;
  description: string;
  projectId: string;
  /** No subteams = a whole-team task, shown under "General". */
  subteams: string[];
  ownerIds: string[];
  status: TaskStatus;
  /** yyyy-mm-dd, or "" when not scheduled yet. */
  startDate: string;
  dueDate: string;
  notes: string;
  seasonId: string;
  /** _ids of tasks that must be done before this one ("needs completion of"). */
  blockedBy: string[];
  createdBy: string;
}

/** A target date, for the whole team (no subteams) or for some subteams (collection icarus_milestones). */
export interface Milestone extends Item {
  name: string;
  date: string;
  subteams: string[];
  seasonId: string;
  eventId: string;
}

/** A competition or scrimmage (collection icarus_events). */
export interface TeamEvent extends Item {
  /** The official event code ("2027casd"), or a made-up one for a local scrimmage. */
  code: string;
  /** What the team calls it ("Beach Blitz"). */
  displayName: string;
  officialName: string;
  startDate: string;
  endDate: string;
  location: string;
  source: "manual" | "tba" | "first";
}

/** One Gantt chart (collection icarus_seasons). */
export interface Season extends Item {
  name: string;
  startDate: string;
  /** The countdown rows count down to this date. */
  endDate: string;
  eventIds: string[];
}

/** Which end of the season a template date is counted from. */
export type Anchor = "start" | "end";

/** A date stored as "N days after the season starts" or "N days before it ends" (a negative offset). */
export interface TemplateDate {
  anchor: Anchor;
  offsetDays: number;
}

export interface TemplateTask {
  /** A short name used only inside the template, so subtasks can point at their parent. */
  key: string;
  parentKey: string;
  title: string;
  subteams: string[];
  start: TemplateDate;
  due: TemplateDate;
}

export interface TemplateMilestone {
  name: string;
  subteams: string[];
  date: TemplateDate;
}

/** A saved set of tasks and milestones to start a season from (collection icarus_templates). */
export interface Template extends Item {
  name: string;
  tasks: TemplateTask[];
  milestones: TemplateMilestone[];
}

/** The four kinds of planning record only a Lead can change. */
export interface PlanningRecords {
  milestone: Milestone;
  event: TeamEvent;
  season: Season;
  template: Template;
}
