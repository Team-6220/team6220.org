import { PROFILE_KNOBS, PROFILE_PRESETS, profileById, type DriverProfile } from "@goldsim/agents";
import {
  BatchRunner,
  buildJobs,
  completedJobIds,
  getAtPath,
  grid,
  InProcessExecutor,
  jobsFromFile,
  latinHypercube,
  makeResultsFile,
  registerGame,
  seedsFrom,
  WorkerPoolExecutor,
  type BatchOutcome,
  type BatchProgress,
  type BatchResultsFile,
  type DriverSpec,
  type Executor,
  type MatchSpec,
  type SweepConfig,
  type SweepParam,
} from "@goldsim/batch";
import { MECHANISM_SPECS, resolveMechanism } from "@goldsim/core";
import { RobotDesign, validate, type Alliance, type MatchRobot } from "@goldsim/schema";
import { allDesigns, session } from "../app-state.js";
import { navigate } from "../router.js";
import { clear, h, title, toast } from "../ui/dom.js";
import { addRun, downloadText, fmt, fmtDuration, labeled, labState, numberInput, pickFiles, put, readFiles, safeName } from "./util.js";

// ---------------------------------------------------------------------------
// Setup state (kept for the session so leaving and returning keeps the form)
// ---------------------------------------------------------------------------

interface LabSlot {
  alliance: Alliance;
  station: number;
  design: RobotDesign | null;
  driver: string; // "idle" or a profile id
}

interface ParamRow {
  id: string;
  robot: number;
  kind: "design" | "profile";
  path: string; // design path or profile knob
  values: string; // grid values, comma-separated
  min: number;
  max: number;
}

interface BatchSetup {
  name: string;
  slots: LabSlot[];
  params: ParamRow[];
  mode: "grid" | "lhs";
  lhsCount: number;
  matchesPerConfig: number;
  baseSeed: number;
  profile: string;
  throttle: boolean;
  workers: number;
}

const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
let setup: BatchSetup | null = null;

function defaultBatchSetup(): BatchSetup {
  const d = allDesigns();
  const stations = session.game.game.robotsPerAlliance;
  return {
    name: "Sweep",
    slots: (["blue", "red"] as const).flatMap((alliance) =>
      Array.from({ length: stations }, (_, station) => ({
        alliance,
        station,
        design: alliance === "blue" && station === 0 ? (d[0] ?? null) : null,
        driver: "balanced",
      })),
    ),
    params: [],
    mode: "grid",
    lhsCount: 8,
    matchesPerConfig: 10,
    baseSeed: 6220,
    profile: session.game.game.defaultProfile,
    throttle: false,
    workers: Math.max(1, cores - 1),
  };
}

// ---------------------------------------------------------------------------
// Active run (survives navigation)
// ---------------------------------------------------------------------------

interface ActiveRun {
  runner: BatchRunner;
  executor: Executor;
  progress: BatchProgress;
  listeners: Set<() => void>;
  finish: Promise<void>;
  name: string;
}

let active: ActiveRun | null = null;

registerGame(session.game);

export function isBatchRunning(): boolean {
  return active !== null;
}

function workerSupported(): boolean {
  return typeof Worker !== "undefined";
}

function makeExecutor(s: Pick<BatchSetup, "workers" | "throttle">): Executor {
  if (!workerSupported()) return new InProcessExecutor(s.throttle ? 250 : 0);
  return new WorkerPoolExecutor({ size: s.workers, throttleMs: s.throttle ? 250 : 0 });
}

/** Starts a batch; resolves to the results file once it ends (done, cancelled, or failed). */
export function startBatch(args: {
  name: string;
  base: Omit<MatchSpec, "seed">;
  params: SweepParam[];
  configs: SweepConfig[];
  seeds: number[];
  executor: Executor;
  skip?: Iterable<string>;
  previous?: BatchResultsFile;
  onDone?: (file: BatchResultsFile) => void;
}): ActiveRun {
  const jobs = buildJobs(args.base, args.params, args.configs, args.seeds);
  const run: ActiveRun = {
    runner: null as unknown as BatchRunner,
    executor: args.executor,
    progress: { status: "idle", done: 0, total: jobs.length, running: 0, failed: 0, elapsedMs: 0, etaMs: null, matchesPerMinute: 0 },
    listeners: new Set(),
    finish: Promise.resolve(),
    name: args.name,
  };
  run.runner = new BatchRunner(jobs, args.executor, {
    skip: args.skip,
    onProgress: (p) => {
      run.progress = p;
      for (const l of run.listeners) l();
    },
  });
  run.finish = run.runner.start().then(
    (outcome: BatchOutcome) => {
      args.executor.dispose();
      let file = makeResultsFile({ name: args.name, game: session.game, base: args.base, params: args.params, configs: args.configs, seeds: args.seeds, outcome });
      if (args.previous) {
        file = {
          ...file,
          results: [...args.previous.results, ...file.results],
          errors: [...args.previous.errors.filter((e) => !file.results.some((r) => r.jobId === e.jobId)), ...file.errors],
          elapsedMs: args.previous.elapsedMs + file.elapsedMs,
        };
      }
      const prevIndex = args.previous ? labState.runs.indexOf(args.previous) : -1;
      if (prevIndex >= 0) {
        labState.runs[prevIndex] = file;
        labState.selectedRun = prevIndex;
      } else if (file.results.length) addRun(file);
      args.onDone?.(file);
      if (active === run) active = null;
      for (const l of run.listeners) l();
    },
    (e: Error) => {
      args.executor.dispose();
      toast(`Batch failed: ${e.message}`);
      if (active === run) active = null;
      for (const l of run.listeners) l();
    },
  );
  active = run;
  return run;
}

// ---------------------------------------------------------------------------
// Sweep parameter options
// ---------------------------------------------------------------------------

interface ParamOption {
  path: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
}

function designOptions(design: RobotDesign): ParamOption[] {
  const dt = design.chassis.drivetrain;
  const out: ParamOption[] = [
    { path: "/chassis/drivetrain/maxSpeed", label: "Drivetrain: top speed (m/s)", value: dt.maxSpeed, min: 1, max: 7, step: 0.1 },
    { path: "/chassis/drivetrain/maxAccel", label: "Drivetrain: acceleration (m/s²)", value: dt.maxAccel, min: 1, max: 20, step: 0.5 },
    { path: "/chassis/drivetrain/maxAngularSpeed", label: "Drivetrain: turn speed (rad/s)", value: dt.maxAngularSpeed, min: 1, max: 20, step: 0.5 },
    { path: "/chassis/drivetrain/traction", label: "Drivetrain: traction", value: dt.traction, min: 0.3, max: 2, step: 0.05 },
    { path: "/chassis/mass", label: "Chassis: mass (kg)", value: design.chassis.mass, min: 20, max: 80, step: 1 },
    { path: "/chassis/height", label: "Chassis: height (m)", value: design.chassis.height, min: 0.2, max: 1.5, step: 0.01 },
  ];
  for (const mech of design.mechanisms) {
    let resolved;
    try {
      resolved = resolveMechanism(mech, session.game.mechanisms);
    } catch {
      continue;
    }
    const spec = MECHANISM_SPECS[resolved.base];
    for (const [key, ps] of Object.entries(spec.params))
      out.push({
        path: `/mechanisms/${mech.id}/params/${key}`,
        label: `${mech.id}: ${ps.label}${ps.unit ? ` (${ps.unit})` : ""}`,
        value: resolved.p[key] ?? ps.default,
        min: ps.min,
        max: ps.max,
        step: ps.step,
      });
  }
  return out;
}

function defaultValues(o: { value: number; min: number; max: number }): string {
  const lo = Math.max(o.min, o.value * 0.5);
  const hi = Math.min(o.max, o.value * 1.5);
  return [lo, o.value, hi].map((v) => Number(v.toFixed(3))).join(", ");
}

function parseValues(s: string): number[] {
  return s
    .split(/[,\s]+/)
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x));
}

function slotLabel(slot: LabSlot): string {
  return `${slot.alliance === "blue" ? "Blue" : "Red"} ${slot.station + 1}`;
}

// ---------------------------------------------------------------------------
// Results file import (untrusted)
// ---------------------------------------------------------------------------

/** Checks the shape of an imported results file. Designs inside are validated against the robot schema. */
export function checkResultsFile(data: unknown): { file?: BatchResultsFile; error?: string } {
  const f = data as Partial<BatchResultsFile> | null;
  if (!f || typeof f !== "object" || f.kind !== "goldsim.batch" || f.schemaVersion !== 1) return { error: "Not a GoldSim batch results file (kind goldsim.batch, schemaVersion 1)." };
  if (!Array.isArray(f.results) || !Array.isArray(f.errors) || !f.settings || !Array.isArray(f.settings.seeds) || !Array.isArray(f.settings.configs) || !Array.isArray(f.settings.params))
    return { error: "Results file is missing required sections (settings, results, errors)." };
  const robots = f.settings.base?.robots;
  if (!Array.isArray(robots)) return { error: "Results file has no robots." };
  for (const [i, r] of robots.entries()) {
    const v = validate(RobotDesign, (r as MatchRobot).design);
    if (!v.ok) return { error: `Robot ${i} design is invalid: ${v.issues[0]?.path} ${v.issues[0]?.message}` };
  }
  if (f.settings.base.game !== session.game.game.id) return { error: `File is for game "${f.settings.base.game}", but the loaded game is "${session.game.game.id}".` };
  for (const r of f.results) if (!r || typeof r.jobId !== "string" || !r.result || !r.summary) return { error: "A result row is malformed." };
  return { file: f as BatchResultsFile };
}

export function importResultsFile(onFile: (file: BatchResultsFile) => void): void {
  pickFiles(".json,application/json", false, async (files) => {
    try {
      const [first] = await readFiles(files, 50_000_000);
      if (!first) return;
      const { name, text } = first;
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`${name} is not valid JSON.`);
      }
      const { file, error } = checkResultsFile(data);
      if (!file) throw new Error(error);
      onFile(file);
    } catch (e) {
      toast((e as Error).message, 6000);
    }
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function batchScreen(root: HTMLElement): () => void {
  const s = (setup ??= defaultBatchSetup());
  const designs = allDesigns();
  const body = h("div", { class: "lab" });
  root.appendChild(body);
  let unsub: (() => void) | null = null;

  const render = () => {
    clear(body);
    unsub?.();
    unsub = null;
    put(body, 
      h(
        "div",
        { class: "row center" },
        title("h1", "Batch & sweeps", { class: "grow" }),
        h("button", { class: "btn", onclick: () => importResultsFile(onImported) }, "Import results file…"),
        h("button", { class: "btn", disabled: !labState.runs.length, onclick: () => navigate("/lab/dashboard") }, `Dashboards (${labState.runs.length})`),
      ),
      h("p", { class: "muted" }, "Run many seeded matches headless on every core of this device. Nothing is saved yet; export the results file to keep a run."),
    );
    if (active) put(body, progressPanel());
    put(body, h("div", { class: "grid2" }, robotsPanel(), h("div", { class: "col" }, sweepPanel(), runPanel())));
  };

  const onImported = (file: BatchResultsFile) => {
    const done = completedJobIds(file);
    const total = file.settings.configs.length * file.settings.seeds.length;
    addRun(file);
    const remaining = total - done.size;
    toast(`Imported "${file.name}": ${done.size}/${total} matches complete.`);
    if (remaining > 0 && !active)
      body.prepend(
        h(
          "div",
          { class: "panel hint row center" },
          h("span", { class: "grow" }, `"${file.name}" has ${remaining} unfinished matches.`),
          h("button", { class: "btn primary", onclick: () => resume(file) }, "Resume run"),
        ),
      );
    else render();
  };

  const resume = (file: BatchResultsFile) => {
    try {
      jobsFromFile(file); // throws on a broken sweep definition
      const { base, params, configs, seeds } = file.settings;
      startBatch({ name: file.name, base: { ...base, game: base.game }, params, configs, seeds, executor: makeExecutor(s), skip: completedJobIds(file), previous: file });
      render();
    } catch (e) {
      toast((e as Error).message, 6000);
    }
  };

  const robotsPanel = () =>
    h(
      "div",
      { class: "panel col" },
      h("h2", null, "Robots"),
      h("p", { class: "small muted" }, "Empty slots are left off the field. Sweeps and the dashboard compare designs by name."),
      s.slots.map((slot) =>
        h(
          "div",
          { class: "slot" },
          h("span", { class: `who ${slot.alliance}` }, slotLabel(slot)),
          h(
            "select",
            {
              onchange: (e: Event) => {
                const v = (e.target as HTMLSelectElement).value;
                slot.design = v === "" ? null : (designs[Number(v)] ?? null);
                s.params = s.params.filter((p) => s.slots[p.robot]?.design);
                render();
              },
            },
            h("option", { value: "", selected: !slot.design }, "— empty —"),
            designs.map((d, i) => h("option", { value: String(i), selected: slot.design === d }, d.name)),
          ),
          h(
            "select",
            { disabled: !slot.design, onchange: (e: Event) => (slot.driver = (e.target as HTMLSelectElement).value) },
            h("option", { value: "idle", selected: slot.driver === "idle" }, "Idle"),
            PROFILE_PRESETS.map((p) => h("option", { value: p.id, selected: slot.driver === p.id }, `Agent: ${p.label}`)),
          ),
        ),
      ),
    );

  const sweepPanel = () => {
    const used = s.slots.map((slot, i) => ({ slot, i })).filter((x) => x.slot.design);
    const addParam = () => {
      const first = used[0];
      if (!first) return toast("Put a robot in a slot first.");
      const o = designOptions(first.slot.design!)[0]!;
      s.params.push({ id: `p${s.params.length + 1}`, robot: first.i, kind: "design", path: o.path, values: defaultValues(o), min: o.min, max: o.max });
      render();
    };
    return h(
      "div",
      { class: "panel col" },
      h("div", { class: "row center" }, h("h2", { class: "grow" }, "Sweep"), h("button", { class: "btn", onclick: addParam }, "+ Parameter")),
      h(
        "div",
        { class: "row center" },
        h("label", { class: "row center small" }, h("input", { type: "radio", name: "mode", checked: s.mode === "grid", onchange: () => ((s.mode = "grid"), render()) }), " Grid"),
        h("label", { class: "row center small" }, h("input", { type: "radio", name: "mode", checked: s.mode === "lhs", onchange: () => ((s.mode = "lhs"), render()) }), " Latin hypercube"),
        s.mode === "lhs" ? labeled("Configurations", numberInput(s.lhsCount, (v) => ((s.lhsCount = Math.max(2, Math.round(v))), render()), { min: 2, max: 200, style: "width:80px" })) : null,
      ),
      s.params.length ? null : h("p", { class: "small muted" }, "No parameters: every match uses the robots as designed (an archetype comparison)."),
      s.params.map((p, k) => paramRow(p, k, used)),
    );
  };

  const paramRow = (p: ParamRow, k: number, used: { slot: LabSlot; i: number }[]) => {
    const design = s.slots[p.robot]?.design;
    const opts = design ? designOptions(design) : [];
    const pick = (kind: ParamRow["kind"], path: string) => {
      p.kind = kind;
      p.path = path;
      if (kind === "design") {
        const o = opts.find((x) => x.path === path);
        if (o) {
          p.values = defaultValues(o);
          p.min = o.min;
          p.max = o.max;
        }
      } else {
        const knob = PROFILE_KNOBS.find((x) => x.key === path)!;
        const cur = Number(profileById(s.slots[p.robot]!.driver)[knob.key]);
        p.values = defaultValues({ value: cur, min: knob.min, max: knob.max });
        p.min = knob.min;
        p.max = knob.max;
      }
      render();
    };
    const isAgent = s.slots[p.robot]?.driver !== "idle";
    return h(
      "div",
      { class: "lab-param" },
      h(
        "div",
        { class: "row center" },
        h(
          "select",
          { onchange: (e: Event) => ((p.robot = Number((e.target as HTMLSelectElement).value)), pick("design", designOptions(s.slots[p.robot]!.design!)[0]!.path)) },
          used.map(({ slot, i }) => h("option", { value: String(i), selected: i === p.robot }, `${slotLabel(slot)}: ${slot.design!.name}`)),
        ),
        h("button", { class: "btn small", onclick: () => (s.params.splice(k, 1), render()), "aria-label": "Remove parameter" }, "×"),
      ),
      h(
        "select",
        {
          onchange: (e: Event) => {
            const [kind, path] = (e.target as HTMLSelectElement).value.split("|") as [ParamRow["kind"], string];
            pick(kind, path);
          },
        },
        h("optgroup", { label: "Design" }, opts.map((o) => h("option", { value: `design|${o.path}`, selected: p.kind === "design" && p.path === o.path }, o.label))),
        isAgent
          ? h("optgroup", { label: "Driver profile" }, PROFILE_KNOBS.map((kn) => h("option", { value: `profile|${String(kn.key)}`, selected: p.kind === "profile" && p.path === kn.key }, kn.label)))
          : null,
      ),
      s.mode === "grid"
        ? labeled("Values", h("input", { type: "text", value: p.values, onchange: (e: Event) => (p.values = (e.target as HTMLInputElement).value) }), "Comma-separated")
        : h(
            "div",
            { class: "row" },
            labeled("Min", numberInput(p.min, (v) => (p.min = v), { step: "any", style: "width:100px" })),
            labeled("Max", numberInput(p.max, (v) => (p.max = v), { step: "any", style: "width:100px" })),
          ),
      h("span", { class: "small muted mono" }, p.kind === "design" ? p.path : `profile.${p.path}`),
    );
  };

  const buildRun = () => {
    const robots: MatchRobot[] = [];
    const drivers: DriverSpec[] = [];
    const indexMap = new Map<number, number>();
    s.slots.forEach((slot, i) => {
      if (!slot.design) return;
      indexMap.set(i, robots.length);
      robots.push({ design: structuredClone(slot.design), alliance: slot.alliance, station: slot.station });
      drivers.push(slot.driver === "idle" ? { kind: "idle" } : { kind: "agent", profile: { ...profileById(slot.driver) } as DriverProfile });
    });
    if (!robots.length) throw new Error("Put at least one robot in a slot.");
    const params: SweepParam[] = s.params.map((p) => {
      const robot = indexMap.get(p.robot);
      if (robot === undefined) throw new Error(`Parameter ${p.id} targets an empty slot.`);
      const target = p.kind === "design" ? ({ kind: "design", robot, path: p.path } as const) : ({ kind: "profile", robot, knob: p.path as keyof DriverProfile } as const);
      if (s.mode === "grid") {
        const values = parseValues(p.values);
        if (!values.length) throw new Error(`Parameter ${p.id} needs at least one numeric value.`);
        return { id: paramLabel(p), target, values };
      }
      if (!(p.max > p.min)) throw new Error(`Parameter ${p.id}: max must be greater than min.`);
      return { id: paramLabel(p), target, min: p.min, max: p.max };
    });
    const ids = new Set(params.map((p) => p.id));
    if (ids.size !== params.length) throw new Error("Two parameters sweep the same value.");
    const configs: SweepConfig[] = !params.length ? [{ id: "c0", values: {} }] : s.mode === "grid" ? grid(params) : latinHypercube(params, s.lhsCount, s.baseSeed);
    const seeds = seedsFrom(Math.max(1, Math.round(s.matchesPerConfig)), s.baseSeed);
    const base: Omit<MatchSpec, "seed"> = { game: session.game.game.id, robots, drivers, profile: s.profile };
    return { base, params, configs, seeds };
  };

  const paramLabel = (p: ParamRow) => {
    const slot = s.slots[p.robot]!;
    const short = p.kind === "design" ? p.path.split("/").slice(-2).join(".") : String(p.path);
    return `${slotLabel(slot)} ${short}`;
  };

  const runPanel = () => {
    let total = 0;
    let error = "";
    try {
      const r = buildRun();
      total = r.configs.length * r.seeds.length;
    } catch (e) {
      error = (e as Error).message;
    }
    const profiles = Object.keys(session.game.game.thresholdProfiles);
    const start = () => {
      try {
        const r = buildRun();
        if (r.configs.length * r.seeds.length > 5000 && !confirm(`This is ${r.configs.length * r.seeds.length} matches. Run anyway?`)) return;
        // Check every path resolves before spawning workers.
        for (const p of r.params) if (p.target.kind === "design" && getAtPath(r.base.robots[p.target.robot]!.design, p.target.path.replace(/\/[^/]+$/, "")) === undefined) throw new Error(`Path ${p.target.path} does not exist on that design.`);
        startBatch({ name: s.name, ...r, executor: makeExecutor(s), onDone: (file) => toast(`"${file.name}" finished: ${file.results.length} matches.`) });
        render();
      } catch (e) {
        toast((e as Error).message, 6000);
      }
    };
    return h(
      "div",
      { class: "panel col" },
      h("h2", null, "Run"),
      h(
        "div",
        { class: "lab-form" },
        labeled("Name", h("input", { type: "text", value: s.name, onchange: (e: Event) => (s.name = (e.target as HTMLInputElement).value || "Sweep") })),
        labeled("Matches per configuration", numberInput(s.matchesPerConfig, (v) => ((s.matchesPerConfig = Math.max(1, Math.round(v))), render()), { min: 1, max: 1000 })),
        labeled("Base seed", numberInput(s.baseSeed, (v) => (s.baseSeed = Math.round(v)))),
        labeled(
          "Bonus RP thresholds",
          h("select", { onchange: (e: Event) => (s.profile = (e.target as HTMLSelectElement).value) }, profiles.map((p) => h("option", { value: p, selected: p === s.profile }, p))),
        ),
        labeled("Workers", numberInput(s.workers, (v) => (s.workers = Math.max(1, Math.min(cores, Math.round(v)))), { min: 1, max: cores }), `This device has ${cores} logical cores.`),
        h("label", { class: "row center small" }, h("input", { type: "checkbox", checked: s.throttle, onchange: (e: Event) => (s.throttle = (e.target as HTMLInputElement).checked) }), " Throttle for low-power devices"),
      ),
      error ? h("p", { class: "small red" }, error) : h("p", { class: "small muted" }, `${total} matches total.`),
      h("button", { class: "btn primary big", disabled: !!error || !!active, onclick: start }, active ? "A batch is running" : "Start batch"),
      workerSupported() ? null : h("p", { class: "small muted" }, "Web Workers are unavailable; matches will run on the main thread."),
    );
  };

  const progressPanel = () => {
    const run = active!;
    const bar = h("div");
    const text = h("div", { class: "small" });
    const status = h("span", { class: "tag warn" });
    const pauseBtn = h("button", { class: "btn" });
    const update = () => {
      const p = run.progress;
      const frac = p.total ? (p.done + p.failed) / p.total : 0;
      bar.style.width = `${(frac * 100).toFixed(1)}%`;
      status.textContent = p.status;
      text.textContent = `${p.done}/${p.total} done · ${p.failed} failed · ${p.running} running · ${fmt(p.matchesPerMinute, 1)} matches/min · elapsed ${fmtDuration(p.elapsedMs)} · ETA ${fmtDuration(p.etaMs)}`;
      pauseBtn.textContent = p.status === "paused" ? "Resume" : "Pause";
      if (!active) render();
    };
    pauseBtn.addEventListener("click", () => (run.progress.status === "paused" ? run.runner.resume() : run.runner.pause()));
    run.listeners.add(update);
    unsub = () => run.listeners.delete(update);
    const panel = h(
      "div",
      { class: "panel sel col" },
      h("div", { class: "row center" }, h("h2", { class: "grow" }, `Running: ${run.name}`), status),
      h("div", { class: "meter" }, h("div", { class: "bar" }, bar)),
      text,
      h("div", { class: "controls" }, pauseBtn, h("button", { class: "btn", onclick: () => run.runner.cancel() }, "Cancel")),
      h("p", { class: "small muted" }, "Pause lets running matches finish. Cancel keeps the results gathered so far."),
    );
    update();
    return panel;
  };

  render();
  return () => unsub?.();
}

export function exportResultsFile(file: BatchResultsFile): void {
  downloadText(`${safeName(file.name)}-${file.createdAt.slice(0, 10)}.goldsim-batch.json`, JSON.stringify(file));
}
