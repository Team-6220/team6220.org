// The light/dark button at the bottom of the main site's footer. The choice is saved as team6220.theme and is
// shared with the team apps (packages/assets/scripts/app-sidebar.js). Dark is the default; the device setting is ignored.
import { expect, settle, test } from "../helpers";

test.describe("light / dark mode (main site)", () => {
  test("the footer button switches to light mode and the choice is remembered", async ({ page, collected }) => {
    await page.goto("about");
    await settle(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Light mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("button", { name: "Dark mode" })).toBeVisible();

    await page.reload();
    await settle(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Dark mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(collected.errors).toEqual([]);
  });

  test("a device set to light mode still gets dark until the button is used", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("about");
    await settle(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
