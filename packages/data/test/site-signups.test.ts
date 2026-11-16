import { describe, expect, it, vi } from "vitest";
import { handleSiteRequest, type SiteApiDeps } from "../src/site/api";
import { MockSiteStore } from "../src/site/mock";
import { DemoSignupReader, WixSignupReader, emailListText, fieldLabel, signupReaderFromEnv, toSignup, uniqueEmails, type Signup } from "../src/site/signups";
import type { Viewer } from "../src/site/verify";

const NEWSLETTER = "140821da-28b0-4e89-9b59-fd4cdc03a63a";
const person = (email: string, name = "A"): Signup => ({ id: email, name, email, submittedAt: "2026-11-01T00:00:00Z", details: {} });

describe("toSignup", () => {
  it("finds the name and email whatever the field keys are, and keeps the rest as answers", () => {
    const s = toSignup({
      id: "s1",
      createdDate: "2026-11-10T18:04:00Z",
      submissions: { name_a1c2: "Alex Griffin", email_b2d3: "alex@example.com", grade_c3e4: "8th", is_parent_d4f5: false, interests_e5a6: ["Programming", "Design"] },
    });
    expect(s).toEqual({
      id: "s1",
      name: "Alex Griffin",
      email: "alex@example.com",
      submittedAt: "2026-11-10T18:04:00Z",
      details: { Grade: "8th", "Is parent": "No", Interests: "Programming, Design" },
    });
  });

  it("joins first and last names, and does not mistake a company name for the person", () => {
    const s = toSignup({ submissions: { first_name_x1y2: "Chris", last_name_z3w4: "Park", company_name_q1q2: "Example Co", email_e1e1: "c@example.com" } });
    expect(s.name).toBe("Chris Park");
    expect(s.details).toEqual({ "Company name": "Example Co" });
  });

  it("labels a field from its key without Wix's random suffix", () => {
    expect(fieldLabel("interests_e5a6")).toBe("Interests");
    expect(fieldLabel("is_parent_d4f5")).toBe("Is parent");
  });
});

describe("copying emails", () => {
  it("lists each email once, ignoring case, in order, and skips blanks", () => {
    const list = [person("a@x.com"), person("B@x.com"), person("A@X.com"), person("")];
    expect(uniqueEmails(list)).toEqual(["a@x.com", "B@x.com"]);
    expect(emailListText(list)).toBe("a@x.com, B@x.com");
  });
});

describe("WixSignupReader", () => {
  it("queries the form with the API key on the server and follows the pages", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const pages = [
      { submissions: [{ id: "1", submissions: { email_a: "one@x.com" } }], metadata: { hasNext: true, cursors: { next: "c2" } } },
      { submissions: [{ id: "2", submissions: { email_a: "two@x.com" } }], metadata: { hasNext: false } },
    ];
    const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(pages[calls.length - 1]), { status: 200 });
    }) as unknown as typeof fetch;
    const reader = new WixSignupReader("secret-key", "site-123", fakeFetch);
    const out = await reader.list(NEWSLETTER, new Date("2026-08-01T00:00:00Z"));

    expect(out.map((s) => s.email)).toEqual(["one@x.com", "two@x.com"]);
    expect(calls).toHaveLength(2);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("secret-key");
    expect(headers["wix-site-id"]).toBe("site-123");
    const first = JSON.parse(String(calls[0].init.body)).query;
    expect(first.filter).toEqual({ namespace: "wix.form_app.form", formId: NEWSLETTER, createdDate: { $gte: "2026-08-01T00:00:00.000Z" } });
    expect(JSON.parse(String(calls[1].init.body)).query.cursorPaging).toEqual({ limit: 100, cursor: "c2" });
  });

  it("explains a refused key", async () => {
    const reader = new WixSignupReader("bad", "site", (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch);
    await expect(reader.list(NEWSLETTER)).rejects.toMatchObject({ code: "not-configured" });
  });

  it("is only built when both server variables are set", () => {
    expect(signupReaderFromEnv({})).toBeNull();
    expect(signupReaderFromEnv({ SITE_MANAGER_WIX_API_KEY: "k" })).toBeNull();
    expect(signupReaderFromEnv({ SITE_MANAGER_WIX_API_KEY: "k", WIX_SITE_ID: "s" })).toBeInstanceOf(WixSignupReader);
  });
});

describe("/api/site signups", () => {
  const webAdmin: Viewer = { id: "m1", name: "Ada Lovelace", approved: true, badges: ["Team Member", "Web Admin"] };
  function call(body: unknown, opts: { viewer?: Viewer; reader?: DemoSignupReader | null; store?: MockSiteStore | null } = {}) {
    const deps: SiteApiDeps = {
      verify: async () => opts.viewer ?? webAdmin,
      getStore: async () => (opts.store === undefined ? null : opts.store),
      getSignups: () => (opts.reader === undefined ? new DemoSignupReader() : opts.reader),
    };
    return handleSiteRequest(
      new Request("https://dev.team6220.org/api/site", {
        method: "POST",
        headers: { Authorization: "token-token-token-token-token", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      deps,
    );
  }

  it("lists a form's signups for a Web Admin, without needing the GitHub credential", async () => {
    const res = await call({ action: "signups", formId: NEWSLETTER });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.signups.length).toBeGreaterThan(0);
    expect(data.signups[0]).toHaveProperty("email");
  });

  it("refuses anyone without the Web Admin badge", async () => {
    const res = await call({ action: "signups", formId: NEWSLETTER }, { viewer: { ...webAdmin, badges: ["Team Member"] } });
    expect(res.status).toBe(403);
  });

  it("only reads the website's own forms", async () => {
    const res = await call({ action: "signups", formId: "some-other-form" });
    expect(res.status).toBe(400);
  });

  it("rejects a date it can't read", async () => {
    const res = await call({ action: "signups", formId: NEWSLETTER, since: "next tuesday" });
    expect(res.status).toBe(400);
  });

  it("says when the server has no Wix key", async () => {
    const res = await call({ action: "signups", formId: NEWSLETTER }, { reader: null });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("not-configured");
  });
});
