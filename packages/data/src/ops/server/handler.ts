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
import * as account from "./account";
import * as attendance from "./attendance";
import * as bom from "./bom";
import * as business from "./business";
import * as calendar from "./calendar";
import { withCallBudget } from "./budget";
import { eventItems, icsText } from "../../calendar/ics";
import { publicEvents } from "../../calendar/public";
import type { CalEvent } from "../../calendar/types";
import { Ctx, sha256Hex, VISITOR, type Actor } from "./context";
import { ApiError, apiError, type Doc, type OpsEnv } from "./env";
import * as events from "./events";
import * as fundraising from "./fundraising";
import * as github from "./github";
import * as icarus from "./icarus";
import * as rsvp from "./rsvp";
import * as inbox from "./inbox";
import * as notify from "./notify";
import { runReminders, runRsvpReminders } from "./notify/reminders";
import * as records from "./records";
import * as shared from "./shared";
import * as supervision from "./supervision";

type Action = (ctx: Ctx, body: Doc) => Promise<object>;

/**
 * Every action the API answers. `who` is the role needed (see rolesFor in ../roles.ts); `agent: true` also lets Apollo
 * call it. To add an action, add one line here and its function in another file.
 */
const ACTIONS: Record<string, { who: Who; agent?: boolean; run: Action }> = {
  whoAmI: { who: "viewer", run: shared.whoAmI },
  // Your own account (account.ts)
  getAccount: { who: "signedIn", run: account.getAccount },
  saveMyProfile: { who: "signedIn", run: account.saveMyProfile },
  savePrefs: { who: "signedIn", run: account.savePrefs },
  linkStudentId: { who: "signedIn", run: account.linkStudentId },
  finishProfile: { who: "signedIn", run: account.finishProfile },
  setMyPhoto: { who: "signedIn", run: account.setMyPhoto },
  deleteMyAccount: { who: "signedIn", run: account.deleteMyAccount },
  importRoster: { who: "peopleAdmin", run: account.importRoster },
  // Your inbox, notification settings and Discord link (inbox.ts)
  myInbox: { who: "signedIn", run: inbox.myInbox },
  markRead: { who: "signedIn", run: inbox.markRead },
  getNotificationSettings: { who: "signedIn", run: inbox.getNotificationSettings },
  saveNotificationPrefs: { who: "signedIn", run: inbox.saveNotificationPrefs },
  startDiscordLink: { who: "signedIn", run: inbox.startDiscordLink },
  unlinkDiscord: { who: "signedIn", run: inbox.unlinkDiscord },
  // Apollo only (it checks): someone typed /link <code> in Discord.
  linkDiscordCode: { who: "signedIn", agent: true, run: inbox.linkDiscordCode },
  nextNumber: { who: "team", agent: true, run: shared.nextNumber },
  logHistory: { who: "team", run: shared.logHistory },
  // Reads and simple writes the apps make through the server (records.ts)
  listRecords: { who: "viewer", run: records.listRecords },
  saveRecord: { who: "team", run: records.saveRecord },
  removeRecord: { who: "team", run: records.removeRecord },
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
  // Calendar (calendar.ts). publicCalendar is for anyone, signed in or not.
  publicCalendar: { who: "anyone", run: calendar.publicCalendar },
  saveCalEvent: { who: "scheduler", run: calendar.saveCalEvent },
  removeCalEvent: { who: "scheduler", run: calendar.removeCalEvent },
  saveSchedule: { who: "scheduler", run: calendar.saveSchedule },
  assignMeetings: { who: "lead", run: calendar.assignMeetings },
  // Calendar supervision (supervision.ts). The actions check who may sign up or take someone off a shift.
  signUpShift: { who: "viewer", run: supervision.signUpShift },
  withdrawShift: { who: "viewer", run: supervision.withdrawShift },
  saveSupervisor: { who: "scheduler", run: supervision.saveSupervisor },
  mySupervisorRow: { who: "signedIn", run: supervision.mySupervisorRow },
  askToSupervise: { who: "signedIn", run: supervision.askToSupervise },
  // Attendance (attendance.ts). The kiosk actions use the kiosk's own token, not a login.
  attDay: { who: "attendance", run: attendance.attDay },
  attMine: { who: "attendance", run: attendance.attMine },
  attPast: { who: "attendance", run: attendance.attPast },
  attStats: { who: "attendance", run: attendance.attStats },
  attCopyMonth: { who: "attendanceAdmin", run: attendance.attCopyMonth },
  attImport: { who: "attendanceAdmin", run: attendance.attImport },
  attOpenKiosk: { who: "attendanceAdmin", run: attendance.attOpenKiosk },
  attCloseKiosk: { who: "anyone", run: attendance.attCloseKiosk },
  attKioskSignIn: { who: "anyone", run: attendance.attKioskSignIn },
  attKioskRegister: { who: "anyone", run: attendance.attKioskRegister },
  attKioskToday: { who: "anyone", run: attendance.attKioskToday },
  attKioskQuick: { who: "anyone", run: attendance.attKioskQuick },
  // Business: Sponsor tracker, Grant tracker, Stats (business.ts)
  bizSponsors: { who: "team", run: business.bizSponsors },
  bizAddSponsor: { who: "team", run: business.bizAddSponsor },
  bizSaveSponsor: { who: "business", run: business.bizSaveSponsor },
  bizImportSponsors: { who: "business", run: business.bizImportSponsors },
  bizGrants: { who: "team", run: business.bizGrants },
  bizAddGrant: { who: "team", run: business.bizAddGrant },
  bizSaveGrant: { who: "business", run: business.bizSaveGrant },
  bizImportGrants: { who: "business", run: business.bizImportGrants },
  bizGrantToSponsor: { who: "business", run: business.bizGrantToSponsor },
  bizStats: { who: "team", run: business.bizStats },
  // 1-2-3-100 (fundraising.ts)
  bizMy: { who: "team", run: fundraising.bizMy },
  bizPick: { who: "team", run: fundraising.bizPick },
  bizItemSave: { who: "team", run: fundraising.bizItemSave },
  bizItemSend: { who: "team", run: fundraising.bizItemSend },
  bizAttach: { who: "team", run: fundraising.bizAttach },
  bizFile: { who: "team", run: fundraising.bizFile },
  bizPitchSent: { who: "team", run: fundraising.bizPitchSent },
  bizPitchReply: { who: "team", run: fundraising.bizPitchReply },
  bizFollowUpSent: { who: "team", run: fundraising.bizFollowUpSent },
  bizMerchAdd: { who: "team", run: fundraising.bizMerchAdd },
  bizMerchRemove: { who: "team", run: fundraising.bizMerchRemove },
  bizMerchDone: { who: "team", run: fundraising.bizMerchDone },
  bizApprovals: { who: "business", run: fundraising.bizApprovals },
  bizReview: { who: "business", run: fundraising.bizReview },
  bizDecide: { who: "bizApprover", run: fundraising.bizDecide },
  bizStatus: { who: "business", run: fundraising.bizStatus },
  bizRemind: { who: "bizApprover", run: fundraising.bizRemind },
  bizGetSettings: { who: "team", run: fundraising.bizGetSettings },
  bizSaveSettings: { who: "lead", run: fundraising.bizSaveSettings },
  bizDistance: { who: "team", run: fundraising.bizDistance },
  bizTemplates: { who: "team", run: fundraising.bizTemplates },
  // RSVP (rsvp.ts)
  rsvpOpen: { who: "team", run: rsvp.rsvpOpen },
  rsvpAnswer: { who: "team", run: rsvp.rsvpAnswer },
  rsvpResults: { who: "team", run: rsvp.rsvpResults },
  rsvpManage: { who: "lead", run: rsvp.rsvpManage },
  rsvpSaveForm: { who: "lead", run: rsvp.rsvpSaveForm },
  rsvpRemind: { who: "lead", run: rsvp.rsvpRemind },
  rsvpGetSettings: { who: "lead", run: rsvp.rsvpGetSettings },
  rsvpSaveSettings: { who: "lead", run: rsvp.rsvpSaveSettings },
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
  sendDeliveries: (ctx) => notify.sendDeliveries(ctx),
  runReminders: (ctx) => runReminders(ctx),
  runRsvpReminders: (ctx) => runRsvpReminders(ctx),
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
    const actor = action.who === "anyone" ? VISITOR : await actorFor(body, deps.verify, env);
    if (actor.agent && !action.agent) throw apiError("forbidden", "Apollo isn't allowed to do that.");
    if (!actor.agent) requireRole(actor, action.who);
    return await run(new Ctx(env, actor), action.run, body);
  } catch (err) {
    return opsFailure(err, "ops api");
  }
}

// ---------------------------------------------------------------------------------------------------------
// The calendar feed
// ---------------------------------------------------------------------------------------------------------

/** GET /api/calendar.ics: the public calendar as an .ics feed, for "Add to Google Calendar" and "Subscribe" on Apple
 *  Calendar, which keep it current by themselves. Public meetings, competitions, events and breaks only: no shifts,
 *  supervisors, team-only meetings or notes. */
export async function handleCalendarFeed(request: Request, deps: { env: OpsEnv }): Promise<Response> {
  try {
    if (request.method !== "GET") throw apiError("bad-request", "Use GET.");
    const env = withCallBudget(deps.env);
    const rows = (await env.data.query("cal_events", { public: true }, 1000)) as unknown as CalEvent[];
    const text = icsText(eventItems(publicEvents(rows)), "Team 6220 calendar", env.now());
    return new Response(text, { status: 200, headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "public, max-age=900" } });
  } catch (err) {
    return opsFailure(err, "calendar feed");
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
