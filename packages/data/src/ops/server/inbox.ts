// Your inbox, your notification settings, and linking your Discord account. SERVER ONLY.
//
// Linking proves which Discord account is yours (a typed username can be wrong or change), two ways:
//   - "Link with Discord" on Account: Discord's own sign-in (discord-link.ts), for when you're signed in to Discord here.
//   - A 6-digit code: Account shows it, you type /link 482913 in Discord (Apollo's listener on the Pi sends it to
//     linkDiscordCode). For when Discord is on another device.
// Codes are kept hashed in ops_link_codes, which only the server can read, and work for 10 minutes.
import { NOTIFICATION_KINDS, type InboxItem } from "../../notifications/catalog";
import { COLLECTION_PEOPLE, sha256Hex, text, type Ctx } from "./context";
import { apiError, type Doc } from "./env";
import * as notify from "./notify";
import { COLLECTION_NOTIFICATIONS } from "./notify/outbox";

export const COLLECTION_LINK_CODES = "ops_link_codes";
const CODE_MINUTES = 10;
const INBOX_SIZE = 50;

async function myRow(ctx: Ctx): Promise<Doc> {
  return (await ctx.data.query(COLLECTION_PEOPLE, { memberId: ctx.actor.id }, 1))[0] ?? { memberId: ctx.actor.id, name: ctx.actor.name, subteams: [], active: true };
}

/** {} -> { items, unread }. Your newest notifications. */
export async function myInbox(ctx: Ctx) {
  const rows = await ctx.data.query(COLLECTION_NOTIFICATIONS, { recipientId: ctx.actor.id }, INBOX_SIZE, { field: "createdAt", descending: true });
  const items: InboxItem[] = rows.map((r) => ({ _id: String(r._id), kind: String(r.kind), title: String(r.title), text: String(r.text ?? ""), url: String(r.url ?? ""), createdAt: String(r.createdAt), readAt: String(r.readAt ?? "") }));
  return { items, unread: items.filter((i) => !i.readAt).length };
}

/** { ids } or { all: true } -> { marked }. Only your own notifications. */
export async function markRead(ctx: Ctx, body: Doc) {
  const unread = (await ctx.data.query(COLLECTION_NOTIFICATIONS, { recipientId: ctx.actor.id, readAt: "" }, 200));
  const wanted = body.all === true ? unread : unread.filter((r) => Array.isArray(body.ids) && body.ids.includes(r._id));
  const now = ctx.env.now().toISOString();
  await ctx.data.saveMany(COLLECTION_NOTIFICATIONS, wanted.map((r) => ({ ...r, readAt: now })));
  return { marked: wanted.length };
}

/** {} -> { prefs, discord }. Your notification settings and whether Discord is linked. */
export async function getNotificationSettings(ctx: Ctx) {
  const row = await myRow(ctx);
  return { prefs: row.notificationPrefs ?? null, discord: row.discordId ? { name: String(row.discordName ?? "") } : null };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** { prefs: { ways: { kind: { discord, push } }, quietHours: { on, from, to } } } -> {}. */
export async function saveNotificationPrefs(ctx: Ctx, body: Doc) {
  const p = (body.prefs ?? {}) as Doc;
  const ways: Record<string, { discord: boolean; push: boolean }> = {};
  for (const kind of NOTIFICATION_KINDS) {
    const w = p.ways?.[kind.id];
    if (!w) continue;
    if (kind.mandatory && !w.discord && !w.push) throw apiError("bad-request", `"${kind.label}" needs Discord or push on.`);
    ways[kind.id] = { discord: w.discord === true, push: w.push === true };
  }
  const q = (p.quietHours ?? {}) as Doc;
  if (!TIME.test(String(q.from)) || !TIME.test(String(q.to))) throw apiError("bad-request", "Quiet hours need a start and an end time.");
  const row = await myRow(ctx);
  await ctx.data.save(COLLECTION_PEOPLE, { ...row, notificationPrefs: { ways, quietHours: { on: q.on === true, from: String(q.from), to: String(q.to) } } });
  return {};
}

/** {} -> { code, expiresAt }. A new 6-digit code for /link in Discord (any older code of yours stops working). */
export async function startDiscordLink(ctx: Ctx) {
  const old = await ctx.data.query(COLLECTION_LINK_CODES, { memberId: ctx.actor.id });
  for (const o of old) await ctx.data.remove(COLLECTION_LINK_CODES, String(o._id));
  const random = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const code = String(random).padStart(6, "0");
  const expiresAt = new Date(ctx.env.now().getTime() + CODE_MINUTES * 60_000).toISOString();
  await ctx.data.insert(COLLECTION_LINK_CODES, { memberId: ctx.actor.id, kind: "code", hash: await sha256Hex(`code:${code}`), expiresAt });
  return { code, expiresAt };
}

/** Saves the Discord account on the member's row (moving it off anyone else's) and tells them. */
export async function linkDiscordAccount(ctx: Ctx, memberId: string, discordId: string, discordName: string) {
  const people = await ctx.data.query(COLLECTION_PEOPLE, {});
  const elsewhere = people.filter((p) => p.discordId === discordId && p.memberId !== memberId);
  const mine = people.find((p) => p.memberId === memberId) ?? { memberId, name: "", subteams: [], active: true };
  await ctx.data.saveMany(COLLECTION_PEOPLE, [
    ...elsewhere.map((p) => ({ ...p, discordId: "", discordName: "", discordDmChannelId: "" })),
    { ...mine, discordId, discordName, discordDmChannelId: "" },
  ]);
  ctx.log({ kind: "person", id: memberId }, "linked Discord", discordName, { type: "person.discordLinked" });
  await notify.sendAll(ctx, [notify.rules.accountNews(memberId, `Discord linked: @${discordName}`, "Notifications you choose in Account now come to you on Discord too.")]);
}

/**
 * { code, discordId, discordName } -> { name }. Apollo only: someone typed /link <code> in Discord. Apollo's listener
 * fills in the Discord ID from Discord itself, so it can't be typed by the person.
 */
export async function linkDiscordCode(ctx: Ctx, body: Doc) {
  if (!ctx.actor.agent) throw apiError("forbidden", "Only Apollo can do that: type /link in Discord.");
  const code = text(body.code, "code", 6);
  const discordId = text(body.discordId, "Discord ID", 30);
  if (!/^\d{6}$/.test(code) || !/^\d{5,30}$/.test(discordId)) throw apiError("bad-request", "That isn't a 6-digit code.");
  const found = (await ctx.data.query(COLLECTION_LINK_CODES, { hash: await sha256Hex(`code:${code}`) }, 1))[0];
  if (!found || found.expiresAt < ctx.env.now().toISOString()) throw apiError("bad-request", "That code doesn't work. Get a new one in Account on the team site.");
  await ctx.data.remove(COLLECTION_LINK_CODES, String(found._id));
  await linkDiscordAccount(ctx, String(found.memberId), discordId, text(body.discordName, "Discord name", 40));
  const person = (await ctx.data.query(COLLECTION_PEOPLE, { memberId: found.memberId }, 1))[0];
  return { name: String(person?.name ?? "") };
}

/** {} -> {}. Unlinks your Discord account. */
export async function unlinkDiscord(ctx: Ctx) {
  const row = await myRow(ctx);
  await ctx.data.save(COLLECTION_PEOPLE, { ...row, discordId: "", discordName: "", discordDmChannelId: "" });
  ctx.log({ kind: "person", id: ctx.actor.id }, "unlinked Discord", "", { type: "person.discordUnlinked" });
  return {};
}
