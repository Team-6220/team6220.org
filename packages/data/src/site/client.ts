// site: the functions /apps/site uses (browser side). See docs/SITE-MANAGER.md.
//
//   import { site } from "@team6220/data";
//   const viewer = await site.getViewer();          // signed-out | pending | member | admin (cosmetic: hides the editor)
//   const { value } = await site.load("summer-camp");
//   const result = await site.submit("summer-camp", edited);   // result.pullRequest.mock === true in demo mode
//
// Two modes:
//   - Server mode (build variable PUBLIC_SITE_MANAGER_API=on, Phase 2): talks to POST /api/site, which checks the Web
//     Admin badge and holds the GitHub credential. The browser only ever sends its Wix member token to our own site.
//   - Demo mode (default, e.g. the static Phase 1 site): everything runs in this tab against MockSiteStore. No network,
//     no pull request is opened. `?demo=admin` also skips the sign-in so the editor can be tried locally.
// The badge check here only chooses what to show; /api/site enforces it.
import { AREAS, jsonSchemaOf, parseContent, type AreaId, type Change } from "@team6220/content";
import { BADGES } from "../config";
import * as auth from "../auth";
import { memberAccessToken } from "../wix";
import { MockSiteStore, REPO_URL } from "./mock";
import { proposeChange, readArea } from "./propose";
import { SiteError, type ImageUpload, type PullRequest, type SiteErrorCode, type SiteStore } from "./types";

export { AREAS, jsonSchemaOf, parseContent };
export type { AreaId };
export { REPO_URL };

export type SiteViewer = { kind: "signed-out" } | { kind: "pending"; name: string } | { kind: "member"; name: string } | { kind: "admin"; name: string };

const DEMO_KEY = "team6220.site.demo";

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** True when `?demo=admin` is on for this tab. */
export function demoMode(): boolean {
  return session()?.getItem(DEMO_KEY) === "admin";
}

export function setDemoMode(on: boolean): void {
  try {
    if (on) session()?.setItem(DEMO_KEY, "admin");
    else session()?.removeItem(DEMO_KEY);
  } catch {
    // storage blocked
  }
}

/** True when this build talks to /api/site (Phase 2). Otherwise submits are demo-only. */
export function apiConfigured(): boolean {
  const v = String(import.meta.env?.PUBLIC_SITE_MANAGER_API ?? "").toLowerCase();
  return v === "on" || v === "1" || v === "true";
}

/** Whether Submit really opens a pull request in this tab. */
export function opensRealPullRequests(): boolean {
  return apiConfigured() && !demoMode();
}

let mock: MockSiteStore | undefined;
function mockStore(): SiteStore {
  mock ??= new MockSiteStore();
  return mock;
}

export async function getViewer(): Promise<SiteViewer> {
  if (demoMode()) return { kind: "admin", name: "Demo admin" };
  const member = await auth.getMember();
  if (!member) return { kind: "signed-out" };
  if ((await auth.getAccess()) !== "approved") return { kind: "pending", name: member.name };
  return (await auth.hasBadge(BADGES.webAdmin)) ? { kind: "admin", name: member.name } : { kind: "member", name: member.name };
}

async function callApi<T>(body: Record<string, unknown>): Promise<T> {
  const token = await memberAccessToken();
  if (!token) throw new SiteError("signed-out", "Sign in to use the Site Manager.");
  let res: Response;
  try {
    res = await fetch("/api/site", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify(body),
      credentials: "omit",
    });
  } catch {
    throw new SiteError("network", "Couldn't reach the server. Check the internet connection.");
  }
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new SiteError("server-error", `The server sent an unexpected answer (${res.status}).`);
  }
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new SiteError((e.code as SiteErrorCode) ?? "server-error", e.message ?? `The server answered ${res.status}.`, e.issues);
  }
  return data as T;
}

export interface LoadedArea {
  value: unknown;
  /** Where it came from: the live content on main, or the copy bundled with this build (demo). */
  source: "main" | "bundled";
}

export async function load(area: AreaId): Promise<LoadedArea> {
  if (opensRealPullRequests()) {
    const { value } = await callApi<{ value: unknown }>({ action: "read", area });
    return { value, source: "main" };
  }
  return { value: await readArea(mockStore(), area), source: "bundled" };
}

export interface SubmitResult {
  pullRequest: PullRequest;
  changes: Change[];
}

export async function submit(area: AreaId, value: unknown, images?: ImageUpload[]): Promise<SubmitResult> {
  if (opensRealPullRequests()) {
    return callApi<SubmitResult>({ action: "propose", area, value, images });
  }
  // Demo: same validation and diff as the server, but the pull request only exists in memory.
  const member = demoMode() ? null : await auth.getMember().catch(() => null);
  return proposeChange(mockStore(), { area, value, images, requestedBy: { name: member?.name ?? "Demo admin", id: member?.id } });
}

/** Link to the open Site Manager pull requests on GitHub. */
export function openPullRequestsUrl(): string {
  return `${REPO_URL}/pulls?q=${encodeURIComponent("is:pr is:open head:site-manager/")}`;
}
