// The outbox: every notification is one row in ops_notifications per person (or one per channel post). The row is the
// inbox item on Home, and it also tracks the Discord delivery. SERVER ONLY.
//
//   send(ctx, list)        what the actions call after a change: writes the rows, then sends a few to Discord at once
//   sendDeliveries(ctx)    the timer job (every 5 minutes): sends what is left, retries, and bundles what quiet hours held
//
// Discord states on a row: pending → sent, or held (quiet hours) → sent as part of one morning message, or failed
// (gave up), expired (too late to matter), off (the person turned Discord off for this kind), no-link (no Discord linked).
import { DISCORD_CHANNELS, SITE_URL } from "../../../config";
import { DEFAULT_QUIET_HOURS, KIND_BY_ID, waysFor, type ChannelKey, type NotificationPrefs } from "../../../notifications/catalog";
import { COLLECTION_PEOPLE, type Ctx } from "../context";
import type { Doc } from "../env";
import { DiscordError, openDm, sendMessage } from "./discord";

export const COLLECTION_NOTIFICATIONS = "ops_notifications";
/** The collections step 1 added (both Admin read and write: only the server reads them). */
export const NOTIFY_COLLECTIONS = [COLLECTION_NOTIFICATIONS, "ops_link_codes"];

/** One notification to send. */
export interface Outgoing {
  kind: string;
  /** Member IDs. The person who made the change is left out, unless `toSelf`. Ignored for channel kinds. */
  to: string[];
  /** News about the person's own account (Discord linked): sent even though they made the change. */
  toSelf?: boolean;
  title: string;
  text?: string;
  /** A path in the apps, like /apps/icarus?task=abc. */
  url: string;
  record?: { kind: string; id: string };
  /** The same key is never sent twice (reminders run every few minutes). */
  dedupeKey?: string;
  /** After this time, a Discord message not sent yet is dropped (ISO). */
  expiresAt?: string;
}

/** Tries left after a Discord error that may pass (Discord down, rate limit). */
const MAX_TRIES = 5;
/** A message sent more than this after it was made says so. */
const LATE_MS = 10 * 60_000;
/** Calls kept back for saving the rows at the end of a request. */
const RESERVE = 3;
/** Discord messages sent inside the request that made them; the timer sends the rest within 5 minutes. */
const SEND_NOW = 3;

/** True when `now` is inside the person's quiet hours (team time, America/Los_Angeles). */
export function isQuiet(now: Date, prefs: Partial<NotificationPrefs> | undefined): boolean {
  const q = prefs?.quietHours ?? DEFAULT_QUIET_HOURS;
  if (!q.on) return false;
  const t = now.toLocaleTimeString("en-GB", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false });
  return q.from <= q.to ? t >= q.from && t < q.to : t >= q.from || t < q.to;
}

function line(row: Doc, late: boolean): string {
  return `**${row.title}**${late ? " (sent late)" : ""}${row.text ? `\n${row.text}` : ""}\n<${SITE_URL}${row.url}>`;
}

/** Everyone's row in ops_people, by member ID. One call. */
async function peopleById(ctx: Ctx): Promise<Map<string, Doc>> {
  return new Map((await ctx.data.query(COLLECTION_PEOPLE, {})).map((p) => [String(p.memberId), p]));
}

/** Writes the rows for `list` and sends a few to Discord straight away. Never throws: a notification must not undo a change. */
export async function send(ctx: Ctx, list: Outgoing[]): Promise<void> {
  try {
    if (!list.length) return;
    const people = await peopleById(ctx);
    const now = ctx.env.now();
    const rows: Doc[] = [];
    for (const n of list) {
      const kind = KIND_BY_ID[n.kind];
      if (!kind) continue;
      const base = { kind: n.kind, title: n.title, text: n.text ?? "", url: n.url, recordKind: n.record?.kind ?? "", recordId: n.record?.id ?? "", createdAt: now.toISOString(), readAt: "", dedupeKey: n.dedupeKey ?? "", expiresAt: n.expiresAt ?? "", discordTries: 0, push: "off" };
      if (kind.channel) {
        rows.push({ ...base, recipientId: `channel:${kind.channel}`, discord: "pending" });
        continue;
      }
      for (const id of new Set(n.to)) {
        if (!id || (id === ctx.actor.id && !n.toSelf)) continue;
        const person = people.get(id);
        const ways = waysFor(kind, person?.notificationPrefs);
        const discord = !ways.discord ? "off" : !person?.discordId ? "no-link" : isQuiet(now, person.notificationPrefs) ? "held" : "pending";
        rows.push({ ...base, recipientId: id, discord });
      }
    }
    if (!rows.length) return;
    const saved = await ctx.data.insertMany(COLLECTION_NOTIFICATIONS, rows);
    await deliver(ctx, saved.filter((r) => r.discord === "pending").slice(0, SEND_NOW), people);
  } catch (err) {
    console.error("notify: couldn't send", err instanceof Error ? err.name : "unknown");
  }
}

/** Sends pending rows to Discord while calls are left, then saves what happened to them. */
async function deliver(ctx: Ctx, rows: Doc[], people: Map<string, Doc>): Promise<number> {
  const changed: Doc[] = [];
  const peopleChanged = new Map<string, Doc>();
  const now = ctx.env.now();
  for (const row of rows) {
    if (ctx.env.callsLeft() < RESERVE + 2) break;
    if (row.expiresAt && row.expiresAt < now.toISOString()) {
      changed.push({ ...row, discord: "expired" });
      continue;
    }
    const late = now.getTime() - Date.parse(row.createdAt) > LATE_MS;
    try {
      const channelId = await channelFor(ctx, row, people, peopleChanged);
      await sendMessage(ctx, channelId, line(row, late));
      changed.push({ ...row, discord: "sent", sentAt: now.toISOString() });
    } catch (err) {
      changed.push(failed(row, err));
    }
  }
  if (changed.length) await ctx.data.saveMany(COLLECTION_NOTIFICATIONS, changed);
  if (peopleChanged.size) await ctx.data.saveMany(COLLECTION_PEOPLE, [...peopleChanged.values()]);
  return changed.filter((r) => r.discord === "sent").length;
}

/** Where a row goes: its channel, or the person's DM (opened once, then kept on their row in ops_people). */
async function channelFor(ctx: Ctx, row: Doc, people: Map<string, Doc>, peopleChanged: Map<string, Doc>): Promise<string> {
  const recipient = String(row.recipientId);
  if (recipient.startsWith("channel:")) {
    const id = DISCORD_CHANNELS[recipient.slice(8) as ChannelKey];
    if (!id) throw new DiscordError(400, `No channel ID set for ${recipient.slice(8)} (DISCORD_CHANNELS in config.ts).`);
    return id;
  }
  const person = peopleChanged.get(recipient) ?? people.get(recipient);
  if (!person?.discordId) throw new DiscordError(400, "Discord isn't linked any more.");
  if (person.discordDmChannelId) return String(person.discordDmChannelId);
  const dm = await openDm(ctx, String(person.discordId));
  const next = { ...person, discordDmChannelId: dm };
  peopleChanged.set(recipient, next);
  people.set(recipient, next);
  return dm;
}

function failed(row: Doc, err: unknown): Doc {
  const tries = Number(row.discordTries ?? 0) + 1;
  const final = err instanceof DiscordError ? err.final || err.status === 0 : false;
  return { ...row, discordTries: tries, discordError: err instanceof Error ? err.message.slice(0, 200) : "unknown", discord: final || tries >= MAX_TRIES ? "failed" : "pending" };
}

/**
 * The timer job (every 5 minutes). Sends pending messages, oldest first, and for each person whose quiet hours are over,
 * sends everything held overnight as one message.
 */
export async function sendDeliveries(ctx: Ctx) {
  const [pending, held, people] = await Promise.all([
    ctx.data.query(COLLECTION_NOTIFICATIONS, { discord: "pending" }, 50, { field: "createdAt" }),
    ctx.data.query(COLLECTION_NOTIFICATIONS, { discord: "held" }, 200, { field: "createdAt" }),
    peopleById(ctx),
  ]);
  const now = ctx.env.now();
  // Held rows: one combined message per person once their quiet hours end.
  const byPerson = new Map<string, Doc[]>();
  for (const row of held) {
    const person = people.get(String(row.recipientId));
    if (isQuiet(now, person?.notificationPrefs)) continue;
    byPerson.set(String(row.recipientId), [...(byPerson.get(String(row.recipientId)) ?? []), row]);
  }
  const changed: Doc[] = [];
  const peopleChanged = new Map<string, Doc>();
  let bundled = 0;
  for (const [id, rows] of byPerson) {
    if (ctx.env.callsLeft() < RESERVE + 2) break;
    const live = rows.filter((r) => !r.expiresAt || r.expiresAt >= now.toISOString());
    changed.push(...rows.filter((r) => !live.includes(r)).map((r) => ({ ...r, discord: "expired" })));
    if (!live.length) continue;
    const text = live.length === 1 ? line(live[0], false) : `**While you were away (${live.length})**\n${live.map((r) => `• ${r.title}: <${SITE_URL}${r.url}>`).join("\n")}`;
    try {
      const channelId = await channelFor(ctx, live[0], people, peopleChanged);
      await sendMessage(ctx, channelId, text);
      changed.push(...live.map((r) => ({ ...r, discord: "sent", sentAt: now.toISOString() })));
      bundled++;
    } catch (err) {
      changed.push(...live.map((r) => failed(r, err)));
    }
  }
  if (changed.length) await ctx.data.saveMany(COLLECTION_NOTIFICATIONS, changed);
  if (peopleChanged.size) await ctx.data.saveMany(COLLECTION_PEOPLE, [...peopleChanged.values()]);
  const sent = await deliver(ctx, pending, people);
  return { sent, bundled, waiting: Math.max(0, pending.length - sent) };
}
