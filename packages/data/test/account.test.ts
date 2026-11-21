// Your own account on the server (account.ts): profile, frame settings, and finishing your profile (students on the
// roster are approved straight away).
import { beforeEach, describe, expect, it } from "vitest";
import { makeOps } from "./helpers/ops-server";

const lead = "tok-lead-0123456789abcdef";
const member = "tok-member-0123456789abcdef";
const newbie = "tok-newbie-0123456789abcdef";

function team() {
  return makeOps({
    [lead]: { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] },
    [member]: { id: "m-member", status: "APPROVED", badges: ["b-team"] },
    [newbie]: { id: "m-new", status: "PENDING", badges: [] },
  });
}

describe("your account", () => {
  let s: ReturnType<typeof team>;
  beforeEach(() => {
    s = team();
  });

  it("starts from the Google name and saves a typed one", async () => {
    expect((await s.post({ action: "getAccount", token: member })).profile).toMatchObject({ firstName: "Pat", lastName: "m-member" });
    const saved = await s.post({ action: "saveMyProfile", token: member, profile: { firstName: "Sam", lastName: "Lee", githubLogin: "sam-lee" } });
    expect(saved.profile).toMatchObject({ firstName: "Sam", lastName: "Lee", githubLogin: "sam-lee" });
    expect(s.rows("ops_people").find((p) => p.memberId === "m-member")).toMatchObject({ name: "Sam Lee", customName: "Sam Lee" });
  });

  it("refuses a GitHub username with spaces", async () => {
    const answer = await s.post({ action: "saveMyProfile", token: member, profile: { githubLogin: "not a login" } });
    expect(answer).toMatchObject({ ok: false, error: "bad-request" });
  });

  it("keeps frame settings, but not huge ones", async () => {
    expect((await s.post({ action: "savePrefs", token: member, prefs: { layout: "rail", pins: [] } })).ok).toBe(true);
    expect((await s.post({ action: "getAccount", token: member })).prefs).toEqual({ layout: "rail", pins: [] });
    expect((await s.post({ action: "savePrefs", token: member, prefs: { big: "x".repeat(30_000) } })).error).toBe("bad-request");
  });

  it("is for people, and pending members can use it", async () => {
    expect((await s.post({ action: "getAccount", token: newbie })).ok).toBe(true);
    expect((await s.post({ action: "getAccount" })).error).toBe("signed-out");
  });
});

describe("finishing your profile", () => {
  let s: ReturnType<typeof team>;
  beforeEach(async () => {
    s = team();
    await s.post({ action: "importRoster", token: lead, rows: [{ studentId: "1234567", firstName: "Ada", lastName: "Byron", grade: "11th" }] });
  });

  const form = (extra: Record<string, unknown> = {}) => ({ role: "student", firstName: "Ada", lastName: "byron", studentId: "1234567", discordName: "ada", subteams: ["Programming"], ...extra });

  it("approves a student on the roster and gives them Team Member and their subteams", async () => {
    const answer = await s.post({ action: "finishProfile", token: newbie, form: form() });
    expect(answer).toMatchObject({ ok: true, approved: true });
    expect(s.members[newbie]).toMatchObject({ status: "APPROVED", badges: ["b-team", "b-programming"] });
    expect(s.rows("ops_roster")[0].memberId).toBe("m-new");
    expect(s.rows("ops_history").some((h) => h.type === "person.approved")).toBe(true);
  });

  it("leaves a student who doesn't match for a web admin", async () => {
    const answer = await s.post({ action: "finishProfile", token: newbie, form: form({ lastName: "Lovelace" }) });
    expect(answer).toMatchObject({ ok: true, approved: false });
    expect(s.members[newbie]).toMatchObject({ status: "PENDING", badges: [] });
  });

  it("doesn't let a second account take a roster row", async () => {
    await s.post({ action: "finishProfile", token: newbie, form: form() });
    expect((await s.post({ action: "finishProfile", token: member, form: form() })).approved).toBe(false);
  });

  it("needs Discord from students, but not from others", async () => {
    expect((await s.post({ action: "finishProfile", token: newbie, form: form({ discordName: "" }) })).error).toBe("bad-request");
    expect((await s.post({ action: "finishProfile", token: newbie, form: { role: "mentor", firstName: "Ada", lastName: "Byron" } })).approved).toBe(false);
  });

  it("only lets people admins import the roster", async () => {
    expect((await s.post({ action: "importRoster", token: member, rows: [{ studentId: "7654321", firstName: "A", lastName: "B" }] })).error).toBe("forbidden");
    const again = await s.post({ action: "importRoster", token: lead, rows: [{ studentId: "1234567", firstName: "Ada", lastName: "Byron", grade: "12th" }] });
    expect(again).toMatchObject({ ok: true, added: 0, updated: 1 });
    expect(s.rows("ops_roster")).toHaveLength(1);
  });
});
