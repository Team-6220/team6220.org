// The cookie default, with no visible banner (https://github.com/Team-6220/team6220.org/wiki/History-Phase-2). Wix's consent manager is faked here: on Wix hosting it
// comes from Wix's scripts.
import { expect, settle, test } from "../helpers";

function fakeManager() {
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
  };
}

const OFF = { functional: false, analytics: false, advertising: false, dataToThirdParty: false };

test.describe("cookie default", () => {
  test("does nothing where there is no consent manager (the static build), and shows no banner", async ({ page }) => {
    await page.goto("/about/join/");
    await settle(page);
    await expect(page.getByRole("region", { name: "Cookies" })).toHaveCount(0);
  });

  test("keeps everything except essential cookies off, without showing a banner", async ({ page }) => {
    await page.addInitScript(() => { (window as any).__defaultPolicy = true; });
    await page.addInitScript(fakeManager());
    await page.goto("/");
    await settle(page);
    expect(await page.evaluate(() => (window as any).__consentCalls)).toEqual([OFF]);
    await expect(page.getByRole("region", { name: "Cookies" })).toHaveCount(0);
  });

  test("a visitor who already chose has their choice left alone", async ({ page }) => {
    await page.addInitScript(() => { (window as any).__defaultPolicy = false; });
    await page.addInitScript(fakeManager());
    await page.goto("/");
    await settle(page);
    expect(await page.evaluate(() => (window as any).__consentCalls)).toEqual([]);
  });
});
