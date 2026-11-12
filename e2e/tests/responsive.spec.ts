// Phone viewport (390x844) and reduced motion: pages load cleanly and nothing sticks out sideways.
import { builtRoutes, expect, IMPORTED_APP_ROUTES, settle, test } from "../helpers";

// The pages this site makes itself. GoldSim and WingIt are imported apps with their own layouts.
const PAGES = builtRoutes().filter((r) => !IMPORTED_APP_ROUTES.includes(r));

async function overflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const wide = Array.from(document.body.querySelectorAll("*"))
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.right > vw + 1 && getComputedStyle(e).position !== "fixed";
      })
      .slice(0, 5)
      .map((e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : ""}`);
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: vw, wide };
  });
}

test.describe("phone 390x844", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const route of PAGES) {
    test(`${route} has no horizontal overflow and no errors`, async ({ page, collected }) => {
      const res = await page.goto("." + route);
      expect(res?.status()).toBe(200);
      await settle(page);
      const o = await overflow(page);
      expect(o.scrollWidth, `page is ${o.scrollWidth}px wide in a ${o.clientWidth}px viewport; wide elements: ${o.wide.join(", ")}`).toBeLessThanOrEqual(o.clientWidth);
      expect(collected.errors).toEqual([]);
    });
  }

  test("the MENU button opens and closes the main menu", async ({ page }) => {
    await page.goto("./");
    await settle(page);
    const btn = page.locator("#menu-btn");
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#site-nav").getByRole("link", { name: "About", exact: true })).toBeVisible();
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("reduced motion", () => {
  // The intro is played here (playIntro), in its reduced-motion form, which is what such a visitor gets.
  test.use({ reducedMotion: "reduce", playIntro: true });

  for (const route of ["/", "/about/", "/robots/", "/resources/media/", "/apps/"]) {
    test(`${route} loads cleanly and shows its content`, async ({ page, collected }) => {
      const res = await page.goto("." + route);
      expect(res?.status()).toBe(200);
      await settle(page);
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
      // The intro animation must not keep the page covered: the first heading is visible and the menu is usable.
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      expect(collected.errors).toEqual([]);
    });
  }

  test("the home intro ends and does not keep covering the page", async ({ page }) => {
    await page.goto("./");
    await settle(page);
    await expect(page.locator("#intro")).toBeHidden({ timeout: 15_000 });
    await expect(page.locator("#site-nav a", { hasText: "About" }).first()).toBeVisible();
  });
});

test.describe("normal motion", () => {
  test.use({ playIntro: true });

  test("the home intro plays, ends, and the menu works afterwards", async ({ page, collected }) => {
    await page.goto("./");
    await expect(page.locator("#intro")).toBeHidden({ timeout: 20_000 });
    await page.locator("#site-nav").getByRole("link", { name: "Robots", exact: true }).click();
    await page.waitForURL(/\/robots\/?$/);
    expect(collected.errors).toEqual([]);
  });
});
