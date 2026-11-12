import { describe, expect, it, vi } from "vitest";
import { AREAS, type SummerCamp } from "@team6220/content";
import { handleSiteRequest, type SiteApiDeps } from "../src/site/api";
import { MockSiteStore } from "../src/site/mock";
import { SiteError } from "../src/site/types";
import { createWixVerifier, type Viewer } from "../src/site/verify";

const camp = () => structuredClone(AREAS["summer-camp"].initial) as SummerCamp;
const webAdmin: Viewer = { id: "m1", name: "Ada Lovelace", approved: true, badges: ["Team Member", "Web Admin"] };

function setup(viewer: Viewer | SiteError = webAdmin, store: MockSiteStore | null = new MockSiteStore()) {
  const verify = vi.fn(async () => {
    if (viewer instanceof SiteError) throw viewer;
    return viewer;
  });
  const deps: SiteApiDeps = { verify, getStore: async () => store, now: () => new Date("2026-11-09T12:00:00Z") };
  const call = (body: unknown, init: RequestInit = {}) =>
    handleSiteRequest(
      new Request("https://dev.team6220.org/api/site", {
        method: "POST",
        headers: { Authorization: "token-token-token-token-token", "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
        ...init,
      }),
      deps,
    );
  return { call, verify, store, deps };
}

describe("/api/site access", () => {
  it("refuses a signed-out request (401) before reading anything", async () => {
    const { call, store } = setup(new SiteError("signed-out", "Sign in"));
    const res = await call({ action: "propose", area: "summer-camp", value: camp() });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("signed-out");
    expect(store!.pullRequests).toHaveLength(0);
  });

  it("refuses a Team Member who is not a Web Admin (403)", async () => {
    const { call, store } = setup({ ...webAdmin, badges: ["Team Member", "Attendance Admin"] });
    const value = camp();
    value.title = "Hacked";
    const res = await call({ action: "propose", area: "summer-camp", value });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("forbidden");
    expect(store!.pullRequests).toHaveLength(0);
  });

  it("refuses an unapproved member even with the badge", async () => {
    const { call } = setup({ ...webAdmin, approved: false });
    const res = await call({ action: "status" });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("pending");
  });

  it("checks the sign-in on EVERY request", async () => {
    const { call, verify } = setup();
    await call({ action: "status" });
    await call({ action: "read", area: "summer-camp" });
    await call({ action: "nonsense" });
    expect(verify).toHaveBeenCalledTimes(3);
    expect(verify).toHaveBeenCalledWith("token-token-token-token-token");
  });

  it("only answers POST", async () => {
    const { call, verify } = setup();
    for (const method of ["GET", "PUT", "DELETE"]) {
      const res = await call(undefined as never, { method, body: undefined });
      expect(res.status).toBe(405);
    }
    expect(verify).not.toHaveBeenCalled();
  });

  it("never caches answers", async () => {
    const { call } = setup();
    expect((await call({ action: "status" })).headers.get("cache-control")).toBe("no-store");
  });
});

describe("/api/site actions", () => {
  it("creates a pull request for a valid change (mock store)", async () => {
    const { call, store } = setup();
    const value = camp();
    value.enabled = true;
    const res = await call({ action: "propose", area: "summer-camp", value });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pullRequest).toMatchObject({ mock: true, branch: "site-manager/summer-camp-20261109-ada-lovelace" });
    expect(body.changes).toEqual([{ path: "enabled", kind: "changed", before: "false", after: "true" }]);
    expect(store!.pullRequests[0]!.body).toContain("Requested by **Ada Lovelace**");
  });

  it("refuses content that fails the schema (422) and opens nothing", async () => {
    const { call, store } = setup();
    const value = { ...camp(), title: "" };
    const res = await call({ action: "propose", area: "summer-camp", value });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("invalid");
    expect(body.error.issues.map((i: { path: string }) => i.path)).toContain("title");
    expect(store!.pullRequests).toHaveLength(0);
  });

  it("refuses an unknown area, bad JSON and unknown actions (400)", async () => {
    const { call } = setup();
    expect((await call({ action: "propose", area: "../../etc/passwd", value: {} })).status).toBe(400);
    expect((await call("{not json")).status).toBe(400);
    expect((await call("[1,2]")).status).toBe(400);
    expect((await call({ action: "delete-everything" })).status).toBe(400);
  });

  it("reads the current content", async () => {
    const { call } = setup();
    const res = await call({ action: "read", area: "summer-camp" });
    expect(res.status).toBe(200);
    expect((await res.json()).value.title).toBe("2026 Robotics Summer Camps");
  });

  it("says so when the server has no GitHub credential (503), after the admin check", async () => {
    const { call } = setup(webAdmin, null);
    const res = await call({ action: "propose", area: "summer-camp", value: camp() });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("not-configured");
    const denied = setup({ ...webAdmin, badges: [] }, null);
    expect((await denied.call({ action: "status" })).status).toBe(403);
  });

  it("rejects a bad image before anything is committed (422)", async () => {
    const { call, store } = setup();
    const value = camp();
    value.title = "x";
    const res = await call({ action: "propose", area: "summer-camp", value, images: [{ path: "src/pages/index.astro", base64: "QUJD" }] });
    expect(res.status).toBe(422);
    expect(store!.pullRequests).toHaveLength(0);
  });

  it("turns unexpected failures into a plain 500 without details", async () => {
    const { deps } = setup();
    const broken: SiteApiDeps = { ...deps, getStore: async () => { throw new Error("secret detail ghs_abc"); } };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await handleSiteRequest(new Request("https://x.example/api/site", { method: "POST", body: JSON.stringify({ action: "status" }) }), broken);
    quiet.mockRestore();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("ghs_abc");
  });
});

describe("Wix member verification", () => {
  const CLIENT = "client-1";
  function wix(overrides: { info?: object | number; me?: object | number; badges?: object[]; assignments?: object[] } = {}) {
    const seen: string[] = [];
    const f = (async (url: string, init: RequestInit = {}) => {
      const path = new URL(url).pathname;
      seen.push(`${init.method ?? "GET"} ${path}`);
      const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s });
      if (path === "/oauth2/token-info") {
        return typeof overrides.info === "number" ? json({}, overrides.info) : json(overrides.info ?? { active: true, subjectType: "MEMBER", clientId: CLIENT });
      }
      if (path === "/members/v1/members/my") {
        return typeof overrides.me === "number"
          ? json({}, overrides.me)
          : json(overrides.me ?? { member: { id: "m1", status: "APPROVED", contact: { firstName: "Ada", lastName: "Lovelace" } } });
      }
      if (path === "/oauth2/token") return json({ access_token: "visitor-token" });
      if (path === "/badges/v4/badges/query") return json({ badges: overrides.badges ?? [{ id: "b1", title: "Team Member" }, { id: "b2", title: "Web Admin" }] });
      if (path === "/badges/v4/assignments/query") {
        return json({ badgeAssignments: overrides.assignments ?? [{ memberId: "m1", badgeId: "b2" }, { memberId: "other", badgeId: "b1" }] });
      }
      return json({}, 404);
    }) as unknown as typeof fetch;
    return { f, seen };
  }
  const token = "x".repeat(40);

  it("returns the member, approval and badge titles", async () => {
    const { f } = wix();
    const viewer = await createWixVerifier({ clientId: CLIENT, fetch: f })(`Bearer ${token}`);
    expect(viewer).toEqual({ id: "m1", name: "Ada Lovelace", approved: true, badges: ["Web Admin"] });
  });

  it("refuses a missing, inactive, non-member or foreign-client token", async () => {
    const verify = (w: ReturnType<typeof wix>) => createWixVerifier({ clientId: CLIENT, fetch: w.f })(token);
    await expect(createWixVerifier({ clientId: CLIENT, fetch: wix().f })(null)).rejects.toMatchObject({ code: "signed-out" });
    await expect(verify(wix({ info: { active: false } }))).rejects.toMatchObject({ code: "signed-out" });
    await expect(verify(wix({ info: { active: true, subjectType: "VISITOR", clientId: CLIENT } }))).rejects.toMatchObject({ code: "signed-out" });
    await expect(verify(wix({ info: { active: true, subjectType: "MEMBER", clientId: "someone-else" } }))).rejects.toMatchObject({ code: "signed-out" });
    await expect(verify(wix({ me: 401 }))).rejects.toMatchObject({ code: "signed-out" });
  });

  it("reports Wix outages separately from sign-in problems", async () => {
    await expect(createWixVerifier({ clientId: CLIENT, fetch: wix({ info: 503 }).f })(token)).rejects.toMatchObject({ code: "wix-unavailable" });
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    await expect(createWixVerifier({ clientId: CLIENT, fetch: down })(token)).rejects.toMatchObject({ code: "wix-unavailable" });
  });

  it("does not cache: every call asks Wix again", async () => {
    const w = wix();
    const verify = createWixVerifier({ clientId: CLIENT, fetch: w.f });
    await verify(token);
    await verify(token);
    expect(w.seen.filter((s) => s === "POST /oauth2/token-info")).toHaveLength(2);
  });

  it("is wired to the badge check: Web Admin passes the API, a Team Member does not", async () => {
    const admin = wix();
    const member = wix({ assignments: [{ memberId: "m1", badgeId: "b1" }] });
    const run = (w: ReturnType<typeof wix>) =>
      handleSiteRequest(
        new Request("https://x.example/api/site", { method: "POST", headers: { Authorization: token }, body: JSON.stringify({ action: "status" }) }),
        { verify: createWixVerifier({ clientId: CLIENT, fetch: w.f }), getStore: async () => new MockSiteStore() },
      );
    expect((await run(admin)).status).toBe(200);
    expect((await run(member)).status).toBe(403);
  });
});
