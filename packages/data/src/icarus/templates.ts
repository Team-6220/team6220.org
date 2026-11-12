// Templates: a saved set of tasks and milestones whose dates are stored as offsets ("3 days after the season
// starts", "14 days before it ends"), so the same plan can be laid onto any season.
import { addDays, daysBetween } from "./dates";
import type { Anchor, Milestone, Season, Task, Template, TemplateDate, TemplateMilestone, TemplateTask } from "./types";

function toDate(season: Pick<Season, "startDate" | "endDate">, date: TemplateDate): string {
  return addDays(date.anchor === "start" ? season.startDate : season.endDate, date.offsetDays);
}

/** Dates in the second half of a season are counted back from its end, so they follow the last event. */
function toTemplateDate(season: Season, date: string): TemplateDate {
  const fromStart = daysBetween(season.startDate, date);
  const fromEnd = daysBetween(season.endDate, date);
  const anchor: Anchor = fromStart <= -fromEnd ? "start" : "end";
  return { anchor, offsetDays: anchor === "start" ? fromStart : fromEnd };
}

/** What a template would create in a season. Nothing is saved: the screen shows this for the lead to confirm. */
export function previewTemplate(template: Pick<Template, "tasks" | "milestones">, season: Season) {
  return {
    tasks: template.tasks.map((t) => ({
      key: t.key,
      parentKey: t.parentKey,
      title: t.title,
      subteams: t.subteams,
      startDate: toDate(season, t.start),
      dueDate: toDate(season, t.due),
    })),
    milestones: template.milestones.map((m) => ({ name: m.name, subteams: m.subteams, date: toDate(season, m.date) })),
  };
}

/** Turns a season's scheduled tasks and its milestones into a template (to reuse next year). */
export function seasonToTemplate(season: Season, tasks: Task[], milestones: Milestone[]): Pick<Template, "tasks" | "milestones"> {
  const mine = tasks.filter((t) => t.seasonId === season._id && t.startDate && t.dueDate && t.status !== "cancelled");
  const keys = new Map(mine.map((t) => [t._id, `t${t.number}`]));
  const templateTasks: TemplateTask[] = mine.map((t) => ({
    key: keys.get(t._id)!,
    parentKey: keys.get(t.parentId) ?? "",
    title: t.title,
    subteams: t.subteams,
    start: toTemplateDate(season, t.startDate),
    due: toTemplateDate(season, t.dueDate),
  }));
  const templateMilestones: TemplateMilestone[] = milestones
    .filter((m) => m.seasonId === season._id)
    .map((m) => ({ name: m.name, subteams: m.subteams, date: toTemplateDate(season, m.date) }));
  return { tasks: templateTasks, milestones: templateMilestones };
}

const start = (offsetDays: number): TemplateDate => ({ anchor: "start", offsetDays });
const end = (offsetDays: number): TemplateDate => ({ anchor: "end", offsetDays });
const task = (key: string, title: string, subteams: string[], from: TemplateDate, due: TemplateDate, parentKey = ""): TemplateTask => ({
  key, parentKey, title, subteams, start: from, due,
});

/**
 * The two templates Icarus starts with. PROPOSED content: a first guess at a build season and an offseason,
 * written from the shape of the team's Gantt sheets. Leads should start a season from one, fix it in the chart,
 * then use "Save this season as a template" so next year starts from what really happened.
 */
export const BUILT_IN_TEMPLATES: Pick<Template, "name" | "tasks" | "milestones">[] = [
  {
    name: "Season (built-in)",
    tasks: [
      task("strategy", "Game analysis and strategy", [], start(0), start(3)),
      task("proto", "Prototype mechanisms", ["Design", "Manufacturing"], start(2), start(14)),
      task("cad", "CAD the robot", ["Design"], start(7), start(24)),
      task("cad-drive", "Drivetrain CAD", ["Design"], start(7), start(12), "cad"),
      task("cad-mech", "Mechanism CAD", ["Design"], start(12), start(24), "cad"),
      task("swerve", "Swerve drive code", ["Programming"], start(1), start(10)),
      task("vision", "Vision", ["Programming"], start(9), start(28)),
      task("subsystems", "Subsystem code", ["Programming"], start(14), start(35)),
      task("auto", "Autonomous routines", ["Programming"], start(30), start(42)),
      task("build", "Manufacture and assemble", ["Manufacturing"], start(18), start(35)),
      task("wire", "Wire the robot", ["Electrical"], start(30), start(38)),
      task("practice", "Driver practice", [], start(38), start(42)),
      task("pit", "Pit, packing list and travel", ["Operations"], start(21), start(40)),
      task("awards", "Award submissions", ["Operations"], start(14), start(33)),
    ],
    milestones: [
      { name: "Kickoff", subteams: [], date: start(0) },
      { name: "Design review", subteams: ["Design", "Manufacturing"], date: start(14) },
      { name: "Design talk with programming", subteams: ["Design", "Programming"], date: start(10) },
      { name: "Robot driving", subteams: [], date: start(35) },
    ],
  },
  {
    name: "Offseason (built-in)",
    tasks: [
      task("train", "Train new members", [], start(0), start(21)),
      task("project", "Offseason robot or project", ["Design", "Manufacturing"], start(14), end(-14)),
      task("code", "Code cleanup and new features", ["Programming"], start(7), end(-14)),
      task("shop", "Organize the shop and inventory audit", ["Manufacturing", "Operations"], start(0), start(14)),
      task("sponsors", "Sponsor outreach", ["Operations"], start(0), end(-7)),
      task("ready", "Get ready for the offseason event", [], end(-14), end(0)),
    ],
    milestones: [
      { name: "Project design review", subteams: ["Design"], date: start(28) },
      { name: "Offseason event", subteams: [], date: end(0) },
    ],
  },
];
