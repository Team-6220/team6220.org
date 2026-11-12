// Shared helpers for the smoke tests.
import { test as base, expect, type Page, type Request, type Response } from "@playwright/test";
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { isKnownMissingImage } from "./known-missing-images";

export { expect };

export const ROOT = resolve(import.meta.dirname, "..");
export const DIST = join(ROOT, "dist");
export const DIST_MOCK = join(ROOT, "dist-mock");

/** Port of the second server, which serves the mock-inventory build (see e2e/playwright.config.ts). */
export const MOCK_PORT = Number(process.env.E2E_MOCK_PORT ?? 4323);
export const BASE_PATH = (process.env.E2E_BASE ?? "/").replace(/\/?$/, "/");
export const MOCK_ORIGIN = `http://127.0.0.1:${MOCK_PORT}${BASE_PATH}`;

/** Every page in the build: dist/**\/index.html -> "/", "/about/", "/apps/inventory/" ... (folder form, with a trailing slash). */
export function builtRoutes(dist = DIST): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "index.html") out.push("/" + relative(dist, dir).split(sep).join("/") + (dir === dist ? "" : "/"));
    }
  };
  walk(dist);
  return out.sort();
}

/**
 * Pages made by the Astro site (the main site and the /apps screens). The GoldSim and WingIt apps are imported
 * with their own tooling and their own conventions: they are loaded and link-checked, but held to the same
 * console rules only where noted by the tests.
 */
export const IMPORTED_APP_ROUTES = ["/apps/goldsim/", "/apps/wingit/"];

/** "/about/" and "/about" are the same page. */
export const normPath = (p: string) => (p.replace(/\/+$/, "") || "/");

/** Strip the deployed base path from a pathname, so tests can talk about "/about". */
export function sitePath(pathname: string): string {
  const base = BASE_PATH.replace(/\/$/, "");
  return base && pathname.startsWith(base) ? pathname.slice(base.length) || "/" : pathname;
}

/** isKnownMissingImage for a pathname as the browser sees it (with the deployed base path). */
export const isKnownMissingImageUrl = (pathname: string) => isKnownMissingImage(sitePath(pathname));

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export interface Collected {
  /** console.error() messages and uncaught page errors */
  errors: string[];
  /** Same-site requests that came back 4xx/5xx or failed, that are not in the known-missing-images allow-list */
  failed: string[];
  /** Same-site requests that came back 4xx/5xx and ARE in the allow-list (known missing gallery images, issue #8) */
  allowed: string[];
}

/**
 * The tests are hermetic: requests to other sites (Google Fonts, Wix, images on other hosts) are answered locally
 * and never leave the machine, so a flaky network can't fail a test and nothing real is called.
 */
async function isolate(page: Page): Promise<void> {
  await page.context().route(
    (url) => url.hostname !== "127.0.0.1" && url.hostname !== "localhost",
    (route) => {
      const type = route.request().resourceType();
      if (type === "image") return route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG });
      if (type === "stylesheet") return route.fulfill({ status: 200, contentType: "text/css", body: "" });
      if (type === "script") return route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
      if (type === "font") return route.fulfill({ status: 200, contentType: "font/woff2", body: "" });
      return route.fulfill({ status: 200, contentType: "text/plain", body: "" });
    },
  );
}

function watch(page: Page): Collected {
  const c: Collected = { errors: [], failed: [], allowed: [] };
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // "Failed to load resource: ... 404" has no URL in its text; every such response is checked below, by URL.
    if (/^Failed to load resource/.test(m.text())) return;
    c.errors.push(m.text());
  });
  page.on("pageerror", (e) => c.errors.push(`pageerror: ${e.message}`));
  const bad = (url: string, what: string) => {
    const u = new URL(url);
    (isKnownMissingImage(sitePath(u.pathname)) ? c.allowed : c.failed).push(`${what} ${u.pathname}`);
  };
  page.on("response", (r: Response) => {
    if (r.status() >= 400) bad(r.url(), String(r.status()));
  });
  page.on("requestfailed", (r: Request) => {
    const u = new URL(r.url());
    // ERR_ABORTED is the browser cancelling its own request (a video it stopped streaming, a page it left): not a failure.
    if (r.failure()?.errorText === "net::ERR_ABORTED") return;
    if (u.hostname === "127.0.0.1") bad(r.url(), `failed(${r.failure()?.errorText})`);
  });
  return c;
}

export const test = base.extend<{ collected: Collected; playIntro: boolean }>({
  /** The home page plays a one-time intro per browser session (sessionStorage "g6220-intro"). Tests skip it, to be fast, unless they set `test.use({ playIntro: true })`. */
  playIntro: [false, { option: true }],
  collected: [async ({ page, playIntro }, use) => {
    await isolate(page);
    if (!playIntro) {
      await page.addInitScript(() => {
        try {
          sessionStorage.setItem("g6220-intro", "1");
        } catch {
          /* storage blocked: the intro plays */
        }
      });
    }
    await use(watch(page));
  }, { auto: true }],
});

/** Wait until the page is quiet: loaded, and any client-rendered content (React apps) had time to appear. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

/** Internal links on the current page: [href as written, resolved absolute URL]. */
export async function internalLinks(page: Page): Promise<{ href: string; url: string }[]> {
  return page.evaluate(() => {
    const here = location.origin;
    const seen = new Map<string, string>();
    for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
      const href = a.getAttribute("href") ?? "";
      if (/^(mailto:|tel:|javascript:|data:|blob:)/i.test(href)) continue;
      const url = new URL(href, location.href);
      if (url.origin !== here) continue;
      seen.set(href, url.href);
    }
    return Array.from(seen, ([href, url]) => ({ href, url }));
  });
}
