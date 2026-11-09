import { beforeEach, describe, expect, it } from "vitest";
import { rebuiltPresets } from "@goldsim/game-rebuilt";
import type { Replay, RobotDesign } from "@goldsim/schema";
import { DataLayerError, MemoryBackend, MemoryDataLayer, resolveConflict, type TestRunData } from "../src/index.js";

const design = (name = "Bot"): RobotDesign => ({ ...structuredClone(rebuiltPresets[0]!), name });

const replay = (): Replay => ({
  schemaVersion: 1,
  engineVersion: "0.1.0",
  module: { id: "rebuilt-2026", version: "0.1.0" },
  seed: 1,
  hz: 120,
  profile: "regional",
  robots: [{ design: design(), alliance: "blue", station: 0 }],
  actionNames: ["intake", "shoot", "climb", "place", "deploy"],
  inputs: [[0, 0, 10, 0, 0, 1]],
  durationTicks: 100,
});

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof DataLayerError ? e.code : `other: ${String(e)}`;
  }
}

describe("MemoryDataLayer", () => {
  let backend: MemoryBackend;
  let alice: MemoryDataLayer;
  let bob: MemoryDataLayer;
  let teamId: string;

  beforeEach(async () => {
    backend = new MemoryBackend();
    alice = backend.client();
    bob = backend.client();
    await alice.signInWithEmail("alice@team6220.org");
    await bob.signInWithEmail("bob@example.com");
    teamId = (await alice.createTeam({ name: "Golden Griffins", type: "frc_team", teamNumber: 6220 })).id;
  });

  it("requires sign-in to save", async () => {
    const guest = backend.client();
    expect(await code(guest.createTeam({ name: "X", type: "group" }))).toBe("unauthenticated");
    expect(await code(guest.saveSettings({ units: "metric", theme: "dark" }))).toBe("unauthenticated");
  });

  it("creator becomes admin; team numbers are self-declared", async () => {
    const teams = await alice.listMyTeams();
    expect(teams).toMatchObject([{ name: "Golden Griffins", teamNumber: 6220, role: "admin" }]);
    expect(await code(alice.createTeam({ name: "Bad", type: "frc_team", teamNumber: 0 }))).toBe("invalid");
  });

  it("non-members cannot read or write team data", async () => {
    const doc = await alice.createDoc(teamId, "design", "Secret bot", design());
    expect(await code(bob.listDocs(teamId, "design"))).toBe("not_found");
    expect(await code(bob.getDoc(doc.id))).toBe("not_found");
    expect(await code(bob.saveDoc(doc.id, 1, "hacked", design()))).toBe("not_found");
    expect(await code(bob.deleteDoc(doc.id))).toBe("not_found");
    expect(await code(bob.createDoc(teamId, "design", "Intruder", design()))).toBe("not_found");
    expect(await code(bob.listMembers(teamId))).toBe("not_found");
    expect(await bob.listMyTeams()).toEqual([]);
  });

  it("invite -> request -> admin approval -> member sees team data; members cannot do admin actions", async () => {
    const doc = await alice.createDoc(teamId, "design", "Shared bot", design());
    const inv = await alice.createInvite(teamId);
    const req = await bob.requestToJoin(inv.code.toLowerCase());
    expect(req.status).toBe("pending");
    expect(await code(bob.listDocs(teamId, "design"))).toBe("not_found");
    await alice.decideJoinRequest(req.id, true);

    expect((await bob.listDocs(teamId, "design")).map((d) => d.id)).toEqual([doc.id]);
    expect((await bob.listMyTeams())[0]!.role).toBe("member");
    expect(await code(bob.createInvite(teamId))).toBe("forbidden");
    expect(await code(bob.renameTeam(teamId, "Mine now"))).toBe("forbidden");
    expect(await code(bob.deleteTeam(teamId))).toBe("forbidden");
    expect(await code(bob.removeMember(teamId, (await alice.getSession())!.user.id))).toBe("forbidden");
    // Members can edit team data.
    expect((await bob.saveDoc(doc.id, 1, "Shared bot v2", design("v2"))).ok).toBe(true);
  });

  it("expired or revoked invites are rejected; denied requests do not join", async () => {
    const inv = await alice.createInvite(teamId, 1);
    await alice.revokeInvite(inv.id);
    expect(await code(bob.requestToJoin(inv.code))).toBe("not_found");
    const inv2 = await alice.createInvite(teamId, 1);
    backend.now = () => new Date(Date.now() + 2 * 86400_000);
    expect(await code(bob.requestToJoin(inv2.code))).toBe("not_found");
    backend.now = () => new Date();
    const inv3 = await alice.createInvite(teamId);
    const req = await bob.requestToJoin(inv3.code);
    await alice.decideJoinRequest(req.id, false);
    expect(await bob.listMyTeams()).toEqual([]);
  });

  it("a team always keeps an admin", async () => {
    const me = (await alice.getSession())!.user.id;
    expect(await code(alice.removeMember(teamId, me))).toBe("forbidden");
    expect(await code(alice.setMemberRole(teamId, me, "member"))).toBe("forbidden");
    const req = await bob.requestToJoin((await alice.createInvite(teamId)).code);
    await alice.decideJoinRequest(req.id, true);
    const bobId = (await bob.getSession())!.user.id;
    await alice.setMemberRole(teamId, bobId, "admin");
    await alice.removeMember(teamId, me);
    expect(await alice.listMyTeams()).toEqual([]);
    expect((await bob.listMembers(teamId)).map((m) => m.role)).toEqual(["admin"]);
  });

  it("saves use version counters, keep design history, and report conflicts", async () => {
    const req = await bob.requestToJoin((await alice.createInvite(teamId)).code);
    await alice.decideJoinRequest(req.id, true);
    const doc = await alice.createDoc(teamId, "design", "Bot", design("a"));
    const a = await alice.saveDoc(doc.id, 1, "Bot", design("alice edit"));
    expect(a.ok && a.doc.version).toBe(2);

    const b = await bob.saveDoc<"design">(doc.id, 1, "Bot", design("bob stale edit"));
    expect(b.ok).toBe(false);
    if (b.ok) return;
    expect(b.conflict.theirs.data.name).toBe("alice edit");

    const copy = await resolveConflict(bob, b, "save-as-copy");
    expect(copy.name).toBe("Bot (copy)");
    const kept = await resolveConflict(bob, b, "keep-mine");
    expect(kept.version).toBe(3);
    expect(kept.data.name).toBe("bob stale edit");
    expect((await resolveConflict(bob, b, "keep-theirs")).version).toBe(2);

    const history = await alice.listVersions<"design">(doc.id);
    expect(history.map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it("validates payloads against schemas and enforces size caps", async () => {
    const bad = { ...design(), chassis: { ...design().chassis, mass: "heavy" } } as unknown as RobotDesign;
    expect(await code(alice.createDoc(teamId, "design", "Bad", bad))).toBe("invalid");
    expect(await code(alice.createDoc(teamId, "recording", "Bad replay", { nope: true } as unknown as Replay))).toBe("invalid");
    expect(await code(alice.createDoc(teamId, "design", "", design()))).toBe("invalid");
    const huge = { ...design(), description: "x".repeat(300 * 1024) };
    expect(await code(alice.createDoc(teamId, "design", "Huge", huge))).toBe("too_large");
    expect(await code(alice.createDoc(teamId, "recording", "Run 1", replay()))).toBe("ok");
  });

  it("rate-limits bursts of writes", async () => {
    let last = "ok";
    for (let i = 0; i < 80 && last === "ok"; i++) last = await code(alice.saveSettings({ units: "metric", theme: "dark" }));
    expect(last).toBe("rate_limited");
  });

  it("publish is admin-only, builds a selectable payload, supports anonymous, unpublish deletes, remix copies", async () => {
    const rec = await alice.createDoc(teamId, "recording", "Match 1", replay());
    const run: TestRunData = { gameId: "rebuilt-2026", engineVersion: "0.1.0", seeds: [1, 2], summary: { meanScore: 88 }, designs: [design("Pub bot")], replayIds: [rec.id] };
    const testRun = await alice.createDoc(teamId, "testRun", "Sweep", run);

    const snap = await alice.publish(teamId, { testRunId: testRun.id, title: "Turret vs fixed", include: { stats: true, designs: true, replays: false }, attribution: "team", tags: ["turret"] });
    expect(snap.attribution).toEqual({ teamName: "Golden Griffins", teamNumber: 6220, verified: false });
    expect(snap.payload.stats).toEqual({ meanScore: 88 });
    expect(snap.payload.replays).toBeUndefined();
    expect(snap.license).toBe("CC BY 4.0");

    const anon = await alice.publish(teamId, { testRunId: testRun.id, title: "Anon", include: { stats: false, designs: false, replays: true }, attribution: "anonymous" });
    expect(anon.attribution).toBeNull();
    expect(anon.payload.replays?.length).toBe(1);

    // Public read without an account.
    const visitor = backend.client();
    expect((await visitor.listSnapshots({ tag: "turret" })).map((s) => s.id)).toEqual([snap.id]);
    expect((await visitor.listSnapshots({ text: "anon" })).length).toBe(1);

    // Snapshots are copies: editing the original does not change them.
    await alice.saveDoc(testRun.id, 1, "Sweep", { ...run, summary: { meanScore: 1 } });
    expect((await visitor.getSnapshot(snap.id)).payload.stats).toEqual({ meanScore: 88 });

    // Remix into another team (sign-in required).
    expect(await code(visitor.remixDesign(snap.id, 0, teamId))).toBe("unauthenticated");
    const bobTeam = await bob.createTeam({ name: "Ri3D Crew", type: "group" });
    const remix = await bob.remixDesign(snap.id, 0, bobTeam.id);
    expect(remix.name).toBe("Pub bot (remix)");

    // Members cannot publish; non-owners cannot unpublish.
    expect(await code(bob.publish(teamId, { testRunId: testRun.id, title: "x", include: { stats: true, designs: false, replays: false }, attribution: "team" }))).toBe("not_found");
    expect(await code(bob.unpublish(snap.id))).toBe("not_found");
    await alice.unpublish(snap.id);
    expect(await code(visitor.getSnapshot(snap.id))).toBe("not_found");
  });

  it("exports and deletes user and team data", async () => {
    await alice.saveSettings({ units: "metric", theme: "light" });
    await alice.createDoc(teamId, "design", "Bot", design());
    const mine = await alice.exportMyData();
    expect(mine.settings.theme).toBe("light");
    expect(mine.memberships.length).toBe(1);

    const team = await alice.exportTeam(teamId);
    expect(team.docs.length).toBe(1);
    expect(team.versions.length).toBe(1);

    // Bob joins; members cannot export the team.
    const req = await bob.requestToJoin((await alice.createInvite(teamId)).code);
    await alice.decideJoinRequest(req.id, true);
    expect(await code(bob.exportTeam(teamId))).toBe("forbidden");

    // Sole admin with other members must hand over admin first.
    expect(await code(alice.deleteMyAccount())).toBe("forbidden");
    await alice.setMemberRole(teamId, (await bob.getSession())!.user.id, "admin");
    await alice.deleteMyAccount();
    expect(await alice.getSession()).toBeNull();
    expect((await bob.listMembers(teamId)).length).toBe(1);

    // Deleting the workspace removes everything.
    await bob.deleteTeam(teamId);
    expect(await bob.listMyTeams()).toEqual([]);
    expect(backend.docs.size).toBe(0);
  });

  it("auth listeners fire on sign-in and sign-out", async () => {
    const events: (string | null)[] = [];
    const c = backend.client();
    c.onAuthChange((s) => events.push(s?.user.email ?? null));
    await c.signInWithEmail("Carol@Example.com");
    await c.signOut();
    expect(events).toEqual(["carol@example.com", null]);
  });
});
