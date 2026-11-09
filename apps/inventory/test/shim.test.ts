// The page assembly (shim/assemble.ts) and the google.script stub (shim/google-script-stub.js).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { BOOT_JSON, UI_INCLUDES, assembleIndex, uiName } from "../shim/assemble.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const uiDir = join(here, "../ui");
const original = join(here, "../../../backend/apps-script/inventory");
const readUi = (dir: string) => Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".html")).map((f) => [f, readFileSync(join(dir, f), "utf8")]));

describe("original UI files", () => {
  it("are copies of the Apps Script project's HTML files (team6220.org changes are marked)", () => {
    const ui = readUi(uiDir);
    const src = readUi(original);
    expect(Object.keys(ui).sort()).toEqual(Object.keys(src).sort());
    for (const [name, text] of Object.entries(ui)) {
      // Any change made for the new site must carry a "team6220.org:" comment (see apps/inventory/README.md).
      if (text !== src[name]) expect(text, `${name} differs from the original without a team6220.org: note`).toContain("team6220.org:");
    }
  });
});

describe("assembleIndex", () => {
  it("fills in every include and the boot data, like Apps Script", () => {
    const files = readUi(uiDir);
    const page = assembleIndex(files);
    expect(page.head).toContain("<base target=\"_top\">");
    expect(page.head).toContain("@font-face");
    expect(page.head).toContain("--"); // Styles.html custom properties
    expect(page.body).toContain('<div id="app" class="app">');
    expect(page.body).toContain(`window.BOOT = ${BOOT_JSON};`);
    expect(page.body).toContain("const BRAND = {");
    expect(page.body).toContain("App.start();");
    for (const name of UI_INCLUDES) {
      const src = files[`${name}.html`];
      expect(page.head.includes(src) || page.body.includes(src), `${name} included verbatim`).toBe(true);
    }
    expect(page.head + page.body).not.toMatch(/<\?/);
    // Scripts keep their original order.
    const order = ["const BRAND", "const App = {", "App.views.parts", "App.views.settings", "App.start();"].map((s) => page.body.indexOf(s));
    expect(order.every((x) => x >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("refuses unknown includes, missing files and other scriptlets", () => {
    const index = (inner: string) => ({ "Index.html": `<html><head></head><body>${inner}</body></html>` });
    expect(() => assembleIndex(index("<?!= include('Secrets'); ?>"))).toThrow(/isn't an allowed/);
    expect(() => assembleIndex(index("<?!= include('JsCore'); ?>"))).toThrow(/missing/);
    expect(() => assembleIndex(index("<?= user ?>"))).toThrow(/scriptlet/);
    expect(assembleIndex({ ...index("<?!= include('Brand'); ?>"), "Brand.html": "$& $1 brand" }).body).toBe("$& $1 brand");
    expect(uiName("../../ui/JsCore.html")).toBe("JsCore");
  });
});

describe("google.script stub", () => {
  const stubSrc = readFileSync(join(here, "../shim/google-script-stub.js"), "utf8");

  function load(search = "?a=1&a=2&b=3") {
    const window: Record<string, unknown> = {};
    const ctx = { window, location: { origin: "https://dev.team6220.org", search, hash: "#x" }, URLSearchParams, Proxy, Promise, console, Error };
    runInNewContext(stubSrc, ctx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return window as any;
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("queues calls until attached, then answers them with the chained handlers", async () => {
    const w = load();
    const got: unknown[] = [];
    const runner = w.google.script.run.withSuccessHandler((r: unknown, u: unknown) => got.push(["ok", r, u])).withUserObject("U");
    runner.apiGetAll();
    w.google.script.run.withFailureHandler((e: Error) => got.push(["fail", e.message])).apiBroken(1);
    await tick();
    expect(got).toEqual([]);
    const seen: unknown[] = [];
    w.__ggiInventory.attach(async (name: string, args: unknown[]) => {
      seen.push([name, args]);
      if (name === "apiBroken") throw new Error("offline");
      return { ok: true, data: 42 };
    });
    await tick();
    expect(seen).toEqual([["apiGetAll", []], ["apiBroken", [1]]]);
    expect(got).toEqual([["ok", { ok: true, data: 42 }, "U"], ["fail", "offline"]]);
    // after attaching, calls go straight through (still asynchronously)
    runner.apiGetChanges({ parts: 1 });
    expect(got).toHaveLength(2);
    await tick();
    expect(seen.at(-1)).toEqual(["apiGetChanges", [{ parts: 1 }]]);
    expect(got).toHaveLength(3);
  });

  it("each with...() makes a new runner; runners aren't thenable", () => {
    const w = load();
    const base = w.google.script.run;
    const a = base.withSuccessHandler(() => {});
    expect(a).not.toBe(base);
    expect(base.then).toBeUndefined();
    expect(typeof base.anyFunctionName).toBe("function");
  });

  it("provides google.script.host / url / history", () => {
    const w = load();
    let loc: unknown;
    w.google.script.url.getLocation((l: unknown) => (loc = l));
    expect(loc).toEqual({ hash: "x", parameter: { a: "1", b: "3" }, parameters: { a: ["1", "2"], b: ["3"] } });
    expect(() => w.google.script.host.close()).not.toThrow();
    expect(w.google.script.host.origin).toBe("https://dev.team6220.org");
    expect(() => w.google.script.history.push({}, {}, "")).not.toThrow();
  });
});
