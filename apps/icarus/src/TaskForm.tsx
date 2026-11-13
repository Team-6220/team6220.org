// One task, laid out like a GitHub issue: the title and status at the top, the description and the conversation
// on the left, and the details (people, subteams, dates, project, relations, materials) on the right.
// A new task uses the same page with everything editable.
import { useEffect, useState, type FormEvent } from "react";
import { icarus, ops, type Draft, type HistoryEntry, type Me, type Person, type Project, type Task, type TaskComment, type TaskStatus } from "@team6220/data";
import { HistoryList, ProjectPicker, StatusPill, SubteamPicker } from "@team6220/ui";
import { MentionPicker } from "./MentionPicker";
import { TaskLinks } from "./TaskLinks";

interface TaskFormProps {
  task: Draft<Task>;
  /** Every task of the season, for relations and subtasks. */
  tasks: Task[];
  people: Person[];
  projects: Project[];
  subteams: string[];
  me: Me;
  onSave: (task: Draft<Task>) => Promise<void>;
  onRemove: (task: Task) => Promise<void>;
  onAddSubtask: (parent: Task) => void;
  onOpenTask: (task: Task) => void;
  onCreateGithubIssue: (task: Task) => Promise<void>;
  onClose: () => void;
}

const STATUSES: TaskStatus[] = ["not-started", "in-progress", "done", "cancelled"];
const isOpen = (status: TaskStatus) => status === "not-started" || status === "in-progress";

export function TaskForm({ task, tasks, people, projects, subteams, me, onSave, onRemove, onAddSubtask, onOpenTask, onCreateGithubIssue, onClose }: TaskFormProps) {
  // Tasks saved before "related" and "needs" existed don't have them, so fill them in.
  const [draft, setDraft] = useState<Draft<Task>>({ ...task, related: task.related ?? [], needs: task.needs ?? [] });
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [comment, setComment] = useState("");
  const [relationType, setRelationType] = useState<icarus.RelationType>("needs");
  const [relationTask, setRelationTask] = useState("");
  const saved = task._id ? (task as Task) : null;
  const canEdit = !saved || icarus.canEditTask(me, saved);
  const parent = tasks.find((t) => t._id === draft.parentId);
  const subtasks = saved ? tasks.filter((t) => t.parentId === saved._id) : [];
  const set = (changes: Partial<Draft<Task>>) => setDraft({ ...draft, ...changes });
  const relations = icarus.relationsOf({ _id: saved?._id ?? "", blockedBy: draft.blockedBy, related: draft.related ?? [] }, tasks);
  const linkable = tasks.filter((t) => t._id !== saved?._id && !relations.some((r) => r.task._id === t._id));
  const changed = JSON.stringify({ ...task, related: task.related ?? [], needs: task.needs ?? [] }) !== JSON.stringify(draft);

  const reloadSide = () => {
    if (!saved) return;
    void ops.listHistory({ kind: "task", id: saved._id }).then(setHistory);
    void icarus.listComments(saved._id).then(setComments);
  };
  useEffect(reloadSide, [saved?._id]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  function addRelation() {
    if (!relationTask) return;
    if (relationType === "needs") set({ blockedBy: [...draft.blockedBy, relationTask] });
    if (relationType === "related") set({ related: [...(draft.related ?? []), relationTask] });
    // "Blocks t7" is stored on t7 as "needs completion of this task", so it is saved on the other task right away.
    if (relationType === "blocks" && saved) {
      const other = tasks.find((t) => t._id === relationTask)!;
      void onSave({ ...other, blockedBy: [...other.blockedBy, saved._id] });
    }
    setRelationTask("");
  }

  function removeRelation(type: icarus.RelationType, other: Task) {
    if (type === "needs") set({ blockedBy: draft.blockedBy.filter((id) => id !== other._id) });
    if (type === "related") set({ related: (draft.related ?? []).filter((id) => id !== other._id) });
    if (type === "blocks" && saved) void onSave({ ...other, blockedBy: other.blockedBy.filter((id) => id !== saved._id) });
  }

  return (
    <section className="t-panel icr__issue" aria-label={saved ? `Task ${icarus.taskLabel(saved)}` : "New task"}>
      <form onSubmit={submit}>
        <header className="icr__issue-head">
          {canEdit ? (
            <input className="icr__issue-title" value={draft.title} onChange={(e) => set({ title: e.target.value })} maxLength={200}
              placeholder={parent ? `Subtask of ${icarus.taskLabel(parent)}` : "Title"} aria-label="Title" required autoFocus={!saved} />
          ) : (
            <h2 className="icr__issue-title">{draft.title}</h2>
          )}
          {saved && <span className="icr__issue-number">{icarus.taskLabel(saved)}</span>}
          <div className="icr__issue-state">
            <StatusPill tone={isOpen(draft.status) ? "ok" : "neutral"}>
              {icarus.STATUS_ICONS[draft.status]} {icarus.STATUS_LABELS[draft.status]}
            </StatusPill>
            {parent && (
              <span className="t-muted">
                Subtask of{" "}
                <button type="button" className="icr__link" onClick={() => onOpenTask(parent)}>
                  {icarus.taskLabel(parent)} {parent.title}
                </button>
              </span>
            )}
          </div>
        </header>

        <div className="icr__issue-body">
          <div className="icr__issue-main">
            <label className="t-field">
              Description
              <textarea rows={5} value={draft.description} onChange={(e) => set({ description: e.target.value })} maxLength={4000} disabled={!canEdit}
                placeholder="What needs doing, and how will we know it's done?" />
            </label>

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
                <h3>Conversation</h3>
                <ol className="icr__comments">
                  {comments.map((c) => (
                    <li key={c._id}>
                      <strong>{c.authorName}</strong> <span className="t-muted">{new Date(c.at).toLocaleString()}</span>
                      <p>{c.body}</p>
                    </li>
                  ))}
                  {comments.length === 0 && <li className="t-muted">No comments yet.</li>}
                </ol>
                {me.roles.team && (
                  <div className="icr__comment-box">
                    <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Leave a comment" aria-label="Comment" maxLength={4000} />
                    <button className="t-button t-button--quiet" type="button" disabled={!comment.trim()}
                      onClick={() => void icarus.addComment(saved, comment, me).then(() => (setComment(""), reloadSide()))}>
                      Comment
                    </button>
                  </div>
                )}
                <details className="icr__history">
                  <summary>History</summary>
                  <HistoryList entries={history} />
                </details>
              </>
            )}
          </div>

          <aside className="icr__issue-side">
            <MentionPicker label="Assignees" people={people} value={draft.ownerIds} onChange={(ownerIds) => set({ ownerIds })} disabled={!canEdit} />
            {canEdit && !draft.ownerIds.includes(me.id) && (
              <button type="button" className="icr__link" onClick={() => set({ ownerIds: [...draft.ownerIds, me.id] })}>
                Assign yourself
              </button>
            )}

            <label className="t-field">
              Status
              <select value={draft.status} onChange={(e) => set({ status: e.target.value as TaskStatus })} disabled={!canEdit}>
                {STATUSES.map((s) => <option key={s} value={s}>{icarus.STATUS_ICONS[s]} {icarus.STATUS_LABELS[s]}</option>)}
              </select>
            </label>
            <div className="icr__dates">
              <label className="t-field">
                Start
                <input type="date" value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} disabled={!canEdit} />
              </label>
              <label className="t-field">
                Due
                <input type="date" value={draft.dueDate} min={draft.startDate || undefined} onChange={(e) => set({ dueDate: e.target.value })} disabled={!canEdit} />
              </label>
            </div>
            <fieldset disabled={!canEdit} className="icr__plainset">
              <SubteamPicker subteams={subteams} value={draft.subteams} onChange={(chosen) => set({ subteams: chosen })} />
            </fieldset>
            <fieldset disabled={!canEdit} className="icr__plainset">
              <ProjectPicker projects={projects} value={draft.projectId} onChange={(projectId) => set({ projectId })} />
            </fieldset>

            {saved && <GithubLink task={saved} project={projects.find((p) => p._id === saved.projectId)} onCreate={onCreateGithubIssue} />}

            <div>
              <span className="icr__side-label">Relations</span>
              {relations.length === 0 && <p className="t-muted">None</p>}
              <ul className="icr__plain">
                {relations.map(({ type, task: other }) => (
                  <li key={`${type}-${other._id}`}>
                    <span className="t-muted">{icarus.RELATION_LABELS[type]}</span>{" "}
                    <button type="button" className="icr__link" onClick={() => onOpenTask(other)}>
                      {icarus.STATUS_ICONS[other.status]} {icarus.taskLabel(other)} {other.title}
                    </button>
                    {canEdit && (
                      <button type="button" className="icr__chip-x" aria-label="Remove relation" onClick={() => removeRelation(type, other)}>
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit && (
                <div className="icr__relation-add">
                  <select value={relationType} onChange={(e) => setRelationType(e.target.value as icarus.RelationType)} aria-label="Kind of relation">
                    <option value="needs">{icarus.RELATION_LABELS.needs}</option>
                    {saved && <option value="blocks">{icarus.RELATION_LABELS.blocks}</option>}
                    <option value="related">{icarus.RELATION_LABELS.related}</option>
                  </select>
                  <select value={relationTask} onChange={(e) => setRelationTask(e.target.value)} aria-label="Task">
                    <option value="">Choose a task…</option>
                    {linkable.map((t) => <option key={t._id} value={t._id}>{icarus.taskLabel(t)} {t.title}</option>)}
                  </select>
                  <button className="t-button t-button--quiet" type="button" disabled={!relationTask} onClick={addRelation}>
                    Add
                  </button>
                </div>
              )}
            </div>

            <TaskLinks needs={draft.needs ?? []} onChange={(needs) => set({ needs })} canEdit={canEdit} taskId={saved?._id ?? ""} projectId={draft.projectId} />

            <label className="t-field">
              Notes
              <input value={draft.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={500} disabled={!canEdit} />
            </label>
          </aside>
        </div>

        <footer className="icr__buttons">
          {canEdit && (
            <button className="t-button" type="submit" disabled={saving || !draft.title.trim() || (!!saved && !changed)}>
              {saved ? "Save changes" : "Create task"}
            </button>
          )}
          {saved && canEdit && (
            <button className="t-button t-button--quiet" type="button"
              onClick={() => void onSave({ ...draft, status: isOpen(draft.status) ? "done" : "not-started" })}>
              {isOpen(draft.status) ? "Close as done" : "Reopen"}
            </button>
          )}
          {saved && me.roles.team && (
            <button className="t-button t-button--quiet" type="button" onClick={() => onAddSubtask(saved)}>
              Add subtask
            </button>
          )}
          <button className="t-button t-button--quiet" type="button" onClick={onClose}>
            {changed && canEdit ? "Discard changes" : "Close"}
          </button>
          {saved && canEdit && subtasks.length === 0 && (
            <button className="t-button t-button--quiet icr__danger" type="button" onClick={() => window.confirm(`Delete ${icarus.taskLabel(saved)}? This can't be undone.`) && void onRemove(saved)}>
              Delete
            </button>
          )}
        </footer>
      </form>
    </section>
  );
}

/** The task's GitHub issue, or a button to open one when the task's project is connected to a repository. */
function GithubLink({ task, project, onCreate }: { task: Task; project?: Project; onCreate: (task: Task) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const issue = task.githubIssue;
  if (!issue && !project?.githubRepo) return null;
  return (
    <div>
      <span className="icr__side-label">GitHub</span>
      {issue ? (
        <p>
          <a href={issue.url} target="_blank" rel="noreferrer">{issue.repo}#{issue.number}</a>
          <br />
          <span className="t-muted">Kept in sync both ways every 5 minutes.</span>
        </p>
      ) : (
        <button className="t-button t-button--quiet" type="button" disabled={busy}
          onClick={async () => { setBusy(true); try { await onCreate(task); } finally { setBusy(false); } }}>
          Create issue in {project!.githubRepo}
        </button>
      )}
    </div>
  );
}
