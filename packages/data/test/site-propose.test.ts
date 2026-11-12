import { describe, expect, it } from "vitest";
import { AREAS, type SummerCamp } from "@team6220/content";
import { MockSiteStore } from "../src/site/mock";
import { branchName, proposeChange, readArea, slug, validateImages } from "../src/site/propose";
import { SiteError } from "../src/site/types";

const camp = () => structuredClone(AREAS["summer-camp"].initial) as SummerCamp;
const admin = { name: "Ada Lovelace", id: "member-1" };
const now = new Date("2026-11-09T18:30:00Z");

describe("branch names", () => {
  it("is site-manager/<area>-<yyyymmdd>-<who>", () => {
    expect(branchName("summer-camp", now, "Ada Lovelace")).toBe("site-manager/summer-camp-20261109-ada-lovelace");
  });
  it("makes names safe for git", () => {
    expect(slug("José  Núñez!!")).toBe("jose-nunez");
    expect(slug("../../evil name")).toBe("evil-name");
    expect(slug("🙂")).toBe("admin");
    expect(slug("a".repeat(80)).length).toBeLessThanOrEqual(30);
  });
});

describe("proposeChange with the mock store", () => {
  it("opens a (mock) pull request that names the admin and lists the changes", async () => {
    const store = new MockSiteStore();
    const value = camp();
    value.enabled = true;
    value.title = "2027 Robotics Summer Camps";

    const result = await proposeChange(store, { area: "summer-camp", value, requestedBy: admin, now });

    expect(result.pullRequest).toMatchObject({ mock: true, number: 1, branch: "site-manager/summer-camp-20261109-ada-lovelace" });
    expect(result.changes.map((c) => c.path)).toEqual(["enabled", "title"]);
    expect(store.pullRequests).toHaveLength(1);
    const pr = store.pullRequests[0]!;
    expect(pr.title).toBe("Site Manager: update summer camp");
    expect(pr.body).toContain("Requested by **Ada Lovelace**");
    expect(pr.body).toContain("sites/main/content/summer-camp.json");
    expect(pr.body).toContain('enabled: "false" -> "true"');
    expect(pr.body).toContain('title: "2026 Robotics Summer Camps" -> "2027 Robotics Summer Camps"');
    expect(pr.body).toContain("webmaster");
    expect(pr.files).toHaveLength(1);
    expect(pr.files[0]).toMatchObject({ path: "sites/main/content/summer-camp.json", encoding: "utf-8" });
    expect(JSON.parse(pr.files[0]!.content)).toMatchObject({ enabled: true, title: "2027 Robotics Summer Camps" });
    expect(pr.files[0]!.content.endsWith("}\n")).toBe(true);
  });

  it("does not change what the store reads (main only changes when a PR is merged)", async () => {
    const store = new MockSiteStore();
    const value = camp();
    value.title = "Changed";
    await proposeChange(store, { area: "summer-camp", value, requestedBy: admin, now });
    expect(await readArea(store, "summer-camp")).toMatchObject({ title: "2026 Robotics Summer Camps" });
  });

  it("refuses content that doesn't match the schema, with the problem paths", async () => {
    const store = new MockSiteStore();
    const err = await proposeChange(store, { area: "summer-camp", value: { ...camp(), title: "" }, requestedBy: admin }).catch((e) => e);
    expect(err).toBeInstanceOf(SiteError);
    expect(err.code).toBe("invalid");
    expect(err.issues.map((i: { path: string }) => i.path)).toContain("title");
    expect(store.pullRequests).toHaveLength(0);
  });

  it("refuses an edit that changes nothing", async () => {
    const store = new MockSiteStore();
    await expect(proposeChange(store, { area: "summer-camp", value: camp(), requestedBy: admin })).rejects.toMatchObject({ code: "no-changes" });
  });

  it("keeps @ out of the pull request text so nobody on GitHub gets pinged", async () => {
    const store = new MockSiteStore();
    const value = camp();
    value.title = "Hi @octocat";
    await proposeChange(store, { area: "summer-camp", value, requestedBy: { name: "@bob" }, now });
    expect(store.pullRequests[0]!.body).not.toMatch(/@(?!​)/);
  });

  it("commits small images with the content file", async () => {
    const store = new MockSiteStore();
    const value = camp();
    value.title = "With image";
    const png = Buffer.from("not really a png").toString("base64");
    await proposeChange(store, { area: "summer-camp", value, images: [{ path: "sites/main/media/camp/poster.png", base64: png }], requestedBy: admin, now });
    const files = store.pullRequests[0]!.files;
    expect(files.map((f) => f.path)).toEqual(["sites/main/content/summer-camp.json", "sites/main/media/camp/poster.png"]);
    expect(files[1]).toMatchObject({ encoding: "base64", content: png });
    expect(store.pullRequests[0]!.body).toContain("sites/main/media/camp/poster.png");
  });
});

describe("image validation", () => {
  const ok = Buffer.from("abc").toString("base64");
  it.each([
    ["../escape.png"],
    ["sites/main/media/../../../etc/x.png"],
    ["src/pages/index.astro"],
    ["sites/main/media/evil.svg"],
    ["sites/main/media/x.html"],
    ["sites/main/media//x.png"],
  ])("refuses the path %s", (path) => {
    expect(() => validateImages([{ path, base64: ok }])).toThrowError(SiteError);
  });
  it("refuses data that isn't base64 and images over 2 MB", () => {
    expect(() => validateImages([{ path: "sites/main/media/a.png", base64: "not base64!" }])).toThrowError(/not valid image data/);
    const big = Buffer.alloc(2_000_001).toString("base64");
    expect(() => validateImages([{ path: "sites/main/media/a.png", base64: big }])).toThrowError(/bigger than/);
  });
  it("accepts a normal image path", () => {
    expect(validateImages([{ path: "sites/main/media/sponsors/acme.webp", base64: ok }])).toHaveLength(1);
  });
});
