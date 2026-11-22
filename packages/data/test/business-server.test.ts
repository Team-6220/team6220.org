// Business on the server (ops/server/business.ts): the Sponsor tracker, the Grant tracker and Stats, and who sees what.
import { beforeEach, describe, expect, it } from "vitest";
import { makeOps } from "./helpers/ops-server";

const ops = "tok-ops-0123456789abcdef";
const ada = "tok-ada-0123456789abcdef";
const mentor = "tok-mentor-0123456789abcdef";
const guest = "tok-guest-0123456789abcdef";

function business() {
  const s = makeOps({
    [ops]: { id: "m-ops", status: "APPROVED", badges: ["b-team", "b-operations"] },
    [ada]: { id: "m-ada", status: "APPROVED", badges: ["b-team", "b-programming"] },
    [mentor]: { id: "m-mentor", status: "APPROVED", badges: ["b-mentor"] },
    [guest]: { id: "m-guest", status: "APPROVED", badges: ["b-guest"] },
  });
  s.setNow(new Date("2026-11-22T20:00:00Z"));
  return s;
}

describe("sponsor tracker", () => {
  let s: ReturnType<typeof business>;
  beforeEach(() => {
    s = business();
    s.rows("biz_sponsors").push(
      { _id: "old-boeing", season: "2025–26", company: "Boeing", status: "5. Received monetary", amount: "2,500", contact: "b@example.com", notes: "", tier: "Griffin", studentContact: "", support: "", prior: false },
      { _id: "old-nope", season: "2025–26", company: "Nope Inc", status: "4. Declined", amount: "", contact: "n@example.com", notes: "no", tier: "", studentContact: "", support: "", prior: false },
    );
  });

  it("lets anyone on the team add a company, once a season, and flags a company that said yes before", async () => {
    const added = await s.post({ action: "bizAddSponsor", token: ada, sponsor: { company: "  Boeing ", studentContact: "Ada" } });
    expect(added.sponsor).toMatchObject({ company: "Boeing", prior: true, status: "0. Needs research", season: "2026–27" });
    expect(added.sponsor.contact).toBeUndefined(); // a plain member gets the public view back
    expect((await s.post({ action: "bizAddSponsor", token: ada, sponsor: { company: "boeing" } })).message).toContain("already on the tracker");
    expect((await s.post({ action: "bizAddSponsor", token: ada, sponsor: { company: "" } })).message).toContain("company's name");
    expect((await s.post({ action: "bizAddSponsor", token: guest, sponsor: { company: "X" } })).error).toBe("forbidden");
    const nope = await s.post({ action: "bizAddSponsor", token: ada, sponsor: { company: "Nope Inc" } });
    expect(nope.sponsor.prior).toBe(false); // declined before is not a prior sponsor
  });

  it("shows the team only the company, its stage and the student contact; business roles see everything", async () => {
    await s.post({ action: "bizAddSponsor", token: ada, sponsor: { company: "Acme", studentContact: "Ada", contact: "Pat · acme@example.com" } });
    const member = await s.post({ action: "bizSponsors", token: ada });
    expect(member).toMatchObject({ full: false, season: "2026–27" });
    expect(member.rows[0]).toEqual({ _id: expect.any(String), season: "2026–27", company: "Acme", studentContact: "Ada", status: "0. Needs research", prior: false });
    for (const token of [ops, mentor]) {
      const full = await s.post({ action: "bizSponsors", token });
      expect(full.full).toBe(true);
      expect(full.rows[0].contact).toBe("Pat · acme@example.com");
    }
    expect((await s.post({ action: "bizSponsors", token: ada, season: "2025–26" })).rows.map((r: { company: string }) => r.company)).toEqual(["Boeing", "Nope Inc"]);
  });

  it("lets only Operations, leads, mentors and boosters change a row, and only the fields sent", async () => {
    const id = (await s.post({ action: "bizAddSponsor", token: ada, sponsor: { company: "Acme" } })).sponsor._id;
    expect((await s.post({ action: "bizSaveSponsor", token: ada, sponsor: { _id: id, status: "2. Pending" } })).error).toBe("forbidden");
    const saved = (await s.post({ action: "bizSaveSponsor", token: ops, sponsor: { _id: id, status: "5. Received monetary", amount: "1,200", tier: "Eagle" } })).sponsor;
    expect(saved).toMatchObject({ company: "Acme", status: "5. Received monetary", amount: "1,200", tier: "Eagle" });
    expect((await s.post({ action: "bizSaveSponsor", token: ops, sponsor: { _id: id, status: "9. Bogus", tier: "Dragon" } })).sponsor).toMatchObject({ status: "5. Received monetary", tier: "" });
  });

  it("imports last season's companies without statuses, marks earlier yeses as prior, and skips ones already here", async () => {
    await s.post({ action: "bizAddSponsor", token: ada, sponsor: { company: "Nope Inc" } });
    const result = await s.post({ action: "bizImportSponsors", token: ops, from: "2025–26" });
    expect(result.added).toBe(1);
    const rows = (await s.post({ action: "bizSponsors", token: ops })).rows;
    expect(rows.find((r: { company: string }) => r.company === "Boeing")).toMatchObject({ prior: true, status: "0. Needs research", amount: "" });
    expect((await s.post({ action: "bizImportSponsors", token: ops, from: "2025–26" })).added).toBe(0);
    expect((await s.post({ action: "bizImportSponsors", token: ada, from: "2025–26" })).error).toBe("forbidden");
  });
});

describe("grant tracker", () => {
  it("adds, changes and imports grants, and offers a received grant to the Sponsor tracker", async () => {
    const s = business();
    s.rows("biz_grants").push({ _id: "old-rev", season: "2025–26", title: "REV Robotics", organization: "REV", status: "5. Received", amount: "1,000", deadline: "Rolling", link: "", writer: "", notes: "", questions: "", prior: false, sponsored: false });
    const added = await s.post({ action: "bizAddGrant", token: ada, grant: { title: "PTSA Grant", link: "https://example.com/ptsa" } });
    expect(added.grant).toEqual({ _id: expect.any(String), season: "2026–27", title: "PTSA Grant", link: "https://example.com/ptsa", status: "0. Needs research", deadline: "", prior: false });
    const id = added.grant._id;
    const received = await s.post({ action: "bizSaveGrant", token: ops, grant: { _id: id, status: "5. Received", amount: "2,000", organization: "LAHS PTSA", deadline: "Rolling" } });
    expect(received.grant.status).toBe("5. Received");
    const sponsor = (await s.post({ action: "bizGrantToSponsor", token: ops, grantId: id })).sponsor;
    expect(sponsor).toMatchObject({ company: "LAHS PTSA", notes: "Received through PTSA Grant", status: "5. Received monetary", amount: "2,000" });
    expect((await s.post({ action: "bizGrantToSponsor", token: ops, grantId: id })).message).toContain("already on the Sponsor tracker");
    expect((await s.post({ action: "bizGrants", token: ops })).rows.find((r: { _id: string }) => r._id === id).sponsored).toBe(true);
    expect((await s.post({ action: "bizImportGrants", token: mentor, from: "2025–26" })).added).toBe(1);
    expect((await s.post({ action: "bizGrants", token: ops })).rows.find((r: { title: string }) => r.title === "REV Robotics").prior).toBe(true);
  });
});

describe("stats", () => {
  it("counts stages and money for a season, for the business roles only", async () => {
    const s = business();
    s.rows("biz_sponsors").push(
      { _id: "a", season: "2026–27", company: "A", status: "5. Received monetary", amount: "1,500", prior: false },
      { _id: "b", season: "2026–27", company: "B", status: "4. Declined", amount: "", prior: false },
      { _id: "c", season: "2026–27", company: "C", status: "2. Pending", amount: "", prior: false },
    );
    s.rows("biz_grants").push({ _id: "g", season: "2026–27", title: "G", status: "5. Received", amount: "1,000", prior: false });
    const { stats } = await s.post({ action: "bizStats", token: ops });
    expect(stats).toMatchObject({ season: "2026–27", raised: { sponsors: 1500, grants: 1000 }, sponsorStages: [0, 0, 1, 0, 1, 1], pitches: { accepted: 1, declined: 1, deciding: 1 }, grants: { applied: 1, accepted: 1 } });
    expect((await s.post({ action: "bizStats", token: ada })).error).toBe("forbidden");
  });
});
