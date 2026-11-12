// Smoke tests of the BUILT site (dist/), served by e2e/serve.mjs.  Run: pnpm build && pnpm test:e2e
import { defineConfig } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.E2E_PORT ?? 4322);
const MOCK_PORT = Number(process.env.E2E_MOCK_PORT ?? 4323);
const BASE = (process.env.E2E_BASE ?? "/").replace(/\/?$/, "/");

/**
 * Which Chromium to use. In CI, `playwright install chromium` puts the right one where Playwright looks and this
 * returns undefined. In sandboxes that ship another Chromium build (PLAYWRIGHT_BROWSERS_PATH), it is picked up
 * from there. Override with E2E_CHROMIUM=/path/to/chrome.
 */
function chromiumPath(): string | undefined {
  if (process.env.E2E_CHROMIUM) return process.env.E2E_CHROMIUM;
  if (process.env.CI) return undefined;
  const dirs = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(process.env.HOME ?? "", ".cache/ms-playwright")].filter(Boolean) as string[];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const entries = readdirSync(dir)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort()
      .reverse();
    for (const e of entries) {
      for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
        const p = join(dir, e, sub);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

const executablePath = chromiumPath();

export default defineConfig({
  testDir: "./tests",
  outputDir: "../test-results/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 30_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "../playwright-report" }]] : "list",
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}${BASE}`,
    trace: "retain-on-failure",
    launchOptions: { ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox"] },
  },
  // dist/ is the deployed build. dist-mock/ is the same site with the inventory on made-up data (pnpm build:e2e-mock).
  webServer: [
    {
      command: `node e2e/serve.mjs dist ${PORT}`,
      cwd: "..",
      url: `http://127.0.0.1:${PORT}${BASE}`,
      env: { E2E_BASE: BASE },
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
    },
    {
      command: `node e2e/serve.mjs dist-mock ${MOCK_PORT}`,
      cwd: "..",
      url: `http://127.0.0.1:${MOCK_PORT}${BASE}`,
      env: { E2E_BASE: BASE },
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
    },
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } }],
});
