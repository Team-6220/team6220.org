// Starts the original inventory UI on the new site.
//
// The page (src/pages/apps/inventory/index.astro) is the original Index.html with its includes, plus:
//   - google-script-stub.js, which defines google.script.run and queues calls until this file attaches;
//   - #ggi-gate, shown instead of the app when there is a message (signed out, not approved, can't load);
//   - the shared page-change loader, which covers the page from the first paint (html[data-pgl-hold]) and is released
//     here once there is something to show: a message, or the first apiGetAll has finished (data or its error);
//   - this module (bundled by Astro / Vite; runs after the original scripts have set up the page).
//
// Here: check the session (signed out -> link to /apps; not approved -> "waiting for approval"), connect to the
// inventory data (Wix on the deployed site, demo data in dev), and answer google.script.run calls with the
// Apps Script API port from @team6220/data.
import {
  connectInventory,
  createScriptApi,
  getInventorySession,
  inventoryBackend,
  type MemberSession,
} from "@team6220/data/inventory";

/** The team apps dashboard, where members sign in (packages/data config APPS_HOME_PATH). */
const APPS_HOME = "/apps";

interface Stub {
  attach(dispatch: (name: string, args: unknown[]) => Promise<unknown>): void;
}

// From the original UI (JsCore.html / Brand.html). Classic-script globals, so they can be undefined if a script failed.
interface OriginalApp {
  on(evt: string, fn: (data: unknown) => void): void;
  toast(message: string, opts?: { type?: string; timeout?: number }): void;
}
declare global {
  interface Window {
    __ggiInventory?: Stub;
    /** Shared page-change loader (packages/assets/scripts/page-loader.js); absent if its script did not load. */
    G6220Loader?: { release(): void };
  }
}
declare const App: OriginalApp | undefined;
declare const BRAND: { wings?: string } | undefined;

const root = document.documentElement;
const gate = document.getElementById("ggi-gate");

/** Lets the shared loader reveal the page. Without the loader script (or after it gave up) there is nothing to release. */
function releaseLoader(): void {
  if (window.G6220Loader) window.G6220Loader.release();
  else root.classList.remove("pgl-arrive", "mh-logo");
  root.removeAttribute("data-pgl-hold"); // the original boot screens may show again
}

/**
 * The first apiGetAll is done when the original UI has taken its "Loading inventory…" out of #main: it renders the
 * parts view on success, or "Can’t load the inventory" + Try again on failure. Release the loader then.
 * (The UI's own App.on("started") only fires on success.)
 */
function releaseWhenFirstLoadDone(): void {
  const main = document.getElementById("main");
  const loading = () => main?.querySelector(":scope > .loading");
  if (!main || !loading()) return releaseLoader();
  const done = () => {
    obs.disconnect();
    // After the UI's own render of that result, not in the middle of it.
    requestAnimationFrame(releaseLoader);
  };
  const obs = new MutationObserver(() => {
    if (!loading()) done();
  });
  obs.observe(main, { childList: true });
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...kids: (Node | string | null)[]) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "text") n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const k of kids) if (k !== null) n.append(k);
  return n;
}

/** A message in place of the app, styled with the original UI's own classes. */
function showGate(title: string, text: string, action: HTMLElement | null, extra: HTMLElement | null = null): void {
  root.dataset.ggi = "gate";
  releaseLoader();
  if (!gate) return;
  const wings = typeof BRAND !== "undefined" && BRAND?.wings ? h("img", { class: "ggi-gate-wings", src: BRAND.wings, alt: "Team 6220 Golden Griffins" }) : null;
  gate.replaceChildren(
    h(
      "div",
      { class: "page" },
      h("div", { class: "empty-state" }, wings, h("div", { class: "big", text: title }), h("p", { text }), extra, action),
    ),
  );
}

function link(href: string, label: string, primary = true): HTMLElement {
  return h("a", { class: primary ? "btn primary" : "btn", href, text: label });
}

function reloadButton(): HTMLElement {
  const b = h("button", { class: "btn primary", type: "button", text: "Try again" });
  b.addEventListener("click", () => location.reload());
  return b;
}

function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Something went wrong.";
}

async function start(): Promise<void> {
  const stub = window.__ggiInventory;
  if (!stub) throw new Error("The inventory page is missing its google.script stub.");
  const backend = inventoryBackend();

  let session: MemberSession;
  try {
    session = await getInventorySession(backend);
  } catch (e) {
    console.error("[inventory] sign-in check failed", e);
    showGate("Can’t check your sign-in", `${errorText(e)} Check your connection and try again.`, reloadButton());
    return;
  }

  if (!session.loggedIn) {
    showGate(
      "Sign in to use the inventory",
      "The inventory is for Los Al Robotics team members. Sign in on the team apps page, then open Inventory again.",
      link(APPS_HOME, "Sign in at team apps"),
    );
    return;
  }
  if (!session.approved) {
    showGate(
      "Waiting for approval",
      `You’re signed in${session.name ? " as " + session.name : ""}, but a web admin still has to approve your account ` +
        "and give it the Team Member badge. Once that’s done, reload this page.",
      link(APPS_HOME, "Back to team apps", false),
    );
    return;
  }

  let api;
  try {
    api = createScriptApi(await connectInventory(session, backend));
  } catch (e) {
    console.error("[inventory] could not connect", e);
    showGate("Can’t load the inventory", errorText(e), reloadButton());
    return;
  }

  root.dataset.ggi = "ready";
  if (backend === "mock" && typeof App !== "undefined" && App) {
    App.on("started", () => App.toast("Demo data: changes aren’t saved, and reloading the page starts over.", { timeout: 8000 }));
  }
  releaseWhenFirstLoadDone(); // before attach: the UI's queued apiGetAll is answered by attach()
  stub.attach((name, args) => api.call(name, args));
}

start().catch((e) => {
  console.error("[inventory] failed to start", e);
  showGate("Can’t load the inventory", errorText(e), reloadButton());
});
