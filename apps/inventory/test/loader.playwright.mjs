// Browser check: Inventory uses the shared page-change loader instead of its own boot screens.
// Not part of `pnpm test` (Playwright and a browser are not project dependencies). Run it by hand:
//
//   PUBLIC_INVENTORY_BACKEND=mock pnpm build && node apps/inventory/test/loader.playwright.mjs
//
// It serves dist/ itself. The mock (demo) build needs no sign-in; ?demo=signed-out and ?demo=pending show the
// other screens. (A normal production build uses Wix and would show the sign-in screen.) Set PLAYWRIGHT_MODULE to the playwright package path if `playwright`
// is not resolvable from here.
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const dist = fileURLToPath(new URL("../../../dist/", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webm": "video/webm", ".mp4": "video/mp4", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };

const server = createServer((req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let f = join(dist, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  else if (!existsSync(f) && existsSync(f + ".html")) f += ".html";
  if (!existsSync(f)) { res.writeHead(404, { "content-type": "text/html" }); res.end("not found"); return; }
  res.writeHead(200, { "content-type": types[extname(f)] || "application/octet-stream" });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

let failed = 0;
const ok = (cond, name, extra = "") => { console.log(`${cond ? "ok  " : "FAIL"} ${name}${extra ? "  " + extra : ""}`); if (!cond) failed++; };
const visible = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);
const loaderOn = (page) => page.evaluate(() => document.getElementById("pgl")?.classList.contains("on") ?? false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Delays the answer to the first apiGetAll, so we can see the cover stay up while the data loads.
const slowFirstLoad = (ms) => `(() => { let v; Object.defineProperty(window, "__ggiInventory", { configurable: true, get: () => v, set: (x) => {
  const attach = x.attach; x.attach = (d) => attach((n, a) => n === "apiGetAll" ? new Promise((r) => setTimeout(() => r(d(n, a)), ${ms})) : d(n, a)); v = x; } }); })();`;

const browser = await chromium.launch();
try {
  // 1. Demo member: loader covers entry, original boot screens stay hidden, then the app is revealed.
  {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(slowFirstLoad(2500));
    await page.goto(`${base}/apps/inventory/`, { waitUntil: "domcontentloaded" });
    await sleep(300);
    ok(await loaderOn(page), "inventory: loader is up at page entry");
    ok(!(await visible(page, "#ggi-gate")), "inventory: no 'Loading inventory…' gate while the loader is up");
    ok(!(await visible(page, "#main > .loading")), "inventory: no in-app .loading while the loader is up");
    await sleep(1900); // t ~ 2.2 s: the spin (1.2 s) is long over, the data (2.5 s) is not
    ok(await loaderOn(page), "inventory: loader stays up until the first apiGetAll finishes");
    ok(!(await visible(page, "#app .page-title")), "inventory: app content is not revealed early");
    await page.waitForFunction(() => !document.getElementById("pgl")?.classList.contains("on"), null, { timeout: 15000 });
    ok(await visible(page, "#app"), "inventory: app visible after the loader");
    ok((await page.locator("#main .page-title").count()) > 0, "inventory: first view rendered under the loader");
    ok(await page.evaluate(() => !document.documentElement.hasAttribute("data-pgl-hold") && !document.documentElement.classList.contains("mh-logo")), "inventory: hold and mh-logo cleared after reveal");
    const land = await page.evaluate(() => { const s = document.querySelector("#pgl-land svg"); const r = s.getBoundingClientRect(); return { op: getComputedStyle(s).opacity, x: r.left, y: r.top, w: r.width }; });
    ok(land.op === "1" && land.x < 40 && land.y < 40 && land.w > 20, "inventory: logo ends in the top-left placeholder", JSON.stringify(land));
    ok(errors.length === 0, "inventory: no page errors", errors.join("; "));
    await page.screenshot({ path: process.env.SHOT_DIR ? join(process.env.SHOT_DIR, "inventory-ready.png") : "/dev/null" }).catch(() => {});
    await page.context().close();
  }

  // 2. Signed out / pending: the messages still show (the loader reveals them).
  for (const [mode, text] of [["signed-out", "Sign in to use the inventory"], ["pending", "Waiting for approval"]]) {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await page.goto(`${base}/apps/inventory/?demo=${mode}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("pgl") && !document.getElementById("pgl").classList.contains("on") && document.documentElement.dataset.ggi === "gate", null, { timeout: 15000 });
    ok(await page.locator("#ggi-gate", { hasText: text }).isVisible(), `inventory ?demo=${mode}: '${text}' is shown`);
    ok(!(await visible(page, "#app")), `inventory ?demo=${mode}: app stays hidden`);
    await page.context().close();
  }

  // 3. Reduced motion: no loader (as on the main site); the original boot screens/app show.
  {
    const page = await (await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1200, height: 800 } })).newPage();
    await page.addInitScript(slowFirstLoad(1500));
    await page.goto(`${base}/apps/inventory/`, { waitUntil: "domcontentloaded" });
    await sleep(400);
    ok(!(await loaderOn(page)) && !(await page.evaluate(() => document.documentElement.classList.contains("pgl-arrive"))), "reduced motion: no loader");
    ok(await visible(page, "#main > .loading"), "reduced motion: the original 'Loading inventory…' screen shows while loading");
    await page.waitForSelector("#main .page-title", { timeout: 15000 });
    ok(await visible(page, "#app"), "reduced motion: app shows");
    await page.context().close();
  }

  // 4. Main site is unchanged: a slow next page plays the loader and lands in the header logo.
  {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await page.route("**/about", async (route) => { if (route.request().resourceType() === "document" || route.request().resourceType() === "fetch") await sleep(900); await route.continue(); });
    await page.goto(`${base}/resources/media`, { waitUntil: "load" });
    await page.addStyleTag({ content: "html.intro-on{}" });
    await page.evaluate(() => sessionStorage.setItem("g6220-intro", "1"));
    await page.locator('a[href="/about"]').first().click();
    let saw = false; // the page changes under us, so poll and tolerate the navigation
    for (let i = 0; i < 40 && !saw; i++) { saw = await loaderOn(page).catch(() => false); await sleep(50); }
    ok(saw, "main site: loader plays when the next page is slow");
    await page.waitForURL("**/about", { timeout: 15000 });
    await page.waitForFunction(() => !document.getElementById("pgl")?.classList.contains("on") && !document.documentElement.classList.contains("mh-logo"), null, { timeout: 15000 });
    ok(Number(await page.evaluate(() => getComputedStyle(document.querySelector(".center-logo svg")).opacity)) === 1, "main site: header logo visible after the loader");
    ok((await page.locator("#pgl-land").count()) === 0, "main site: no placeholder landing element");
    await page.context().close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
