// The old one-page addresses (dev.team6220.org/#about ...) are sent to the new pages by a script on the home page.
import { OLD_ANCHORS } from "../../sites/main/data/old-anchors";
import { expect, normPath, sitePath, test } from "../helpers";

const here = (page: import("@playwright/test").Page) => new URL(page.url());

for (const [anchor, target] of Object.entries(OLD_ANCHORS)) {
  test(`/#${anchor} goes to ${target}`, async ({ page, collected }) => {
    // The home page replaces its own address while it is loading, so don't wait for its load event: poll the address.
    await page.goto(`./#${anchor}`, { waitUntil: "commit" });
    const [path, hash = ""] = target.split("#");
    await expect.poll(() => normPath(sitePath(here(page).pathname)), { timeout: 15_000 }).toBe(normPath(path));
    await expect.poll(() => here(page).hash.slice(1)).toBe(hash);
    await page.waitForLoadState("load");
    await expect(page.locator("main")).toBeVisible();
    expect(collected.errors).toEqual([]);
  });
}

test("/#photos-<album> goes to /resources/media#<album>", async ({ page }) => {
  await page.goto("./#photos-beach-blitz-2025", { waitUntil: "commit" });
  await expect.poll(() => normPath(sitePath(here(page).pathname)), { timeout: 15_000 }).toBe("/resources/media");
  await expect.poll(() => here(page).hash).toBe("#beach-blitz-2025");
});

test("an anchor that is not an old address stays on the home page", async ({ page }) => {
  await page.goto("./#contact-us-not-an-old-address");
  await page.waitForLoadState("load");
  expect(normPath(sitePath(here(page).pathname))).toBe("/");
});
