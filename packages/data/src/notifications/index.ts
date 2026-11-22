// Notifications in the browser: your inbox (Home), your settings and the Discord link (Account). The server decides who
// is notified (packages/data/src/ops/server/notify); the browser only reads and marks read. Demo mode keeps a made-up
// inbox in memory.
import { callOps, isDemo } from "../ops";
import type { InboxItem, NotificationPrefs } from "./catalog";

export * from "./catalog";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
let demoInbox: InboxItem[] = [
  { _id: "d1", kind: "task.mentioned", title: "Sam T. mentioned you on t12 Intake rollers", text: "@demolead can you check the roller spacing before Thursday?", url: "/apps/icarus", createdAt: minutesAgo(25), readAt: "" },
  { _id: "d2", kind: "bom.line", title: "3 of your BOM lines were ordered", text: "NEO 550, SPARK MAX, 1/2\" hex shaft", url: "/apps/bom", createdAt: minutesAgo(190), readAt: "" },
  { _id: "d3", kind: "part.progress", title: "Your part Gearbox plate is finished", text: "On the shelf by the Shapeoko", url: "/apps/production", createdAt: minutesAgo(60 * 26), readAt: minutesAgo(60 * 20) },
  { _id: "d4", kind: "task.assigned", title: "You were added to t9 CAD the elevator", text: "Due Nov 30", url: "/apps/icarus", createdAt: minutesAgo(60 * 50), readAt: minutesAgo(60 * 48) },
];
let demoSettings: { prefs: NotificationPrefs | null; discord: { name: string } | null } = { prefs: null, discord: null };

export async function myInbox(): Promise<{ items: InboxItem[]; unread: number }> {
  if (isDemo()) return { items: structuredClone(demoInbox), unread: demoInbox.filter((i) => !i.readAt).length };
  return callOps<{ items: InboxItem[]; unread: number }>("myInbox");
}

/** Marks some (or, with "all", every) notification of yours read. */
export async function markRead(ids: string[] | "all"): Promise<void> {
  if (isDemo()) {
    demoInbox = demoInbox.map((i) => (ids === "all" || ids.includes(i._id) ? { ...i, readAt: i.readAt || new Date().toISOString() } : i));
    return;
  }
  await callOps("markRead", ids === "all" ? { all: true } : { ids });
}

export async function getSettings(): Promise<{ prefs: NotificationPrefs | null; discord: { name: string } | null }> {
  if (isDemo()) return structuredClone(demoSettings);
  return callOps("getNotificationSettings");
}

export async function savePrefs(prefs: NotificationPrefs): Promise<void> {
  if (isDemo()) {
    demoSettings = { ...demoSettings, prefs: structuredClone(prefs) };
    return;
  }
  await callOps("saveNotificationPrefs", { prefs });
}

/** A 6-digit code to type as /link <code> in Discord, good for 10 minutes. */
export async function startDiscordLink(): Promise<{ code: string; expiresAt: string }> {
  if (isDemo()) return { code: "482913", expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() };
  return callOps("startDiscordLink");
}

export async function unlinkDiscord(): Promise<void> {
  if (isDemo()) {
    demoSettings = { ...demoSettings, discord: null };
    return;
  }
  await callOps("unlinkDiscord");
}

/** Where "Link with Discord" goes: the server sends you on to Discord's sign-in, then back to Account. */
export const DISCORD_LINK_URL = "/api/discord-link";
