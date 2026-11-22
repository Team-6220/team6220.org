// GET /api/discord-link/callback: Discord sends people back here after they click Authorize.
// Logic: packages/data/src/ops/server/discord-link.ts.
import type { APIRoute } from "astro";
import { handleDiscordLinkCallback } from "@team6220/data/ops-server";
import { opsEnv } from "./ops-env";
import { verifySession } from "./session";

export const prerender = false;

export const GET: APIRoute = ({ request }) => handleDiscordLinkCallback(request, { verify: verifySession, env: opsEnv });
