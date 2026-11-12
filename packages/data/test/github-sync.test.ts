// Two-way GitHub issue sync (ops-api GitHub.gs) against a small fake of GitHub's issues API.
import { beforeEach, describe, expect, it } from "vitest";
import { makeScript, type GithubIssue } from "./helpers/ops-api-script";

const lead = "tok-lead-0123456789abcdef";
const member = "tok-member-0123456789abcdef";
const REPO = "Team-6220/robot-2027";

describe("GitHub two-way sync", () => {
  let s: ReturnType<typeof makeScript>;
  /** Runs the 5-minute trigger once. */
  const sync = () => (s.context as unknown as { syncGithub: () => void }).syncGithub();
  const tasks = () => s.rows("icarus_tasks");
  const issue = (number: number) => s.github.repos[REPO].find((i) => i.number === number)!;
  /** Someone edits the issue on GitHub. */
  const editOnGithub = (number: number, changes: Partial<GithubIssue>, at: string) => Object.assign(issue(number), changes, { updated_at: at });

  beforeEach(() => {
    s = makeScript({
      [lead]: { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] },
      [member]: { id: "m-member", status: "APPROVED", badges: ["b-team"] },
    });
    s.post({ action: "whoAmI", token: lead });
    s.post({ action: "whoAmI", token: member });
    s.post({ action: "setGithubLogin", token: member, login: "@octomember" });
    s.post({ action: "saveProject", token: lead, project: { name: "Robot code", githubRepo: REPO } });
    s.github.repos[REPO] = [
      { number: 7, title: "Fix swerve offsets", body: "They drift.", state: "open", state_reason: null, labels: [{ name: "Programming" }],
        assignees: [{ login: "OctoMember" }], html_url: `https://github.com/${REPO}/issues/7`, updated_at: "2027-01-09T00:00:00Z" },
      { number: 8, title: "A pull request", body: "", state: "open", state_reason: null, labels: [], assignees: [], html_url: "", updated_at: "2027-01-09T00:00:00Z", pull_request: {} },
    ];
  });

  it("creates tasks from new issues (not pull requests), with owners and subteams matched", () => {
    sync();
    expect(tasks()).toHaveLength(1);
    expect(tasks()[0]).toMatchObject({
      title: "Fix swerve offsets", description: "They drift.", status: "in-progress", ownerIds: ["m-member"], subteams: ["Programming"],
      githubIssue: { repo: REPO, number: 7, closed: false },
    });
    sync(); // nothing new: nothing changes, nothing is sent back
    expect(tasks()).toHaveLength(1);
    expect(s.github.patches).toEqual([]);
  });

  it("closing on GitHub closes the task; closing in Icarus closes the issue with a comment saying who", () => {
    sync();
    editOnGithub(7, { state: "closed", state_reason: "not_planned" }, "2027-01-11T00:00:00Z");
    sync();
    expect(tasks()[0].status).toBe("cancelled");

    // Reopen it, then finish it, in Icarus, as the website would: change the task and stamp updatedAt.
    let later = Date.now();
    const editInIcarus = (status: string) => {
      s.rows("icarus_tasks")[0] = { ...tasks()[0], status, updatedAt: new Date((later += 60_000)).toISOString() };
      s.post({ action: "logHistory", token: member, record: { kind: "task", id: tasks()[0]._id }, change: "edited", summary: status });
      sync();
    };
    editInIcarus("in-progress");
    expect(s.github.patches.at(-1)).toMatchObject({ number: 7, state: "open" });
    expect(s.github.comments.at(-1)?.body).toMatch(/^Reopened from Icarus .* by /);
    editInIcarus("done");
    expect(s.github.patches.at(-1)).toMatchObject({ number: 7, state: "closed", state_reason: "completed", assignees: ["octomember"] });
    expect(s.github.comments.at(-1)?.body).toMatch(/^Closed from Icarus .* by .+\.$/);
    // The push doesn't come back as a change from GitHub.
    const patches = s.github.patches.length;
    sync();
    expect(s.github.patches).toHaveLength(patches);
    expect(tasks()[0].status).toBe("done");
  });

  it("when both sides changed, the newer edit wins and the other is kept in the history", () => {
    sync();
    const task = tasks()[0];
    s.rows("icarus_tasks")[0] = { ...task, title: "Icarus title", updatedAt: "2027-01-12T00:00:00Z" };
    editOnGithub(7, { title: "GitHub title" }, "2027-01-13T00:00:00Z"); // GitHub's edit is later
    sync();
    expect(tasks()[0].title).toBe("GitHub title");
    expect(s.rows("ops_history").some((h) => h.action === "GitHub's newer edit won" && String(h.summary).includes("Icarus title"))).toBe(true);
  });

  it("creates an issue for a task in a connected project", () => {
    const created = s.post({ action: "saveTask", token: lead, task: { title: "Tune the shooter", ownerIds: ["m-member"] } }).task;
    expect(s.post({ action: "createGithubIssue", token: lead, taskId: created._id })).toMatchObject({ ok: false, error: "bad-request" }); // no project yet
    const project = s.rows("ops_projects")[0];
    s.post({ action: "saveTask", token: lead, task: { _id: created._id, projectId: project._id } });
    const linked = s.post({ action: "createGithubIssue", token: lead, taskId: created._id });
    expect(linked).toMatchObject({ ok: true, task: { githubIssue: { repo: REPO, number: 3 } } });
    expect(issue(3)).toMatchObject({ title: "Tune the shooter", assignees: [{ login: "octomember" }] });
    expect(s.post({ action: "createGithubIssue", token: lead, taskId: created._id })).toMatchObject({ ok: false, error: "conflict" });
  });

  it("only syncs the team's own organization, stops when paused, and checks GitHub usernames", () => {
    s.post({ action: "saveProject", token: lead, project: { name: "Someone else's", githubRepo: "other-org/thing" } });
    sync();
    expect(s.github.gets).toEqual([REPO]);
    s.props.set("GITHUB_SYNC_PAUSED", "yes");
    sync();
    expect(s.github.gets).toEqual([REPO]);
    expect(s.post({ action: "syncGithubNow", token: member })).toMatchObject({ ok: false, error: "busy" });
    expect(s.post({ action: "setGithubLogin", token: member, login: "not a username!" })).toMatchObject({ ok: false, error: "bad-request" });
    expect(s.post({ action: "setGithubLogin", token: member, memberId: "m-lead", login: "x" })).toMatchObject({ ok: false, error: "forbidden" });
  });
});
