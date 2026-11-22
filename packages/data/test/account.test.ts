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

  const form = (extra: Record<string, unknown> = {}) => ({ role: "student", firstName: "Ada", lastName: "byron", studentId: "1234567", subteams: ["Programming"], ...extra });

  it("approves a student on the roster and gives them Team Member and their subteams", async () => {
    const answer = await s.post({ action: "finishProfile", token: newbie, form: form() });
    expect(answer).toMatchObject({ ok: true, approved: true });
    expect(s.members[newbie]).toMatchObject({ status: "APPROVED", badges: ["b-team", "b-programming"] });
    expect(s.rows("ops_roster")[0].memberId).toBe("m-new");
    expect(s.rows("ops_history").some((h) => h.type === "person.approved")).toBe(true);
  });

  it("gives a roster student their roster subteam even if they pick none", async () => {
    s.rows("ops_roster")[0].subteam = "Design";
    await s.post({ action: "finishProfile", token: newbie, form: form({ subteams: [] }) });
    expect(s.members[newbie].badges).toEqual(["b-team", "b-design"]);
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

  it("needs no Discord username, and keeps a Discord account already linked", async () => {
    s.rows("ops_people").push({ memberId: "m-new", name: "Ada", discordId: "123456789012345678", discordName: "ada", active: true });
    expect((await s.post({ action: "finishProfile", token: newbie, form: form() })).approved).toBe(true);
    expect(s.rows("ops_people").find((p) => p.memberId === "m-new")).toMatchObject({ discordId: "123456789012345678", discordName: "ada" });
    expect((await s.post({ action: "finishProfile", token: newbie, form: { role: "mentor", firstName: "Ada", lastName: "Byron" } })).approved).toBe(false);
  });

  it("only lets people admins import the roster", async () => {
    expect((await s.post({ action: "importRoster", token: member, rows: [{ studentId: "7654321", firstName: "A", lastName: "B" }] })).error).toBe("forbidden");
    const again = await s.post({ action: "importRoster", token: lead, rows: [{ studentId: "1234567", firstName: "Ada", lastName: "Byron", grade: "12th" }] });
    expect(again).toMatchObject({ ok: true, added: 0, updated: 1 });
    expect(s.rows("ops_roster")).toHaveLength(1);
  });
});

describe("profile picture and deleting your account", () => {
  let s: ReturnType<typeof team>;
  beforeEach(() => {
    s = team();
  });
  const jpeg = `data:image/jpeg;base64,${Buffer.from("fake jpeg bytes").toString("base64")}`;

  it("uploads a picture to Wix Media and makes it the profile photo", async () => {
    const answer = await s.post({ action: "setMyPhoto", token: member, photo: jpeg });
    expect(answer.ok).toBe(true);
    expect(s.uploads[0]).toMatchObject({ folder: "/team6220/profile-photos", size: 15 });
    expect(s.members[member].photoUrl).toBe(answer.photoUrl);
    expect((await s.post({ action: "getAccount", token: member })).profile.photoUrl).toBe(answer.photoUrl);
  });

  it("refuses anything that isn't a picture, or is too big", async () => {
    expect((await s.post({ action: "setMyPhoto", token: member, photo: "data:text/html;base64,PGI+" })).error).toBe("bad-request");
    const big = `data:image/png;base64,${Buffer.alloc(500_000).toString("base64")}`;
    expect((await s.post({ action: "setMyPhoto", token: member, photo: big })).error).toBe("bad-request");
  });

  it("deletes the member, their badges and settings, but keeps their name and the roster row", async () => {
    await s.post({ action: "importRoster", token: lead, rows: [{ studentId: "1234567", firstName: "Ada", lastName: "Byron" }] });
    await s.post({ action: "finishProfile", token: newbie, form: { role: "student", firstName: "Ada", lastName: "Byron", studentId: "1234567", subteams: ["Design"] } });
    await s.post({ action: "savePrefs", token: newbie, prefs: { layout: "top" } });
    expect((await s.post({ action: "deleteMyAccount", token: newbie })).ok).toBe(true);
    expect(s.members[newbie]).toMatchObject({ status: "DELETED", badges: [] });
    const row = s.rows("ops_people").find((p) => p.memberId === "m-new")!;
    expect(row).toMatchObject({ name: "Ada Byron", active: false, deleted: true });
    expect(row.prefs).toBeUndefined();
    expect(row.discordName).toBeUndefined();
    expect(s.rows("ops_roster")[0]).toMatchObject({ studentId: "1234567", memberId: "" });
  });
});
