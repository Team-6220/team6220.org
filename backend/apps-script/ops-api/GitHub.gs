// Two-way sync between Icarus tasks and GitHub issues, for every repository a project is connected to (projects'
// githubRepo, "Team-6220/<name>"). Plan: docs/operations/ICARUS.md, "GitHub two-way sync".
//
// How it stays safe:
//   - Polling, every 5 minutes, by a time trigger (syncGithub). An Apps Script web app can't read request headers,
//     so it can't check GitHub's webhook signature; polling needs no webhook.
//   - Each linked task keeps githubIssue = { repo, number, url, updatedAt (GitHub's, at the last sync), syncedAt }.
//     A task changed since syncedAt was changed in Icarus; an issue whose updated_at differs from updatedAt was
//     changed on GitHub. If both changed, the newer one wins and the other side's version goes into the history.
//   - After writing one side, both stamps are updated, so the change doesn't bounce back.
//   - Only title, description, open/closed and assignees are synced. Dates, relations, materials and parts are
//     Icarus-only. Deleting either side never deletes the other. Pull requests are skipped.
//   - Script Property GITHUB_SYNC_PAUSED = "yes" stops the sync at once (a kill switch).
//
// REST API (https://docs.github.com/en/rest/issues/issues), with the token in Script Property GITHUB_TOKEN:
//   GET   /repos/{owner}/{repo}/issues?state=all&since=...&per_page=100&page=N   (includes pull requests: skipped)
//   POST  /repos/{owner}/{repo}/issues                                           create
//   PATCH /repos/{owner}/{repo}/issues/{number}                                  title, body, state, state_reason, assignees
//   POST  /repos/{owner}/{repo}/issues/{number}/comments                         "Closed from Icarus by ..."

const GITHUB_API = "https://api.github.com";
const GITHUB_ORG = "Team-6220";
const SYNC_PROPERTY_PREFIX = "gh-sync:";
const MAX_ISSUE_PAGES = 10;

function githubCall_(method, path, payload) {
  const token = prop_("GITHUB_TOKEN");
  if (!token) throw apiError_("not-configured", "GitHub sync isn't set up yet (GITHUB_TOKEN is missing).");
  const options = {
    method: method,
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    muteHttpExceptions: true,
  };
  if (payload !== undefined) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(payload);
  }
  const res = UrlFetchApp.fetch(GITHUB_API + path, options);
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    console.error("GitHub " + method + " " + path + " answered " + code + ": " + res.getContentText().slice(0, 300));
    throw apiError_("wix-unavailable", "GitHub didn't accept the change (" + code + "). Try again later.");
  }
  const text = res.getContentText();
  return text ? JSON.parse(text) : {};
}

/** "Team-6220/robot-2027" -> true. Only the team's own organization is synced. */
function isTeamRepo_(repo) {
  return typeof repo === "string" && new RegExp("^" + GITHUB_ORG + "/[A-Za-z0-9._-]+$", "i").test(repo);
}

/** The people list, keyed both ways, for turning assignees into owners and back. */
function githubPeople_() {
  const byLogin = {}, byMember = {};
  wixQuery_(COLLECTION_PEOPLE, {}).forEach(function (p) {
    if (!p.githubLogin) return;
    byLogin[String(p.githubLogin).toLowerCase()] = p.memberId;
    byMember[p.memberId] = p.githubLogin;
  });
  return { byLogin: byLogin, byMember: byMember };
}

function stateOf_(issue) {
  if (issue.state !== "closed") return "in-progress";
  return issue.state_reason === "not_planned" ? "cancelled" : "done";
}
function isClosedStatus_(status) {
  return status === "done" || status === "cancelled";
}

/** The Icarus season running today, so new tasks from GitHub land on the current chart. */
function currentSeasonId_() {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const running = wixQuery_("icarus_seasons", {}).filter(function (s) { return s.startDate <= today && today <= s.endDate; });
  return running.length ? running[0]._id : "";
}

/** Runs every 5 minutes (Triggers > Add trigger > syncGithub > Time-driven > Minutes timer > Every 5 minutes). */
function syncGithub() {
  if (prop_("GITHUB_SYNC_PAUSED") === "yes") return console.log("syncGithub: paused (GITHUB_SYNC_PAUSED).");
  if (!prop_("GITHUB_TOKEN")) return console.log("syncGithub: GITHUB_TOKEN is not set.");
  const result = withLock_(function () { return syncAll_(); });
  console.log("syncGithub: " + JSON.stringify(result));
}

/** { } -> { repos, pulled, pushed }. "Sync now", from a linked task or a project. */
function syncGithubNow_() {
  if (prop_("GITHUB_SYNC_PAUSED") === "yes") throw apiError_("busy", "GitHub sync is paused (GITHUB_SYNC_PAUSED).");
  return withLock_(function () { return syncAll_(); });
}

function syncAll_() {
  const repos = {};
  wixQuery_(COLLECTION_PROJECTS, {}).forEach(function (p) { if (isTeamRepo_(p.githubRepo)) repos[p.githubRepo] = p; });
  const people = githubPeople_();
  const subteams = subteamBadges_().map(function (s) { return s.name; });
  const seasonId = currentSeasonId_();
  let pulled = 0, pushed = 0;
  Object.keys(repos).forEach(function (repo) {
    const counts = syncRepo_(repo, repos[repo], people, subteams, seasonId);
    pulled += counts.pulled;
    pushed += counts.pushed;
  });
  return { repos: Object.keys(repos).length, pulled: pulled, pushed: pushed };
}

const GITHUB_SYNC_ACTOR = { id: "github-sync", name: "GitHub sync", agent: true };

function syncRepo_(repo, project, people, subteams, seasonId) {
  const props = PropertiesService.getScriptProperties();
  const since = props.getProperty(SYNC_PROPERTY_PREFIX + repo) || "1970-01-01T00:00:00Z";
  const startedAt = new Date().toISOString();
  const tasks = wixQuery_("icarus_tasks", {}).filter(function (t) { return t.githubIssue && t.githubIssue.repo === repo; });
  const byNumber = {};
  tasks.forEach(function (t) { byNumber[t.githubIssue.number] = t; });
  const handled = {};
  let pulled = 0, pushed = 0;

  // ----- GitHub -> Icarus -----
  for (let page = 1; page <= MAX_ISSUE_PAGES; page++) {
    const issues = githubCall_("get", "/repos/" + repo + "/issues?state=all&per_page=100&page=" + page + "&since=" + encodeURIComponent(since));
    issues.forEach(function (issue) {
      if (issue.pull_request) return;
      const task = byNumber[issue.number];
      if (task && task.githubIssue.updatedAt === issue.updated_at) return; // nothing new on GitHub
      const fromGithub = {
        title: String(issue.title || "").slice(0, 200),
        description: String(issue.body || "").slice(0, 4000),
        status: stateOf_(issue),
        ownerIds: (issue.assignees || []).map(function (a) { return people.byLogin[String(a.login).toLowerCase()]; }).filter(Boolean),
      };
      const link = { repo: repo, number: issue.number, url: issue.html_url, updatedAt: issue.updated_at, syncedAt: startedAt, closed: issue.state === "closed" };
      if (!task) {
        const labels = (issue.labels || []).map(function (l) { return String(l.name || l); });
        const created = wixSave_("icarus_tasks", Object.assign(fromGithub, {
          number: String(takeNumberLocked_("task")), parentId: "", projectId: project._id, seasonId: seasonId,
          subteams: subteams.filter(function (s) { return labels.indexOf(s) !== -1; }),
          startDate: "", dueDate: "", notes: "", blockedBy: [], related: [], needs: [], createdBy: GITHUB_SYNC_ACTOR.id,
          githubIssue: link, updatedAt: startedAt,
        }));
        writeHistory_(GITHUB_SYNC_ACTOR, { kind: "task", id: created._id }, "created from GitHub", repo + "#" + issue.number);
        pulled++;
        handled[created._id] = true;
        return;
      }
      const changedHere = (task.updatedAt || "") > (task.githubIssue.syncedAt || "");
      if (changedHere && task.updatedAt > issue.updated_at) return; // Icarus is newer: pushed below
      if (changedHere) {
        writeHistory_(GITHUB_SYNC_ACTOR, { kind: "task", id: task._id }, "GitHub's newer edit won",
          "Icarus had: " + task.title + " (" + task.status + ")");
      }
      // Status: keep "not started" vs "in progress" from Icarus while the issue stays open.
      if (fromGithub.status === "in-progress" && !isClosedStatus_(task.status)) fromGithub.status = task.status;
      wixSave_("icarus_tasks", Object.assign({}, task, fromGithub, { githubIssue: link, updatedAt: startedAt }));
      writeHistory_(GITHUB_SYNC_ACTOR, { kind: "task", id: task._id }, "updated from GitHub", repo + "#" + issue.number);
      pulled++;
      handled[task._id] = true;
    });
    if (issues.length < 100) break;
  }

  // ----- Icarus -> GitHub -----
  tasks.forEach(function (task) {
    if (handled[task._id]) return;
    if (!((task.updatedAt || "") > (task.githubIssue.syncedAt || ""))) return; // not changed in Icarus
    const closed = isClosedStatus_(task.status);
    const patch = {
      title: task.title,
      body: task.description || "",
      state: closed ? "closed" : "open",
      state_reason: closed ? (task.status === "cancelled" ? "not_planned" : "completed") : "reopened",
      assignees: (task.ownerIds || []).map(function (id) { return people.byMember[id]; }).filter(Boolean),
    };
    const issue = githubCall_("patch", "/repos/" + repo + "/issues/" + task.githubIssue.number, patch);
    const wasClosed = task.githubIssue.closed === true;
    if (closed !== wasClosed) {
      githubCall_("post", "/repos/" + repo + "/issues/" + task.githubIssue.number + "/comments", {
        body: (closed ? "Closed" : "Reopened") + " from Icarus (team6220.org) by " + lastEditor_(task) + ".",
      });
    }
    wixSave_("icarus_tasks", Object.assign({}, task, {
      // A browser clock that runs fast can stamp updatedAt in the future; never record a sync earlier than the edit.
      githubIssue: Object.assign({}, task.githubIssue, { updatedAt: issue.updated_at, syncedAt: laterOf_(new Date().toISOString(), task.updatedAt), closed: closed }),
    }));
    pushed++;
  });

  props.setProperty(SYNC_PROPERTY_PREFIX + repo, startedAt);
  return { pulled: pulled, pushed: pushed };
}

function laterOf_(a, b) {
  return (b || "") > a ? b : a;
}

/** Who last changed a task, from the history log. */
function lastEditor_(task) {
  const lines = wixQuery_(COLLECTION_HISTORY, { recordKind: "task", recordId: task._id })
    .filter(function (h) { return h.actorId !== GITHUB_SYNC_ACTOR.id; })
    .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  return lines.length ? lines[0].actorName : "a team member";
}

/** { taskId } -> { task }. Creates a GitHub issue for a task whose project is connected to a repository. */
function createGithubIssue_(body, actor) {
  const task = getRecord_("icarus_tasks", String(body.taskId || ""), "task");
  if (task.githubIssue) throw apiError_("conflict", "This task already has a GitHub issue.");
  const project = task.projectId ? wixQuery_(COLLECTION_PROJECTS, { _id: task.projectId }, 1)[0] : null;
  if (!project || !isTeamRepo_(project.githubRepo)) throw apiError_("bad-request", "Put the task in a project that is connected to a GitHub repository first.");
  const people = githubPeople_();
  const issue = githubCall_("post", "/repos/" + project.githubRepo + "/issues", {
    title: task.title,
    body: (task.description ? task.description + "\n\n" : "") + "Created from Icarus task t" + task.number + " by " + actor.name + ".",
    assignees: (task.ownerIds || []).map(function (id) { return people.byMember[id]; }).filter(Boolean),
  });
  const now = new Date().toISOString();
  const saved = wixSave_("icarus_tasks", Object.assign({}, task, {
    githubIssue: { repo: project.githubRepo, number: issue.number, url: issue.html_url, updatedAt: issue.updated_at, syncedAt: now, closed: false },
    updatedAt: now,
  }));
  writeHistory_(actor, { kind: "task", id: task._id }, "created GitHub issue", project.githubRepo + "#" + issue.number);
  return { task: saved };
}

/** { login, memberId? } -> { person }. A member sets their own GitHub username; Leads and Mentors can set anyone's. */
function setGithubLogin_(body, actor) {
  const memberId = body.memberId ? String(body.memberId) : actor.id;
  if (memberId !== actor.id && !roles_(actor.badges).peopleAdmin) throw apiError_("forbidden", "You can only set your own GitHub username.");
  const login = text_(body.login, "GitHub username", 39, true).replace(/^@/, "");
  if (login && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(login)) throw apiError_("bad-request", "That isn't a GitHub username.");
  const person = wixQuery_(COLLECTION_PEOPLE, { memberId: memberId }, 1)[0];
  if (!person) throw apiError_("bad-request", "That person hasn't opened the apps yet.");
  return { person: wixSave_(COLLECTION_PEOPLE, Object.assign({}, person, { githubLogin: login })) };
}
