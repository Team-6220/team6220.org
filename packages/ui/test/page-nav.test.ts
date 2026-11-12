import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// The script is a plain browser script (no module syntax). Run it with no document, which loads only the pure parts.
const src = readFileSync(new URL("../../assets/scripts/page-nav.js", import.meta.url), "utf8");
const ctx: { G6220PageNav?: any; URL: typeof URL } = { URL };
runInNewContext(src, ctx);
const nav = ctx.G6220PageNav;

describe("page-nav decision", () => {
  it("default delay is the one named constant", () => {
    expect(nav.LOADER_DELAY_MS).toBe(200);
  });

  it("keeps waiting while the page is pending and the delay has not passed", () => {
    expect(nav.decide(0, "pending")).toBe("wait");
    expect(nav.decide(199, "pending")).toBe("wait");
  });

  it("shows the loader once the delay passes and the page is still pending", () => {
    expect(nav.decide(200, "pending")).toBe("loader");
    expect(nav.decide(1500, "pending")).toBe("loader");
  });

  it("navigates without a loader when the page is ready, at any time before the delay", () => {
    expect(nav.decide(0, "ready")).toBe("navigate");
    expect(nav.decide(120, "ready")).toBe("navigate");
  });

  it("navigates plainly when the fetch failed (404, offline)", () => {
    expect(nav.decide(10, "failed")).toBe("navigate");
    expect(nav.decide(900, "failed")).toBe("navigate");
  });

  it("honours a custom delay", () => {
    expect(nav.decide(50, "pending", 0)).toBe("loader");
    expect(nav.decide(500, "pending", 1000)).toBe("wait");
  });

  it("shouldShowLoader(elapsed, ready)", () => {
    expect(nav.shouldShowLoader(100, false)).toBe(false);
    expect(nav.shouldShowLoader(250, false)).toBe(true);
    expect(nav.shouldShowLoader(250, true)).toBe(false);
    expect(nav.shouldShowLoader(0, true)).toBe(false);
  });
});

describe("page-nav canPrefetch", () => {
  const here = "https://dev.team6220.org/about/";
  it("accepts other pages of the same site", () => {
    expect(nav.canPrefetch("/robots", here)).toBe(true);
    expect(nav.canPrefetch("https://dev.team6220.org/apps/", here)).toBe(true);
  });
  it("rejects external, non-web, asset and same-page links", () => {
    expect(nav.canPrefetch("https://example.com/", here)).toBe(false);
    expect(nav.canPrefetch("mailto:a@b.c", here)).toBe(false);
    expect(nav.canPrefetch("/assets/main/x.pdf", here)).toBe(false);
    expect(nav.canPrefetch("/about", here)).toBe(false);
    expect(nav.canPrefetch("#team", here)).toBe(false);
    expect(nav.canPrefetch("http://[bad", here)).toBe(false);
  });
});
