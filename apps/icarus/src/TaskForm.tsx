// The form for a new task or for changing one. Also shows a task's subtasks and its change log.
import { useEffect, useState, type FormEvent } from "react";
import { icarus, ops, type Draft, type HistoryEntry, type Me, type Person, type Project, type Task, type TaskStatus } from "@team6220/data";
import { HistoryList, ProjectPicker, SubteamPicker } from "@team6220/ui";
import { TaskLinks } from "./TaskLinks";

interface TaskFormProps {
  task: Draft<Task>;
  /** Every task of the season, for the "needs completion of" list and the subtasks. */
  tasks: Task[];
  people: Person[];
  projects: Project[];
  subteams: string[];
  me: Me;
  onSave: (task: Draft<Task>) => Promise<void>;
  onRemove: (task: Task) => Promise<void>;
  onAddSubtask: (parent: Task) => void;
  onOpenTask: (task: Task) => void;
  onClose: () => void;
}

const STATUSES: TaskStatus[] = ["not-started", "in-progress", "done", "cancelled"];

export function TaskForm({ task, tasks, people, projects, subteams, me, onSave, onRemove, onAddSubtask, onOpenTask, onClose }: TaskFormProps) {
  const [draft, setDraft] = useState(task);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const saved = task._id ? (task as Task) : null;
  const canEdit = !saved || icarus.canEditTask(me, saved);
  const parent = tasks.find((t) => t._id === draft.parentId);
  const subtasks = saved ? tasks.filter((t) => t.parentId === saved._id) : [];
  const others = tasks.filter((t) => t._id !== task._id);
  const set = (changes: Partial<Draft<Task>>) => setDraft({ ...draft, ...changes });
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  useEffect(() => {
    if (saved) void ops.listHistory({ kind: "task", id: saved._id }).then(setHistory);
  }, [saved?._id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="t-panel icr__form" aria-label={saved ? `Task ${icarus.taskLabel(saved)}` : "New task"}>
      <h2>
        {saved ? `${icarus.taskLabel(saved)} ${saved.title}` : parent ? `New subtask of ${icarus.taskLabel(parent)}` : "New task"}
      </h2>
      {!canEdit && <p className="t-muted">Only this task's owners and leads can change it.</p>}
      <form onSubmit={submit}>
        <fieldset disabled={!canEdit} className="icr__fields">
          <label className="t-field icr__wide">
            Title
            <input value={draft.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} required autoFocus />
          </label>
          <label className="t-field">
            Status
            <select value={draft.status} onChange={(e) => set({ status: e.target.value as TaskStatus })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {icarus.STATUS_ICONS[s]} {icarus.STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="t-field">
            Start
            <input type="date" value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </label>
          <label className="t-field">
            Due
            <input type="date" value={draft.dueDate} min={draft.startDate || undefined} onChange={(e) => set({ dueDate: e.target.value })} />
          </label>
          <ProjectPicker projects={projects} value={draft.projectId} onChange={(projectId) => set({ projectId })} />
          <div className="icr__wide">
            <SubteamPicker subteams={subteams} value={draft.subteams} onChange={(chosen) => set({ subteams: chosen })} />
          </div>
          <fieldset className="t-checks icr__wide icr__people">
            <legend>Owners</legend>
            {people.map((p) => (
              <label key={p.memberId}>
                <input type="checkbox" checked={draft.ownerIds.includes(p.memberId)} onChange={() => set({ ownerIds: toggle(draft.ownerIds, p.memberId) })} />{" "}
                {p.name}
              </label>
            ))}
          </fieldset>
          <label className="t-field icr__wide">
            Needs completion of
            <select multiple size={Math.min(6, Math.max(2, others.length))} value={draft.blockedBy}
              onChange={(e) => set({ blockedBy: [...e.target.selectedOptions].map((o) => o.value) })}>
              {others.map((t) => (
                <option key={t._id} value={t._id}>
                  {icarus.taskLabel(t)} {t.title}
                </option>
              ))}
            </select>
            <span className="t-hint">Hold Ctrl (or ⌘) to choose more than one. Leave empty if this task waits on nothing.</span>
          </label>
          <TaskLinks needs={draft.needs ?? []} onChange={(needs) => set({ needs })} canEdit={canEdit} taskId={saved?._id ?? ""} projectId={draft.projectId} />
          <label className="t-field icr__wide">
            Description
            <textarea rows={3} value={draft.description} onChange={(e) => set({ description: e.target.value })} maxLength={4000} />
          </label>
          <label className="t-field icr__wide">
            Notes
            <input value={draft.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={500} />
          </label>
        </fieldset>
        <div className="icr__buttons">
          {canEdit && (
            <button className="t-button" type="submit" disabled={saving || !draft.title.trim()}>
              {saved ? "Save" : "Create task"}
            </button>
          )}
          <button className="t-button t-button--quiet" type="button" onClick={onClose}>
            Close
          </button>
          {saved && me.roles.team && (
            <button className="t-button t-button--quiet" type="button" onClick={() => onAddSubtask(saved)}>
              Add subtask
            </button>
          )}
          {saved && canEdit && subtasks.length === 0 && (
            <button className="t-button t-button--quiet" type="button" onClick={() => window.confirm(`Remove ${icarus.taskLabel(saved)}?`) && void onRemove(saved)}>
              Remove
            </button>
          )}
        </div>
      </form>

      {subtasks.length > 0 && (
        <>
          <h3>Subtasks</h3>
          <ul className="icr__sublist">
            {subtasks.map((t) => (
              <li key={t._id}>
                <button type="button" className="icr__task-button" onClick={() => onOpenTask(t)}>
                  {icarus.STATUS_ICONS[t.status]} <span className="icr__number">{icarus.taskLabel(t)}</span> {t.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {saved && (
        <>
          <h3>History</h3>
          <HistoryList entries={history} />
        </>
      )}
    </section>
  );
}
