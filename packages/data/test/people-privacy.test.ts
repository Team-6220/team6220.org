// listRecords on ops_people (records.ts): everyone gets the picker fields, only the owner gets the private ones.
import { beforeEach, describe, expect, it } from "vitest";
import { makeOps } from "./helpers/ops-server";

const member = "tok-member-0123456789abcdef";
const lead = "tok-lead-0123456789abcdef";
const guest = "tok-guest-0123456789abcdef";

const PRIVATE = ["prefs", "notificationPrefs", "discordId", "discordDmChannelId", "discordName", "signupRole", "firstName", "lastName", "customName", "deleted", "photoUrl"];

describe("reading the people list", () => {
  let s: ReturnType<typeof makeOps>;
  beforeEach(() => {
    s = makeOps({
      [member]: { id: "m-member", status: "APPROVED", badges: ["b-team"] },
      [lead]: { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] },
      [guest]: { id: "m-guest", status: "APPROVED", badges: ["b-guest"] },
    });
    const secrets = {
      prefs: { layout: "rail" },
      notificationPrefs: { ways: ["discord"] },
      discordId: "111222333444555666",
      discordDmChannelId: "dm-1",
      discordName: "lee.d",
      signupRole: "student",
      firstName: "Lee",
      lastName: "Dee",
      customName: "Lee Dee",
      deleted: false,
      photoUrl: "https://static.wixstatic.com/media/lee.jpg",
    };
    s.rows("ops_people").push(
      { _id: "p-member", memberId: "m-member", name: "Sam Lee", username: "sam", githubLogin: "sam-lee", subteams: ["Programming"], active: true, ...secrets, discordId: "999888777666555444" },
      { _id: "p-lead", memberId: "m-lead", name: "Lee Dee", username: "lee", githubLogin: "lee-dee", subteams: ["Design"], active: true, ...secrets },
    );
  });

  const people = async (token: string) => (await s.post({ action: "listRecords", token, collection: "ops_people" })).items as Record<string, unknown>[];

  it("gives a member the picker fields of others, without their private ones", async () => {
    const other = (await people(member)).find((p) => p.memberId === "m-lead")!;
    expect(other).toEqual({ _id: "p-lead", memberId: "m-lead", name: "Lee Dee", username: "lee", githubLogin: "lee-dee", subteams: ["Design"], active: true });
    for (const field of PRIVATE) expect(other).not.toHaveProperty(field);
    expect(other.notificationPrefs).toBeUndefined();
    expect(other.discordId).toBeUndefined();
  });

  it("gives you your own row in full", async () => {
    const mine = (await people(member)).find((p) => p.memberId === "m-member")!;
    expect(mine).toMatchObject({ discordId: "999888777666555444", notificationPrefs: { ways: ["discord"] }, prefs: { layout: "rail" } });
  });

  it("trims the list for a guest too, and leaves the stored rows alone", async () => {
    for (const p of await people(guest)) for (const field of PRIVATE) expect(p).not.toHaveProperty(field);
    expect(s.rows("ops_people")[1]).toMatchObject({ discordId: "111222333444555666" });
  });
});
