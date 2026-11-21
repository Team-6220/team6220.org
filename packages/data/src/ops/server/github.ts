// Two-way sync between Icarus tasks and GitHub issues, for every repository a project is connected to (projects'
// githubRepo, "Team-6220/<name>"). Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Icarus, "GitHub two-way sync". SERVER ONLY.
// Ported from backend/apps-script/ops-api/GitHub.gs.
//
// How it stays safe:
//   - GitHub tells us at once when an issue changes (a webhook, signature checked: handler.ts), and a timer (every
//     5 minutes) runs the same sync as a safety net and to send Icarus changes to GitHub.
//   - Each linked task keeps githubIssue = { repo, number, url, updatedAt (GitHub's, at the last sync), syncedAt }.
//     A task changed since syncedAt was changed in Icarus; an issue whose updated_at differs from updatedAt was
//     changed on GitHub. If both changed, the newer one wins and the other side's version goes into the history.
//   - After writing one side, both stamps are updated, so the change doesn't bounce back (including the webhook
//     GitHub sends for our own change: its updated_at matches, so nothing happens).
//   - Only title, description, open/closed and assignees are synced. Dates, relations, materials and parts are
//     Icarus-only. Deleting either side never deletes the other. Pull requests are skipped.
//   - The Wix secret GITHUB_SYNC_PAUSED = "yes" stops the sync at once (a kill switch).
//   - A request may make 20 calls (https://github.com/Team-6220/team6220.org/wiki/History-Phase-2), so one run reads at most 3 pages of issues per repository,
//     pushes only as many tasks as it has calls for, and the next run carries on. Nothing is lost: what wasn't
//     done is still "changed" next time.
//
// REST API (https://docs.github.com/en/rest/issues/issues), with the token in the Wix secret GITHUB_TOKEN:
//   GET   /repos/{owner}/{repo}/issues?state=all&since=...&sort=updated&direction=asc&per_page=100&page=N
//   POST  /repos/{owner}/{repo}/issues                                           create
//   PATCH /repos/{owner}/{repo}/issues/{number}                                  title, body, state, state_reason, assignees
//   POST  /repos/{owner}/{repo}/issues/{number}/comments                         "Closed from Icarus by ..."
import { COLLECTION_COUNTERS, COLLECTION_HISTORY, COLLECTION_PEOPLE, COLLECTION_PROJECTS, GITHUB_SYNC, getRecord, text, type Actor, type Ctx } from "./context";
import { apiError, withId, type Doc } from "./env";
import { COLLECTION_SEASONS, COLLECTION_TASKS } from "./icarus";
import { findPerson, subteamBadges } from "./shared";
import { rolesFor } from "../roles";

const GITHUB_API = "https://api.github.com";
const GITHUB_ORG = "Team-6220";
const SYNC_KEY_PREFIX = "gh-sync:";
const MAX_ISSUE_PAGES = 3;
/** Calls kept back for the writes at the end of a run: tasks, sync marks, history. */
const RESERVED_CALLS = 3;

async function githubCall(ctx: Ctx, method: string, path: string, payload?: unknown): Promise<any> {
  const token = await ctx.secret("GITHUB_TOKEN");
  if (!token) throw apiError("not-configured", "GitHub sync isn't set up yet (GITHUB_TOKEN is missing).");
  let res: Response;
  try {
    res = await ctx.env.fetch(GITHUB_API + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch {
    throw apiError("wix-unavailable", "GitHub didn't answer. Try again later.");
  }
  if (!res.ok) {
    console.error(`GitHub ${method} ${path} answered ${res.status}`);
    throw apiError("wix-unavailable", `GitHub didn't accept the change (${res.status}). Try again later.`);
  }
  const body = await res.text();
  return body ? JSON.parse(body) : {};
}

/** "Team-6220/robot-2027" -> true. Only the team's own organization is synced. */
export function isTeamRepo(repo: unknown): repo is string {
  return typeof repo === "string" && new RegExp(`^${GITHUB_ORG}/[A-Za-z0-9._-]+$`, "i").test(repo);
}

/** The people list, keyed both ways, for turning assignees into owners and back. */
async function githubPeople(ctx: Ctx) {
  const byLogin = new Map<string, string>();
  const byMember = new Map<string, string>();
  for (const p of await ctx.data.query(COLLECTION_PEOPLE, {})) {
    if (!p.githubLogin) continue;
    byLogin.set(String(p.githubLogin).toLowerCase(), p.memberId);
    byMember.set(p.memberId, p.githubLogin);
  }
  return { byLogin, byMember };
}

const stateOf = (issue: Doc) => (issue.state !== "closed" ? "in-progress" : issue.state_reason === "not_planned" ? "cancelled" : "done");
const isClosedStatus = (status: string) => status === "done" || status === "cancelled";
const later = (a: string, b?: string) => ((b || "") > a ? b! : a);

const syncPaused = async (ctx: Ctx) => (await ctx.secret("GITHUB_SYNC_PAUSED")) === "yes";

export interface SyncResult {
  repos: number;
  pulled: number;
  pushed: number;
  paused?: boolean;
}

/** What the timer runs (and "Sync now" runs for a person): every connected repository, as many as fit in one request. */
export async function syncGithub(ctx: Ctx, options: { repos?: string[]; person?: boolean } = {}): Promise<SyncResult> {
  if (await syncPaused(ctx)) {
    if (options.person) throw apiError("busy", "GitHub sync is paused (GITHUB_SYNC_PAUSED).");
    return { repos: 0, pulled: 0, pushed: 0, paused: true };
  }
  if (!(await ctx.secret("GITHUB_TOKEN"))) {
    if (options.person) throw apiError("not-configured", "GitHub sync isn't set up yet (GITHUB_TOKEN is missing).");
    return { repos: 0, pulled: 0, pushed: 0 };
  }
  const sync = ctx.as(GITHUB_SYNC);
  const projects = new Map<string, Doc>();
  for (const p of await ctx.data.query(COLLECTION_PROJECTS, {})) if (isTeamRepo(p.githubRepo)) projects.set(p.githubRepo, p);
  let repos = [...projects.keys()];
  if (options.repos) repos = repos.filter((r) => options.repos!.some((w) => w.toLowerCase() === r.toLowerCase()));
  if (!repos.length) return { repos: 0, pulled: 0, pushed: 0 };

  const people = await githubPeople(ctx);
  const subteams = (await subteamBadges(ctx)).map((s) => s.name);
  const seasonId = await currentSeasonId(ctx);
  const marks = new Map((await ctx.data.query(COLLECTION_COUNTERS, {})).filter((c) => String(c.key).startsWith(SYNC_KEY_PREFIX)).map((c) => [String(c.key), c]));
  const tasks = await ctx.data.query(COLLECTION_TASKS, {});
  // The repository that waited longest goes first, so a long list is finished over several runs.
  repos.sort((a, b) => String(marks.get(SYNC_KEY_PREFIX + a)?.since ?? "").localeCompare(String(marks.get(SYNC_KEY_PREFIX + b)?.since ?? "")));

  const changedTasks = new Map<string, Doc>();
  const newMarks: Doc[] = [];
  let pulled = 0;
  let pushed = 0;
  let done = 0;
  for (const repo of repos) {
    if (ctx.env.callsLeft() < RESERVED_CALLS + 3) break;
    const mark = marks.get(SYNC_KEY_PREFIX + repo);
    const repoTasks = tasks.filter((t) => t.githubIssue?.repo === repo).map((t) => changedTasks.get(String(t._id)) ?? t);
    const result = await syncRepo(sync, { repo, project: projects.get(repo)!, since: mark?.since || "1970-01-01T00:00:00Z", tasks: repoTasks, people, subteams, seasonId });
    result.saved.forEach((t) => changedTasks.set(String(t._id), t));
    newMarks.push({ ...mark, _id: mark?._id ?? SYNC_KEY_PREFIX + repo, key: SYNC_KEY_PREFIX + repo, since: result.since });
    pulled += result.pulled;
    pushed += result.pushed;
    done++;
  }
  await ctx.data.saveMany(COLLECTION_TASKS, [...changedTasks.values()]);
  await ctx.data.saveMany(COLLECTION_COUNTERS, newMarks);
  return { repos: done, pulled, pushed };
}

interface RepoSync {
  repo: string;
  project: Doc;
  since: string;
  tasks: Doc[];
  people: Awaited<ReturnType<typeof githubPeople>>;
  subteams: string[];
  seasonId: string;
}

async function syncRepo(ctx: Ctx, r: RepoSync): Promise<{ pulled: number; pushed: number; since: string; saved: Doc[] }> {
  const { repo } = r;
  const startedAt = ctx.env.now().toISOString();
  const byNumber = new Map<number, Doc>(r.tasks.map((t) => [t.githubIssue.number, t]));
  const saved = new Map<string, Doc>();
  const handled = new Set<string>();
  let pulled = 0;
  let pushed = 0;

  // ----- GitHub -> Icarus -----
  const issues: Doc[] = [];
  let capped = false;
  for (let page = 1; page <= MAX_ISSUE_PAGES; page++) {
    const batch: Doc[] = await githubCall(ctx, "GET", `/repos/${repo}/issues?state=all&sort=updated&direction=asc&per_page=100&page=${page}&since=${encodeURIComponent(r.since)}`);
    issues.push(...batch);
    if (batch.length < 100) break;
    if (page === MAX_ISSUE_PAGES) capped = true;
  }
  const fresh = issues.filter((i) => !i.pull_request && byNumber.get(i.number)?.githubIssue.updatedAt !== i.updated_at);
  const brandNew = fresh.filter((i) => !byNumber.has(i.number)).length;
  let nextNumber = brandNew ? await ctx.takeNumber("task", brandNew) : 0; // one call for all the new tasks' numbers

  for (const issue of fresh) {
    const task = byNumber.get(issue.number);
    const fromGithub = {
      title: String(issue.title || "").slice(0, 200),
      description: String(issue.body || "").slice(0, 4000),
      status: stateOf(issue),
      ownerIds: (issue.assignees ?? []).map((a: Doc) => r.people.byLogin.get(String(a.login).toLowerCase())).filter(Boolean),
    };
    const link = { repo, number: issue.number, url: issue.html_url, updatedAt: issue.updated_at, syncedAt: startedAt, closed: issue.state === "closed" };
    if (!task) {
      const labels = (issue.labels ?? []).map((l: Doc) => String(l.name || l));
      const created = withId({
        ...fromGithub,
        number: String(nextNumber++),
        parentId: "",
        projectId: r.project._id,
        seasonId: r.seasonId,
        subteams: r.subteams.filter((s) => labels.includes(s)),
        startDate: "",
        dueDate: "",
        notes: "",
        blockedBy: [],
        related: [],
        needs: [],
        createdBy: GITHUB_SYNC.id,
        githubIssue: link,
        updatedAt: startedAt,
      });
      saved.set(created._id, created);
      ctx.log({ kind: "task", id: created._id }, "created from GitHub", `${repo}#${issue.number}`);
      pulled++;
      handled.add(created._id);
      continue;
    }
    const changedHere = (task.updatedAt || "") > (task.githubIssue.syncedAt || "");
    if (changedHere && task.updatedAt > issue.updated_at) continue; // Icarus is newer: pushed below
    if (changedHere) ctx.log({ kind: "task", id: String(task._id) }, "GitHub's newer edit won", `Icarus had: ${task.title} (${task.status})`);
    // Status: keep "not started" vs "in progress" from Icarus while the issue stays open.
    if (fromGithub.status === "in-progress" && !isClosedStatus(task.status)) fromGithub.status = task.status;
    saved.set(String(task._id), { ...task, ...fromGithub, githubIssue: link, updatedAt: startedAt });
    ctx.log({ kind: "task", id: String(task._id) }, "updated from GitHub", `${repo}#${issue.number}`);
    pulled++;
    handled.add(String(task._id));
  }

  // ----- Icarus -> GitHub -----
  let editors: Doc[] | undefined;
  for (const task of r.tasks) {
    if (handled.has(String(task._id))) continue;
    if (!((task.updatedAt || "") > (task.githubIssue.syncedAt || ""))) continue; // not changed in Icarus
    if (ctx.env.callsLeft() < RESERVED_CALLS + 3) break; // the rest waits for the next run
    const closed = isClosedStatus(task.status);
    const issue = await githubCall(ctx, "PATCH", `/repos/${repo}/issues/${task.githubIssue.number}`, {
      title: task.title,
      body: task.description || "",
      state: closed ? "closed" : "open",
      state_reason: closed ? (task.status === "cancelled" ? "not_planned" : "completed") : "reopened",
      assignees: (task.ownerIds ?? []).map((id: string) => r.people.byMember.get(id)).filter(Boolean),
    });
    if (closed !== (task.githubIssue.closed === true)) {
      editors ??= await ctx.data.query(COLLECTION_HISTORY, { recordKind: "task" });
      await githubCall(ctx, "POST", `/repos/${repo}/issues/${task.githubIssue.number}/comments`, {
        body: `${closed ? "Closed" : "Reopened"} from Icarus (team6220.org) by ${lastEditor(editors, task)}.`,
      });
    }
    saved.set(String(task._id), {
      ...task,
      // A browser clock that runs fast can stamp updatedAt in the future; never record a sync earlier than the edit.
      githubIssue: { ...task.githubIssue, updatedAt: issue.updated_at, syncedAt: later(ctx.env.now().toISOString(), task.updatedAt), closed },
    });
    pushed++;
  }

  // When more issues are waiting, carry on from the last one read; otherwise from now.
  const since = capped && issues.length ? String(issues[issues.length - 1].updated_at) : startedAt;
  return { pulled, pushed, since, saved: [...saved.values()] };
}

/** Who last changed a task by hand, from the history log. */
function lastEditor(history: Doc[], task: Doc): string {
  const lines = history.filter((h) => h.recordId === task._id && h.actorId !== GITHUB_SYNC.id).sort((a, b) => (a.at < b.at ? 1 : -1));
  return lines.length ? lines[0].actorName : "a team member";
}

/** The Icarus season running today, so new tasks from GitHub land on the current chart. */
async function currentSeasonId(ctx: Ctx): Promise<string> {
  const today = ctx.today();
  const running = (await ctx.data.query(COLLECTION_SEASONS, {})).filter((s) => s.startDate <= today && today <= s.endDate);
  return running.length ? String(running[0]._id) : "";
}

/** { } -> { repos, pulled, pushed }. "Sync now", from a linked task or a project. */
export async function syncGithubNow(ctx: Ctx) {
  return syncGithub(ctx, { person: true });
}

/** { taskId } -> { task }. Creates a GitHub issue for a task whose project is connected to a repository. */
export async function createGithubIssue(ctx: Ctx, body: Doc) {
  const task = await getRecord(ctx, COLLECTION_TASKS, String(body.taskId || ""), "task");
  if (task.githubIssue) throw apiError("conflict", "This task already has a GitHub issue.");
  const project = task.projectId ? (await ctx.data.queryIds(COLLECTION_PROJECTS, [String(task.projectId)]))[0] : undefined;
  if (!project || !isTeamRepo(project.githubRepo)) throw apiError("bad-request", "Put the task in a project that is connected to a GitHub repository first.");
  const people = await githubPeople(ctx);
  const issue = await githubCall(ctx, "POST", `/repos/${project.githubRepo}/issues`, {
    title: task.title,
    body: `${task.description ? `${task.description}\n\n` : ""}Created from Icarus task t${task.number} by ${ctx.actor.name}.`,
    assignees: (task.ownerIds ?? []).map((id: string) => people.byMember.get(id)).filter(Boolean),
  });
  const now = ctx.env.now().toISOString();
  const saved = await ctx.data.save(COLLECTION_TASKS, {
    ...task,
    githubIssue: { repo: project.githubRepo, number: issue.number, url: issue.html_url, updatedAt: issue.updated_at, syncedAt: now, closed: false },
    updatedAt: now,
  });
  ctx.log({ kind: "task", id: String(task._id) }, "created GitHub issue", `${project.githubRepo}#${issue.number}`);
  return { task: saved };
}

/** { login, memberId? } -> { person }. A member sets their own GitHub username; Leads and Mentors can set anyone's. */
export async function setGithubLogin(ctx: Ctx, body: Doc) {
  const actor: Actor = ctx.actor;
  const memberId = body.memberId ? String(body.memberId) : actor.id;
  if (memberId !== actor.id && !rolesFor(actor.badges).peopleAdmin) throw apiError("forbidden", "You can only set your own GitHub username.");
  const login = text(body.login, "GitHub username", 39, true).replace(/^@/, "");
  if (login && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(login)) throw apiError("bad-request", "That isn't a GitHub username.");
  const person = await findPerson(ctx, memberId);
  if (!person) throw apiError("bad-request", "That person hasn't opened the apps yet.");
  return { person: await ctx.data.save(COLLECTION_PEOPLE, { ...person, githubLogin: login }) };
}
