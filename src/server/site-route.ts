// POST /api/site: the Site Manager's server endpoint. Only added to the Wix build by integrations/site-api.mjs (the
// static test build has no server). All logic lives in @team6220/data/site-server (handleSiteRequest), which is
// unit-tested; this file only wires it to Wix.
//
// Who is asking: the member of the request's session (Wix's built-in login), read with @wix/members.
// Secrets (Wix dashboard → Developer Tools → Secrets Manager; never in the repo), read only when an action needs them:
//   GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY   the GitHub App (preferred)
//   SITE_MANAGER_GITHUB_TOKEN                                           alternative: one ready token
//   SITE_MANAGER_GITHUB_REPO                                            optional, default Team-6220/team6220.org
// Form signups (#76) need no secret: the server reads them with elevated permissions.
import type { APIRoute } from "astro";
import { auth } from "@wix/essentials";
import { submissions } from "@wix/forms";
import { createSignupReader, githubStoreFromEnv, handleSiteRequest, type QuerySubmissions, type SiteEnv } from "@team6220/data/site-server";
import { verifySession as verify } from "./session";
import { readSecret, readSecrets } from "./wix-secrets";

export const prerender = false;

/** The GitHub credential: one token if it's set (one secret read), else the three GitHub App secrets. */
async function githubEnv(): Promise<SiteEnv> {
  const token = await readSecret("SITE_MANAGER_GITHUB_TOKEN");
  const repo = await readSecret("SITE_MANAGER_GITHUB_REPO");
  if (token) return { SITE_MANAGER_GITHUB_TOKEN: token, SITE_MANAGER_GITHUB_REPO: repo };
  return { ...(await readSecrets(["GITHUB_APP_ID", "GITHUB_APP_INSTALLATION_ID", "GITHUB_APP_PRIVATE_KEY"] as const)), SITE_MANAGER_GITHUB_REPO: repo };
}

const querySubmissions = auth.elevate(submissions.querySubmissionsByNamespace) as unknown as QuerySubmissions;
const signups = createSignupReader(querySubmissions);

export const ALL: APIRoute = async ({ request }) =>
  handleSiteRequest(request, {
    verify,
    getStore: async () => githubStoreFromEnv(await githubEnv()),
    getSignups: () => signups,
  });
