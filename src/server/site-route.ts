// POST /api/site: the Site Manager's server endpoint. Only added to the site when `output` is "server"
// (Phase 2, Wix hosting) by integrations/site-api.mjs; in the static Phase 1 build this file is not part of the site.
// All logic lives in @team6220/data/site-server (handleSiteRequest), which is unit-tested; this file only wires it up.
//
// Server environment variables (secrets: set them in Wix, never in the repo; see docs/WIX-SETUP.md and .env.example):
//   GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY   the GitHub App (preferred)
//   SITE_MANAGER_GITHUB_TOKEN                                           alternative: one ready token
//   SITE_MANAGER_GITHUB_REPO                                            optional, default Team-6220/team6220.org
import type { APIRoute } from "astro";
import { createWixVerifier, githubStoreFromEnv, handleSiteRequest, type SiteEnv } from "@team6220/data/site-server";

export const prerender = false;

const NAMES = [
  "SITE_MANAGER_GITHUB_TOKEN",
  "GITHUB_APP_ID",
  "GITHUB_APP_INSTALLATION_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "SITE_MANAGER_GITHUB_REPO",
] as const;

const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

/**
 * Reads the server variables. process.env covers Node-style hosting; Astro's server env covers the rest.
 * If Wix hosting only exposes secrets through `astro:env/server` (`getSecret`), swap this one function.
 */
function readEnv(): SiteEnv {
  const out: SiteEnv = {};
  for (const name of NAMES) {
    const value = nodeEnv?.[name] ?? (import.meta.env as Record<string, string | undefined>)[name];
    if (value) out[name] = value;
  }
  return out;
}

const verify = createWixVerifier();

export const ALL: APIRoute = ({ request }) =>
  handleSiteRequest(request, {
    verify,
    getStore: () => githubStoreFromEnv(readEnv()),
  });
