// Sending to Discord with the bot's token (the Wix secret DISCORD_BOT_TOKEN, the same token Apollo uses on the Pi).
// Sending is one web request, so the website does it; only listening (slash commands) needs the Pi. SERVER ONLY.
// API: https://discord.com/developers/docs/resources/message#create-message
import type { Ctx } from "../context";

const API = "https://discord.com/api/v10";

export class DiscordError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
  /** Discord said no for good (DMs closed, unknown user or channel): trying again won't help. */
  get final(): boolean {
    return this.status === 403 || this.status === 404 || this.status === 400;
  }
}

async function call(ctx: Ctx, path: string, body: unknown): Promise<Record<string, unknown>> {
  const token = await ctx.secret("DISCORD_BOT_TOKEN");
  if (!token) throw new DiscordError(0, "The Wix secret DISCORD_BOT_TOKEN isn't set.");
  const res = await ctx.env.fetch(API + path, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new DiscordError(res.status, `Discord answered ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** The DM channel with a member (Discord gives the same one every time, so callers keep it). */
export async function openDm(ctx: Ctx, discordId: string): Promise<string> {
  return String((await call(ctx, "/users/@me/channels", { recipient_id: discordId })).id ?? "");
}

/** Posts a message. Mentions in the text never ping anyone. */
export async function sendMessage(ctx: Ctx, channelId: string, content: string): Promise<void> {
  await call(ctx, `/channels/${channelId}/messages`, { content: content.slice(0, 2000), allowed_mentions: { parse: [] } });
}
