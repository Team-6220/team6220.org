import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import { APP_NAME, BASE_PATH } from "./config.js";
import { $, clear, h } from "./ui/dom.js";
import { currentTheme, initTheme, onThemeChange, themeIconSvg, toggleTheme } from "./ui/theme.js";
import { homeScreen } from "./screens/home.js";
import { setupScreen } from "./screens/setup.js";
import { matchScreen } from "./screens/match.js";
import { rulesScreen } from "./screens/rules.js";
import { editorScreen } from "./screens/editor.js";
import { replayScreen } from "./screens/replay.js";
import { benchmarkScreen } from "./screens/benchmark.js";
import { setRerouter, type Screen } from "./router.js";
import { sfx } from "./audio/sound.js";
import { labRoutes } from "./lab/index.js";

const routes: Record<string, { screen: Screen; nav?: string; flush?: boolean }> = {
  "/": { screen: homeScreen, nav: "/" },
  "/play": { screen: setupScreen, nav: "/play" },
  "/match": { screen: matchScreen, nav: "/play", flush: true },
  "/rules": { screen: rulesScreen, nav: "/rules" },
  "/editor": { screen: editorScreen, nav: "/editor", flush: true },
  "/replay": { screen: replayScreen, nav: "/replay", flush: true },
  "/benchmark": { screen: benchmarkScreen, nav: "/benchmark" },
  ...Object.fromEntries(labRoutes.map((r) => [r.path, { screen: r.render, nav: "/lab/batch" }])),
};

const NAV = [
  { path: "/", label: "Home" },
  { path: "/play", label: "Play" },
  { path: "/editor", label: "Editor" },
  { path: "/replay", label: "Replay" },
  { path: "/lab/batch", label: "Lab" },
  { path: "/rules", label: "Rules" },
  { path: "/benchmark", label: "Benchmark" },
];

let cleanup: (() => void) | void;
let unTheme: (() => void) | undefined;

function currentPath(): string {
  const p = location.hash.replace(/^#/, "") || "/";
  return routes[p] ? p : "/";
}

/** True when this build is served from the team website (team6220.org/apps/goldsim/). */
const ON_TEAM_SITE = BASE_PATH === "/apps/goldsim/";

/** Adds the team website's shared sidebar (all apps, main site link, fullscreen, light/dark, account). */
function loadTeamSidebar(): void {
  document.head.append(h("link", { rel: "stylesheet", href: "/assets/shared/styles/app-sidebar.css" }));
  // The sidebar script needs the other two first, so load them in order.
  const scripts = ["icons.js", "account.js", "app-sidebar.js"].map((file) => h("script", { src: `/assets/shared/scripts/${file}`, async: false }));
  document.head.append(...scripts);
}

function renderTopbar(): void {
  const bar = $("topbar");
  clear(bar);
  const half = Math.ceil(APP_NAME.length / 2);
  const path = currentPath();
  const themeBtn = h("button", { class: "btn icon-btn", title: "Light / dark mode", "aria-label": "Switch between light and dark mode", onclick: () => toggleTheme() });
  themeBtn.innerHTML = themeIconSvg(currentTheme());
  const soundLabel = () => (sfx.enabled ? "Sound on" : "Sound off");
  const soundBtn = h("button", { class: "btn", title: "Turn sound effects on or off", onclick: () => sfx.setEnabled(!sfx.enabled) }, soundLabel());
  const unSound = sfx.onChange(() => (soundBtn.isConnected ? (soundBtn.textContent = soundLabel()) : unSound()));
  unTheme?.();
  unTheme = onThemeChange((t) => (themeBtn.innerHTML = themeIconSvg(t)));
  bar.append(
    h(
      "a",
      { id: "logo", href: "#/", "aria-label": `${APP_NAME} home` },
      h("img", { src: `${BASE_PATH}brand/6220-logo-gold.svg`, alt: "" }),
      h("span", { class: "wordmark" }, APP_NAME.slice(0, half).toUpperCase(), h("span", null, APP_NAME.slice(half).toUpperCase())),
    ),
    h(
      "nav",
      { id: "nav" },
      NAV.map((n) => h("a", { href: `#${n.path}`, class: routes[path]?.nav === n.path ? "sel" : "" }, n.label)),
    ),
    soundBtn,
  );
  if (!ON_TEAM_SITE) bar.append(themeBtn); // on the team site the shared sidebar has the light/dark button
}

function route(): void {
  if (typeof cleanup === "function") cleanup();
  cleanup = undefined;
  const path = currentPath();
  const r = routes[path]!;
  const main = $("main");
  clear(main);
  main.classList.toggle("flush", !!r.flush);
  renderTopbar();
  cleanup = r.screen(main);
}

initTheme();
if (ON_TEAM_SITE) loadTeamSidebar();
setRerouter(route);
window.addEventListener("hashchange", route);
route();
