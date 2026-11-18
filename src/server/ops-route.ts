// POST /api/ops: the apps' protected actions (numbers, subteams, BOM, Icarus, GitHub). The Wix build only
// (integrations/site-api.mjs). All logic is in @team6220/data/ops-server, which is unit-tested; this wires it to Wix.
//
// Wix secrets (dashboard → Developer Tools → Secrets Manager), each read only when an action needs it:
//   APOLLO_KEY_SHA256   SHA-256 (hex) of Apollo's API key. Without it Apollo can't call anything.
//   TBA_KEY             The Blue Alliance read key, for looking events up.
//   TEAM_NUMBER         optional, default 6220.
//   GITHUB_TOKEN        a GitHub token with read and write access to issues in Team-6220 repositories.
//   GITHUB_SYNC_PAUSED  optional. "yes" stops the GitHub sync at once.
import type { APIRoute } from "astro";
import { handleOpsRequest } from "@team6220/data/ops-server";
import { opsEnv } from "./ops-env";
import { verifySession } from "./session";

export const prerender = false;

export const ALL: APIRoute = ({ request }) => handleOpsRequest(request, { verify: verifySession, env: opsEnv });
