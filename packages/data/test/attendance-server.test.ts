// Attendance on the server (ops/server/attendance.ts): the kiosk, signing in and out, who sees what, and student IDs.
import { beforeEach, describe, expect, it } from "vitest";
import { makeOps } from "./helpers/ops-server";

const admin = "tok-admin-0123456789abcdef";
const member = "tok-member-0123456789abcdef";
const stranger = "tok-stranger-0123456789abcdef";
const guest = "tok-guest-0123456789abcdef";

function team() {
  const s = makeOps({
    [admin]: { id: "m-admin", status: "APPROVED", badges: ["b-attendance"] },
    [member]: { id: "m-ada", status: "APPROVED", badges: ["b-team", "b-programming"] },
    [guest]: { id: "m-guest", status: "APPROVED", badges: ["b-guest"] },
    [stranger]: { id: "m-new", status: "PENDING", badges: [] },
  });
  s.rows("ops_roster").push(
    { _id: "r1", studentId: "4829173650", firstName: "Ada", lastName: "Lovelace", grade: "11th", subteam: "Programming", memberId: "m-ada", active: true },
    { _id: "r2", studentId: "1057382946", firstName: "Nikola", lastName: "Tesla", grade: "10th", subteam: "Electrical", memberId: "", active: true },
  );
  s.rows("ops_people").push({ _id: "p1", memberId: "m-ada", name: "Ada Lovelace", subteams: ["Programming"], active: true });
  s.rows("cal_events").push({ _id: "e1", type: "meeting", title: "", startDate: "2026-11-21", endDate: "2026-11-21", startTime: "10:00", endTime: "14:00", location: "", notes: "", mandatory: true, subteams: [], public: true, cancelled: false });
  s.setNow(new Date("2026-11-21T18:30:00Z")); // 10:30 AM Pacific on the meeting day
  return s;
}

describe("attendance", () => {
  let s: ReturnType<typeof team>;
  let kiosk: string;
  beforeEach(async () => {
    s = team();
    kiosk = (await s.post({ action: "attOpenKiosk", token: admin })).kioskToken;
  });

  it("lets only an Attendance Admin open the kiosk", async () => {
    expect(kiosk).toMatch(/^[0-9a-f]{64}$/);
    expect((await s.post({ action: "attOpenKiosk", token: member })).error).toBe("forbidden");
    expect((await s.post({ action: "attOpenKiosk" })).error).toBe("signed-out");
  });

  it("keeps only a hash of the kiosk's token", () => {
    expect(JSON.stringify(s.rows("att_kiosks"))).not.toContain(kiosk);
  });

  it("signs a student in with the kiosk's token and no login, once a day", async () => {
    const first = await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "4829173650", mode: "in" });
    expect(first.result).toMatchObject({ status: "signed-in", name: "Ada" });
    expect(first.result.message).toContain("10:30 AM");
    const again = await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "4829173650", mode: "in" });
    expect(again.result.status).toBe("duplicate");
    expect(s.rows("att_signins")).toHaveLength(1);
    expect(s.rows("att_signins")[0]).toMatchObject({ season: "2026", date: "2026-11-21", studentId: "4829173650", source: "kiosk" });
  });

  it("signs out for leaving early, and counts the time", async () => {
    await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "4829173650", mode: "in" });
    expect((await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "1057382946", mode: "out" })).result.status).toBe("not-signed-in");
    s.setNow(new Date("2026-11-21T20:00:00Z")); // 12:00 PM
    const out = await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "4829173650", mode: "out" });
    expect(out.result).toMatchObject({ status: "signed-out", minutes: 90 });
    expect(out.result.message).toContain("1 h 30 min");
    expect((await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "4829173650", mode: "out" })).result.status).toBe("duplicate");
  });

  it("refuses a closed, expired or made-up kiosk", async () => {
    expect((await s.post({ action: "attKioskSignIn", kioskToken: "x".repeat(64), studentId: "4829173650" })).error).toBe("kiosk-closed");
    s.setNow(new Date("2026-11-22T18:30:00Z")); // past the 6 hours
    expect((await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "4829173650" })).error).toBe("kiosk-closed");
    s.setNow(new Date("2026-11-21T18:30:00Z"));
    await s.post({ action: "attCloseKiosk", kioskToken: kiosk });
    expect((await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "4829173650" })).error).toBe("kiosk-closed");
  });

  it("asks an unknown ID to add a name, and signs them in", async () => {
    const unknown = await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "9990001112", mode: "in" });
    expect(unknown.result.status).toBe("needs-registration");
    const added = await s.post({ action: "attKioskRegister", kioskToken: kiosk, studentId: "9990001112", firstName: "New", lastName: "Kid" });
    expect(added.result).toMatchObject({ status: "signed-in", name: "New" });
    expect(s.rows("ops_roster").find((r) => r.studentId === "9990001112")).toMatchObject({ firstName: "New", lastName: "Kid", active: true });
    expect((await s.post({ action: "attKioskRegister", kioskToken: kiosk, studentId: "9990001112", firstName: "A", lastName: "B" })).error).toBe("bad-request");
    expect((await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "12" })).error).toBe("bad-request");
  });

  it("turns away unknown IDs when new names aren't allowed", async () => {
    s.rows("att_settings").push({ _id: "set", allowNewMembers: false });
    expect((await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "9990001112" })).result.status).toBe("invalid");
    expect((await s.post({ action: "attKioskRegister", kioskToken: kiosk, studentId: "9990001112", firstName: "A", lastName: "B" })).error).toBe("forbidden");
  });

  it("lists today's sign-ins on the kiosk, names only", async () => {
    await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "4829173650", mode: "in" });
    const list = await s.post({ action: "attKioskToday", kioskToken: kiosk });
    expect(list.rows).toMatchObject([{ name: "Ada Lovelace" }]);
    expect(JSON.stringify(list)).not.toContain("4829173650");
  });

  it("shows the team who is here and who isn't, without student IDs", async () => {
    await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "4829173650", mode: "in" });
    const answer = await s.post({ action: "attDay", token: member });
    expect(answer.kioskOpen).toBe(true);
    expect(answer.day.here.map((r: { name: string }) => r.name)).toEqual(["Ada Lovelace"]);
    expect(answer.day.absent.map((r: { name: string }) => r.name)).toEqual(["Nikola Tesla"]);
    expect(answer.day.expected).toBe(2);
    expect(JSON.stringify(answer)).not.toMatch(/4829173650|1057382946/);
  });

  it("shows a member their own sign-ins and hours, from their account's roster row", async () => {
    await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "4829173650", mode: "in" });
    const mine = (await s.post({ action: "attMine", token: member })).mine;
    expect(mine).toMatchObject({ onRoster: true, attended: 1, expected: 1, percent: 100, mandatoryAttended: 1 });
    expect(mine.signedInToday).not.toBe("");
    expect((await s.post({ action: "attMine", token: admin })).mine.onRoster).toBe(false);
  });

  it("follows a name change on the roster", async () => {
    await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "4829173650", mode: "in" });
    s.rows("ops_roster")[0].lastName = "King";
    expect((await s.post({ action: "attDay", token: member })).day.here[0].name).toBe("Ada King");
  });

  it("keeps the screens for the team, and the copy with student IDs for Attendance Admins", async () => {
    expect((await s.post({ action: "attDay", token: guest })).error).toBe("forbidden");
    expect((await s.post({ action: "attPast", token: stranger })).error).toBe("pending");
    expect((await s.post({ action: "attStats", token: admin })).stats.members).toBe(2);
    await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: "4829173650", mode: "in" });
    expect((await s.post({ action: "attCopyMonth", token: member, month: "2026-11" })).error).toBe("forbidden");
    const copy = await s.post({ action: "attCopyMonth", token: admin, month: "2026-11" });
    expect(copy.rows).toEqual([{ date: "2026-11-21", firstName: "Ada", lastName: "Lovelace", studentId: "4829173650" }]);
  });

  it("reads a season of sign-ins that is more than one page", async () => {
    const rows = s.rows("att_signins");
    for (let i = 0; i < 2300; i++) rows.push({ _id: `x${i}`, season: "2026", date: "2026-09-01", studentId: `${1000000 + i}`, signedInAt: "2026-09-01T22:00:00.000Z", signedOutAt: "", source: "import" });
    expect((await s.post({ action: "attStats", token: member })).ok).toBe(true);
  });
});

describe("importing the old Sheet", () => {
  it("brings in sign-ins for people on the roster, once, for an Attendance Admin only", async () => {
    const s = team();
    const rows = [
      { studentId: "4829173650", date: "2026-11-21", time: "10:05" },
      { studentId: "1057382946", date: "2026-11-21", time: "" },
      { studentId: "7770000000", date: "2026-11-21", time: "10:00" },
    ];
    expect((await s.post({ action: "attImport", token: member, rows })).error).toBe("forbidden");
    const first = await s.post({ action: "attImport", token: admin, rows });
    expect(first).toMatchObject({ added: 2, skipped: 0, unknown: 1 });
    const saved = s.rows("att_signins");
    expect(saved).toHaveLength(2);
    expect(saved.every((r) => r.source === "import" && r.season === "2026")).toBe(true);
    // A day with no time starts when that day's meeting did (10:00 AM Pacific).
    expect(saved.find((r) => r.studentId === "1057382946")?.signedInAt).toBe("2026-11-21T18:00:00.000Z");
    expect(await s.post({ action: "attImport", token: admin, rows })).toMatchObject({ added: 0, skipped: 2, unknown: 1 });
    expect((await s.post({ action: "attImport", token: admin, rows: [{ studentId: "x", date: "2026-11-21", time: "" }] })).error).toBe("bad-request");
  });
});

describe("random quick sign in", () => {
  it("gives the kiosk random student IDs, none of them people who already signed in, and nothing without the kiosk's token", async () => {
    const s = team();
    for (let i = 0; i < 8; i++) s.rows("ops_roster").push({ _id: `x${i}`, studentId: `20000000${i}0`, firstName: `Kid${i}`, lastName: "Test", grade: "", subteam: "", memberId: "", active: true });
    const kiosk = (await s.post({ action: "attOpenKiosk", token: admin })).kioskToken;
    const first = (await s.post({ action: "attKioskQuick", kioskToken: kiosk })).ids as string[];
    expect(first).toHaveLength(5);
    expect(new Set(first).size).toBe(5);
    await s.post({ action: "attKioskSignIn", kioskToken: kiosk, studentId: first[0], mode: "in" });
    for (let n = 0; n < 5; n++) expect((await s.post({ action: "attKioskQuick", kioskToken: kiosk })).ids).not.toContain(first[0]);
    // The IDs are only IDs: no names.
    expect(JSON.stringify(await s.post({ action: "attKioskQuick", kioskToken: kiosk }))).not.toMatch(/Kid|Test|Lovelace/);
    expect((await s.post({ action: "attKioskQuick", kioskToken: "x".repeat(64) })).error).toBe("kiosk-closed");
  });
});

describe("linking your account to the roster", () => {
  it("links a roster row nobody has, when the ID and last name match, once", async () => {
    const s = team();
    const lead = "tok-lead-0123456789abcdef";
    s.members[lead] = { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] };
    s.rows("ops_roster").push({ _id: "r3", studentId: "7773331119", firstName: "Hossegor", lastName: "Harman", grade: "12th", subteam: "Design", memberId: "", active: true });
    const wrong = await s.post({ action: "linkStudentId", token: lead, studentId: "7773331119", lastName: "Smith" });
    const unknown = await s.post({ action: "linkStudentId", token: lead, studentId: "7770000000", lastName: "Harman" });
    // A wrong last name and an unknown ID answer the same, so this can't be used to look IDs up.
    expect(wrong.error).toBe("bad-request");
    expect(wrong.message).toBe(unknown.message);
    const linked = await s.post({ action: "linkStudentId", token: lead, studentId: "7773331119", lastName: " harman " });
    expect(linked.profile).toMatchObject({ studentId: "7773331119", grade: "12th" });
    expect(s.rows("ops_roster").find((r) => r._id === "r3")?.memberId).toBe("m-lead");
    expect((await s.post({ action: "attMine", token: lead })).mine.onRoster).toBe(true);
    expect((await s.post({ action: "linkStudentId", token: lead, studentId: "4829173650", lastName: "Lovelace" })).message).toContain("already linked to the roster");
  });

  it("refuses a roster row that belongs to someone else, and a signed-out request", async () => {
    const s = team();
    expect((await s.post({ action: "linkStudentId", token: admin, studentId: "4829173650", lastName: "Lovelace" })).message).toContain("another account");
    expect((await s.post({ action: "linkStudentId", studentId: "4829173650", lastName: "Lovelace" })).error).toBe("signed-out");
  });
});
