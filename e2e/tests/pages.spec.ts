// Every page in the build (found from dist/**/index.html) loads cleanly: HTTP 200, no console or page errors,
// all internal links and in-page anchors resolve, and all images load.
import { builtRoutes, expect, internalLinks, isKnownMissingImageUrl, settle, sitePath, test } from "../helpers";

/** Pages whose #hash is handled by JavaScript, not by an element id: /resources/media#<album> opens that album. */
const JS_HASH_PAGES = ["/resources/media"];

const ROUTES = builtRoutes();

test("the build has the pages we expect", () => {
  expect(ROUTES.length).toBeGreaterThan(10);
  for (const r of ["/", "/about/", "/apps/", "/summer-camp/", "/resources/media/"]) expect(ROUTES).toContain(r);
});

for (const route of ROUTES) {
  test.describe(route, () => {
    test("loads with 200 and no console errors", async ({ page, collected }) => {
      const res = await page.goto("." + route);
      expect(res?.status()).toBe(200);
      await settle(page);
      expect(collected.errors, "console errors / uncaught page errors").toEqual([]);
      expect(collected.failed, "failed requests on this site (4xx/5xx), not in the known-missing-images allow-list").toEqual([]);
    });

    test("internal links resolve and in-page anchors exist", async ({ page, request }) => {
      await page.goto("." + route);
      await settle(page);
      const links = await internalLinks(page);
      const problems: string[] = [];
      for (const { href, url } of links) {
        const u = new URL(url);
        const hash = decodeURIComponent(u.hash.slice(1));
        u.hash = "";
        const res = await request.get(u.href);
        if (res.status() !== 200) {
          problems.push(`${href} -> HTTP ${res.status()}`);
          continue;
        }
        if (!hash) continue;
        // "#/play": a client-side router path (GoldSim), not an element.
        if (hash.startsWith("/")) continue;
        const type = res.headers()["content-type"] ?? "";
        if (!type.includes("text/html")) continue;
        const html = await res.text();
        const esc = hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const hasElement = new RegExp(`\\s(id|name)=["']${esc}["']`).test(html);
        // A few pages open their own content from the #hash with JavaScript (the Media page opens the album named in it).
        // For those, the page must link to the hash itself (href="#hash"), which is how it lists what it can open.
        const jsHash = JS_HASH_PAGES.includes(sitePath(u.pathname).replace(/\/$/, "")) && html.includes(`href="#${hash}"`);
        if (!hasElement && !jsHash) problems.push(`${href} -> no element with id "${hash}"`);
      }
      expect(problems, `${links.length} internal links checked`).toEqual([]);
    });

    test("images load", async ({ page, collected }, info) => {
      await page.goto("." + route);
      await settle(page);
      // Lazy images only load when scrolled to: make them all eager instead, so every image on the page is tried.
      await page.evaluate(() => {
        for (const img of Array.from(document.images)) img.loading = "eager";
      });
      await page.waitForLoadState("networkidle").catch(() => undefined);
      // Give images that started loading late a moment to finish (a broken one finishes too, with no width).
      await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete), null, { timeout: 10_000 }).catch(() => undefined);
      const imgs = await page.evaluate(() =>
        Array.from(document.images)
          .filter((i) => i.currentSrc || i.getAttribute("src")) // an <img> with no src yet (the photo viewer's) is not broken
          .map((i) => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0, alt: i.getAttribute("alt") })),
      );
      const broken = imgs.filter((i) => !i.ok).map((i) => new URL(i.src).pathname);
      const unexpected = broken.filter((p) => !isKnownMissingImageUrl(p));
      expect(unexpected, `${imgs.length} images on the page`).toEqual([]);
      const known = new Set([...broken.filter((p) => isKnownMissingImageUrl(p)), ...collected.allowed.map((a) => a.split(" ")[1])]);
      if (known.size) info.annotations.push({ type: "known-missing-images (issue #8)", description: `${known.size} allow-listed image(s) missing` });
    });
  });
}
