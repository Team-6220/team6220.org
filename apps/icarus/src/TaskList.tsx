// Tasks as a list with filters. "My tasks" is this list with the "mine" filter on.
import { useState } from "react";
import { icarus, type Me, type Person, type Project, type Task, type TaskStatus } from "@team6220/data";

interface TaskListProps {
  tasks: Task[];
  people: Person[];
  projects: Project[];
  subteams: string[];
  me: Me;
  /** Start with only the tasks this person owns. */
  mineOnly: boolean;
  /** Start with one project chosen (from the Projects tab). */
  projectId?: string;
  today: string;
  onOpenTask: (task: Task) => void;
}

export function TaskList({ tasks, people, projects, subteams, me, mineOnly, projectId = "", today, onOpenTask }: TaskListProps) {
  const [mine, setMine] = useState(mineOnly);
  const [subteam, setSubteam] = useState("");
  const [project, setProject] = useState(projectId);
  const [status, setStatus] = useState<TaskStatus | "open" | "">("open");
  const [search, setSearch] = useState("");

  const isOpen = (t: Task) => t.status === "not-started" || t.status === "in-progress";
  const words = search.trim().toLowerCase();
  const shown = tasks.filter(
    (t) =>
      (!mine || t.ownerIds.includes(me.id)) &&
      (!subteam || t.subteams.includes(subteam)) &&
      (!project || t.projectId === project) &&
      (status === "" || (status === "open" ? isOpen(t) : t.status === status)) &&
      (!words || `${icarus.taskLabel(t)} ${t.title}`.toLowerCase().includes(words)),
  );
  const names = (ids: string[]) => ids.map((id) => people.find((p) => p.memberId === id)?.name ?? "").filter(Boolean).join(", ");
  const projectName = (id: string) => {
    const p = projects.find((x) => x._id === id);
    return p ? `p${p.number} ${p.name}` : "";
  };

  return (
    <div>
      <div className="icr__filters">
        <label className="icr__toggle">
          <input type="checkbox" checked={mine} onChange={() => setMine(!mine)} /> Mine
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
          <option value="open">Not done yet</option>
          <option value="">Every status</option>
          {(Object.keys(icarus.STATUS_LABELS) as TaskStatus[]).map((s) => (
            <option key={s} value={s}>{icarus.STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select value={subteam} onChange={(e) => setSubteam(e.target.value)} aria-label="Subteam">
          <option value="">Every subteam</option>
          {subteams.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
          <option value="">Every project</option>
          {projects.map((p) => <option key={p._id} value={p._id}>p{p.number} {p.name}</option>)}
        </select>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search t42 or words" aria-label="Search tasks" />
      </div>

      {shown.length === 0 ? (
        <p className="t-muted">{mine ? "Nothing is assigned to you with these filters." : "No tasks match these filters."}</p>
      ) : (
        <ul className="icr__list">
          {shown.map((t) => {
            const overdue = !!t.dueDate && t.dueDate < today && isOpen(t);
            return (
              <li key={t._id}>
                <button type="button" className="icr__list-item" onClick={() => onOpenTask(t)}>
                  <span className="icr__list-title">
                    {icarus.STATUS_ICONS[t.status]} <span className="icr__number">{icarus.taskLabel(t)}</span> {t.title}
                  </span>
                  <span className="t-muted">
                    {[t.subteams.join(", "), projectName(t.projectId), names(t.ownerIds)].filter(Boolean).join(" · ")}
                  </span>
                  <span className={overdue ? "icr__overdue" : "t-muted"}>
                    {t.dueDate ? `Due ${t.dueDate}${overdue ? " (overdue)" : ""}` : "No due date"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
