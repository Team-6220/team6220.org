import { session } from "../app-state.js";
import { h, title } from "../ui/dom.js";

export const STATUS_TAG: Record<string, string> = { implemented: "good", approximated: "warn", not_implemented: "bad" };

export function coverageTable(rules: { id: string; topic: string; status: string; reason?: string }[]): HTMLElement {
  return h(
    "table",
    null,
    h("thead", null, h("tr", null, h("th", null, "Rule"), h("th", null, "Topic"), h("th", null, "Status"), h("th", null, "Notes"))),
    h(
      "tbody",
      null,
      rules.map((r) =>
        h(
          "tr",
          null,
          h("td", { class: "mono" }, r.id),
          h("td", null, r.topic),
          h("td", null, h("span", { class: `tag ${STATUS_TAG[r.status] ?? ""}` }, r.status.replace("_", " "))),
          h("td", { class: "muted small" }, r.reason ?? ""),
        ),
      ),
    ),
  );
}

export function rulesScreen(main: HTMLElement): void {
  const g = session.game;
  const rules = g.rules.rules;
  const count = (s: string) => rules.filter((r) => r.status === s).length;
  main.append(
    h(
      "div",
      { style: "max-width: 1000px; margin: 0 auto;" },
      title("h1", `${g.game.name} rule coverage`),
      h(
        "p",
        { class: "muted" },
        `Rules are implemented best-effort and never block a robot design. Every match result carries this report so you know which rules the numbers reflect. Source: game manual ${g.game.manualVersion}.`,
      ),
      h(
        "div",
        { class: "row", style: "margin-bottom:10px" },
        h("span", { class: "tag good" }, `${count("implemented")} implemented`),
        h("span", { class: "tag warn" }, `${count("approximated")} approximated`),
        h("span", { class: "tag bad" }, `${count("not_implemented")} not implemented`),
      ),
      h("div", { class: "panel" }, coverageTable(rules)),
    ),
  );
}
