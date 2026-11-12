// The main menu matches sites/main/data/nav.ts, and each link goes to the right page.
import { LOGIN, NAV, type NavGroup, type NavLink } from "../../sites/main/data/nav";
import { SUMMER_CAMP_ENABLED } from "../../sites/main/config/site";
import { expect, normPath, settle, sitePath, test } from "../helpers";

const nav = (page: import("@playwright/test").Page) => page.locator("nav#site-nav");
const isGroup = (c: NavLink | NavGroup): c is NavGroup => "children" in c;

test("the menu lists every tab and dropdown link from nav.ts, in order, plus Log In", async ({ page, collected }) => {
  await page.goto("./");
  await settle(page);
  const expected: string[] = [];
  for (const t of NAV) {
    expected.push(`${t.label}|${t.href}`);
    for (const c of t.children ?? []) {
      expected.push(`${c.label}${c.external ? " ↗" : ""}|${c.href}`);
      // A dropdown item can open a second dropdown (Apps under Resources)
      for (const g of isGroup(c) ? c.children : []) expected.push(`${g.label}${g.external ? " ↗" : ""}|${g.href}`);
    }
  }
  expected.push(`${LOGIN.label}|${LOGIN.href}`);
  const actual = await nav(page).locator("a").evaluateAll((as) =>
    as.map((a) => `${(a.textContent ?? "").trim()}|${a.getAttribute("href")}`),
  );
  expect(actual).toEqual(expected);
  expect(collected.errors).toEqual([]);
});

// Top-level tabs: click each in the visible menu and check where it lands.
for (const tab of NAV.filter((t) => !t.external)) {
  test(`clicking "${tab.label}" opens ${tab.href}`, async ({ page }) => {
    await page.goto("./");
    await settle(page);
    await nav(page).getByRole("link", { name: tab.label, exact: true }).first().click();
    await page.waitForURL((u) => normPath(sitePath(u.pathname)) === normPath(tab.href));
    expect(normPath(sitePath(new URL(page.url()).pathname))).toBe(normPath(tab.href));
    await expect(page.locator("nav#site-nav a[aria-current='page']").first()).toHaveAttribute("href", tab.href);
  });
}

// Dropdown links: each internal one opens the right page and is marked as the current page there.
for (const tab of NAV) {
  for (const child of (tab.children ?? []).filter((c) => !c.external)) {
    test(`"${tab.label}" > "${child.label}" opens ${child.href}`, async ({ page }) => {
      await page.goto("./");
      await settle(page);
      await nav(page).locator(`li[data-page="${tab.id}"]`).hover();
      await nav(page).locator(`li[data-page="${tab.id}"] ul.sub a`, { hasText: child.label }).first().click();
      if (child.href.startsWith("#")) {
        // An on-page link (Contact): stays on the page and scrolls to the element it names.
        await page.waitForURL((u) => u.hash === child.href);
        await expect(page.locator(child.href)).toBeInViewport();
        return;
      }
      await page.waitForURL((u) => normPath(sitePath(u.pathname)) === normPath(child.href));
      expect(normPath(sitePath(new URL(page.url()).pathname))).toBe(normPath(child.href));
    });
  }
}

test("Log In goes to the apps dashboard", async ({ page }) => {
  await page.goto("./");
  await settle(page);
  await nav(page).getByRole("link", { name: LOGIN.label, exact: true }).click();
  await page.waitForURL((u) => normPath(sitePath(u.pathname)) === normPath(LOGIN.href));
  await expect(page.getByRole("heading", { level: 1, name: "Team apps" })).toBeVisible();
});

test("external menu links open in a new tab safely", async ({ page }) => {
  await page.goto("./");
  const external = NAV.flatMap((t) => t.children ?? []).filter((c) => c.external);
  for (const c of external) {
    const a = nav(page).locator(`a[href="${c.href}"]`);
    await expect(a).toHaveAttribute("target", "_blank");
    await expect(a).toHaveAttribute("rel", /noopener/);
  }
});

test("the Summer Camp tab shows in the menu only while the switch is on (the page itself always exists)", async ({ page }) => {
  // The switch is SUMMER_CAMP_ENABLED in sites/main/config/site.ts, a build-time constant: this checks the build
  // against the value in the source. To see the "on" state, flip the switch and rebuild.
  await page.goto("./");
  const inMenu = await nav(page).locator("a[href='/summer-camp']").count();
  expect(inMenu > 0).toBe(SUMMER_CAMP_ENABLED);
  expect(NAV.some((t) => t.id === "summer-camp")).toBe(SUMMER_CAMP_ENABLED);
  // The home page banner follows the same switch.
  const banner = await page.locator("section.camp-banner").count();
  expect(banner > 0).toBe(SUMMER_CAMP_ENABLED);
});

test("the Summer Camp page exists and works whether or not the switch is on", async ({ page, collected }) => {
  const res = await page.goto("summer-camp");
  expect(res?.status()).toBe(200);
  await settle(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(new URL(page.url()).pathname).toMatch(/\/summer-camp\/$/);
  expect(collected.errors).toEqual([]);
});

// A second dropdown inside a dropdown (Apps under Resources): hover the tab, then the item, then pick a link.
for (const tab of NAV) {
  for (const group of (tab.children ?? []).filter(isGroup)) {
    for (const item of group.children) {
      test(`"${tab.label}" > "${group.label}" > "${item.label}" opens ${item.href}`, async ({ page }) => {
        await page.goto("./");
        await settle(page);
        await nav(page).locator(`li[data-page="${tab.id}"]`).hover();
        await nav(page).locator(`li[data-page="${tab.id}"] li.sub-group`, { hasText: group.label }).hover();
        await nav(page).locator(`li[data-page="${tab.id}"] ul.sub2 a`, { hasText: item.label }).first().click();
        await page.waitForURL((u) => normPath(sitePath(u.pathname)) === normPath(item.href));
      });
    }
  }
}
