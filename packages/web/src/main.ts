import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import { APP_NAME, BASE_PATH } from "./config.js";
import { $, clear, h } from "./ui/dom.js";
import { currentTheme, initTheme, onThemeChange, toggleTheme } from "./ui/theme.js";
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

function renderTopbar(): void {
  const bar = $("topbar");
  clear(bar);
  const half = Math.ceil(APP_NAME.length / 2);
  const path = currentPath();
  const themeBtn = h("button", { class: "btn", title: "Toggle light / dark", onclick: () => toggleTheme() }, currentTheme() === "dark" ? "Light" : "Dark");
  const soundLabel = () => (sfx.enabled ? "Sound on" : "Sound off");
  const soundBtn = h("button", { class: "btn", title: "Turn sound effects on or off", onclick: () => sfx.setEnabled(!sfx.enabled) }, soundLabel());
  const unSound = sfx.onChange(() => (soundBtn.isConnected ? (soundBtn.textContent = soundLabel()) : unSound()));
  unTheme?.();
  unTheme = onThemeChange((t) => (themeBtn.textContent = t === "dark" ? "Light" : "Dark"));
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
    themeBtn,
  );
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
setRerouter(route);
window.addEventListener("hashchange", route);
route();
