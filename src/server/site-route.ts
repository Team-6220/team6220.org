// POST /api/site: the Site Manager's server endpoint. Only added to the site when `output` is "server"
// (Phase 2, Wix hosting) by integrations/site-api.mjs; in the static Phase 1 build this file is not part of the site.
// All logic lives in @team6220/data/site-server (handleSiteRequest), which is unit-tested; this file only wires it up.
//
// Server environment variables (secrets: set them in Wix, never in the repo; see docs/WIX-SETUP.md and .env.example):
//   GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY   the GitHub App (preferred)
//   SITE_MANAGER_GITHUB_TOKEN                                           alternative: one ready token
//   SITE_MANAGER_GITHUB_REPO                                            optional, default Team-6220/team6220.org
//   SITE_MANAGER_WIX_API_KEY, WIX_SITE_ID                               form signups (#76): a Wix API key with
//                                                                       "Manage form submissions", and our site ID
import type { APIRoute } from "astro";
import { badgeAssignments, badgesV2, members } from "@wix/members";
import { createSessionVerifier, githubStoreFromEnv, handleSiteRequest, signupReaderFromEnv, type SignupEnv, type SiteEnv } from "@team6220/data/site-server";

export const prerender = false;

const NAMES = [
  "SITE_MANAGER_GITHUB_TOKEN",
  "GITHUB_APP_ID",
  "GITHUB_APP_INSTALLATION_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "SITE_MANAGER_GITHUB_REPO",
  "SITE_MANAGER_WIX_API_KEY",
  "WIX_SITE_ID",
] as const;

const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

/**
 * Reads the server variables. process.env covers Node-style hosting; Astro's server env covers the rest.
 * If Wix hosting only exposes secrets through `astro:env/server` (`getSecret`), swap this one function.
 */
function readEnv(): SiteEnv & SignupEnv {
  const out: SiteEnv & SignupEnv = {};
  for (const name of NAMES) {
    const value = nodeEnv?.[name] ?? (import.meta.env as Record<string, string | undefined>)[name];
    if (value) out[name] = value;
  }
  return out;
}

// Who is asking: the member of this request's session (Wix's built-in login). Wix's middleware runs these module
// functions as that member, so no token is passed around.
const verify = createSessionVerifier({
  getCurrentMember: async () => (await members.getCurrentMember({ fieldsets: ["FULL"] })).member,
  listBadges: async () => (await badgesV2.queryBadges().limit(100).find()).items,
  listBadgeIds: async (memberId) =>
    (await badgeAssignments.queryBadgeAssignments().eq("memberId", memberId).limit(100).find()).items.map((a) => a.badgeId ?? ""),
});

export const ALL: APIRoute = ({ request }) =>
  handleSiteRequest(request, {
    verify,
    getStore: () => githubStoreFromEnv(readEnv()),
    getSignups: () => signupReaderFromEnv(readEnv()),
  });
