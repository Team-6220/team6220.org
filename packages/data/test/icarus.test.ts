// Icarus: the Gantt chart's numbers, templates, task numbering and the planning-record rules.
import { beforeEach, describe, expect, it } from "vitest";
import { icarus, ops } from "../src/index";
import { mockTransport } from "../src/ops/mock";
import type { Me } from "../src/ops/types";
import type { Milestone, Season, Task, TeamEvent } from "../src/icarus/types";
import { makeScript } from "./helpers/ops-api-script";

const season: Season = { _id: "s1", name: "2027 Competition", startDate: "2027-01-09", endDate: "2027-05-01", eventIds: ["e1"] };
const task = (over: Partial<Task>): Task => ({ ...icarus.emptyTask("s1"), _id: `id-${over.number}`, number: "1", title: "Task", createdBy: "x", ...over }) as Task;

describe("dates", () => {
  it("adds and counts days without time-zone surprises", () => {
    expect(icarus.addDays("2027-01-30", 3)).toBe("2027-02-02");
    expect(icarus.addDays("2027-03-14", 1)).toBe("2027-03-15"); // the day clocks change in the US
    expect(icarus.daysBetween("2027-01-09", "2027-05-01")).toBe(112);
    expect(icarus.eachDay("2027-02-27", "2027-03-02")).toEqual(["2027-02-27", "2027-02-28", "2027-03-01", "2027-03-02"]);
    expect(icarus.weekday("2027-01-09")).toBe(6);
  });
});

describe("the Gantt chart", () => {
  const events: TeamEvent[] = [
    { _id: "e1", code: "x", displayName: "Beach Blitz", officialName: "", startDate: "2027-03-13", endDate: "2027-03-14", location: "", source: "manual" },
    { _id: "e2", code: "y", displayName: "Not in this season", officialName: "", startDate: "2027-02-01", endDate: "2027-02-01", location: "", source: "manual" },
  ];
  const milestones: Milestone[] = [
    { _id: "m1", name: "Kickoff", date: "2027-01-09", subteams: [], seasonId: "s1", eventId: "" },
    { _id: "m2", name: "Design review", date: "2027-01-23", subteams: ["Design"], seasonId: "s1", eventId: "" },
  ];
  const tasks = [
    task({ number: "1", title: "Fix swerve", subteams: ["Programming"], startDate: "2027-01-10", dueDate: "2027-01-13", status: "done" }),
    task({ number: "2", title: "Vision", subteams: ["Programming"], startDate: "2027-01-19", dueDate: "2027-02-06", status: "in-progress" }),
    task({ number: "2.1", parentId: "id-2", title: "Camera mounts", subteams: ["Programming"], startDate: "2027-01-19", dueDate: "2027-01-20" }),
    task({ number: "3", title: "CAD", subteams: ["Design", "Manufacturing"], startDate: "2027-01-12", dueDate: "2027-01-15" }),
    task({ number: "4", title: "Build", subteams: ["Manufacturing"], startDate: "2027-01-16", dueDate: "2027-01-30", blockedBy: ["id-3"] }),
    task({ number: "5", title: "Team dinner", dueDate: "2027-02-01" }),
    task({ number: "6", title: "No dates yet", subteams: ["Operations"] }),
    task({ number: "7", title: "Another season", seasonId: "other", startDate: "2027-01-10", dueDate: "2027-01-11" }),
  ];
  const chart = icarus.buildGantt({ season, tasks, milestones, events, subteams: ["Design", "Manufacturing", "Programming"], today: "2027-01-18" });

  it("has the sheet's countdown rows: days left and weeks left to the season's end", () => {
    expect(chart.days).toHaveLength(113);
    expect(chart.days[0]).toMatchObject({ date: "2027-01-09", daysLeft: 112, weeksLeft: 16, month: "January", dayOfMonth: 9, weekdayLetter: "S", isSaturday: true });
    expect(chart.days[1]).toMatchObject({ daysLeft: 111, weeksLeft: 15, weekdayLetter: "SU" });
    expect(chart.days.at(-1)).toMatchObject({ date: "2027-05-01", daysLeft: 0, weeksLeft: 0, month: "May" });
    expect(chart.days.filter((d) => d.isToday).map((d) => d.date)).toEqual(["2027-01-18"]);
  });

  it("groups tasks by subteam with General first, and puts subtasks under their parent", () => {
    expect(chart.groups.map((g) => g.name)).toEqual(["General", "Design", "Manufacturing", "Programming"]);
    const titles = (name: string) => chart.groups.find((g) => g.name === name)!.rows.map((r) => `${"  ".repeat(r.depth)}${r.task.title}`);
    expect(titles("General")).toEqual(["Team dinner"]);
    expect(titles("Design")).toEqual(["CAD"]); // on two subteams, drawn once under the first
    expect(titles("Manufacturing")).toEqual(["Build"]);
    expect(titles("Programming")).toEqual(["Fix swerve", "Vision", "  Camera mounts"]);
    expect(chart.unscheduled.map((t) => t.title)).toEqual(["No dates yet"]);
  });

  it("places bars by day, and marks overdue and blocked tasks", () => {
    const row = (title: string) => chart.groups.flatMap((g) => g.rows).find((r) => r.task.title === title)!;
    expect(row("Fix swerve")).toMatchObject({ bar: { from: 1, to: 4 }, overdue: false }); // done, so not overdue
    expect(row("CAD")).toMatchObject({ bar: { from: 3, to: 6 }, overdue: true });
    expect(row("Build")).toMatchObject({ blocked: true });
    expect(row("Team dinner").bar).toEqual({ from: 23, to: 23 }); // only a due date: a one-day bar
  });

  it("draws events and whole-team target dates as lines, and subteam target dates on their group", () => {
    expect(chart.lines).toEqual([
      { column: 0, span: 1, label: "Kickoff", kind: "milestone" },
      { column: 63, span: 2, label: "Beach Blitz", kind: "event" },
    ]);
    expect(chart.groups.find((g) => g.name === "Design")!.milestones).toEqual([{ column: 14, name: "Design review" }]);
  });

  it("sorts t42.2 before t42.10", () => {
    const sorted = [{ number: "42.10" }, { number: "42.2" }, { number: "5" }, { number: "42" }].sort(icarus.byNumber);
    expect(sorted.map((t) => t.number)).toEqual(["5", "42", "42.2", "42.10"]);
  });
});

describe("templates", () => {
  it("lays the built-in season template onto real dates", () => {
    const plan = icarus.previewTemplate(icarus.BUILT_IN_TEMPLATES[0], season);
    expect(plan.tasks.find((t) => t.key === "swerve")).toMatchObject({ startDate: "2027-01-10", dueDate: "2027-01-19", subteams: ["Programming"] });
    expect(plan.milestones[0]).toEqual({ name: "Kickoff", subteams: [], date: "2027-01-09" });
    // Every subtask's parent comes earlier in the list, which startSeasonFromTemplate relies on.
    for (const template of icarus.BUILT_IN_TEMPLATES) {
      template.tasks.forEach((t, i) => t.parentKey && expect(template.tasks.findIndex((p) => p.key === t.parentKey)).toBeLessThan(i));
    }
  });

  it("turns a season back into a template that gives the same dates", () => {
    const tasks = [
      task({ number: "1", title: "Early", startDate: "2027-01-10", dueDate: "2027-01-13" }),
      task({ number: "1.1", parentId: "id-1", title: "Sub", startDate: "2027-01-10", dueDate: "2027-01-11" }),
      task({ number: "2", title: "Before the last event", startDate: "2027-04-20", dueDate: "2027-04-30" }),
    ];
    const template = icarus.seasonToTemplate(season, tasks, []);
    expect(template.tasks[1]).toMatchObject({ key: "t1.1", parentKey: "t1" });
    expect(template.tasks[2].due).toEqual({ anchor: "end", offsetDays: -1 });
    const again = icarus.previewTemplate(template, season);
    expect(again.tasks.map((t) => [t.startDate, t.dueDate])).toEqual(tasks.map((t) => [t.startDate, t.dueDate]));
    // On a season that ends a week later, late tasks move with the end and early ones stay with the start.
    const later = icarus.previewTemplate(template, { ...season, endDate: "2027-05-08" });
    expect(later.tasks.map((t) => t.dueDate)).toEqual(["2027-01-13", "2027-01-11", "2027-05-07"]);
  });
});

describe("Icarus in demo mode", () => {
  let me: Me;
  beforeEach(async () => {
    ops.resetMock();
    const viewer = await ops.getViewer();
    if (viewer.kind !== "member") throw new Error("expected the demo lead");
    me = viewer.me;
  });

  it("numbers new tasks and subtasks, and logs them", async () => {
    const { tasks, seasons } = await icarus.loadAll();
    const top = Math.max(...tasks.filter((t) => !t.parentId).map((t) => Number(t.number)));
    const created = await icarus.saveTask({ ...icarus.emptyTask(seasons[0]._id), title: "Wire the elevator" }, me, tasks);
    expect(created.number).toBe(String(top + 1));
    const all = [...tasks, created];
    const sub1 = await icarus.saveTask({ ...icarus.emptyTask(seasons[0]._id, created._id), title: "Crimp connectors" }, me, all);
    const sub2 = await icarus.saveTask({ ...icarus.emptyTask(seasons[0]._id, created._id), title: "Label wires" }, me, [...all, sub1]);
    expect([icarus.taskLabel(sub1), icarus.taskLabel(sub2)]).toEqual([`t${top + 1}.1`, `t${top + 1}.2`]);
    expect(await ops.listHistory({ kind: "task", id: created._id })).toMatchObject([{ action: "created", actorName: "Demo Lead" }]);
    await expect(icarus.removeTask(created, [...all, sub1, sub2])).rejects.toThrow(/subtasks first/);
    await expect(icarus.saveTask({ ...created, startDate: "2027-02-02", dueDate: "2027-02-01" }, me, all)).rejects.toThrow(/before the start/);
  });

  it("starts a season from a template", async () => {
    const created = await icarus.savePlanning("season", { name: "2028 Competition", startDate: "2028-01-08", endDate: "2028-04-29", eventIds: [] });
    const count = await icarus.startSeasonFromTemplate(icarus.BUILT_IN_TEMPLATES[0], created, me);
    const { tasks, milestones } = await icarus.loadAll();
    const mine = tasks.filter((t) => t.seasonId === created._id);
    expect(mine).toHaveLength(count);
    expect(new Set(mine.map((t) => t.number)).size).toBe(count); // no two tasks share a number
    const cad = mine.find((t) => t.title === "CAD the robot")!;
    expect(mine.filter((t) => t.parentId === cad._id).map((t) => t.number)).toEqual([`${cad.number}.1`, `${cad.number}.2`]);
    expect(milestones.filter((m) => m.seasonId === created._id).map((m) => m.name)).toContain("Kickoff");
  });

  it("exports tasks in the sheet's column order", async () => {
    const { tasks } = await icarus.loadAll();
    const rows = icarus.tasksToSheetRows(tasks.slice(0, 1), await ops.listPeople());
    expect(rows[0]).toEqual(["TASK", "OWNER(S)", "NOTES", "STATUS", "START", "DUE"]);
    expect(rows[1][0]).toMatch(/^t1 /);
  });
});

// The planning-record rules, checked against both backends with the same steps (like bom-rules.test.ts).
describe.each([
  ["ops-api (Icarus.gs)", () => {
    const script = makeScript({
      "tok-lead-0123456789abcdef": { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] },
      "tok-member-0123456789abcdef": { id: "m-member", status: "APPROVED", badges: ["b-team"] },
    });
    return async (role: string, action: string, args: object) => script.post({ action, token: `tok-${role}-0123456789abcdef`, ...args });
  }],
  ["demo (icarus/mock.ts)", () => {
    ops.resetMock();
    return (role: string, action: string, args: object) => mockTransport({ action, token: `mock:${role}`, ...args });
  }],
])("planning records: %s", (_name, make) => {
  it("lets only leads save and remove them, and checks their fields", async () => {
    const send = make();
    const milestone = { name: "Design review", date: "2027-01-23", subteams: ["Design"], seasonId: "s1" };
    expect(await send("member", "saveIcarusRecord", { kind: "milestone", record: milestone })).toMatchObject({ ok: false, error: "forbidden" });
    const saved = await send("lead", "saveIcarusRecord", { kind: "milestone", record: { ...milestone, sneaky: "extra field" } });
    expect(saved).toMatchObject({ ok: true, record: { name: "Design review", subteams: ["Design"], eventId: "" } });
    expect(saved.record).not.toHaveProperty("sneaky");

    const bad = (record: object, kind = "milestone") => send("lead", "saveIcarusRecord", { kind, record });
    expect(await bad({ ...milestone, date: "January 23" })).toMatchObject({ ok: false, error: "bad-request" });
    expect(await bad({ ...milestone, subteams: ["Lead"] })).toMatchObject({ ok: false, error: "bad-request" });
    expect(await bad({ name: "Backwards", startDate: "2027-05-01", endDate: "2027-01-09", eventIds: [] }, "season")).toMatchObject({ ok: false, error: "bad-request" });
    expect(await bad(milestone, "task")).toMatchObject({ ok: false, error: "bad-request" });

    expect(await send("member", "removeIcarusRecord", { kind: "milestone", id: saved.record._id })).toMatchObject({ ok: false, error: "forbidden" });
    expect(await send("lead", "removeIcarusRecord", { kind: "milestone", id: saved.record._id })).toMatchObject({ ok: true });
  });
});
