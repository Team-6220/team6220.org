// Browser smoke check of the Sponsors, Merch and Resources areas in /apps/site (demo mode), including the image
// uploader. Not part of CI (Playwright isn't a repo dependency). Same setup as smoke.cjs:
//
//   pnpm build && pnpm preview --port 4321 &
//   node apps/site/scripts/smoke-areas.cjs      # BASE_URL=http://localhost:4321 by default
const { chromium } = require("playwright");
const assert = require("node:assert/strict");

const base = process.env.BASE_URL || "http://localhost:4321";
// A 1x1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const submit = (page) => page.getByRole("button", { name: /^Submit/ });
const changes = (page) => page.getByRole("list", { name: "Changes" }).innerText();

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(`${base}/apps/site?demo=admin`);
  const area = page.locator("select").first();
  await area.waitFor();

  // Sponsors: current list, text-only sponsor, reorder, upload, limits, submit.
  await area.selectOption({ label: "Sponsors" });
  await page.getByLabel("Name").first().waitFor();
  assert.equal(await page.getByLabel("Name").count(), 9);
  assert.equal(await page.getByLabel("Name").first().inputValue(), "RTX (Raytheon)");
  assert.equal(await submit(page).isDisabled(), true, "nothing changed yet");
  assert.equal(await page.locator(".site__preview").count(), 8, "eight logos have a preview, the text-only sponsor has none");

  await page.getByRole("button", { name: /^Move Sponsor 2 2 up$/ }).click();
  assert.match(await changes(page), /sponsors\[0\]\.name/);

  await page.getByRole("button", { name: "Add sponsor" }).click();
  assert.equal(await submit(page).isDisabled(), true, "a new sponsor needs a name");
  await page.getByLabel("Name").last().fill("Acme Robotics");
  await page.getByLabel("Tier").last().selectOption("Eagle");
  const logo = page.getByLabel("Logo (color)").last();
  await logo.setInputFiles({ name: "acme.png", mimeType: "image/png", buffer: PNG });
  await page.locator(".site__preview").nth(8).waitFor();
  assert.match(await page.locator(".site__image code").last().innerText(), /^[0-9a-f]{10}\.png$/);
  assert.match(await page.locator(".site__panel").innerText(), /New images committed with this change: [0-9a-f]{10}\.png \(1 of 10 allowed\)/);
  assert.match(await changes(page), /Acme Robotics/);

  // Wrong type and too big are refused with a reason; the field keeps its value.
  await logo.setInputFiles({ name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await page.getByRole("alert").filter({ hasText: /isn't a png, jpg/ }).waitFor();
  await logo.setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(2_000_001) });
  await page.getByRole("alert").filter({ hasText: /The limit is 2 MB/ }).waitFor();

  await submit(page).click();
  await page.getByRole("heading", { name: "Demo: no pull request is opened" }).waitFor();
  assert.match(await page.locator(".site__panel--ok").innerText(), /site-manager\/sponsors-\d{8}-demo-admin/);

  // Merch: 11 items, edit a price.
  await area.selectOption({ label: "Merch" });
  await page.getByLabel("Price (as shown)").first().waitFor();
  assert.equal(await page.getByLabel("Price (as shown)").count(), 11);
  assert.equal(await page.getByLabel("Price (as shown)").first().inputValue(), "From $35");
  await page.getByLabel("Price (as shown)").first().fill("From $36");
  assert.match(await changes(page), /items\[0\]\.price.*From \$35.*From \$36/);
  await page.getByLabel("Store link").first().fill("javascript:alert(1)");
  await page.getByText("Fix these before submitting").waitFor();
  assert.equal(await submit(page).isDisabled(), true);
  await page.getByRole("button", { name: "Undo my edits" }).click();
  assert.equal(await submit(page).isDisabled(), true);

  // Resources: 4 links, empty archive; add an archive item.
  await area.selectOption({ label: "Resources and links" });
  await page.getByLabel("Title", { exact: true }).first().waitFor();
  assert.equal(await page.getByLabel("Title", { exact: true }).count(), 4);
  await page.getByRole("button", { name: "Add archive item" }).click();
  assert.equal(await submit(page).isDisabled(), true, "a new archive item needs text");
  const fresh = page.getByLabel("Title", { exact: true }).last();
  await fresh.fill("2026 technical binder");
  await page.getByLabel("Label").last().fill("BINDER");
  await page.getByLabel("Link", { exact: true }).last().fill("https://example.com/binder");
  await page.getByLabel("Description").last().fill("Technical binder");
  assert.match(await changes(page), /archive\[0\]\.title/);

  assert.deepEqual(errors.filter((e) => !/favicon|Failed to load resource/.test(e)), []);
  await browser.close();
  console.log("site areas smoke check passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
