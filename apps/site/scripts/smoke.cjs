// Browser smoke check of /apps/site in demo (mock) mode. Not part of CI (Playwright isn't a repo dependency).
//
//   pnpm build && pnpm preview --port 4321 &
//   node apps/site/scripts/smoke.cjs            # BASE_URL=http://localhost:4321 by default
//
// Needs `playwright` with Chromium installed (require('playwright') must resolve, e.g. via NODE_PATH).
const { chromium } = require("playwright");
const assert = require("node:assert/strict");

const base = process.env.BASE_URL || "http://localhost:4321";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  // 1. Signed out: asks to sign in, no editor.
  await page.goto(`${base}/apps/site`);
  await page.getByRole("heading", { name: "Sign in to use the Site Manager" }).waitFor();
  assert.equal(await page.getByLabel("Title (with the year)").count(), 0);

  // 2. Demo admin: editor with the current content, demo banner.
  await page.goto(`${base}/apps/site?demo=admin`);
  await page.getByLabel("Title (with the year)").waitFor();
  assert.match(await page.locator(".site__demo").innerText(), /no pull request is opened/);
  assert.equal(await page.getByLabel("Title (with the year)").inputValue(), "2026 Robotics Summer Camps");
  assert.equal(await page.getByRole("button", { name: /^Submit/ }).isDisabled(), true, "nothing changed yet");
  assert.ok((await page.getByRole("link", { name: /pull requests on GitHub/ }).getAttribute("href")).includes("github.com/Team-6220/team6220.org/pulls"));

  // 3. Edit: the change shows up in "What will change".
  await page.getByLabel("Title (with the year)").fill("2027 Robotics Summer Camps");
  await page.getByLabel("Show summer camp on the site").check();
  const diff = await page.getByRole("list", { name: "Changes" }).innerText();
  assert.match(diff, /enabled/);
  assert.match(diff, /2027 Robotics Summer Camps/);

  // 4. Validation: an empty title blocks Submit and says why.
  await page.getByLabel("Title (with the year)").fill("");
  await page.getByText("Fix these before submitting").waitFor();
  assert.equal(await page.getByRole("button", { name: /^Submit/ }).isDisabled(), true);
  await page.getByLabel("Title (with the year)").fill("2027 Robotics Summer Camps");

  // 5. Add and move a block.
  await page.getByRole("button", { name: "Add heading" }).click();
  // The new heading starts empty, so Submit stays off until it has text.
  assert.equal(await page.getByRole("button", { name: /^Submit/ }).isDisabled(), true);
  await page.getByLabel("Heading", { exact: true }).last().fill("A new heading");
  await page.getByRole("button", { name: /^Move Heading \d+ up$/ }).last().click();
  assert.match(await page.getByRole("list", { name: "Changes" }).innerText(), /A new heading/);

  // 6. Submit in demo mode: says so, nothing real.
  await page.getByRole("button", { name: /^Submit/ }).click();
  await page.getByRole("heading", { name: "Demo: no pull request is opened" }).waitFor();
  assert.match(await page.locator(".site__panel--ok").innerText(), /site-manager\/summer-camp-\d{8}-demo-admin/);

  // 7. The dashboard route and the page itself have no script errors.
  assert.deepEqual(errors.filter((e) => !/favicon|Failed to load resource/.test(e)), []);
  await browser.close();
  console.log("site smoke check passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
