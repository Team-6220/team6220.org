// GET /api/calendar.ics: the public calendar as a feed Google Calendar and Apple Calendar can subscribe to. The Wix build
// only (integrations/site-api.mjs). The logic is in @team6220/data/ops-server (handleCalendarFeed).
import type { APIRoute } from "astro";
import { handleCalendarFeed } from "@team6220/data/ops-server";
import { opsEnv } from "./ops-env";

export const prerender = false;

export const ALL: APIRoute = ({ request }) => handleCalendarFeed(request, { env: opsEnv });
