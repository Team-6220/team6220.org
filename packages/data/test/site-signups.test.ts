import { describe, expect, it, vi } from "vitest";
import { handleSiteRequest, type SiteApiDeps } from "../src/site/api";
import { MockSiteStore } from "../src/site/mock";
import { DemoSignupReader, createSignupReader, emailListText, fieldLabel, toSignup, uniqueEmails, type Signup, type SubmissionsPage } from "../src/site/signups";
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

describe("createSignupReader", () => {
  it("queries the form newest first, since a date, and follows the pages", async () => {
    const queries: Record<string, any>[] = [];
    const pages: SubmissionsPage[] = [
      { submissions: [{ _id: "1", _createdDate: new Date("2026-11-10T00:00:00Z"), submissions: { email_a: "one@x.com" } }], metadata: { hasNext: true, cursors: { next: "c2" } } },
      { submissions: [{ _id: "2", _createdDate: "2026-11-09T00:00:00Z", submissions: { email_a: "two@x.com" } }], metadata: { hasNext: false } },
    ];
    const reader = createSignupReader(async (q) => {
      queries.push(q);
      return pages[queries.length - 1];
    });
    const out = await reader.list(NEWSLETTER, new Date("2026-08-01T00:00:00Z"));

    expect(out.map((s) => [s.id, s.email, s.submittedAt])).toEqual([
      ["1", "one@x.com", "2026-11-10T00:00:00.000Z"],
      ["2", "two@x.com", "2026-11-09T00:00:00Z"],
    ]);
    expect(queries[0]).toEqual({
      filter: { namespace: "wix.form_app.form", formId: NEWSLETTER, _createdDate: { $gte: "2026-08-01T00:00:00.000Z" } },
      sort: [{ fieldName: "_createdDate", order: "DESC" }],
      cursorPaging: { limit: 100 },
    });
    expect(queries[1]).toEqual({ cursorPaging: { limit: 100, cursor: "c2" } });
  });

  it("explains when Wix can't be read", async () => {
    const reader = createSignupReader(async () => {
      throw new Error("403");
    });
    await expect(reader.list(NEWSLETTER)).rejects.toMatchObject({ code: "wix-unavailable" });
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

  it("says when the server can't read signups", async () => {
    const res = await call({ action: "signups", formId: NEWSLETTER }, { reader: null });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("not-configured");
  });
});
