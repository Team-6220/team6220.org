// The shared parts of backend/apps-script/ops-api (who may call what, numbers, history, projects, subteams),
// run in Node against a fake Wix. The BOM rules are in bom-rules.test.ts.
import { beforeEach, describe, expect, it } from "vitest";
import { APOLLO_KEY, makeScript } from "./helpers/ops-api-script";

const TOKENS = {
  member: "tok-member-0123456789abcdef",
  lead: "tok-lead-0123456789abcdef",
  mentor: "tok-mentor-0123456789abcdef",
  supervisor: "tok-supervisor-0123456789abcdef",
  nobadge: "tok-nobadge-0123456789abcdef",
  pending: "tok-pending-0123456789abcdef",
};

describe("ops-api", () => {
  let s: ReturnType<typeof makeScript>;
  beforeEach(() => {
    s = makeScript({
      [TOKENS.member]: { id: "m-member", status: "APPROVED", badges: ["b-team", "b-programming"] },
      [TOKENS.lead]: { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] },
      [TOKENS.mentor]: { id: "m-mentor", status: "APPROVED", badges: ["b-mentor"] },
      [TOKENS.supervisor]: { id: "m-supervisor", status: "APPROVED", badges: ["b-supervisor"] },
      [TOKENS.nobadge]: { id: "m-new", status: "APPROVED", badges: [] },
      [TOKENS.pending]: { id: "m-pending", status: "PENDING", badges: ["b-team"] },
    });
  });

  it("refuses requests without a valid sign-in, and unknown actions", () => {
    expect(s.post({ action: "whoAmI" })).toMatchObject({ ok: false, error: "signed-out" });
    expect(s.post({ action: "whoAmI", token: "not-a-real-token-at-all" })).toMatchObject({ ok: false, error: "signed-out" });
    expect(s.post({ action: "constructor", token: TOKENS.lead })).toMatchObject({ ok: false, error: "bad-request" });
  });

  it("refuses members who are not approved or have no badge", () => {
    expect(s.post({ action: "whoAmI", token: TOKENS.pending })).toMatchObject({ ok: false, error: "pending" });
    expect(s.post({ action: "whoAmI", token: TOKENS.nobadge })).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("tells a member who they are and remembers them for the pickers", () => {
    const answer = s.post({ action: "whoAmI", token: TOKENS.member });
    expect(answer).toMatchObject({
      ok: true,
      me: { id: "m-member", subteams: ["Programming"], roles: { viewer: true, team: true, lead: false, approver: false } },
      subteams: ["Design", "Programming"],
    });
    expect(s.rows("ops_people")).toMatchObject([{ memberId: "m-member", subteams: ["Programming"], active: true }]);
  });

  it("lets a supervisor view and nothing else", () => {
    expect(s.post({ action: "whoAmI", token: TOKENS.supervisor })).toMatchObject({ ok: true, me: { roles: { viewer: true, team: false } } });
    expect(s.post({ action: "nextNumber", token: TOKENS.supervisor, kind: "task" })).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("hands out numbers that never repeat, one counter per kind", () => {
    expect(s.post({ action: "nextNumber", token: TOKENS.member, kind: "task" })).toMatchObject({ number: 1 });
    expect(s.post({ action: "nextNumber", token: TOKENS.member, kind: "task" })).toMatchObject({ number: 2 });
    expect(s.post({ action: "nextNumber", token: TOKENS.member, kind: "part" })).toMatchObject({ number: 1 });
    expect(s.post({ action: "nextNumber", token: TOKENS.member, kind: "nonsense" })).toMatchObject({ ok: false, error: "bad-request" });
  });

  it("only lets leads save projects, and numbers and logs them", () => {
    const project = { name: "Summer Bot", subteams: ["Design", "Not a subteam"] };
    expect(s.post({ action: "saveProject", token: TOKENS.member, project })).toMatchObject({ ok: false, error: "forbidden" });
    const saved = s.post({ action: "saveProject", token: TOKENS.lead, project });
    expect(saved).toMatchObject({ ok: true, project: { number: 1, name: "Summer Bot", subteams: ["Design"], status: "active" } });
    const renamed = s.post({ action: "saveProject", token: TOKENS.lead, project: { _id: saved.project._id, name: "Summer Bot 2" } });
    expect(renamed.project).toMatchObject({ number: 1, name: "Summer Bot 2" });
    expect(s.rows("ops_projects")).toHaveLength(1);
    expect(s.rows("ops_history").map((h) => [h.actorId, h.action])).toEqual([["m-lead", "created"], ["m-lead", "updated"]]);
  });

  it("records history under the verified member, not a name sent in the request", () => {
    const record = { kind: "task", id: "task-1" };
    s.post({ action: "logHistory", token: TOKENS.member, record, change: "status", summary: "Done", actorId: "m-lead", actorName: "Someone Else" });
    expect(s.rows("ops_history")).toMatchObject([{ recordId: "task-1", actorId: "m-member", actorIsAgent: false, summary: "Done" }]);
  });

  it("lets a member pick their own subteams by changing only subteam badges", () => {
    const answer = s.post({ action: "setMySubteams", token: TOKENS.member, subteams: ["Design"] });
    expect(answer).toMatchObject({ ok: true, subteams: ["Design"] });
    expect(s.members[TOKENS.member].badges.sort()).toEqual(["b-design", "b-team"]);
    expect(s.post({ action: "whoAmI", token: TOKENS.member }).me.subteams).toEqual(["Design"]);
    expect(s.post({ action: "setMySubteams", token: TOKENS.member, subteams: ["Lead"] })).toMatchObject({ ok: false, error: "bad-request" });
    expect(s.members[TOKENS.member].badges).not.toContain("b-lead");
  });

  it("lets leads and mentors set other people's subteams, but not ordinary members", () => {
    s.post({ action: "whoAmI", token: TOKENS.member }); // the member has opened the apps once
    const args = { memberIds: ["m-member"], subteams: ["Design", "Programming"] };
    expect(s.post({ action: "setSubteams", token: TOKENS.member, ...args })).toMatchObject({ ok: false, error: "forbidden" });
    expect(s.post({ action: "setSubteams", token: TOKENS.mentor, ...args })).toMatchObject({ ok: true, changed: 1 });
    expect(s.members[TOKENS.member].badges.sort()).toEqual(["b-design", "b-programming", "b-team"]);
    expect(s.rows("ops_people")[0].subteams).toEqual(["Design", "Programming"]);
  });

  it("copies the site's approved members into the people list, with their @usernames", () => {
    s.post({ action: "whoAmI", token: TOKENS.member });
    expect(s.post({ action: "syncPeople", token: TOKENS.member })).toMatchObject({ ok: false, error: "forbidden" });
    const answer = s.post({ action: "syncPeople", token: TOKENS.lead });
    // Every APPROVED member is listed (the pending one is not); the member who had opened an app is not added twice.
    expect(answer).toMatchObject({ ok: true, people: 5, added: 4, removed: 0 });
    const people = s.rows("ops_people");
    expect(people).toHaveLength(5);
    expect(people.find((p) => p.memberId === "m-member")).toMatchObject({ username: "pat-m-member", subteams: ["Programming"], active: true });
    expect(people.find((p) => p.memberId === "m-pending")).toBeUndefined();
  });

  it("lets Apollo call only the actions opened to it, under the Apollo user", () => {
    expect(s.post({ action: "nextNumber", apiKey: APOLLO_KEY, kind: "task" })).toMatchObject({ ok: true, number: 1 });
    expect(s.post({ action: "saveProject", apiKey: APOLLO_KEY, project: { name: "x" } })).toMatchObject({ ok: false, error: "forbidden" });
    expect(s.post({ action: "setSubteams", apiKey: APOLLO_KEY, memberIds: ["m-member"], subteams: [] })).toMatchObject({ ok: false, error: "forbidden" });
    expect(s.post({ action: "nextNumber", apiKey: "wrong-key-0123456789abcdef0123456789abcdef", kind: "task" })).toMatchObject({ ok: false, error: "signed-out" });
  });

  it("says not-configured when the server's Wix key is missing", () => {
    s.props.delete("WIX_API_KEY");
    expect(s.post({ action: "nextNumber", token: TOKENS.member, kind: "task" })).toMatchObject({ ok: false, error: "not-configured" });
  });
});
