import type { BatchResultsFile } from "@goldsim/batch";
import { h } from "../ui/dom.js";
import { exportResultsFile, plannedMatches } from "./files.js";
import { saveNotice } from "./help.js";
import { deleteRun, labHooks, labState, renameRun } from "./util.js";

export function runKind(file: BatchResultsFile): string {
  if (file.settings.random) return "Random alliances";
  if (file.settings.params.length) return `Sweep of ${file.settings.params.length} setting${file.settings.params.length === 1 ? "" : "s"}`;
  return "Lineup comparison";
}

/**
 * The list of runs from this session: open, rename, duplicate the settings, export, delete.
 * Runs live in this browser tab only until exported (cloud saving arrives with team workspaces).
 */
export function runsPanel(opts: { onOpen: (index: number) => void; onChange: () => void; selected?: number }): HTMLElement {
  const runs = labState.runs;
  if (!runs.length)
    return h("div", { class: "panel col" }, h("h2", null, "Your runs"), h("p", { class: "small muted" }, "Finished runs show up here so you can reopen, rename, or repeat them. Nothing yet."), saveNotice());
  return h(
    "div",
    { class: "panel col" },
    h("h2", null, "Your runs"),
    h("p", { class: "small muted" }, "Give each run a name you will recognize. Click a name to rename it."),
    h(
      "div",
      { class: "lab-scroll" },
      h(
        "table",
        null,
        h("thead", null, h("tr", null, ["Name", "Kind", "Date", "Matches", ""].map((c) => h("th", null, c)))),
        h(
          "tbody",
          null,
          runs.map((file, i) => {
            const total = plannedMatches(file);
            return h(
              "tr",
              { class: i === opts.selected ? "sel" : "" },
              h(
                "td",
                null,
                h("input", {
                  class: "lab-name",
                  type: "text",
                  value: file.name,
                  "aria-label": "Run name",
                  onchange: (e: Event) => {
                    renameRun(file, (e.target as HTMLInputElement).value);
                    opts.onChange();
                  },
                }),
              ),
              h("td", { class: "small" }, runKind(file)),
              h("td", { class: "small" }, file.createdAt.slice(0, 16).replace("T", " ")),
              h("td", { class: "small num" }, `${file.results.length}${file.results.length < total ? ` of ${total}` : ""}`),
              h(
                "td",
                null,
                h(
                  "div",
                  { class: "controls" },
                  h("button", { class: "btn small", onclick: () => opts.onOpen(i) }, "Open"),
                  h("button", { class: "btn small", title: "Load this run's settings into the Batch form to repeat or tweak it", onclick: () => labHooks.duplicateSettings?.(file) }, "Duplicate settings"),
                  h("button", { class: "btn small", title: "Download this run to your computer", onclick: () => exportResultsFile(file) }, "Export"),
                  h(
                    "button",
                    {
                      class: "btn small",
                      onclick: () => {
                        if (!confirm(`Delete "${file.name}" from this session? Export it first if you want to keep it.`)) return;
                        deleteRun(file);
                        opts.onChange();
                      },
                    },
                    "Delete",
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    ),
    saveNotice(),
  );
}
