// GET /api/discord-link: "Link with Discord" on Account sends people here, and on to Discord's sign-in.
// Logic: packages/data/src/ops/server/discord-link.ts (setup steps are at the top of that file).
import type { APIRoute } from "astro";
import { handleDiscordLinkStart } from "@team6220/data/ops-server";
import { opsEnv } from "./ops-env";
import { verifySession } from "./session";

export const prerender = false;

export const GET: APIRoute = ({ request }) => handleDiscordLinkStart(request, { verify: verifySession, env: opsEnv });
