// The shared ops functions against the demo backend (tests always run in demo mode, as the lead).
import { beforeEach, describe, expect, it } from "vitest";
import { ops } from "../src/index";
import { mockTransport } from "../src/ops/mock";
import { rolesFor, subteamsOf } from "../src/ops/roles";

beforeEach(() => ops.resetMock());

describe("roles", () => {
  it("gives a person with several badges everything any of them allows", () => {
    expect(rolesFor(["Supervisor"])).toMatchObject({ viewer: true, team: false, approver: false });
    expect(rolesFor(["Supervisor", "Mentor"])).toMatchObject({ viewer: true, team: true, approver: true });
    expect(rolesFor(["Booster"])).toMatchObject({ approver: true, lead: false });
    expect(rolesFor(["Team Member"])).toMatchObject({ team: true, lead: false, approver: false, peopleAdmin: false });
    expect(rolesFor([])).toMatchObject({ viewer: false });
  });

  it("reads subteams from badge names", () => {
    expect(subteamsOf(["Team Member", "Subteam: Design", "Subteam: Electrical"])).toEqual(["Design", "Electrical"]);
  });
});

describe("ops in demo mode", () => {
  it("signs the developer in as the demo lead", async () => {
    const viewer = await ops.getViewer();
    expect(viewer).toMatchObject({ kind: "member", me: { name: "Demo Lead", roles: { lead: true } } });
    expect(viewer.kind === "member" && viewer.subteams).toEqual(["Design", "Manufacturing", "Programming", "Electrical", "Operations"]);
  });

  it("lists projects in number order and gives a new one the next number", async () => {
    expect((await ops.listProjects()).map((p) => `${ops.projectLabel(p)} ${p.name}`)).toEqual(["p1 Summer Bot", "p2 Elevator code", "p3 Super Pit"]);
    const created = await ops.saveProject({ name: "New scouting app", subteams: ["Programming"] });
    expect(created.number).toBe(4);
    expect(await ops.listHistory({ kind: "project", id: created._id })).toMatchObject([{ action: "created", actorName: "Demo Lead" }]);
  });

  it("changes a member's own subteams", async () => {
    expect(await ops.setMySubteams(["Programming", "Electrical"])).toEqual(["Programming", "Electrical"]);
    const viewer = await ops.getViewer();
    expect(viewer.kind === "member" && viewer.me.subteams).toEqual(["Programming", "Electrical"]);
    await expect(ops.setMySubteams(["Lead"])).rejects.toMatchObject({ code: "bad-request" });
  });

  it("applies the same permission rules as the real server", async () => {
    const asMember = { token: "mock:member" };
    expect(await mockTransport({ action: "saveProject", ...asMember, project: { name: "x" } })).toMatchObject({ ok: false, error: "forbidden" });
    expect(await mockTransport({ action: "setSubteams", ...asMember, memberIds: ["p-ada"], subteams: [] })).toMatchObject({ ok: false, error: "forbidden" });
    expect(await mockTransport({ action: "nextNumber", token: "mock:supervisor", kind: "task" })).toMatchObject({ ok: false, error: "forbidden" });
    expect(await mockTransport({ action: "whoAmI", token: "mock:pending" })).toMatchObject({ ok: false, error: "pending" });
    expect(await mockTransport({ action: "setSubteams", token: "mock:mentor", memberIds: ["p-ada"], subteams: ["Design"] })).toMatchObject({ ok: true });
    expect((await ops.listPeople()).find((p) => p.memberId === "p-ada")?.subteams).toEqual(["Design"]);
  });
});
