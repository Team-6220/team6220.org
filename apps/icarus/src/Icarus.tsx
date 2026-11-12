// /apps/icarus: tasks and the team Gantt chart. Plan: docs/operations/ICARUS.md.
// This file loads everything and decides which screen shows; each screen is its own file.
import { useCallback, useEffect, useMemo, useState } from "react";
import { auth, icarus, ops, OpsError, type Draft, type IcarusData, type OpsViewer, type Person, type Project, type Task } from "@team6220/data";
import { AppShell, type AppShellState } from "@team6220/ui";
import { Gantt } from "./Gantt";
import { People } from "./People";
import { Plan } from "./Plan";
import { TaskForm } from "./TaskForm";
import { TaskList } from "./TaskList";

type Tab = "chart" | "mine" | "list" | "projects" | "people" | "plan";
const TABS: [Tab, string][] = [
  ["chart", "Gantt chart"],
  ["mine", "My tasks"],
  ["list", "All tasks"],
  ["projects", "Projects"],
  ["people", "People"],
  ["plan", "Plan"],
];
type Message = { tone: "ok" | "error"; text: string } | null;

export default function Icarus() {
  const [viewer, setViewer] = useState<OpsViewer | null>(null);
  const [loadError, setLoadError] = useState("");
  const [data, setData] = useState<IcarusData | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [seasonId, setSeasonId] = useState("");
  // On a phone the chart is too wide to be the first thing you see, so start on "My tasks".
  const [tab, setTab] = useState<Tab>(() => (typeof window !== "undefined" && window.innerWidth < 700 ? "mine" : "chart"));
  const [projectFilter, setProjectFilter] = useState("");
  const [editing, setEditing] = useState<Draft<Task> | null>(null);
  const [message, setMessage] = useState<Message>(null);

  const reload = useCallback(async () => {
    const [who, all, everyone, allProjects] = await Promise.all([ops.getViewer(), icarus.loadAll(), ops.listPeople(), ops.listProjects()]);
    setViewer(who);
    setData(all);
    setPeople(everyone);
    setProjects(allProjects);
  }, []);

  useEffect(() => {
    ops.readDemoFromUrl();
    (async () => {
      const who = await ops.getViewer();
      setViewer(who);
      if (who.kind === "member") await reload();
    })().catch((err) => setLoadError(err instanceof Error ? err.message : "We couldn't load Icarus."));
  }, [reload]);

  /** Runs a change, shows what happened, and reloads either way. */
  const run = useCallback(
    async (change: () => Promise<string | void>) => {
      try {
        const text = await change();
        setMessage(text ? { tone: "ok", text } : null);
      } catch (err) {
        setMessage({ tone: "error", text: err instanceof OpsError || err instanceof Error ? err.message : "That didn't work. Try again." });
      }
      await reload();
    },
    [reload],
  );

  const today = icarus.today();
  const me = viewer?.kind === "member" ? viewer.me : null;
  const subteams = viewer?.kind === "member" ? viewer.subteams : [];
  // The season on screen: the chosen one, else the one running today, else the newest.
  const season = useMemo(() => {
    const seasons = data?.seasons ?? [];
    return seasons.find((s) => s._id === seasonId) ?? seasons.find((s) => s.startDate <= today && today <= s.endDate) ?? seasons[0] ?? null;
  }, [data, seasonId, today]);
  const seasonTasks = useMemo(() => (data && season ? data.tasks.filter((t) => t.seasonId === season._id) : []), [data, season]);
  const chart = useMemo(
    () => (data && season ? icarus.buildGantt({ season, tasks: data.tasks, milestones: data.milestones, events: data.events, subteams, today }) : null),
    [data, season, subteams.join("|"), today],
  );

  const state: AppShellState = loadError ? "error" : !viewer ? "loading" : viewer.kind !== "member" ? viewer.kind : data ? "ready" : "loading";
  const openTask = (task: Draft<Task>) => (setEditing(task), window.scrollTo({ top: 0 }));

  return (
    <AppShell
      title="Icarus"
      state={state}
      who={me?.name}
      errorMessage={loadError}
      notice={ops.isDemo() ? "Demo data: nothing here is saved." : !ops.isConnected() ? "Not connected to the team server yet: you can look, but some changes won't save." : undefined}
      onSignIn={() => void auth.login("/apps/icarus")}
    >
      {me && data && (
        <div className="icr">
          <div className="icr__top">
            <label className="t-field">
              Season
              <select value={season?._id ?? ""} onChange={(e) => setSeasonId(e.target.value)}>
                {data.seasons.length === 0 && <option value="">No seasons yet</option>}
                {data.seasons.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </label>
            {season && (
              <p className="icr__countdown-text">
                {Math.max(0, icarus.daysBetween(today, season.endDate))} days ({Math.max(0, Math.floor(icarus.daysBetween(today, season.endDate) / 7))} weeks) left
              </p>
            )}
            {season && me.roles.team && (
              <button className="t-button" type="button" onClick={() => openTask(icarus.emptyTask(season._id))}>
                New task
              </button>
            )}
          </div>

          <nav className="icr__tabs" aria-label="Screens">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" className={tab === id ? "icr__tab icr__tab--on" : "icr__tab"} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </nav>

          {message && <p className={`t-status t-status--${message.tone}`} role="status">{message.text}</p>}
          {me.subteams.length === 0 && me.roles.team && tab !== "people" && (
            <p className="t-status t-status--warn">
              You haven't picked your subteams yet.{" "}
              <button type="button" className="icr__link" onClick={() => setTab("people")}>Pick them now</button>
            </p>
          )}

          {editing && (
            <TaskForm
              key={editing._id ?? `new-${editing.parentId}`}
              task={editing}
              tasks={seasonTasks}
              people={people}
              projects={projects}
              subteams={subteams}
              me={me}
              onClose={() => setEditing(null)}
              onOpenTask={openTask}
              onAddSubtask={(parent) => openTask({ ...icarus.emptyTask(parent.seasonId, parent._id), subteams: parent.subteams, projectId: parent.projectId })}
              onSave={(task) => run(async () => {
                const saved = await icarus.saveTask(task, me, data.tasks);
                setEditing(null);
                return `Saved ${icarus.taskLabel(saved)}.`;
              })}
              onRemove={(task) => run(async () => (await icarus.removeTask(task, data.tasks), setEditing(null)))}
            />
          )}

          {tab === "chart" && (chart ? (
            <>
              <Gantt chart={chart} people={people} onOpenTask={openTask} />
              {chart.unscheduled.length > 0 && (
                <section className="t-panel">
                  <h2>Not scheduled yet</h2>
                  <ul className="icr__sublist">
                    {chart.unscheduled.map((t) => (
                      <li key={t._id}>
                        <button type="button" className="icr__task-button" onClick={() => openTask(t)}>
                          <span className="icr__number">{icarus.taskLabel(t)}</span> {t.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <div className="icr__buttons">
                <button className="t-button t-button--quiet" type="button" onClick={() => window.print()}>Print the chart</button>
                <button className="t-button t-button--quiet" type="button" onClick={() => download(`${season!.name}.csv`, ops.toCsv(icarus.tasksToSheetRows(seasonTasks, people)))}>
                  Export tasks (CSV, sheet columns)
                </button>
              </div>
            </>
          ) : (
            <p className="t-muted">There is no season yet. A lead can create one on the Plan screen.</p>
          ))}
          {(tab === "mine" || tab === "list") && (
            <TaskList key={`${tab}-${projectFilter}`} tasks={seasonTasks} people={people} projects={projects} subteams={subteams} me={me} mineOnly={tab === "mine"}
              projectId={tab === "list" ? projectFilter : ""} today={today} onOpenTask={openTask} />
          )}
          {tab === "projects" && (
            <Projects projects={projects} tasks={data.tasks} canCreate={me.roles.lead} subteams={subteams} run={run}
              onShowTasks={(id) => (setProjectFilter(id), setTab("list"))} />
          )}
          {tab === "people" && <People key={me.subteams.join("|")} me={me} people={people} subteams={subteams} run={run} />}
          {tab === "plan" && <Plan me={me} data={data} season={season} subteams={subteams} onChooseSeason={setSeasonId} run={run} />}
        </div>
      )}
    </AppShell>
  );
}

/** Projects (p10): one shared list, also used by Production and BOM. */
function Projects({
  projects, tasks, canCreate, run, onShowTasks,
}: {
  projects: Project[];
  tasks: Task[];
  canCreate: boolean;
  subteams: string[];
  run: (change: () => Promise<string | void>) => Promise<void>;
  onShowTasks: (projectId: string) => void;
}) {
  return (
    <section className="t-panel">
      <h2>Projects</h2>
      <ul className="icr__list">
        {projects.map((p) => {
          const mine = tasks.filter((t) => t.projectId === p._id);
          const done = mine.filter((t) => t.status === "done").length;
          return (
            <li key={p._id}>
              <button type="button" className="icr__list-item" onClick={() => onShowTasks(p._id)}>
                <span className="icr__list-title"><span className="icr__number">{ops.projectLabel(p)}</span> {p.name}</span>
                <span className="t-muted">{p.subteams.join(", ") || "Whole team"}</span>
                <span className="t-muted">{mine.length ? `${done} of ${mine.length} tasks done` : "No tasks yet"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {canCreate && (
        <button
          className="t-button"
          type="button"
          onClick={() => {
            const name = window.prompt("Name of the new project");
            if (name) void run(async () => `Created ${ops.projectLabel(await ops.saveProject({ name }))} ${name}.`);
          }}
        >
          New project
        </button>
      )}
    </section>
  );
}

function download(filename: string, text: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
