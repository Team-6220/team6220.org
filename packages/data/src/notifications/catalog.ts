// Every kind of notification, in one list. The server's rules (ops/server/notify) send them, and Account → Notifications
// shows one row per kind. Browser-safe: no server code here.
//
// Every notification lands in the inbox on Home first; it is the record. Then, per the person's settings, it is also a
// Discord DM (when they linked Discord) and, once push launches, a push notification. A kind with `channel` is posted
// in a Discord channel instead, for the whole team, and never goes to anyone's inbox.
//
// To add a kind: add an entry here, then the rule that sends it in packages/data/src/ops/server/notify/rules.ts.

export type NotificationApp = "Icarus" | "Production" | "BOM" | "Account";

/** The Discord channels the server may post in. Their IDs are in DISCORD_CHANNELS (config.ts). */
export type ChannelKey = "announcements" | "apolloUpdates";

export interface NotificationKind {
  id: string;
  app: NotificationApp;
  /** What it is about, as the settings table shows it. */
  label: string;
  /** Who gets it. */
  who: string;
  /** On by default for each way. */
  discord: boolean;
  push: boolean;
  /** ★: one of Discord and push must stay on. */
  mandatory?: boolean;
  /** Inbox only: Discord and push can't be turned on (things people see when they next open the apps). */
  inboxOnly?: boolean;
  /** Posted in this channel for the whole team instead of being sent to people. */
  channel?: ChannelKey;
}

export const NOTIFICATION_KINDS: NotificationKind[] = [
  { id: "task.assigned", app: "Icarus", label: "You were added to a task", who: "The people added", discord: true, push: false },
  { id: "task.mentioned", app: "Icarus", label: "You were @mentioned in a comment", who: "The person mentioned", discord: true, push: true },
  { id: "task.comment", app: "Icarus", label: "New comment on a task you are on", who: "People on the task", discord: true, push: false },
  { id: "task.due", app: "Icarus", label: "Your task is due tomorrow or overdue", who: "People on the task", discord: true, push: false },
  { id: "task.unblocked", app: "Icarus", label: "A task you were waiting on is done", who: "People on the waiting task", discord: true, push: false },
  { id: "part.progress", app: "Production", label: "Your part request was claimed or finished", who: "The designer", discord: true, push: false },
  { id: "bom.toSign", app: "BOM", label: "Lines need your signature (one summary a day)", who: "Mentors and boosters", discord: true, push: false },
  { id: "bom.line", app: "BOM", label: "Your line was signed, ordered, or arrived", who: "Whoever requested it", discord: true, push: false },
  { id: "bom.late", app: "BOM", label: "An order is late (not received after its expected date)", who: "Leads", discord: true, push: false },
  { id: "account.newMember", app: "Account", label: "A new member is waiting for approval", who: "Web Admins", discord: true, push: false },
  { id: "account.changed", app: "Account", label: "You were approved, or Discord was linked", who: "You", discord: false, push: false, inboxOnly: true },
];

export const KIND_BY_ID: Record<string, NotificationKind> = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k.id, k]));

/** A person's choices. Rows they never changed use the kind's defaults. */
export interface NotificationPrefs {
  ways: Record<string, { discord: boolean; push: boolean }>;
  quietHours: { on: boolean; from: string; to: string };
}

export const DEFAULT_QUIET_HOURS = { on: true, from: "22:00", to: "07:00" };

/** Whether `kind` goes to Discord and push for someone with these prefs (★ rows keep one way on). */
export function waysFor(kind: NotificationKind, prefs: Partial<NotificationPrefs> | undefined): { discord: boolean; push: boolean } {
  if (kind.inboxOnly || kind.channel) return { discord: false, push: false };
  const chosen = prefs?.ways?.[kind.id] ?? { discord: kind.discord, push: kind.push };
  if (kind.mandatory && !chosen.discord && !chosen.push) return { discord: true, push: false };
  return { discord: !!chosen.discord, push: !!chosen.push };
}

/** One notification as the inbox shows it. */
export interface InboxItem {
  _id: string;
  kind: string;
  title: string;
  text: string;
  /** Where clicking it goes, inside the apps. */
  url: string;
  createdAt: string;
  readAt: string;
}
