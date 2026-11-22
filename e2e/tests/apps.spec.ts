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
    await expect(page.getByRole("button", { name: /^sign in with google$/i })).toBeVisible();
    // Signed out, the cards list the live public apps only.
    const publicLive = APPS.filter((a) => a.access === "public" && a.status === "live");
    expect(publicLive.length).toBeGreaterThan(0);
    for (const a of publicLive) {
      const card = page.locator(".k-card").filter({ has: page.locator(`a[href="${a.href}"]`) });
      await expect(card).toBeVisible();
      await expect(card.locator(".k-card-title")).toHaveText(a.name);
      await expect(card.locator(".k-card-line")).toHaveText(a.description);
    }
    // And the Calendar, whose public view anyone can open.
    await expect(page.locator(".k-card").filter({ has: page.locator('a[href="/apps/calendar"]') }).locator(".k-card-title")).toHaveText("Calendar");
    await expect(page.locator(".k-card")).toHaveCount(publicLive.length + 1);
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
  test("/apps/attendance, with no team server (this build), opens the made-up demo like the other ops apps", async ({ page, collected }) => {
    await page.goto("apps/attendance");
    await settle(page);
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
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

test.describe("attendance ?demo= modes", () => {
  const cases: [string, string][] = [
    ["signed-out", "Sign in to see meeting attendance."],
    ["pending", "Attendance opens once a web admin approves your account"],
  ];
  for (const [mode, text] of cases) {
    test(`?demo=${mode}`, async ({ page, collected }) => {
      await page.goto(`apps/attendance?demo=${mode}`);
      await settle(page);
      await expect(page.getByText(text)).toBeVisible();
      expect(collected.errors).toEqual([]);
    });
  }

  test("?demo=member shows who is here today, without the kiosk button", async ({ page, collected }) => {
    await page.goto("apps/attendance?demo=member");
    await settle(page);
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open kiosk" })).toHaveCount(0);
    expect(collected.errors).toEqual([]);
  });

  test("?demo=member opens every screen it should, and not the kiosk", async ({ page, collected }) => {
    for (const [view, heading] of [["mine", "Did I sign in?"], ["hours", "My hours"], ["past", "Past meetings"], ["stats", "Stats"]]) {
      await page.goto(`apps/attendance/${view}?demo=member`);
      await settle(page);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
    await page.goto("apps/attendance/kiosk?demo=member");
    await settle(page);
    await expect(page.getByText("Only Attendance Admins can open the kiosk.")).toBeVisible();
    expect(collected.errors).toEqual([]);
  });

  test("?demo=attendance opens the kiosk and signs students in and out, by typing or with Random quick sign in", async ({ page, collected }) => {
    await page.goto("apps/attendance/kiosk?demo=attendance");
    await settle(page);
    await page.getByRole("button", { name: "Open kiosk" }).click();
    await page.getByLabel("Scan your ID card or type your student ID").fill("4829173650");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Welcome, Ada!")).toBeVisible();
    await page.getByRole("tab", { name: "Sign out (leaving early)" }).click();
    await page.getByLabel("Scan your ID card or type your student ID").fill("4829173650");
    await page.keyboard.press("Enter");
    await expect(page.getByText("See you next time, Ada!")).toBeVisible();
    // The ID box always has the cursor: clicking the page background doesn't take it away.
    await page.getByRole("heading", { level: 1, name: "Take attendance" }).click();
    await expect(page.getByLabel("Scan your ID card or type your student ID")).toBeFocused();
    // Random quick sign in (only on the Sign in tab): five random IDs, no names. Clicking one is the same as scanning it.
    await expect(page.locator(".att-quick button")).toHaveCount(0);
    await page.getByRole("tab", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".att-quick button")).toHaveCount(5);
    await page.locator(".att-quick button").first().click();
    await expect(page.getByText(/^Welcome, /)).toBeVisible();
    await page.getByRole("button", { name: "Close kiosk" }).click();
    await expect(page.getByRole("button", { name: "Open kiosk" })).toBeVisible();
    expect(collected.errors).toEqual([]);
  });
});

test.describe("linking a student ID (demo)", () => {
  test("Account lets someone already in link their student ID to the roster", async ({ page, collected }) => {
    await page.goto("apps/account?demo=lead");
    await settle(page);
    await expect(page.getByRole("heading", { name: "Link my student ID" })).toBeVisible();
    await page.getByLabel("Student ID").fill("4829173650");
    await page.getByLabel("Last name", { exact: true }).last().fill("Wrong");
    await page.getByRole("button", { name: "Link", exact: true }).click();
    await expect(page.getByText("We couldn't find that student ID with that last name on the roster.")).toBeVisible();
    await page.getByLabel("Last name", { exact: true }).last().fill("Lovelace");
    await page.getByRole("button", { name: "Link", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Link my student ID" })).toHaveCount(0);
    await expect(page.getByText("4829173650")).toBeVisible();
    expect(collected.errors).toEqual([]);
  });
});

test.describe("rsvp ?demo= modes", () => {
  test("a member sees the open forms and answers one: a Maybe saves but doesn't finish it", async ({ page, collected }) => {
    await page.goto("apps/rsvp?demo=member");
    await settle(page);
    await expect(page.getByRole("heading", { level: 1, name: "Open forms" })).toBeVisible();
    await expect(page.getByText("Answered: coming")).toBeVisible();
    await page.getByRole("link", { name: "Beach Blitz" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Beach Blitz · RSVP" })).toBeVisible();
    // Everything answered with a Yes (or the first choice), except one day that is a Maybe.
    for (const group of await page.locator(".rsvp-q").all()) await group.locator('input[type="radio"]').first().check();
    await page.locator(".rsvp-q").nth(1).getByLabel("Maybe").check();
    await page.getByLabel("Anything you have to miss?").fill("N/A");
    await page.getByRole("button", { name: "Send my answer" }).click();
    await expect(page.getByText(/Saved, but the form isn't finished/)).toBeVisible();
    await page.locator(".rsvp-q").nth(1).getByLabel("Yes, I'm coming").check();
    await page.getByRole("button", { name: "Send my answer" }).click();
    await expect(page.getByText("Saved. Thank you!")).toBeVisible();
    await page.waitForURL(/\/apps\/rsvp\/?$/);
    await expect(page.getByText("Answered: coming").first()).toBeVisible();
    // A member can't open the lead screens.
    await page.goto("apps/rsvp/manage?demo=member");
    await settle(page);
    await expect(page.getByText("Only leads can do this.")).toBeVisible();
    expect(collected.errors).toEqual([]);
  });

  test("everyone sees who's coming; only leads, mentors and boosters see what people have to miss", async ({ page, collected }) => {
    await page.goto("apps/rsvp/results?demo=member");
    await settle(page);
    await expect(page.getByRole("heading", { level: 1, name: "Who's coming" })).toBeVisible();
    await expect(page.getByText("What people have to miss")).toHaveCount(0);
    await page.goto("apps/rsvp/results?demo=lead");
    await settle(page);
    await expect(page.getByText("What people have to miss (leads, mentors and boosters only)")).toBeVisible();
    expect(collected.errors).toEqual([]);
  });

  test("a lead makes and publishes a form from a calendar event, and sets the reminders", async ({ page, collected }) => {
    await page.goto("apps/rsvp/manage?demo=lead");
    await settle(page);
    await expect(page.getByRole("heading", { level: 1, name: "Manage forms" })).toBeVisible();
    await page.getByRole("link", { name: "New form" }).first().click();
    const lakewood = await page.getByLabel("Calendar event").locator("option", { hasText: "Lakewood scrimmage" }).getAttribute("value");
    await page.getByLabel("Calendar event").selectOption(lakewood!);
    await page.getByLabel("Answer by").fill(new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10));
    await page.getByRole("button", { name: "+ Add a question" }).click();
    await page.getByLabel("Question", { exact: true }).fill("Can you drive?");
    await page.getByRole("button", { name: "Publish to the whole team" }).click();
    await page.waitForURL(/\/apps\/rsvp\/manage/);
    // Demo data lives in the page, so the saved form is gone after the reload; the server tests cover that it is kept.
    await expect(page.getByRole("heading", { level: 1, name: "Manage forms" })).toBeVisible();
    await page.goto("apps/rsvp/reminders?demo=lead");
    await settle(page);
    await expect(page.getByText("The morning it is due").first()).toBeVisible();
    await page.getByLabel("Days before the answer-by date").fill("5");
    await page.getByRole("button", { name: "+ Add a reminder" }).click();
    await expect(page.getByText("5 days before").first()).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved");
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
