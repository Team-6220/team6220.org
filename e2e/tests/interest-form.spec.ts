// The Join page's newsletter signup posts to Wix Forms. Wix is mocked here: we check what the page sends and what it shows.
import { expect, settle, test } from "../helpers";

const SUBMIT = "**/form-submission-service/v4/submissions";

test.describe("newsletter signup (join page)", () => {
  test("sends the answers to the Wix form and says thanks", async ({ page }) => {
    let sent: { submission: { formId: string; submissions: Record<string, unknown> } } | undefined;
    await page.route("**/oauth2/token", (route) => route.fulfill({ json: { access_token: "visitor-token" } }));
    await page.route(SUBMIT, (route) => {
      sent = route.request().postDataJSON();
      return route.fulfill({ json: { submission: { id: "s1" } } });
    });
    await page.goto("about/join");
    await settle(page);
    await page.getByLabel("Name").fill("Alex Griffin");
    await page.getByLabel("Email").fill("alex@example.com");
    await page.getByLabel("Programming").check();
    await page.getByLabel("Manufacturing").check();
    await page.getByLabel("Parent or guardian").check();
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.locator("#form-ok")).toContainText("Thanks, Alex!");
    expect(sent?.submission.submissions).toMatchObject({ name_a1c2: "Alex Griffin", email_b2d3: "alex@example.com", interests_e5a6: ["Manufacturing", "Programming"], is_parent_d4f5: true });
  });

  test("says so when Wix refuses the form", async ({ page }) => {
    await page.route("**/oauth2/token", (route) => route.fulfill({ json: { access_token: "visitor-token" } }));
    await page.route(SUBMIT, (route) => route.fulfill({ status: 403, json: {} }));
    await page.goto("about/join");
    await settle(page);
    await page.getByLabel("Name").fill("Alex Griffin");
    await page.getByLabel("Email").fill("alex@example.com");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.locator("#form-ok")).toContainText("was not sent");
  });
});
