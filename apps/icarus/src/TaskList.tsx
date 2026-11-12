// Tasks as a list, like GitHub's issue list: Open / Closed, then filters, then one row per task with its
// number, subteams as labels, who it is assigned to and when it is due. "My tasks" is this list filtered to you.
import { useState } from "react";
import { icarus, type Me, type Person, type Project, type Task } from "@team6220/data";
import { StatusPill } from "@team6220/ui";

interface TaskListProps {
  tasks: Task[];
  people: Person[];
  projects: Project[];
  subteams: string[];
  me: Me;
  /** Start with only the tasks assigned to this person. */
  mineOnly: boolean;
  /** Start with one project chosen (from the Projects tab). */
  projectId?: string;
  today: string;
  onOpenTask: (task: Task) => void;
}

const isOpen = (t: Task) => t.status === "not-started" || t.status === "in-progress";

export function TaskList({ tasks, people, projects, subteams, me, mineOnly, projectId = "", today, onOpenTask }: TaskListProps) {
  const [closed, setClosed] = useState(false);
  const [assignee, setAssignee] = useState(mineOnly ? me.id : "");
  const [subteam, setSubteam] = useState("");
  const [project, setProject] = useState(projectId);
  const [search, setSearch] = useState("");

  const words = search.trim().toLowerCase();
  const filtered = tasks.filter(
    (t) =>
      (!assignee || t.ownerIds.includes(assignee)) &&
      (!subteam || t.subteams.includes(subteam)) &&
      (!project || t.projectId === project) &&
      (!words || `${icarus.taskLabel(t)} ${t.title} ${t.description}`.toLowerCase().includes(words)),
  );
  const openCount = filtered.filter(isOpen).length;
  const shown = filtered.filter((t) => isOpen(t) !== closed);
  const person = (id: string) => people.find((p) => p.memberId === id);
  const projectOf = (id: string) => projects.find((p) => p._id === id);

  return (
    <section className="t-panel icr__issues">
      <div className="icr__filters">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search t42 or words" aria-label="Search tasks" />
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee">
          <option value="">Anyone</option>
          <option value={me.id}>Assigned to me</option>
          {people.filter((p) => p.memberId !== me.id).map((p) => (
            <option key={p.memberId} value={p.memberId}>@{p.username || p.name}</option>
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
      </div>

      <div className="icr__issue-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={!closed} className={!closed ? "icr__issue-tab icr__issue-tab--on" : "icr__issue-tab"} onClick={() => setClosed(false)}>
          ● {openCount} Open
        </button>
        <button type="button" role="tab" aria-selected={closed} className={closed ? "icr__issue-tab icr__issue-tab--on" : "icr__issue-tab"} onClick={() => setClosed(true)}>
          ✓ {filtered.length - openCount} Closed
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="t-muted icr__empty-list">{closed ? "No closed tasks with these filters." : assignee === me.id ? "Nothing is assigned to you. Nice." : "No open tasks with these filters."}</p>
      ) : (
        <ul className="icr__list">
          {shown.map((t) => {
            const overdue = !!t.dueDate && t.dueDate < today && isOpen(t);
            const blocked = isOpen(t) && t.blockedBy.some((id) => tasks.some((o) => o._id === id && isOpen(o)));
            const p = projectOf(t.projectId);
            return (
              <li key={t._id}>
                <button type="button" className="icr__issue-row" onClick={() => onOpenTask(t)}>
                  <span className="icr__issue-icon" title={icarus.STATUS_LABELS[t.status]}>{icarus.STATUS_ICONS[t.status]}</span>
                  <span className="icr__issue-main-line">
                    <strong>{t.title}</strong>{" "}
                    {t.subteams.map((s) => <StatusPill key={s} tone="info">{s}</StatusPill>)}
                    {blocked && <StatusPill tone="warn">Waiting on another task</StatusPill>}
                    <span className="icr__issue-meta">
                      {icarus.taskLabel(t)}
                      {p && ` · p${p.number} ${p.name}`}
                      {t.dueDate && <span className={overdue ? "icr__overdue" : undefined}> · due {t.dueDate}{overdue && " (overdue)"}</span>}
                    </span>
                  </span>
                  <span className="icr__issue-people">{t.ownerIds.map((id) => `@${person(id)?.username || person(id)?.name || "?"}`).join(" ")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
