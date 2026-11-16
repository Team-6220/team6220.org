// The cookie notice (docs/PHASE-2.md). Wix's consent manager is faked here: on Wix hosting it comes from Wix's scripts.
import { expect, settle, test } from "../helpers";

function fakeManager(initial: { defaultPolicy: boolean }) {
  return () => {
    const calls: Record<string, boolean>[] = [];
    (window as any).__consentCalls = calls;
    (window as any).consentPolicyManager = {
      getCurrentConsentPolicy: () => ({ defaultPolicy: (window as any).__defaultPolicy, policy: {} }),
      setConsentPolicy: (policy: Record<string, boolean>) => {
        calls.push(policy);
        (window as any).__defaultPolicy = false;
      },
    };
    void initial;
  };
}

test.describe("cookie notice", () => {
  test("does nothing where there is no consent manager (the static build)", async ({ page }) => {
    await page.goto("/about/join/");
    await settle(page);
    await expect(page.getByRole("region", { name: "Cookies" })).toHaveCount(0);
  });

  test("keeps analytics off until the visitor chooses, then remembers the choice", async ({ page }) => {
    await page.addInitScript(() => { (window as any).__defaultPolicy = true; });
    await page.addInitScript(fakeManager({ defaultPolicy: true }));
    await page.goto("/about/join/");
    await settle(page);

    const notice = page.getByRole("region", { name: "Cookies" });
    await expect(notice).toBeVisible();
    // Until the visitor chooses, everything except essential cookies is off.
    expect(await page.evaluate(() => (window as any).__consentCalls)).toEqual([{ functional: false, analytics: false, advertising: false, dataToThirdParty: false }]);

    await notice.getByRole("button", { name: "Allow analytics" }).click();
    await expect(notice).toHaveCount(0);
    expect((await page.evaluate(() => (window as any).__consentCalls)).at(-1)).toEqual({ functional: true, analytics: true });

    // Next page load: the notice stays away.
    await page.goto("/sponsors/");
    await settle(page);
    await expect(page.getByRole("region", { name: "Cookies" })).toHaveCount(0);
  });

  test("\"No thanks\" keeps everything off and closes the notice", async ({ page }) => {
    await page.addInitScript(() => { (window as any).__defaultPolicy = true; });
    await page.addInitScript(fakeManager({ defaultPolicy: true }));
    await page.goto("/");
    await settle(page);
    const notice = page.getByRole("region", { name: "Cookies" });
    await notice.getByRole("button", { name: "No thanks" }).click();
    await expect(notice).toHaveCount(0);
    expect((await page.evaluate(() => (window as any).__consentCalls)).at(-1)).toEqual({ functional: false, analytics: false, advertising: false, dataToThirdParty: false });
  });

  test("a visitor who already chose is not asked again, and their choice is not overwritten", async ({ page }) => {
    await page.addInitScript(() => { (window as any).__defaultPolicy = false; });
    await page.addInitScript(fakeManager({ defaultPolicy: false }));
    await page.goto("/");
    await settle(page);
    expect(await page.evaluate(() => (window as any).__consentCalls)).toEqual([]);
  });
});
