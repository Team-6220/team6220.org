// The /apps dashboard, the sign-in gates of the member apps, and the demo (mock) modes.
//
// "Production" build (dist/, what is deployed): inventory talks to Wix, so signed-out visitors get the sign-in prompt.
// "Mock" build (dist-mock/, built with PUBLIC_INVENTORY_BACKEND=mock): inventory runs on made-up data and understands
// ?demo=signed-out|pending (see apps/inventory/shim and packages/data/src/inventory/index.ts).
import { APPS } from "../../apps/dashboard/src/apps";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DIST, expect, MOCK_ORIGIN, settle, test } from "../helpers";

test.describe("/apps dashboard (signed out)", () => {
  test("shows the sign-in prompt, and the public app cards", async ({ page, collected }) => {
    await page.goto("apps");
    await settle(page);
    await expect(page.getByRole("heading", { level: 1, name: "Team apps" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in to use team apps" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^sign in$/i }).or(page.getByRole("link", { name: /^sign in$/i }))).toBeVisible();
    // Signed out, the grid lists the live public apps only.
    const publicLive = APPS.filter((a) => a.access === "public" && a.status === "live");
    expect(publicLive.length).toBeGreaterThan(0);
    for (const a of publicLive) {
      const card = page.locator(`a.card[href="${a.href}"]`);
      await expect(card).toBeVisible();
      await expect(card.locator(".card__name")).toHaveText(a.name);
      await expect(card.locator(".card__desc")).toHaveText(a.description);
    }
    await expect(page.locator("a.card")).toHaveCount(publicLive.length);
    expect(collected.errors).toEqual([]);
  });

  test("the built dashboard contains every app in apps.ts (member-only and planned cards show after sign-in)", async () => {
    // Signed out, only the public cards render, and signing in needs Wix. So check the other cards against the
    // dashboard's built JavaScript: every app's name, description and route must be in it.
    const dir = join(DIST, "_astro");
    const bundle = readdirSync(dir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    for (const a of APPS) {
      expect(bundle, `app "${a.id}"`).toContain(JSON.stringify(a.name).slice(1, -1));
      expect(bundle, `app "${a.id}" description`).toContain(JSON.stringify(a.description).slice(1, -1));
      if (a.status === "live") expect(bundle, `app "${a.id}" route`).toContain(a.href as string);
    }
  });
});

test.describe("member apps, signed out", () => {
  test("/apps/attendance shows the sign-in prompt", async ({ page, collected }) => {
    await page.goto("apps/attendance");
    await settle(page);
    await expect(page.getByRole("heading", { level: 1, name: "Attendance" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in to see attendance" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to team apps" })).toHaveAttribute("href", "/apps");
    expect(collected.errors).toEqual([]);
  });

  test("/apps/inventory shows the sign-in prompt with a link to /apps", async ({ page, collected }) => {
    await page.goto("apps/inventory");
    await settle(page);
    await expect(page.getByText("Sign in to use the inventory")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in at team apps" })).toHaveAttribute("href", "/apps");
    // The real inventory UI must stay hidden until someone is signed in.
    await expect(page.locator("#app")).toBeHidden();
    expect(collected.errors).toEqual([]);
  });

  test("the production build ignores ?demo= for inventory (it only works on mock builds)", async ({ page }) => {
    await page.goto("apps/inventory?demo=member");
    await settle(page);
    await expect(page.getByText("Sign in to use the inventory")).toBeVisible();
  });
});

test.describe("attendance ?demo= modes (work on the deployed build)", () => {
  const cases: [string, RegExp | string][] = [
    ["signed-out", "Sign in to see attendance"],
    ["pending", "Waiting for approval"],
  ];
  for (const [mode, heading] of cases) {
    test(`?demo=${mode}`, async ({ page, collected }) => {
      await page.goto(`apps/attendance?demo=${mode}`);
      await settle(page);
      await expect(page.getByRole("note")).toContainText(`Demo mode (${mode})`);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      expect(collected.errors).toEqual([]);
    });
  }

  test("?demo=member shows the member view, ?demo=off leaves demo mode", async ({ page, collected }) => {
    await page.goto("apps/attendance?demo=member");
    await settle(page);
    await expect(page.getByRole("note")).toContainText("Demo mode (member)");
    await expect(page.getByRole("heading", { name: "Sign in to see attendance" })).toHaveCount(0);
    await page.getByRole("link", { name: "Leave demo" }).click();
    await settle(page);
    await expect(page.getByRole("heading", { name: "Sign in to see attendance" })).toBeVisible();
    expect(collected.errors).toEqual([]);
  });
});

test.describe("inventory ?demo= modes (mock build)", () => {
  test("default: a demo team member sees the real inventory app with made-up data", async ({ page, collected }) => {
    await page.goto(`${MOCK_ORIGIN}apps/inventory`);
    await settle(page);
    await expect(page.locator("html")).toHaveAttribute("data-ggi", "ready");
    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator("#ggi-gate")).toBeHidden();
    await expect(page.getByText(/Demo data: changes aren.t saved/)).toBeVisible();
    expect(collected.errors).toEqual([]);
  });

  test("?demo=signed-out shows the sign-in prompt", async ({ page, collected }) => {
    await page.goto(`${MOCK_ORIGIN}apps/inventory?demo=signed-out`);
    await settle(page);
    await expect(page.getByText("Sign in to use the inventory")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in at team apps" })).toHaveAttribute("href", "/apps");
    await expect(page.locator("#app")).toBeHidden();
    expect(collected.errors).toEqual([]);
  });

  test("?demo=pending says the account is waiting for approval", async ({ page, collected }) => {
    await page.goto(`${MOCK_ORIGIN}apps/inventory?demo=pending`);
    await settle(page);
    await expect(page.getByText("Waiting for approval")).toBeVisible();
    await expect(page.getByText(/signed in as New member/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to team apps" })).toHaveAttribute("href", "/apps");
    await expect(page.locator("#app")).toBeHidden();
    expect(collected.errors).toEqual([]);
  });
});
