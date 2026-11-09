import { describe, expect, it } from "vitest";
import { site } from "../src/index";

// No window here, like the static build's server step: the client runs in demo mode against the in-memory store.
describe("site client in demo mode", () => {
  it("does not open real pull requests unless the API is configured", () => {
    expect(site.apiConfigured()).toBe(false);
    expect(site.opensRealPullRequests()).toBe(false);
  });

  it("loads the bundled content", async () => {
    const { value, source } = await site.load("summer-camp");
    expect(source).toBe("bundled");
    expect((value as { title: string }).title).toBe("2026 Robotics Summer Camps");
  });

  it("submits to the mock: validates, diffs and says the pull request is not real", async () => {
    const { value } = await site.load("summer-camp");
    const edited = { ...(value as object), title: "2027 Robotics Summer Camps" };
    const result = await site.submit("summer-camp", edited);
    expect(result.pullRequest.mock).toBe(true);
    expect(result.changes).toEqual([{ path: "title", kind: "changed", before: "2026 Robotics Summer Camps", after: "2027 Robotics Summer Camps" }]);
    await expect(site.submit("summer-camp", { ...edited, title: "" })).rejects.toMatchObject({ code: "invalid" });
  });

  it("links to the open Site Manager pull requests on GitHub", () => {
    expect(site.openPullRequestsUrl()).toContain("github.com/Team-6220/team6220.org/pulls");
    expect(decodeURIComponent(site.openPullRequestsUrl())).toContain("head:site-manager/");
  });
});
