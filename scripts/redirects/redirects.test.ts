// Tests for docs/redirects.json. Runs with `pnpm test` (in CI before the build) and checks every new address against
// the built site when dist/ exists, otherwise against src/pages. `pnpm redirects:check --require-dist` is the strict version.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OLD_ANCHORS } from "../../sites/main/data/old-anchors";
// @ts-expect-error plain JS modules
import { checkRedirects } from "./check.mjs";
// @ts-expect-error plain JS modules
import { CSV_HEADER, ROOT, loadRedirects, toCsv } from "./lib.mjs";

const data = loadRedirects();
const DIST = join(ROOT, "dist");
const haveDist = existsSync(join(DIST, "index.html"));

// The old Wix pages (docs/SEO.md) that must each have an entry.
const OLD_WIX_PAGES = [
  "/summer",
  "/our-team",
  "/our-team/subteams",
  "/sponsors-donations",
  "/contact",
  "/gallery",
  "/copy-of-contact",
  "/yearbook",
  "/saved-site-materials",
  "/fullscreen-page",
  "/team",
  "/sponsor",
];

describe("docs/redirects.json", () => {
  it("covers every old Wix page", () => {
    const from = data.pages.map((r: { from: string }) => r.from);
    for (const p of OLD_WIX_PAGES) expect(from, p).toContain(p);
  });

  it("makes Contact scroll to the footer instead of a page of its own (owner decision)", () => {
    const to = Object.fromEntries(data.pages.map((r: { from: string; to: string }) => [r.from, r.to]));
    expect(to["/contact"]).toBe("/#contact");
    expect(to["/copy-of-contact"]).toBe("/#contact");
    // the footer really has that id
    expect(readFileSync(join(ROOT, "sites/main/components/Footer.astro"), "utf8")).toMatch(/<footer id="contact"/);
  });

  it("has a 301 and a decision on every page, and marks the ones that are only proposed", () => {
    for (const r of data.pages) {
      expect(r.status, r.from).toBe(301);
      expect(["confirmed", "owner", "proposed"], r.from).toContain(r.decision);
    }
    const proposed = data.pages.filter((r: { decision: string }) => r.decision === "proposed").map((r: { from: string }) => r.from);
    for (const p of ["/yearbook", "/saved-site-materials", "/fullscreen-page", "/team", "/sponsor"]) expect(proposed, p).toContain(p);
  });

  it("lists exactly the anchors the home page script knows (sites/main/data/old-anchors.ts)", () => {
    const listed = Object.fromEntries(
      data.anchors.filter((a: { from: string }) => !a.from.includes("<")).map((a: { from: string; to: string }) => [a.from.replace(/^\/#/, ""), a.to]),
    );
    expect(listed).toEqual(OLD_ANCHORS);
  });

  it("has a generated CSV in the Wix format: a header row and two columns", () => {
    const csv = readFileSync(join(ROOT, "docs/redirects.csv"), "utf8");
    expect(csv).toBe(toCsv(data));
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines.length - 1).toBe(data.pages.length);
    expect(lines.length - 1).toBeLessThanOrEqual(500); // Wix imports at most 500 per file
    for (const l of lines.slice(1)) expect(l.split(",")).toHaveLength(2);
  });

  it("passes the full check (map, generated files, and every new address exists)", () => {
    const { errors } = checkRedirects({ dist: DIST });
    expect(errors).toEqual([]);
  });

  it.skipIf(!haveDist)("every new address exists in the built site, anchors included (dist/)", () => {
    const { errors, mode } = checkRedirects({ dist: DIST, requireDist: true });
    expect(mode).toBe("dist");
    expect(errors).toEqual([]);
  });
});
