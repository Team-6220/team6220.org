import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AREAS, type SummerCamp } from "@team6220/content";
import { GithubSiteStore, githubAppJwt, githubStoreFromEnv } from "../src/site/github";
import { proposeChange } from "../src/site/propose";

type Call = { method: string; url: string; headers: Record<string, string>; body?: any };

/** A fake GitHub: records every call and answers like the real API does for the happy path. */
function fakeGithub(opts: { existingBranches?: string[]; failPull?: number; contentText?: string | null } = {}) {
  const calls: Call[] = [];
  const existing = new Set(opts.existingBranches ?? []);
  let blob = 0;
  const fakeFetch = (async (url: string, init: RequestInit = {}) => {
    const call: Call = {
      method: init.method ?? "GET",
      url,
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    const path = new URL(url).pathname.replace("/repos/Team-6220/team6220.org", "");
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (call.method === "GET" && path.startsWith("/contents/")) {
      return opts.contentText === null ? json({ message: "Not Found" }, 404) : new Response(opts.contentText ?? JSON.stringify(AREAS["summer-camp"].initial));
    }
    if (call.method === "GET" && path === "/git/ref/heads/main") return json({ object: { sha: "basecommit" } });
    if (call.method === "GET" && path === "/git/commits/basecommit") return json({ tree: { sha: "basetree" } });
    if (path === "/git/blobs") return json({ sha: `blob${++blob}` }, 201);
    if (path === "/git/trees") return json({ sha: "newtree" }, 201);
    if (path === "/git/commits") return json({ sha: "newcommit" }, 201);
    if (path === "/git/refs") {
      const branch = call.body.ref.replace("refs/heads/", "");
      if (existing.has(branch)) return json({ message: "Reference already exists" }, 422);
      existing.add(branch);
      return json({ ref: call.body.ref }, 201);
    }
    if (path === "/pulls") {
      if (opts.failPull) return json({ message: "Validation Failed" }, opts.failPull);
      return json({ number: 42, html_url: "https://github.com/Team-6220/team6220.org/pull/42" }, 201);
    }
    if (call.method === "DELETE") {
      existing.delete(path.replace("/git/refs/heads/", ""));
      return new Response(null, { status: 204 });
    }
    return json({ message: "unexpected " + path }, 500);
  }) as typeof fetch;
  return { calls, fakeFetch, existing };
}

const camp = () => structuredClone(AREAS["summer-camp"].initial) as SummerCamp;
const now = new Date("2026-11-09T12:00:00Z");

describe("GithubSiteStore", () => {
  it("reads a file from main as raw text, and returns null when it doesn't exist", async () => {
    const { fakeFetch, calls } = fakeGithub();
    const store = new GithubSiteStore({ token: "ghs_secret", fetch: fakeFetch });
    expect(JSON.parse((await store.readFile("sites/main/content/summer-camp.json"))!).title).toBe("2026 Robotics Summer Camps");
    expect(calls[0]!.url).toBe("https://api.github.com/repos/Team-6220/team6220.org/contents/sites/main/content/summer-camp.json?ref=main");
    expect(calls[0]!.headers.Accept).toContain("raw");

    const missing = new GithubSiteStore({ token: "t", fetch: fakeGithub({ contentText: null }).fakeFetch });
    expect(await missing.readFile("nope.json")).toBeNull();
  });

  it("creates blobs, a tree, a commit, a branch and a pull request, in that order", async () => {
    const { fakeFetch, calls } = fakeGithub();
    const store = new GithubSiteStore({ token: "ghs_secret", fetch: fakeFetch });
    const pr = await store.createPullRequest({
      branch: "site-manager/summer-camp-20261109-ada",
      title: "Site Manager: update summer camp",
      body: "body text",
      files: [
        { path: "sites/main/content/summer-camp.json", content: "{}\n", encoding: "utf-8" },
        { path: "sites/main/media/a.png", content: "QUJD", encoding: "base64" },
      ],
    });
    expect(pr).toEqual({ number: 42, url: "https://github.com/Team-6220/team6220.org/pull/42", branch: "site-manager/summer-camp-20261109-ada", mock: false });
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname.replace("/repos/Team-6220/team6220.org", "")}`)).toEqual([
      "GET /git/ref/heads/main",
      "GET /git/commits/basecommit",
      "POST /git/blobs",
      "POST /git/blobs",
      "POST /git/trees",
      "POST /git/commits",
      "POST /git/refs",
      "POST /pulls",
    ]);
    expect(calls[2]!.body).toEqual({ content: "{}\n", encoding: "utf-8" });
    expect(calls[3]!.body).toEqual({ content: "QUJD", encoding: "base64" });
    expect(calls[4]!.body).toEqual({
      base_tree: "basetree",
      tree: [
        { path: "sites/main/content/summer-camp.json", mode: "100644", type: "blob", sha: "blob1" },
        { path: "sites/main/media/a.png", mode: "100644", type: "blob", sha: "blob2" },
      ],
    });
    expect(calls[5]!.body).toMatchObject({ message: "Site Manager: update summer camp", tree: "newtree", parents: ["basecommit"] });
    expect(calls[6]!.body).toEqual({ ref: "refs/heads/site-manager/summer-camp-20261109-ada", sha: "newcommit" });
    expect(calls[7]!.body).toEqual({ title: "Site Manager: update summer camp", head: "site-manager/summer-camp-20261109-ada", base: "main", body: "body text" });
    for (const c of calls) expect(c.headers.Authorization).toBe("Bearer ghs_secret");
  });

  it("adds a suffix when the admin already used the branch name today", async () => {
    const { fakeFetch } = fakeGithub({ existingBranches: ["site-manager/summer-camp-20261109-ada", "site-manager/summer-camp-20261109-ada-2"] });
    const store = new GithubSiteStore({ token: "t", fetch: fakeFetch });
    const pr = await store.createPullRequest({ branch: "site-manager/summer-camp-20261109-ada", title: "t", body: "b", files: [] });
    expect(pr.branch).toBe("site-manager/summer-camp-20261109-ada-3");
  });

  it("deletes the branch again when the pull request can't be opened", async () => {
    const { fakeFetch, calls, existing } = fakeGithub({ failPull: 422 });
    const store = new GithubSiteStore({ token: "t", fetch: fakeFetch });
    await expect(store.createPullRequest({ branch: "site-manager/x", title: "t", body: "b", files: [] })).rejects.toMatchObject({ code: "github" });
    expect(calls.at(-1)!.method).toBe("DELETE");
    expect(existing.has("site-manager/x")).toBe(false);
  });

  it("explains a rejected credential without leaking it", async () => {
    const denied = (async () => new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 })) as unknown as typeof fetch;
    const store = new GithubSiteStore({ token: "ghs_VERYSECRET", fetch: denied });
    const err = await store.readFile("a.json").catch((e) => e);
    expect(err.code).toBe("not-configured");
    expect(String(err.message)).not.toContain("VERYSECRET");
  });

  it("refuses to be built without a token or with a bad repo name", () => {
    expect(() => new GithubSiteStore({ token: "" })).toThrowError(/token/i);
    expect(() => new GithubSiteStore({ token: "t", repo: "not a repo" })).toThrowError(/owner\/name/);
  });

  it("works end to end with proposeChange", async () => {
    const { fakeFetch, calls } = fakeGithub();
    const store = new GithubSiteStore({ token: "t", fetch: fakeFetch });
    const value = camp();
    value.enabled = true;
    const { pullRequest, changes } = await proposeChange(store, { area: "summer-camp", value, requestedBy: { name: "Ada" }, now });
    expect(pullRequest.mock).toBe(false);
    expect(changes).toHaveLength(1);
    const pull = calls.find((c) => c.url.endsWith("/pulls"))!;
    expect(pull.body.body).toContain("Requested by **Ada**");
    const blob = calls.find((c) => c.url.endsWith("/git/blobs"))!;
    expect(JSON.parse(blob.body.content).enabled).toBe(true);
  });
});

describe("credentials from the environment", () => {
  it("returns null when nothing is configured", async () => {
    expect(await githubStoreFromEnv({})).toBeNull();
    expect(await githubStoreFromEnv({ GITHUB_APP_ID: "1" })).toBeNull();
  });

  it("uses SITE_MANAGER_GITHUB_TOKEN when set", async () => {
    const { fakeFetch, calls } = fakeGithub();
    const store = await githubStoreFromEnv({ SITE_MANAGER_GITHUB_TOKEN: "tok" }, fakeFetch);
    await store!.readFile("a.json");
    expect(calls[0]!.headers.Authorization).toBe("Bearer tok");
  });

  it("signs a GitHub App JWT that verifies, and exchanges it for an installation token", async () => {
    const keys = await webcrypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64");
    const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;

    const jwt = await githubAppJwt("12345", pem, 1_800_000_000);
    const [h, p, s] = jwt.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(p, "base64url").toString())).toMatchObject({ iss: "12345", exp: 1_800_000_000 + 540 });
    const valid = await webcrypto.subtle.verify("RSASSA-PKCS1-v1_5", keys.publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(`${h}.${p}`));
    expect(valid).toBe(true);

    const seen: { url: string; auth: string }[] = [];
    const exchange = (async (url: string, init: RequestInit) => {
      seen.push({ url, auth: (init.headers as Record<string, string>).Authorization! });
      return new Response(JSON.stringify({ token: "ghs_installation" }), { status: 201 });
    }) as unknown as typeof fetch;
    const store = await githubStoreFromEnv(
      { GITHUB_APP_ID: "12345", GITHUB_APP_INSTALLATION_ID: "678", GITHUB_APP_PRIVATE_KEY: pem.replace(/\n/g, "\\n") },
      exchange,
    );
    expect(store?.kind).toBe("github");
    expect(seen[0]!.url).toBe("https://api.github.com/app/installations/678/access_tokens");
    expect(seen[0]!.auth).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("explains how to convert a PKCS#1 key", async () => {
    await expect(githubAppJwt("1", "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----")).rejects.toThrowError(/pkcs8/);
  });
});
