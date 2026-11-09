import type { Change, ContentIssue } from "@team6220/content";

export type SiteErrorCode =
  | "signed-out" // no or expired Wix sign-in
  | "pending" // signed in but not approved yet
  | "forbidden" // approved, but no Web Admin badge
  | "bad-request" // the request itself is malformed
  | "unknown-area"
  | "invalid" // the content doesn't match the schema
  | "invalid-image"
  | "no-changes"
  | "not-configured" // the server has no GitHub credential
  | "wix-unavailable"
  | "github" // GitHub refused or failed
  | "network"
  | "server-error";

export class SiteError extends Error {
  constructor(
    readonly code: SiteErrorCode,
    message: string,
    readonly issues?: ContentIssue[],
  ) {
    super(message);
    this.name = "SiteError";
  }
}

/** A file to commit. Text is UTF-8; images are base64. */
export interface RepoFile {
  path: string;
  content: string;
  encoding: "utf-8" | "base64";
}

export interface PullRequest {
  number: number;
  /** Where to look at it on GitHub. */
  url: string;
  branch: string;
  /** True when no pull request really exists (the mock store). */
  mock: boolean;
}

export interface NewPullRequest {
  /** Branch name to create. If it already exists, the store adds a numeric suffix. */
  branch: string;
  title: string;
  body: string;
  files: RepoFile[];
}

/** Where content files are read from and pull requests are opened. Implementations: MockSiteStore, GithubSiteStore. */
export interface SiteStore {
  readonly kind: "mock" | "github";
  /** Web address of the repository on GitHub (no trailing slash). */
  readonly repoUrl: string;
  /** Text of a file on the base branch (main), or null if it doesn't exist. */
  readFile(path: string): Promise<string | null>;
  createPullRequest(input: NewPullRequest): Promise<PullRequest>;
}

/** A small image committed together with the content file (sponsor logo, merch photo, ...). */
export interface ImageUpload {
  /** Repository path under sites/main/media/. */
  path: string;
  base64: string;
}

export interface Requester {
  /** Shown in the pull request. */
  name: string;
  /** Wix member ID, kept out of the pull request text. */
  id?: string;
}

export interface ProposeResult {
  pullRequest: PullRequest;
  changes: Change[];
}
