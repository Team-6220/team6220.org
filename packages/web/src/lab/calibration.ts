import { PROFILE_PRESETS, profileById, type DriverProfile } from "@goldsim/agents";
import { CALIBRATION_CSV_TEMPLATE, calibrationReport, mean, median, parseMeasurements, type Measurement } from "@goldsim/analytics";
import { InProcessExecutor, seedsFrom, WorkerPoolExecutor, type BatchResultsFile, type MatchSpec } from "@goldsim/batch";
import { resolveMechanisms } from "@goldsim/core";
import type { RobotDesign } from "@goldsim/schema";
import { allDesigns, session } from "../app-state.js";
import { clear, h, title, toast } from "../ui/dom.js";
import { isBatchRunning, startBatch } from "./batch.js";
import { saveNotice } from "./help.js";
import { downloadText, dropZone, fmt, labeled, numberInput, pickFiles, put, readFiles, shortDate, tableView } from "./util.js";

interface CalState {
  measurements: Measurement[];
  errors: string[];
  designIndex: number;
  profile: string;
  matches: number;
  seed: number;
  tolerance: number;
  sim: Record<string, number> | null;
  running: boolean;
}

const state: CalState = { measurements: [], errors: [], designIndex: 0, profile: "balanced", matches: 12, seed: 6220, tolerance: 0.15, sim: null, running: false };

/** Metrics the sim can report for comparison with real measurements (names match the CSV template). */
export const SIM_METRICS: { metric: string; label: string; source: "sim" | "design" }[] = [
  { metric: "cycleTime", label: "Median cycle time (s)", source: "sim" },
  { metric: "pickupToScore", label: "Median pickup-to-score (s)", source: "sim" },
  { metric: "scoredPerMatch", label: "Pieces scored per match", source: "sim" },
  { metric: "pointsPerMatch", label: "Points per match", source: "sim" },
  { metric: "accuracy", label: "Accuracy (scored / shot)", source: "sim" },
  { metric: "timeToFirstScore", label: "Time to first score (s)", source: "sim" },
  { metric: "topSpeed", label: "Top speed (m/s)", source: "design" },
  { metric: "ballsPerSecond", label: "Shooter rate (pieces/s)", source: "design" },
  { metric: "climbTime", label: "Climb time to max level (s)", source: "design" },
];

function designValues(design: RobotDesign): Record<string, number> {
  const out: Record<string, number> = { topSpeed: design.chassis.drivetrain.maxSpeed };
  const mechs = resolveMechanisms(design, session.game.mechanisms);
  const shooter = mechs.find((m) => m.base === "shooter");
  if (shooter) out.ballsPerSecond = shooter.p.ballsPerSecond!;
  const climber = mechs.find((m) => m.base === "climber");
  if (climber) out.climbTime = climber.p[`level${Math.round(climber.p.maxLevel!)}Time`] ?? climber.p.level1Time!;
  return out;
}

function simValues(file: BatchResultsFile, design: RobotDesign): Record<string, number> {
  const robots = file.results.map((r) => r.summary.robots[0]!).filter(Boolean);
  const finite = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null && Number.isFinite(x));
  const vals: Record<string, number> = {
    cycleTime: median(robots.flatMap((r) => r.cycles.cycleTimes)),
    pickupToScore: median(robots.flatMap((r) => r.cycles.pickupToScore)),
    scoredPerMatch: mean(robots.map((r) => r.scoredActive)),
    pointsPerMatch: mean(robots.map((r) => r.points)),
    accuracy: mean(finite(robots.map((r) => r.accuracy))),
    timeToFirstScore: mean(finite(robots.map((r) => r.cycles.timeToFirstScore))),
    ...designValues(design),
  };
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(vals))
    if (Number.isFinite(v)) {
      out[k] = v;
      out[`${design.name}:${k}`] = v;
    }
  return out;
}

export function calibrationScreen(root: HTMLElement): void {
  const body = h("div", { class: "lab" });
  root.appendChild(body);
  const designs = allDesigns();

  const load = async (files: FileList) => {
    try {
      const [first] = await readFiles(files, 2_000_000);
      if (!first) return;
      const { name, text } = first;
      let parsed;
      try {
        parsed = parseMeasurements(text);
      } catch {
        throw new Error(`${name} could not be read as CSV or JSON.`);
      }
      state.measurements = parsed.measurements;
      state.errors = parsed.errors;
      toast(`Loaded ${parsed.measurements.length} measurements from ${name}.`);
      render();
    } catch (e) {
      toast((e as Error).message, 6000);
    }
  };

  const run = () => {
    const design = designs[state.designIndex];
    if (!design) return toast("Pick a design.");
    if (isBatchRunning()) return toast("A batch is already running. Wait for it or cancel it on the Batch page.");
    state.running = true;
    state.sim = null;
    const base: Omit<MatchSpec, "seed"> = {
      game: session.game.game.id,
      robots: [{ design: structuredClone(design), alliance: "blue", station: 1 }],
      drivers: [{ kind: "agent", profile: { ...profileById(state.profile) } as DriverProfile }],
    };
    const executor = typeof Worker !== "undefined" ? new WorkerPoolExecutor() : new InProcessExecutor();
    startBatch({
      name: `Calibration: ${design.name} · ${shortDate()}`,
      base,
      params: [],
      configs: [{ id: "c0", values: {} }],
      seeds: seedsFrom(Math.max(1, state.matches), state.seed),
      executor,
      onDone: (file) => {
        state.running = false;
        state.sim = file.results.length ? simValues(file, design) : null;
        if (!file.results.length) toast("No matches finished.");
        render();
      },
    });
    render();
  };

  const render = () => {
    clear(body);
    put(
      body,
      title("h1", "Calibration"),
      h("p", { class: "lab-intro muted" }, "Check the sim against your real robot. After a practice session, fill in the template with what you measured (cycle time, top speed, and so on), import it, and run the matching design alone in the sim. The page then shows how far off the sim is for each number. The ±15% limit is a first guess until your team has calibrated once."),
      saveNotice(),
    );
    const drop = h(
      "div",
      { class: "panel lab-drop col" },
      h("h2", null, "1. Measurements"),
      h(
        "div",
        { class: "controls" },
        h("button", { class: "btn", onclick: () => downloadText("goldsim-calibration-template.csv", CALIBRATION_CSV_TEMPLATE, "text/csv") }, "Download CSV template"),
        h("button", { class: "btn", onclick: () => pickFiles(".csv,.json,text/csv,application/json", false, load) }, "Import measurements…"),
      ),
      h("p", { class: "small muted" }, "Or drop a CSV/JSON file here. Columns: metric, value, date, source, robot. Metric names the sim understands: ", SIM_METRICS.map((m) => m.metric).join(", "), "."),
      state.errors.length ? h("ul", { class: "small red" }, state.errors.slice(0, 10).map((e) => h("li", null, e))) : null,
      state.measurements.length
        ? h(
            "table",
            null,
            h("thead", null, h("tr", null, ["Metric", "Value", "Robot", "Date", "Source"].map((c) => h("th", null, c)))),
            h("tbody", null, state.measurements.map((m) => h("tr", null, h("td", null, m.metric), h("td", { class: "num" }, fmt(m.value)), h("td", null, m.robot ?? ""), h("td", null, m.date), h("td", null, m.source)))),
          )
        : h("p", { class: "small muted" }, "No measurements loaded."),
    );
    dropZone(drop, load);

    const runPanel = h(
      "div",
      { class: "panel col" },
      h("h2", null, "2. Simulate"),
      h(
        "div",
        { class: "lab-form" },
        labeled("Design", h("select", { onchange: (e: Event) => (state.designIndex = Number((e.target as HTMLSelectElement).value)) }, designs.map((d, i) => h("option", { value: String(i), selected: i === state.designIndex }, d.name)))),
        labeled("How the computer drives", h("select", { onchange: (e: Event) => (state.profile = (e.target as HTMLSelectElement).value) }, PROFILE_PRESETS.map((p) => h("option", { value: p.id, selected: p.id === state.profile }, p.label)))),
        labeled("Matches", numberInput(state.matches, (v) => (state.matches = Math.max(1, Math.round(v))), { min: 1, max: 500 }), undefined, "How many solo matches to simulate. More matches give steadier averages."),
        labeled("Random seed", numberInput(state.seed, (v) => (state.seed = Math.round(v))), undefined, "A number that decides every random thing in the matches. The same seed gives the same results."),
        labeled("How close counts as a match (±)", numberInput(state.tolerance, (v) => ((state.tolerance = Math.max(0.01, v)), render()), { step: 0.01, min: 0.01, max: 1 }), "0.15 = within 15%", "A sim value is \"within\" if it is no more than this fraction away from what you measured."),
      ),
      h("button", { class: "btn primary", disabled: state.running, onclick: run }, state.running ? "Running… (progress on the Batch page)" : "Run sim matches"),
      h("p", { class: "small muted" }, "The design plays alone against an empty field, so its numbers are not affected by defense. Design metrics (top speed, shooter rate, climb time) come straight from the design."),
    );
    put(body, h("div", { class: "grid2" }, drop, runPanel));

    if (state.sim) {
      const report = calibrationReport(state.measurements, state.sim, state.tolerance);
      const within = report.rows.filter((r) => r.withinTolerance).length;
      const compared = report.rows.filter((r) => r.withinTolerance !== null).length;
      put(
        body,
        h("h2", null, "3. Sim vs real"),
        state.measurements.length
          ? h("p", null, h("span", { class: `tag ${within === compared ? "good" : "warn"}` }, `${within}/${compared} within ±${Math.round(state.tolerance * 100)}%`))
          : h("p", { class: "small muted" }, "Import measurements to compare. Sim values are shown below."),
        state.measurements.length
          ? tableView(report.table, {
              cell: (k, v) => {
                if (k === "withinTolerance") return v === null ? "—" : h("span", { class: `tag ${v ? "good" : "bad"}` }, v ? "within" : "outside");
                if (k === "relativeError" && typeof v === "number") return `${v >= 0 ? "+" : ""}${fmt(v * 100, 1)}%`;
                return null;
              },
            })
          : null,
        h(
          "div",
          { class: "panel" },
          h("h3", null, "Simulated values"),
          h(
            "table",
            null,
            h("tbody", null, SIM_METRICS.filter((m) => state.sim![m.metric] !== undefined).map((m) => h("tr", null, h("td", null, m.label), h("td", { class: "num" }, fmt(state.sim![m.metric]!)), h("td", { class: "small muted" }, m.source === "design" ? "from design" : "simulated")))),
          ),
        ),
      );
    }
  };
  render();
}
