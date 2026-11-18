// The three endpoints of the operations server, as plain functions from Request to Response so they are tested
// directly (src/server/ops-route.ts and friends are thin wrappers). SERVER ONLY.
//
//   POST /api/ops           the apps' protected actions (the table below); one-to-one with the old Apps Script's.
//   POST /api/ops-timer     jobs run by Apps Script time triggers (Wix has no scheduler), checked with a shared secret.
//   POST /api/github-hook   GitHub's webhook, checked with its signature.
//
// Answers are { ok: true, ... } or { ok: false, error: "<code>", message: "..." }, as the apps already expect.
import { failureStatus, guardSameSite, readJsonObject, reply } from "../../server/http";
import { SiteError } from "../../site/types";
import type { VerifyViewer } from "../../site/verify";
import { actorFor, requireRole, type Who } from "./auth";
import * as bom from "./bom";
import { withCallBudget } from "./budget";
import { Ctx, sha256Hex, type Actor } from "./context";
import { ApiError, apiError, type Doc, type OpsEnv } from "./env";
import * as events from "./events";
import * as github from "./github";
import * as icarus from "./icarus";
import * as shared from "./shared";

type Action = (ctx: Ctx, body: Doc) => Promise<object>;

/**
 * Every action the API answers. `who` is the role needed (see rolesFor in ../roles.ts); `agent: true` also lets Apollo
 * call it. To add an action, add one line here and its function in another file.
 */
const ACTIONS: Record<string, { who: Who; agent?: boolean; run: Action }> = {
  whoAmI: { who: "viewer", run: shared.whoAmI },
  nextNumber: { who: "team", agent: true, run: shared.nextNumber },
  logHistory: { who: "team", run: shared.logHistory },
  saveProject: { who: "lead", run: shared.saveProject },
  setMySubteams: { who: "team", run: shared.setMySubteams },
  setSubteams: { who: "peopleAdmin", run: shared.setSubteams },
  syncPeople: { who: "peopleAdmin", run: shared.syncPeople },
  // BOM (bom.ts)
  saveBom: { who: "lead", run: bom.saveBom },
  createOrder: { who: "lead", run: bom.createOrder },
  addSection: { who: "team", run: bom.addSection },
  saveLine: { who: "team", agent: true, run: bom.saveLine },
  addLines: { who: "team", agent: true, run: bom.addLines },
  removeLine: { who: "team", run: bom.removeLine },
  reopenLine: { who: "lead", run: bom.reopenLine },
  signLines: { who: "approver", run: bom.signLines },
  approveSection: { who: "approver", run: bom.approveSection },
  markOrdered: { who: "approver", run: bom.markOrdered },
  receiveLines: { who: "team", agent: true, run: bom.receiveLines },
  linkLineToInventory: { who: "team", agent: true, run: bom.linkLineToInventory },
  importOrder: { who: "lead", run: bom.importOrder },
  // Icarus (icarus.ts)
  saveIcarusRecord: { who: "lead", run: icarus.saveIcarusRecord },
  removeIcarusRecord: { who: "lead", run: icarus.removeIcarusRecord },
  listTasks: { who: "viewer", agent: true, run: icarus.listTasks },
  saveTask: { who: "team", agent: true, run: icarus.saveTask },
  addTaskComment: { who: "team", agent: true, run: icarus.addTaskComment },
  needsAttention: { who: "viewer", agent: true, run: icarus.needsAttention },
  lookupEvent: { who: "team", agent: true, run: events.lookupEvent },
  // GitHub (github.ts)
  createGithubIssue: { who: "team", run: github.createGithubIssue },
  syncGithubNow: { who: "team", run: github.syncGithubNow },
  setGithubLogin: { who: "team", run: github.setGithubLogin },
  listTeamEvents: { who: "team", agent: true, run: events.listTeamEvents },
};

/** Jobs the timer may run. */
const JOBS: Record<string, Action> = {
  syncGithub: (ctx) => github.syncGithub(ctx),
  refreshEvents: (ctx) => events.refreshEvents(ctx),
};

const MAX_BODY_BYTES = 2_000_000;

export interface OpsDeps {
  /** Who is asking, from the Wix session (site/verify.ts). */
  verify: VerifyViewer;
  env: OpsEnv;
}

/** Runs one action as the actor, then writes the history lines it logged (even after an error, so saved work is on record). */
async function run(ctx: Ctx, action: Action, body: Doc): Promise<Response> {
  try {
    return reply(200, { ok: true, ...(await action(ctx, body)) });
  } finally {
    await ctx.flushHistory().catch((err) => console.error("ops: couldn't write history", err instanceof Error ? err.name : "unknown"));
  }
}

/** An error as the apps expect it. Unexpected errors are logged by name only (never request bodies, tokens or keys). */
function opsFailure(err: unknown, who: string): Response {
  if (err instanceof ApiError || err instanceof SiteError) {
    return reply(failureStatus(err.code), { ok: false, error: err.code, message: err.message });
  }
  console.error(`${who}: unexpected error`, err instanceof Error ? err.name : "unknown");
  return reply(500, { ok: false, error: "server-error", message: "Something went wrong on the operations server." });
}

export async function handleOpsRequest(request: Request, deps: OpsDeps): Promise<Response> {
  try {
    if (request.method !== "POST") throw apiError("bad-request", "Use POST.");
    const body = await readJsonObject(request, MAX_BODY_BYTES);
    const action = typeof body.action === "string" && Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : undefined;
    if (!action) throw apiError("bad-request", "Unknown action.");
    // Sign-in lives in a cookie, so refuse other websites' requests. Apollo sends a key, not a cookie.
    if (typeof body.apiKey !== "string" || !body.apiKey) guardSameSite(request);
    const env = withCallBudget(deps.env);
    const actor = await actorFor(body, deps.verify, env);
    if (actor.agent && !action.agent) throw apiError("forbidden", "Apollo isn't allowed to do that.");
    if (!actor.agent) requireRole(actor, action.who);
    return await run(new Ctx(env, actor), action.run, body);
  } catch (err) {
    return opsFailure(err, "ops api");
  }
}

// ---------------------------------------------------------------------------------------------------------
// The timer
// ---------------------------------------------------------------------------------------------------------

const TIMER: Actor = { id: "timer", name: "Timer", agent: true, approved: true, badges: [] };

/** Compares two secrets without stopping at the first difference. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/** POST { job: "syncGithub" | "refreshEvents" } with the header `x-timer-secret` (the Wix secret OPS_TIMER_SECRET). */
export async function handleTimerRequest(request: Request, deps: { env: OpsEnv }): Promise<Response> {
  try {
    if (request.method !== "POST") throw apiError("bad-request", "Use POST.");
    const env = withCallBudget(deps.env, 20);
    const expected = await env.secret("OPS_TIMER_SECRET");
    const given = request.headers.get("x-timer-secret") ?? "";
    if (!expected || expected.length < 20 || !given || !(await sameSecret(given, expected))) throw apiError("signed-out", "That timer secret isn't valid.");
    const body = await readJsonObject(request, 10_000);
    const job = typeof body.job === "string" && Object.hasOwn(JOBS, body.job) ? JOBS[body.job] : undefined;
    if (!job) throw apiError("bad-request", "Unknown job.");
    return await run(new Ctx(env, TIMER), job, body);
  } catch (err) {
    return opsFailure(err, "ops timer");
  }
}

// ---------------------------------------------------------------------------------------------------------
// GitHub's webhook
// ---------------------------------------------------------------------------------------------------------

/** HMAC-SHA256 of the body with the webhook secret, as GitHub writes it: "sha256=<hex>". */
async function githubSignature(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `sha256=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** An issue changed on GitHub: bring that repository up to date at once. Other events are acknowledged and ignored. */
export async function handleGithubWebhook(request: Request, deps: { env: OpsEnv }): Promise<Response> {
  try {
    if (request.method !== "POST") throw apiError("bad-request", "Use POST.");
    const env = withCallBudget(deps.env, 20);
    const raw = await request.text();
    if (raw.length > 5_000_000) throw apiError("bad-request", "That request is too large.");
    const secret = await env.secret("GITHUB_WEBHOOK_SECRET");
    const signature = request.headers.get("x-hub-signature-256") ?? "";
    if (!secret || !signature || !(await sameSecret(signature, await githubSignature(secret, raw)))) throw apiError("signed-out", "That signature isn't valid.");

    const kind = request.headers.get("x-github-event");
    if (kind === "ping") return reply(200, { ok: true, pong: true });
    if (kind !== "issues") return reply(200, { ok: true, ignored: kind });
    let repo: unknown;
    try {
      repo = JSON.parse(raw)?.repository?.full_name;
    } catch {
      throw apiError("bad-request", "The request body must be JSON.");
    }
    if (!github.isTeamRepo(repo)) return reply(200, { ok: true, ignored: "not a team repository" });
    return await run(new Ctx(env, TIMER), (ctx) => github.syncGithub(ctx, { repos: [repo as string] }), {});
  } catch (err) {
    return opsFailure(err, "github webhook");
  }
}
