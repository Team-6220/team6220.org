// In-memory SiteStore: no network, no GitHub. The default for local development, tests and the static
// (Phase 1) site, where /apps/site shows what would happen ("demo: no pull request is opened").
import { AREAS, toFileText } from "@team6220/content";
import type { NewPullRequest, PullRequest, SiteStore } from "./types";

export const REPO_URL = "https://github.com/Team-6220/team6220.org";

export class MockSiteStore implements SiteStore {
  readonly kind = "mock" as const;
  readonly repoUrl = REPO_URL;
  /** Every pull request "opened", for tests and the demo. */
  readonly pullRequests: (NewPullRequest & PullRequest)[] = [];
  private files = new Map<string, string>();

  /** Starts with the content files bundled with this build. `files` overrides or adds paths. */
  constructor(files: Record<string, string> = {}) {
    for (const def of Object.values(AREAS)) this.files.set(def.path, toFileText(def.initial));
    for (const [path, text] of Object.entries(files)) this.files.set(path, text);
  }

  async readFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async createPullRequest(input: NewPullRequest): Promise<PullRequest> {
    const number = this.pullRequests.length + 1;
    const pr: PullRequest = {
      number,
      url: `${REPO_URL}/pulls?q=is%3Apr+is%3Aopen+head%3Asite-manager%2F`,
      branch: input.branch,
      mock: true,
    };
    // Like the real thing, the file on main does not change until a PR is merged, so the files map stays as is.
    this.pullRequests.push({ ...input, ...pr });
    return pr;
  }
}
