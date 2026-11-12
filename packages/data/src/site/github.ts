// SiteStore backed by the GitHub REST API. SERVER ONLY: it needs a token, and tokens never go to the browser.
//
// Opening a pull request = read the tip of main, upload each file as a blob, build one tree and one commit on a new
// branch, then open the pull request. Docs:
//   https://docs.github.com/en/rest/git  and  https://docs.github.com/en/rest/pulls/pulls#create-a-pull-request
import { SiteError, type NewPullRequest, type PullRequest, type SiteStore } from "./types";

export interface GithubSiteStoreOptions {
  /** A GitHub App installation token (or a fine-grained token) with Contents + Pull requests write on the repo. */
  token: string;
  /** "owner/name" */
  repo?: string;
  baseBranch?: string;
  fetch?: typeof fetch;
  apiBase?: string;
}

export const DEFAULT_REPO = "Team-6220/team6220.org";
const MAX_BRANCH_TRIES = 6;

export class GithubSiteStore implements SiteStore {
  readonly kind = "github" as const;
  readonly repoUrl: string;
  private readonly token: string;
  private readonly repo: string;
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly api: string;

  constructor(options: GithubSiteStoreOptions) {
    if (!options.token) throw new SiteError("not-configured", "No GitHub token is configured for the Site Manager.");
    const repo = options.repo ?? DEFAULT_REPO;
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new SiteError("not-configured", `"${repo}" is not an owner/name repository.`);
    this.token = options.token;
    this.repo = repo;
    this.base = options.baseBranch ?? "main";
    this.doFetch = options.fetch ?? ((...a) => fetch(...a));
    this.api = (options.apiBase ?? "https://api.github.com").replace(/\/$/, "");
    this.repoUrl = `https://github.com/${repo}`;
  }

  async readFile(path: string): Promise<string | null> {
    const res = await this.request("GET", `/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(this.base)}`, undefined, {
      Accept: "application/vnd.github.raw+json",
      allow404: true,
    });
    return res === null ? null : res.text;
  }

  async createPullRequest(input: NewPullRequest): Promise<PullRequest> {
    const ref = await this.json<{ object: { sha: string } }>("GET", `/git/ref/heads/${encodeURIComponent(this.base)}`);
    const baseCommit = ref.object.sha;
    const commit = await this.json<{ tree: { sha: string } }>("GET", `/git/commits/${baseCommit}`);

    const entries: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
    for (const f of input.files) {
      const blob = await this.json<{ sha: string }>("POST", "/git/blobs", { content: f.content, encoding: f.encoding });
      entries.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const tree = await this.json<{ sha: string }>("POST", "/git/trees", { base_tree: commit.tree.sha, tree: entries });
    const newCommit = await this.json<{ sha: string }>("POST", "/git/commits", {
      message: input.title,
      tree: tree.sha,
      parents: [baseCommit],
    });

    let branch = input.branch;
    for (let attempt = 1; ; attempt++) {
      const res = await this.request("POST", "/git/refs", { ref: `refs/heads/${branch}`, sha: newCommit.sha }, { allow422: true });
      if (res !== null && res.status !== 422) break;
      if (res !== null && !/already exists/i.test(res.text)) throw new SiteError("github", `GitHub refused the new branch: ${res.text.slice(0, 200)}`);
      if (attempt >= MAX_BRANCH_TRIES) throw new SiteError("github", "GitHub already has several branches with this name. Merge or delete the old ones.");
      branch = `${input.branch}-${attempt + 1}`; // Reference already exists: same admin, same area, same day
    }

    try {
      const pr = await this.json<{ number: number; html_url: string }>("POST", "/pulls", {
        title: input.title,
        head: branch,
        base: this.base,
        body: input.body,
      });
      return { number: pr.number, url: pr.html_url, branch, mock: false };
    } catch (err) {
      // Don't leave an orphan branch behind.
      await this.request("DELETE", `/git/refs/heads/${branch}`, undefined, { allow404: true }).catch(() => undefined);
      throw err;
    }
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.request(method, path, body);
    return JSON.parse(res!.text) as T;
  }

  /** Returns null on an allowed 404; `{status, text}` otherwise (422 only when allowed). Other failures throw SiteError. */
  private async request(
    method: string,
    path: string,
    body?: unknown,
    opts: { Accept?: string; allow404?: boolean; allow422?: boolean } = {},
  ): Promise<{ status: number; text: string } | null> {
    let res: Response;
    try {
      res = await this.doFetch(`${this.api}/repos/${this.repo}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: opts.Accept ?? "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "team6220-site-manager",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SiteError("network", "Couldn't reach GitHub. Try again.");
    }
    const text = await res.text();
    if (res.status === 404 && opts.allow404) return null;
    if (res.status === 422 && opts.allow422) return { status: 422, text };
    if (!res.ok) {
      let message = "";
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? "";
      } catch {
        // not JSON
      }
      // Never include the token or the request in the message.
      if (res.status === 401) throw new SiteError("not-configured", "GitHub rejected the Site Manager's credential (expired or revoked).");
      if (res.status === 403 || res.status === 404) {
        throw new SiteError("not-configured", `GitHub says the Site Manager can't do this (${res.status}). Check the app's access to the repository.`);
      }
      throw new SiteError("github", `GitHub answered ${res.status}${message ? `: ${message}` : ""}`);
    }
    return { status: res.status, text };
  }
}

// ---------------------------------------------------------------------------------------------------------
// Credentials from the server's environment
// ---------------------------------------------------------------------------------------------------------

/** The variables the Site Manager reads on the server. Values are secrets: never commit or log them. */
export interface SiteEnv {
  SITE_MANAGER_GITHUB_TOKEN?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
  /** PKCS#8 PEM ("BEGIN PRIVATE KEY"). Newlines may be written as \n. */
  GITHUB_APP_PRIVATE_KEY?: string;
  SITE_MANAGER_GITHUB_REPO?: string;
}

function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A 9-minute GitHub App JWT (RS256) for `appId`. The key must be PKCS#8. */
export async function githubAppJwt(appId: string, privateKeyPem: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const pem = privateKeyPem.replace(/\\n/g, "\n");
  if (/BEGIN RSA PRIVATE KEY/.test(pem)) {
    throw new SiteError(
      "not-configured",
      "GITHUB_APP_PRIVATE_KEY is in the PKCS#1 format. Convert it: openssl pkcs8 -topk8 -nocrypt -in app-key.pem -out app-key-pkcs8.pem",
    );
  }
  const der = Uint8Array.from(atob(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 9 * 60, iss: appId }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${payload}`));
  return `${head}.${payload}.${b64url(sig)}`;
}

/**
 * Builds the GitHub store from environment variables, or returns null when nothing is configured.
 *  - SITE_MANAGER_GITHUB_TOKEN: a ready token (simplest; fine for testing).
 *  - GITHUB_APP_ID + GITHUB_APP_INSTALLATION_ID + GITHUB_APP_PRIVATE_KEY: the GitHub App. A short-lived installation
 *    token is requested for each call, so nothing expires on the server.
 */
export async function githubStoreFromEnv(env: SiteEnv, doFetch: typeof fetch = (...a) => fetch(...a)): Promise<GithubSiteStore | null> {
  const repo = env.SITE_MANAGER_GITHUB_REPO || undefined;
  if (env.SITE_MANAGER_GITHUB_TOKEN) return new GithubSiteStore({ token: env.SITE_MANAGER_GITHUB_TOKEN, repo, fetch: doFetch });
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_INSTALLATION_ID || !env.GITHUB_APP_PRIVATE_KEY) return null;
  const jwt = await githubAppJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
  let res: Response;
  try {
    res = await doFetch(`https://api.github.com/app/installations/${encodeURIComponent(env.GITHUB_APP_INSTALLATION_ID)}/access_tokens`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "team6220-site-manager" },
    });
  } catch {
    throw new SiteError("network", "Couldn't reach GitHub. Try again.");
  }
  if (!res.ok) throw new SiteError("not-configured", `GitHub would not give the Site Manager an installation token (${res.status}). Check GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID and the private key.`);
  const { token } = (await res.json()) as { token?: string };
  if (!token) throw new SiteError("not-configured", "GitHub sent no installation token.");
  return new GithubSiteStore({ token, repo, fetch: doFetch });
}
