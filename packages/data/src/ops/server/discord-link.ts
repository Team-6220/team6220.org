// "Link with Discord" on Account: Discord's own sign-in proves which Discord account is yours. SERVER ONLY.
//
//   GET /api/discord-link            sends you to Discord (signed in to the site, or you're sent to sign in)
//   GET /api/discord-link/callback   Discord sends you back here; your Discord ID is saved, then you're back on Account
//
// Setup (once): in the Discord Developer Portal, the bot's application → OAuth2 → Redirects, add
// https://www.team6220.org/api/discord-link/callback. Wix secrets: DISCORD_CLIENT_ID (the application ID) and
// DISCORD_CLIENT_SECRET (OAuth2 → Client secret). Only the "identify" scope is asked for: Discord tells us the account's
// ID and name, nothing else.
// API: https://discord.com/developers/docs/topics/oauth2#authorization-code-grant
import type { VerifyViewer } from "../../site/verify";
import { actorFor } from "./auth";
import { withCallBudget } from "./budget";
import { Ctx, sha256Hex } from "./context";
import type { OpsEnv } from "./env";
import { COLLECTION_LINK_CODES, linkDiscordAccount } from "./inbox";

const DISCORD = "https://discord.com";
const STATE_MINUTES = 10;

export interface DiscordLinkDeps {
  verify: VerifyViewer;
  env: OpsEnv;
}

const back = (origin: string, result: "linked" | "failed" | "not-set-up") => Response.redirect(`${origin}/apps/account?discord=${result}#notifications`, 302);

async function signedIn(request: Request, deps: DiscordLinkDeps): Promise<Ctx> {
  const env = withCallBudget(deps.env, 15);
  return new Ctx(env, await actorFor({}, deps.verify, env));
}

/** GET /api/discord-link */
export async function handleDiscordLinkStart(request: Request, deps: DiscordLinkDeps): Promise<Response> {
  const origin = new URL(request.url).origin;
  let ctx: Ctx;
  try {
    ctx = await signedIn(request, deps);
  } catch {
    return Response.redirect(`${origin}/apps/account`, 302);
  }
  const clientId = await ctx.secret("DISCORD_CLIENT_ID");
  if (!clientId) return back(origin, "not-set-up");
  const state = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(ctx.env.now().getTime() + STATE_MINUTES * 60_000).toISOString();
  await ctx.data.insert(COLLECTION_LINK_CODES, { memberId: ctx.actor.id, kind: "oauth", hash: await sha256Hex(`oauth:${state}`), expiresAt });
  const params = new URLSearchParams({ client_id: clientId, response_type: "code", scope: "identify", redirect_uri: `${origin}/api/discord-link/callback`, state, prompt: "none" });
  return Response.redirect(`${DISCORD}/oauth2/authorize?${params}`, 302);
}

/** GET /api/discord-link/callback?code=...&state=... */
export async function handleDiscordLinkCallback(request: Request, deps: DiscordLinkDeps): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  try {
    const ctx = await signedIn(request, deps);
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    if (!code || !state) return back(origin, "failed");
    // The state must be one this member started, in the last 10 minutes: Discord's answer can't be replayed for someone else.
    const found = (await ctx.data.query(COLLECTION_LINK_CODES, { hash: await sha256Hex(`oauth:${state}`) }, 1))[0];
    if (!found || found.memberId !== ctx.actor.id || found.expiresAt < ctx.env.now().toISOString()) return back(origin, "failed");
    await ctx.data.remove(COLLECTION_LINK_CODES, String(found._id));
    const [clientId, secret] = await Promise.all([ctx.secret("DISCORD_CLIENT_ID"), ctx.secret("DISCORD_CLIENT_SECRET")]);
    if (!clientId || !secret) return back(origin, "not-set-up");
    const tokenRes = await ctx.env.fetch(`${DISCORD}/api/v10/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: `${origin}/api/discord-link/callback`, client_id: clientId, client_secret: secret }),
    });
    if (!tokenRes.ok) return back(origin, "failed");
    const token = String(((await tokenRes.json()) as { access_token?: string }).access_token ?? "");
    const meRes = await ctx.env.fetch(`${DISCORD}/api/v10/users/@me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!meRes.ok) return back(origin, "failed");
    const me = (await meRes.json()) as { id?: string; username?: string };
    if (!me.id) return back(origin, "failed");
    await linkDiscordAccount(ctx, ctx.actor.id, String(me.id), String(me.username ?? ""));
    await ctx.flushHistory();
    return back(origin, "linked");
  } catch (err) {
    console.error("discord link: failed", err instanceof Error ? err.name : "unknown");
    return back(origin, "failed");
  }
}
