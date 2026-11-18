// POST /api/github-hook: GitHub's webhook for issue changes, checked with the signature GitHub sends and the Wix secret
// GITHUB_WEBHOOK_SECRET. Setup (repository or organization → Settings → Webhooks): payload URL
// https://www.team6220.org/api/github-hook, content type application/json, the same secret, event "Issues".
import type { APIRoute } from "astro";
import { handleGithubWebhook } from "@team6220/data/ops-server";
import { opsEnv } from "./ops-env";

export const prerender = false;

export const ALL: APIRoute = ({ request }) => handleGithubWebhook(request, { env: opsEnv });
