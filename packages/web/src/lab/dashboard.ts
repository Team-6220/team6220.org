import {
  aggregateByDesign,
  allianceObservations,
  comparisonTable,
  contributions,
  contributionTable,
  coverageCounts,
  coverageTable,
  histogram,
  meanCI,
  responseCurve,
  responseTable,
  rpRatesTable,
  sensitivity,
  sensitivityTable,
  winProbability,
  type ResponsePoint,
  type Sample,
  type Table,
} from "@goldsim/analytics";
import type { BatchResultsFile } from "@goldsim/batch";
import { navigate } from "../router.js";
import { clear, h, title } from "../ui/dom.js";
import { onThemeChange } from "../ui/theme.js";
import { exportResultsFile, importResultsFile } from "./batch.js";
import { barChart, histogramChart, responseChart } from "./charts.js";
import { addRun, ciText, fmt, fmtDuration, labState, put, tableView } from "./util.js";

type Row = BatchResultsFile["results"][number];

interface Outcome {
  id: string;
  label: string;
  value: (r: Row) => number;
}

/** Outcomes a sweep can be measured by: alliance scores, the margin, and each robot's contribution. */
function outcomes(file: BatchResultsFile): Outcome[] {
  const robots = file.settings.base.robots;
  const out: Outcome[] = [
    { id: "blue", label: "Blue score (no foul points)", value: (r) => r.result.score.blue.total - r.result.score.blue.foul },
    { id: "red", label: "Red score (no foul points)", value: (r) => r.result.score.red.total - r.result.score.red.foul },
    { id: "margin", label: "Blue − red margin", value: (r) => r.result.score.blue.total - r.result.score.red.total },
    { id: "blueRP", label: "Blue ranking points", value: (r) => r.result.rp.blue.total },
  ];
  robots.forEach((rb, i) =>
    out.push({
      id: `robot${i}`,
      label: `${rb.alliance === "blue" ? "Blue" : "Red"} ${rb.station + 1} (${rb.design.name}) points`,
      value: (r) => r.result.robots[i]?.points ?? 0,
    }),
  );
  return out;
}

function defaultOutcome(file: BatchResultsFile): string {
  const t = file.settings.params[0]?.target;
  if (t) return `robot${t.robot}`;
  return "blue";
}

/** Bins continuous (Latin hypercube) values so each response point has several matches. */
function binnedSamples(samples: Sample[], param: string): { samples: Sample[]; binned: boolean } {
  const values = [...new Set(samples.map((s) => s.params[param]).filter((v): v is number => v !== undefined))];
  if (values.length <= 12) return { samples, binned: false };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const bins = 8;
  const w = (max - min) / bins || 1;
  return {
    binned: true,
    samples: samples.map((s) => {
      const v = s.params[param]!;
      const b = Math.min(bins - 1, Math.floor((v - min) / w));
      return { ...s, params: { ...s.params, [param]: Number((min + (b + 0.5) * w).toFixed(4)) } };
    }),
  };
}

const STATUS_TAG: Record<string, string> = { implemented: "good", approximated: "warn", not_implemented: "bad" };

export function dashboardScreen(root: HTMLElement): () => void {
  const body = h("div", { class: "lab" });
  root.appendChild(body);
  let outcomeId: string | null = null;

  const render = () => {
    clear(body);
    const runs = labState.runs;
    const header = h(
      "div",
      { class: "row center" },
      title("h1", "Dashboard", { class: "grow" }),
      h(
        "button",
        {
          class: "btn",
          onclick: () =>
            importResultsFile((f) => {
              addRun(f);
              outcomeId = null;
              render();
            }),
        },
        "Import results file…",
      ),
      h("button", { class: "btn", onclick: () => navigate("/lab/batch") }, "New batch"),
    );
    put(body, header);
    if (!runs.length) {
      put(body, h("div", { class: "panel" }, h("p", null, "No runs yet. Start a batch, or import a results file you exported earlier.")));
      return;
    }
    if (labState.selectedRun < 0 || labState.selectedRun >= runs.length) labState.selectedRun = runs.length - 1;
    const file = runs[labState.selectedRun]!;
    const outs = outcomes(file);
    if (!outcomeId || !outs.some((o) => o.id === outcomeId)) outcomeId = defaultOutcome(file);
    const outcome = outs.find((o) => o.id === outcomeId)!;
    const rows = file.results;

    put(body, 
      h(
        "div",
        { class: "panel row center lab-runbar" },
        h(
          "select",
          { onchange: (e: Event) => ((labState.selectedRun = Number((e.target as HTMLSelectElement).value)), (outcomeId = null), render()) },
          runs.map((r, i) => h("option", { value: String(i), selected: i === labState.selectedRun }, `${r.name} — ${r.createdAt.slice(0, 16).replace("T", " ")}`)),
        ),
        h("span", { class: "small muted grow" }, `${rows.length} matches · ${file.status} · ${fmtDuration(file.elapsedMs)} · ${file.module.id} v${file.module.version} (manual ${file.module.manualVersion}) · engine ${file.engineVersion}${file.errors.length ? ` · ${file.errors.length} errors` : ""}`),
        h("button", { class: "btn", onclick: () => exportResultsFile(file) }, "Export results file"),
      ),
    );
    if (!rows.length) {
      put(body, h("div", { class: "panel" }, h("p", null, "This run has no finished matches.")));
      return;
    }

    const summaries = rows.map((r) => r.summary);
    const results = rows.map((r) => r.result);

    // Archetype comparison
    const comp = comparisonTable(aggregateByDesign(summaries));
    const ciCols = new Set(comp.columns.filter((c) => c.key.endsWith("_lo") || c.key.endsWith("_hi")).map((c) => c.key));
    put(body, 
      h("h2", null, "Archetypes"),
      tableView(comp, {
        hide: (k) => ciCols.has(k),
        cell: (k, v, row) => (ciCols.has(`${k}_lo`) ? ciText(v, row[`${k}_lo`], row[`${k}_hi`]) : null),
      }),
      h("p", { class: "small muted" }, "Means with 95% confidence intervals in brackets. Every configuration ran on the same seeds."),
    );

    // Distributions
    const blue = results.map((r) => r.score.blue.total);
    const red = results.map((r) => r.score.red.total);
    const win = winProbability(results, "blue");
    put(body, 
      h(
        "div",
        { class: "grid2" },
        h("div", { class: "panel" }, h("h3", null, `Blue score — mean ${ciText(meanCI(blue).mean, meanCI(blue).lo, meanCI(blue).hi)}`), histogramChart(histogram(blue), "Points", "blue")),
        h("div", { class: "panel" }, h("h3", null, `Red score — mean ${ciText(meanCI(red).mean, meanCI(red).lo, meanCI(red).hi)}`), histogramChart(histogram(red), "Points", "red")),
      ),
      h(
        "div",
        { class: "panel row center" },
        h("span", { class: "grow" }, `Blue win probability (ties count half): `, h("b", null, fmt(win.probability * 100, 1) + "%"), ` · outright wins ${win.wins}/${win.n} [${fmt(win.ci.lo * 100, 1)}%, ${fmt(win.ci.hi * 100, 1)}%] · ties ${win.ties}`),
      ),
    );

    // Sweep analysis
    const params = file.settings.params;
    if (params.length) {
      const samples: Sample[] = rows.map((r) => ({ params: r.values, outcome: outcome.value(r) }));
      put(body, 
        h(
          "div",
          { class: "row center" },
          h("h2", { class: "grow" }, "Sweep"),
          h("span", { class: "small muted" }, "Outcome"),
          h(
            "select",
            { onchange: (e: Event) => ((outcomeId = (e.target as HTMLSelectElement).value), render()) },
            outs.map((o) => h("option", { value: o.id, selected: o.id === outcomeId }, o.label)),
          ),
        ),
      );
      const curves = h("div", { class: "grid2" });
      for (const p of params) {
        const { samples: s2, binned } = binnedSamples(samples, p.id);
        const pts: ResponsePoint[] = responseCurve(s2, p.id);
        const t: Table = responseTable(pts, p.id, outcome.label);
        curves.appendChild(
          h(
            "div",
            { class: "col" },
            h("div", { class: "panel" }, h("h3", null, `${outcome.label} vs ${p.id}`), responseChart(pts, p.id, outcome.label), binned ? h("p", { class: "small muted" }, "Values binned into 8 ranges (Latin hypercube).") : null),
            tableView(t),
          ),
        );
      }
      put(body, curves);
      const sens = sensitivity(samples, params.map((p) => p.id));
      if (sens.length) {
        put(body, 
          h(
            "div",
            { class: "grid2" },
            h("div", { class: "panel" }, h("h3", null, "Sensitivity (standardized effect ± 1.96 SE)"), barChart(sens.map((x) => ({ label: x.param, value: x.standardizedEffect, err: 1.96 * x.standardError })), "Outcome std per parameter std")),
            tableView(sensitivityTable(sens)),
          ),
        );
      } else put(body, h("p", { class: "small muted" }, "Sensitivity needs at least two different values per parameter and more matches than parameters."));
    }

    // Contribution
    const contrib = contributions(allianceObservations(results));
    const designsVary = new Set(results.flatMap((r) => (["blue", "red"] as const).map((a) => r.robots.filter((x) => x.alliance === a).map((x) => x.name).sort().join("+")))).size > 1;
    put(body, 
      h("h2", null, "EPA-style contribution"),
      h(
        "div",
        { class: "grid2" },
        h("div", { class: "panel" }, barChart(contrib.map((c) => ({ label: c.design, value: c.contribution, err: 1.96 * c.standardError })), "Points per match per robot (± 1.96 SE)")),
        tableView(contributionTable(contrib)),
      ),
      designsVary ? null : h("p", { class: "small muted" }, "Every alliance fielded the same designs, so contributions cannot be separated. Vary alliance lineups across runs for a meaningful estimate."),
    );

    // RPs and coverage
    const cov = coverageCounts(results[0]!);
    put(body, 
      h("h2", null, "Ranking points"),
      tableView(rpRatesTable(summaries)),
      h("h2", null, "Rule coverage"),
      h(
        "p",
        null,
        h("span", { class: "tag good" }, `${cov.implemented ?? 0} implemented`),
        h("span", { class: "tag warn" }, `${cov.approximated ?? 0} approximated`),
        h("span", { class: "tag bad" }, `${cov.not_implemented ?? 0} not implemented`),
        h("span", { class: "small muted" }, " These results reflect only the implemented and approximated rules."),
      ),
      tableView(coverageTable(results[0]!), { cell: (k, v) => (k === "status" ? h("span", { class: `tag ${STATUS_TAG[String(v)] ?? ""}` }, String(v).replace("_", " ")) : null) }),
    );
    if (file.errors.length)
      put(body, h("details", { class: "panel" }, h("summary", null, `${file.errors.length} failed matches`), h("ul", { class: "small mono" }, file.errors.slice(0, 50).map((e) => h("li", null, `${e.jobId}: ${e.message}`)))));
  };

  render();
  return onThemeChange(() => render());
}
