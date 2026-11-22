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

// ----- Calendar supervision -----

const shiftWhen = (shift: Doc, event: Doc) => `${dayName(String(event.startDate))}, ${shortTime(String(shift.start))}–${shortTime(String(shift.end))}`;
const eventUrl = (event: Doc) => `/apps/calendar/event?id=${encodeURIComponent(String(event._id))}`;
const shortTime = (t: string) => `${Number(t.slice(0, 2)) % 12 || 12}:${t.slice(3, 5)}`;
const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).replace(",", "");

/** Someone (a lead, mentor or booster) put a supervisor in a shift. */
export function shiftAssigned(shift: Doc, event: Doc): Outgoing {
  return { kind: "shift.changed", to: [String(shift.memberId)], title: `You're supervising ${shiftWhen(shift, event)}`, text: "A lead, mentor, or booster signed you up for this shift.", url: eventUrl(event), record: { kind: "shift", id: String(shift._id) } };
}

/** A supervisor was taken off a shift because its meeting moved, changed or was removed. */
export function shiftsBumped(shifts: Doc[], events: Doc[]): Outgoing[] {
  return shifts.filter((s) => s.memberId).map((s) => {
    const event = events.find((e) => e._id === s.eventId) ?? { _id: s.eventId, startDate: "" };
    return {
      kind: "shift.changed", to: [String(s.memberId)],
      title: event.startDate ? `Your shift on ${shiftWhen(s, event)} was removed` : "One of your shifts was removed",
      text: "The meeting moved or changed, so you're no longer on that shift. Sign up again if the new time works.",
      url: event.startDate ? eventUrl(event) : "/apps/calendar/open", record: { kind: "shift", id: String(s._id) },
    };
  });
}

/** A supervisor withdrew (or was taken off): the shift is open, so the leads and supervisors hear. */
export function shiftOpened(shift: Doc, event: Doc, who: string, to: string[]): Outgoing {
  return { kind: "shift.opened", to, title: `Open shift: ${shiftWhen(shift, event)}`, text: `${who} can't make it. Sign up if you can.`, url: eventUrl(event), record: { kind: "shift", id: String(shift._id) } };
}

/** Tomorrow's shifts, once each. */
export function shiftReminders(shifts: Doc[], events: Doc[], tomorrow: string): Outgoing[] {
  return shifts.filter((s) => s.memberId && !s.cancelled).flatMap((s): Outgoing[] => {
    const event = events.find((e) => e._id === s.eventId && !e.cancelled);
    if (!event || event.startDate !== tomorrow) return [];
    return [{ kind: "shift.reminder", to: [String(s.memberId)], title: `You supervise tomorrow, ${shortTime(String(s.start))}–${shortTime(String(s.end))}`, text: String(event.location || ""), url: eventUrl(event), record: { kind: "shift", id: String(s._id) }, dedupeKey: `shift.reminder:${s._id}:${tomorrow}` }];
  });
}

/** A form still needs answers: sent to everyone on the team who hasn't finished it. */
export function rsvpReminder(form: Doc, event: Doc, to: string[], includeLink = true, dedupeKey?: string): Outgoing {
  return { kind: "rsvp.reminder", to, title: `Please answer the ${event.title} RSVP`, text: `Please answer by ${form.answerBy}. It takes about a minute.`, url: includeLink ? `/apps/rsvp/answer?id=${encodeURIComponent(String(form._id))}` : "/apps/rsvp", record: { kind: "rsvp", id: String(form._id) }, ...(dedupeKey ? { dedupeKey } : {}) };
}

/** The morning a form is due: the leads hear how many have finished. */
export function rsvpSummary(form: Doc, event: Doc, to: string[], finished: number, asked: number, dedupeKey?: string): Outgoing {
  return { kind: "rsvp.summary", to, title: `${event.title} RSVP is due today: ${finished} of ${asked} have answered`, text: `${asked - finished} still need to.`, url: `/apps/rsvp/results?id=${encodeURIComponent(String(form._id))}`, record: { kind: "rsvp", id: String(form._id) }, ...(dedupeKey ? { dedupeKey } : {}) };
}

/** Someone asked to become a supervisor. */
export function supervisorRequest(name: string, to: string[]): Outgoing {
  return { kind: "supervisor.request", to, title: `${name} wants to become a supervisor`, text: "Help them through the paperwork, then mark them approved.", url: "/apps/calendar/supervisors" };
}
