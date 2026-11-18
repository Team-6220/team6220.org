// Wix's built-in login (docs/PHASE-2.md): who is asking comes from the session, and other websites can't use it.
import { describe, expect, it } from "vitest";
import { handleSiteRequest } from "../src/site/api";
import { MockSiteStore } from "../src/site/mock";
import { createSessionVerifier, type SessionWix } from "../src/site/verify";
import { readSessionTokens } from "../src/wix";

const BADGES = [
  { _id: "b-team", title: "Team Member" },
  { _id: "b-web", title: "Web Admin" },
];

function wix(member: Awaited<ReturnType<SessionWix["getCurrentMember"]>>, badgeIds: string[] = []): SessionWix {
  return { getCurrentMember: async () => member, listBadges: async () => BADGES, listBadgeIds: async () => badgeIds };
}

describe("session verifier", () => {
  it("names the signed-in member and their badges", async () => {
    const verify = createSessionVerifier(wix({ _id: "m1", status: "APPROVED", contact: { firstName: "Ada", lastName: "Lovelace" } }, ["b-team", "b-web"]));
    await expect(verify(null)).resolves.toEqual({ id: "m1", name: "Ada Lovelace", approved: true, badges: ["Team Member", "Web Admin"], username: "" });
  });

  it("gives the short @name from the profile slug, else the nickname without spaces", async () => {
    const slug = createSessionVerifier(wix({ _id: "m3", status: "APPROVED", profile: { slug: "Ada-L", nickname: "Ada L" } }));
    await expect(slug(null)).resolves.toMatchObject({ username: "ada-l" });
    const nickname = createSessionVerifier(wix({ _id: "m4", status: "APPROVED", profile: { nickname: "Grace H" } }));
    await expect(nickname(null)).resolves.toMatchObject({ username: "graceh", name: "Grace H" });
  });

  it("treats a visitor (no member) as signed out", async () => {
    await expect(createSessionVerifier(wix(undefined))(null)).rejects.toMatchObject({ code: "signed-out" });
  });

  it("reports an unapproved member as not approved", async () => {
    await expect(createSessionVerifier(wix({ _id: "m2", status: "PENDING" }, ["b-web"]))(null)).resolves.toMatchObject({ approved: false });
  });
});

describe("/api/site from another website", () => {
  const admin = createSessionVerifier(wix({ _id: "m1", status: "APPROVED" }, ["b-team", "b-web"]));
  const call = (secFetchSite?: string) =>
    handleSiteRequest(
      new Request("https://www.team6220.org/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(secFetchSite ? { "Sec-Fetch-Site": secFetchSite } : {}) },
        body: JSON.stringify({ action: "status" }),
      }),
      { verify: admin, getStore: async () => new MockSiteStore() },
    );

  it("refuses a request another site made in the member's browser", async () => {
    expect((await call("cross-site")).status).toBe(403);
    expect((await call("same-site")).status).toBe(403);
  });

  it("accepts requests from this website, and callers that aren't browsers", async () => {
    expect((await call("same-origin")).status).toBe(200);
    expect((await call()).status).toBe(200);
  });
});

describe("session cookie", () => {
  const cookie = (clientId: string) =>
    "other=1; wixSession=" +
    encodeURIComponent(JSON.stringify({ clientId, tokens: { accessToken: { value: "a", expiresAt: 1 }, refreshToken: { value: "r", role: "member" } } }));

  it("reads the tokens when the cookie belongs to our login client", async () => {
    const { WIX_CLIENT_ID } = await import("../src/config");
    expect(readSessionTokens(cookie(WIX_CLIENT_ID))?.refreshToken).toMatchObject({ role: "member" });
  });

  it("ignores a cookie from another client, a missing cookie, and junk", () => {
    expect(readSessionTokens(cookie("someone-else"))).toBeNull();
    expect(readSessionTokens("a=b")).toBeNull();
    expect(readSessionTokens("wixSession=%7Bnot-json")).toBeNull();
  });
});
