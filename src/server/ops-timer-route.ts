// POST /api/ops-timer: jobs run by Apps Script time triggers (Wix hosting has no scheduler), checked with the Wix secret
// OPS_TIMER_SECRET sent in the `x-timer-secret` header. Jobs: syncGithub (every 5 minutes), refreshEvents (daily).
// Setup: backend/apps-script/ops-timer/README.md.
import type { APIRoute } from "astro";
import { handleTimerRequest } from "@team6220/data/ops-server";
import { opsEnv } from "./ops-env";

export const prerender = false;

export const ALL: APIRoute = ({ request }) => handleTimerRequest(request, { env: opsEnv });
