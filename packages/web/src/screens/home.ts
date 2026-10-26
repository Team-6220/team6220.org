import { APP_NAME, BASE_PATH, REPO_URL, TEAM_NUMBER } from "../config.js";
import { navigate } from "../router.js";
import { session } from "../app-state.js";
import { h, title } from "../ui/dom.js";

export function homeScreen(main: HTMLElement): void {
  const half = Math.ceil(APP_NAME.length / 2);
  const g = session.game.game;
  main.append(
    h(
      "section",
      { class: "hero" },
      h("img", { src: `${BASE_PATH}brand/6220-wings-gold.svg`, alt: `FRC Team ${TEAM_NUMBER} wings logo` }),
      h("h1", null, APP_NAME.slice(0, half).toUpperCase(), h("span", null, APP_NAME.slice(half).toUpperCase())),
      h(
        "p",
        { class: "tagline" },
        "An open-source, browser-based 2D FRC strategy and design simulator. Define real robot geometry, drive it with an Xbox controller or simulated drivers, and find out which archetype wins.",
      ),
      h("div", { class: "row center" },
        h("button", { class: "btn primary big", onclick: () => navigate("/play") }, "Play a match"),
        h("button", { class: "btn big", onclick: () => navigate("/rules") }, "Rule coverage"),
      ),
      h("p", { class: "muted small" }, `Game: ${g.name} ${g.year} (module v${g.version}, manual ${g.manualVersion})`),
    ),
    h(
      "div",
      { class: "grid3", style: "max-width: 1000px; margin: 12px auto 0;" },
      feature("Geometry drives behavior", "Intake side, shooter direction, and robot height decide cycle times through physics, not hand-typed numbers."),
      feature("Thin yearly game module", "Everything season-specific is data plus small reviewed hooks. The core is never edited at kickoff."),
      feature("Humans and agents", "Drive with an Xbox controller, or let parameterized simulated drivers play the other robots."),
    ),
    h(
      "div",
      { class: "panel hint", style: "max-width: 1000px; margin: 16px auto 0;" },
      title("h2", "Stay Gold"),
      h("p", { style: "margin:0" }, "Built to stay useful season after season: a new game is a new module, not a rewrite."),
    ),
    h(
      "footer",
      { style: "text-align:center; margin: 24px 0 8px;" },
      title("div", `FRC Team ${TEAM_NUMBER}`, { class: "gold", style: "font-size:20px" }),
      h("div", { class: "muted small" }, h("a", { href: REPO_URL, target: "_blank", rel: "noopener" }, "Source on GitHub"), " · MIT license"),
    ),
  );
}

function feature(head: string, body: string): HTMLElement {
  return h("div", { class: "panel feature" }, h("h3", null, head), h("p", { class: "muted small", style: "margin:0" }, body));
}
