// What each change sends, and to whom: one function per kind of change. The actions call these after saving, then pass
// the result to send() in outbox.ts. The kinds themselves (labels, defaults) are in notifications/catalog.ts. SERVER ONLY.
import type { Doc } from "../env";
import type { Outgoing } from "./outbox";

const taskName = (t: Doc) => `t${t.number} ${t.title}`;
const taskUrl = (t: Doc) => `/apps/icarus?task=${encodeURIComponent(String(t._id))}`;
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** A task was created or edited: the people added to it, and (when it's done) the people on tasks that waited for it. */
export function taskSaved(before: Doc | null, after: Doc, waiting: Doc[]): Outgoing[] {
  const out: Outgoing[] = [];
  const added = ids(after.ownerIds).filter((id) => !ids(before?.ownerIds).includes(id));
  if (added.length) out.push({ kind: "task.assigned", to: added, title: `You were added to ${taskName(after)}`, text: after.dueDate ? `Due ${after.dueDate}` : "", url: taskUrl(after), record: { kind: "task", id: String(after._id) } });
  if (after.status === "done" && before?.status !== "done") {
    for (const t of waiting) {
      out.push({ kind: "task.unblocked", to: ids(t.ownerIds), title: `${taskName(after)} is done`, text: `${taskName(t)} was waiting on it.`, url: taskUrl(t), record: { kind: "task", id: String(t._id) } });
    }
  }
  return out;
}

/** The @usernames written in a comment. */
export function mentionsIn(body: string): string[] {
  return [...body.matchAll(/(^|[^\w@])@([A-Za-z0-9._-]{2,40})/g)].map((m) => m[2].toLowerCase());
}

/** A new comment: anyone @mentioned, then everyone else on the task. Nobody gets both. */
export function commentAdded(comment: Doc, task: Doc, people: Doc[]): Outgoing[] {
  const names = new Set(mentionsIn(String(comment.body ?? "")));
  const mentioned = people.filter((p) => names.has(String(p.username ?? "").toLowerCase())).map((p) => String(p.memberId));
  const rest = ids(task.ownerIds).filter((id) => !mentioned.includes(id));
  const preview = String(comment.body ?? "").replace(/\s+/g, " ").slice(0, 140);
  const record = { kind: "task", id: String(task._id) };
  return [
    { kind: "task.mentioned", to: mentioned, title: `${comment.authorName} mentioned you on ${taskName(task)}`, text: preview, url: taskUrl(task), record },
    { kind: "task.comment", to: rest, title: `${comment.authorName} commented on ${taskName(task)}`, text: preview, url: taskUrl(task), record },
  ];
}

const PART_NEWS: Record<string, string> = { "in-progress": "is being made", cut: "was cut", done: "is finished" };

/** A part request moved along: tell the designer. */
export function partSaved(before: Doc | null, after: Doc): Outgoing[] {
  const news = PART_NEWS[String(after.status)];
  if (!before || before.status === after.status || !news) return [];
  // The maker's note on the last finished piece says where it is.
  const note = after.status === "in-progress" ? "" : String((after.work as Doc[] | undefined)?.filter((w) => w.result === "finished").at(-1)?.note ?? "");
  return [{ kind: "part.progress", to: [String(after.designerId ?? "")], title: `Your part ${after.partName} ${news}`, text: note, url: "/apps/production", record: { kind: "part", id: String(after._id) } }];
}

/** BOM lines were fully signed, ordered or received: one notification for each person who asked for some of them. */
export function bomLines(lines: Doc[], what: "signed" | "ordered" | "arrived"): Outgoing[] {
  const byRequester = new Map<string, Doc[]>();
  for (const line of lines) {
    const id = String((line.requestedBy as Doc | undefined)?.memberId ?? "");
    if (id) byRequester.set(id, [...(byRequester.get(id) ?? []), line]);
  }
  const verb = { signed: "has both signatures", ordered: "was ordered", arrived: "arrived" }[what];
  const verbs = { signed: "have both signatures", ordered: "were ordered", arrived: "arrived" }[what];
  return [...byRequester].map(([id, mine]) => ({
    kind: "bom.line",
    to: [id],
    title: mine.length === 1 ? `${mine[0].quantity} x ${mine[0].name} ${verb}` : `${mine.length} of your BOM lines ${verbs}`,
    text: mine.length === 1 ? "" : mine.slice(0, 5).map((l) => l.name).join(", ") + (mine.length > 5 ? ", ..." : ""),
    url: "/apps/bom",
  }));
}

/** Someone finished their profile and waits for a person to approve them. */
export function newMember(name: string, role: string, webAdmins: string[]): Outgoing {
  return { kind: "account.newMember", to: webAdmins, title: `${name} is waiting for approval`, text: `Signed up as ${role}.`, url: "/apps/site" };
}

/** Inbox-only news about your own account. */
export function accountNews(memberId: string, title: string, text = ""): Outgoing {
  return { kind: "account.changed", to: [memberId], toSelf: true, title, text, url: "/apps/account" };
}
