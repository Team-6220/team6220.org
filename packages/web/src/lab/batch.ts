import { PROFILE_KNOBS, PROFILE_PRESETS, SKILL_LABELS, profileById, type DriverProfile, type SkillLevel } from "@goldsim/agents";
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
  randomAllianceJobs,
  registerGame,
  seedsFrom,
  WorkerPoolExecutor,
  type BatchOutcome,
  type BatchProgress,
  type BatchResultsFile,
  type DriverSpec,
  type Executor,
  type Job,
  type MatchSpec,
  type ProfileMode,
  type RandomAllianceSettings,
  type SweepConfig,
  type SweepParam,
} from "@goldsim/batch";
import type { Alliance, MatchRobot, RobotDesign } from "@goldsim/schema";
import { allDesigns, session } from "../app-state.js";
import { navigate } from "../router.js";
import { clear, h, title, toast } from "../ui/dom.js";
import { importResultsFile, plannedMatches } from "./files.js";
import { glossaryPanel, help, saveNotice } from "./help.js";
import { designOptions, fullParamLabel, humanize, knobFor, knobOption, slotName, type ParamOption } from "./names.js";
import { runsPanel } from "./runs.js";
import { addRun, fmt, fmtDuration, labeled, labHooks, labState, numberInput, put, shortDate } from "./util.js";

export { checkResultsFile, exportResultsFile, importResultsFile } from "./files.js";

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
  /** Which slot (lineup mode) the setting belongs to; always 0 in archetype mode. */
  robot: number;
  kind: "design" | "profile";
  path: string; // design path or profile knob
  values: string; // specific values, comma-separated
  min: number;
  max: number;
}

interface SweepState {
  params: ParamRow[];
  mode: "grid" | "lhs";
  lhsCount: number;
}

interface CommonRun {
  name: string;
  nameTouched: boolean;
  baseSeed: number;
  profile: string;
  throttle: boolean;
  workers: number;
}

interface BatchSetup extends CommonRun, SweepState {
  slots: LabSlot[];
  matchesPerConfig: number;
}

interface ArchetypeSetup extends CommonRun, SweepState {
  subjects: RobotDesign[];
  pool: RobotDesign[];
  matches: number;
  others: "random" | "skill" | "fixed";
  skill: SkillLevel;
  fixedProfile: string;
  subjectProfile: string;
}

type ScreenMode = "lineup" | "archetype";

const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
let setup: BatchSetup | null = null;
let archetype: ArchetypeSetup | null = null;
let screenMode: ScreenMode = "lineup";
let rerenderScreen: (() => void) | null = null;

function commonDefaults(): CommonRun {
  return {
    name: "",
    nameTouched: false,
    baseSeed: 6220,
    profile: session.game.game.defaultProfile,
    throttle: false,
    workers: Math.max(1, cores - 1),
  };
}

function defaultBatchSetup(): BatchSetup {
  const d = allDesigns();
  const stations = session.game.game.robotsPerAlliance;
  return {
    ...commonDefaults(),
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
  };
}

function defaultArchetypeSetup(subjects: RobotDesign[] = []): ArchetypeSetup {
  const d = allDesigns();
  return {
    ...commonDefaults(),
    subjects: subjects.length ? subjects : d.slice(0, 1),
    pool: [...d],
    matches: 40,
    others: "random",
    skill: "average",
    fixedProfile: "balanced",
    subjectProfile: "balanced",
    params: [],
    mode: "grid",
    lhsCount: 8,
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

function makeExecutor(s: Pick<CommonRun, "workers" | "throttle">): Executor {
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
  /** Explicit jobs (random-alliance runs); otherwise built from base/params/configs/seeds. */
  jobs?: Job[];
  random?: RandomAllianceSettings;
  baseSeed?: number;
  executor: Executor;
  skip?: Iterable<string>;
  previous?: BatchResultsFile;
  onDone?: (file: BatchResultsFile) => void;
}): ActiveRun {
  const jobs = args.jobs ?? buildJobs(args.base, args.params, args.configs, args.seeds);
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
      let file = makeResultsFile({ name: args.name, game: session.game, base: args.base, params: args.params, configs: args.configs, seeds: args.seeds, random: args.random, baseSeed: args.baseSeed, outcome });
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
// Sweep helpers
// ---------------------------------------------------------------------------

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

function autoName(kind: "lineup" | "archetype", params: ParamRow[], optionOf: (p: ParamRow) => ParamOption | null, subjects: RobotDesign[]): string {
  const date = shortDate();
  const sweep = params.length === 1 ? `${optionOf(params[0]!)?.short ?? "Setting"} sweep` : params.length > 1 ? `${params.length}-setting sweep` : "";
  if (kind === "archetype") {
    const who = subjects.length === 1 ? subjects[0]!.name : `${subjects.length} designs`;
    return `${who} on random alliances${sweep ? ` · ${sweep}` : ""} · ${date}`;
  }
  return `${sweep || "Lineup comparison"} · ${date}`;
}

interface Owner {
  /** Index used in ParamRow.robot. */
  index: number;
  label: string;
  design: RobotDesign;
  driverId: string;
  agent: boolean;
}

interface SweepDeps {
  s: SweepState;
  owners: Owner[];
  ownerSelectable: boolean;
  baseSeed: number;
  rerender: () => void;
  /** Heading shown above the editor. */
  intro: string;
}

function optionFor(p: ParamRow, owner: Owner | undefined): ParamOption | null {
  if (!owner) return null;
  if (p.kind === "design") return designOptions(owner.design, session.game).find((o) => o.path === p.path) ?? null;
  const knob = knobFor(p.path as keyof DriverProfile);
  return knob ? knobOption(knob, Number(profileById(owner.driverId)[knob.key])) : null;
}

function ownerLabel(o: Owner): string {
  return `${o.label}: ${o.design.name}`;
}

/** Builds the sweep parameters for the batch package; `robotIndex` maps an owner index to the robot index in the match. */
function buildSweepParams(deps: SweepDeps, robotIndex: (ownerIndex: number) => number | undefined): SweepParam[] {
  const { s } = deps;
  const params = s.params.map((p) => {
    const owner = deps.owners.find((o) => o.index === p.robot);
    const opt = optionFor(p, owner);
    if (!owner || !opt) throw new Error("A setting points at a robot slot that is empty. Pick a robot or remove the setting.");
    const robot = robotIndex(p.robot);
    if (robot === undefined) throw new Error("A setting points at an empty slot.");
    const label = fullParamLabel(owner.label, opt);
    const target = p.kind === "design" ? ({ kind: "design", robot, path: p.path } as const) : ({ kind: "profile", robot, knob: p.path as keyof DriverProfile } as const);
    if (s.mode === "grid") {
      const values = parseValues(p.values);
      if (!values.length) throw new Error(`"${label}" needs at least one number to test.`);
      return { id: label, label, unit: opt.unit, target, values };
    }
    if (!(p.max > p.min)) throw new Error(`"${label}": the highest value must be bigger than the lowest.`);
    return { id: label, label, unit: opt.unit, target, min: p.min, max: p.max };
  });
  if (new Set(params.map((p) => p.id)).size !== params.length) throw new Error("Two of the settings change the same thing. Remove one.");
  return params;
}

function buildConfigs(s: SweepState, params: SweepParam[], baseSeed: number): SweepConfig[] {
  if (!params.length) return [{ id: "c0", values: {} }];
  return s.mode === "grid" ? grid(params) : latinHypercube(params, s.lhsCount, baseSeed);
}

/** The "what to change" editor shared by both modes, with plain-language explanations and a preview. */
function sweepEditor(deps: SweepDeps): HTMLElement {
  const { s, owners } = deps;
  const addParam = () => {
    const first = owners[0];
    if (!first) return toast("Put a robot in a slot first.");
    const o = designOptions(first.design, session.game)[0]!;
    s.params.push({ robot: first.index, kind: "design", path: o.path, values: defaultValues(o), min: o.min, max: o.max });
    deps.rerender();
  };
  const preview = () => {
    try {
      const params = buildSweepParams(deps, (i) => i);
      const configs = buildConfigs(s, params, deps.baseSeed);
      if (!params.length) return null;
      const shown = configs.slice(0, 12);
      return h(
        "details",
        { class: "small" },
        h("summary", null, `Preview: the ${configs.length} settings that will be tested`),
        h(
          "div",
          { class: "lab-scroll" },
          h(
            "table",
            null,
            h("thead", null, h("tr", null, h("th", null, "#"), params.map((p) => h("th", { class: "num" }, p.label ?? p.id)))),
            h(
              "tbody",
              null,
              shown.map((c, i) => h("tr", null, h("td", null, String(i + 1)), params.map((p) => h("td", { class: "num" }, fmt(c.values[p.id]))))),
            ),
          ),
        ),
        configs.length > shown.length ? h("p", { class: "muted" }, `…and ${configs.length - shown.length} more.`) : null,
      );
    } catch {
      return null;
    }
  };

  const paramRow = (p: ParamRow, k: number) => {
    const owner = owners.find((o) => o.index === p.robot) ?? owners[0];
    const opts = owner ? designOptions(owner.design, session.game) : [];
    const knobs = owner?.agent ? PROFILE_KNOBS : [];
    const current = optionFor(p, owner);
    const pick = (kind: ParamRow["kind"], path: string) => {
      p.kind = kind;
      p.path = path;
      const o = optionFor(p, owner);
      if (o) {
        p.values = defaultValues(o);
        p.min = o.min;
        p.max = o.max;
      }
      deps.rerender();
    };
    return h(
      "div",
      { class: "lab-param" },
      h(
        "div",
        { class: "row center" },
        deps.ownerSelectable
          ? h(
              "select",
              {
                class: "grow",
                "aria-label": "Which robot",
                onchange: (e: Event) => {
                  p.robot = Number((e.target as HTMLSelectElement).value);
                  const next = owners.find((o) => o.index === p.robot);
                  if (next) pick("design", designOptions(next.design, session.game)[0]!.path);
                },
              },
              owners.map((o) => h("option", { value: String(o.index), selected: o.index === p.robot }, ownerLabel(o))),
            )
          : h("b", { class: "grow" }, owner ? ownerLabel(owner) : ""),
        h("button", { class: "btn small", onclick: () => (s.params.splice(k, 1), deps.rerender()), "aria-label": "Remove this setting" }, "×"),
      ),
      h(
        "select",
        {
          "aria-label": "Which setting to change",
          onchange: (e: Event) => {
            const [kind, path] = (e.target as HTMLSelectElement).value.split("|") as [ParamRow["kind"], string];
            pick(kind, path);
          },
        },
        groupBy(opts).map(([part, list]) => h("optgroup", { label: part }, list.map((o) => h("option", { value: `design|${o.path}`, selected: p.kind === "design" && p.path === o.path }, o.short + (o.unit ? ` (${o.unit})` : ""))))),
        knobs.length ? h("optgroup", { label: "Driver (how the computer driver plays)" }, knobs.map((kn) => h("option", { value: `profile|${String(kn.key)}`, selected: p.kind === "profile" && p.path === kn.key }, kn.label))) : null,
      ),
      current ? h("p", { class: "small muted", style: "margin:0" }, current.help) : null,
      current && Number.isFinite(current.value) ? h("p", { class: "small muted", style: "margin:0" }, `Currently ${fmt(current.value)}${current.unit ? ` ${current.unit}` : ""}. Allowed range ${fmt(current.min)} to ${fmt(current.max)}.`) : null,
      s.mode === "grid"
        ? labeled("Values to test", h("input", { type: "text", value: p.values, onchange: (e: Event) => (p.values = (e.target as HTMLInputElement).value), "aria-label": "Values to test" }), "Separate with commas, e.g. 6, 9, 12")
        : h(
            "div",
            { class: "row" },
            labeled("Lowest value", numberInput(p.min, (v) => (p.min = v), { step: "any", style: "width:110px" })),
            labeled("Highest value", numberInput(p.max, (v) => (p.max = v), { step: "any", style: "width:110px" })),
          ),
    );
  };

  return h(
    "div",
    { class: "panel col" },
    h("div", { class: "row center" }, h("h2", { class: "grow" }, "What to change"), h("button", { class: "btn", onclick: addParam }, "+ Add a setting")),
    h("p", { class: "small muted", style: "margin:0" }, deps.intro),
    h(
      "div",
      { class: "row center" },
      h(
        "div",
        { class: "lab-seg" },
        h("button", { class: s.mode === "grid" ? "sel" : "", onclick: () => ((s.mode = "grid"), deps.rerender()) }, "Test specific values"),
        h("button", { class: s.mode === "lhs" ? "sel" : "", onclick: () => ((s.mode = "lhs"), deps.rerender()) }, "Spread across a range"),
      ),
      help(
        "Test specific values: you type the exact values to try (like 6, 9, 12). With several settings it tries every combination. Spread across a range (also called a Latin hypercube): you give a lowest and highest value; the tool splits each range into equal slices and tests one random value from every slice, so the whole range is covered evenly with far fewer matches than trying every combination.",
      ),
      s.mode === "lhs" ? labeled("How many settings to try", numberInput(s.lhsCount, (v) => ((s.lhsCount = Math.max(2, Math.round(v))), deps.rerender()), { min: 2, max: 200, style: "width:90px" })) : null,
    ),
    s.mode === "lhs"
      ? h(
          "p",
          { class: "small muted", style: "margin:0" },
          `Spread across a range (Latin hypercube): the range is cut into ${s.lhsCount} equal slices and one value is tested from each, so every part of the range is covered evenly. It's the efficient way to test several settings at once.`,
        )
      : h("p", { class: "small muted", style: "margin:0" }, "Test specific values: every value you list is tested. With more than one setting, every combination is tried (3 values × 3 values = 9 settings)."),
    s.params.length ? null : h("p", { class: "small muted" }, "Nothing selected: every match uses the robots as designed. That's a straight comparison of the designs."),
    s.params.map((p, k) => paramRow(p, k)),
    preview(),
  );
}

function groupBy(opts: ParamOption[]): [string, ParamOption[]][] {
  const m = new Map<string, ParamOption[]>();
  for (const o of opts) m.set(o.part, [...(m.get(o.part) ?? []), o]);
  return [...m.entries()];
}

// ---------------------------------------------------------------------------
// Duplicate a run's settings
// ---------------------------------------------------------------------------

function rowsFromParams(params: SweepParam[], slotOf: (robot: number) => number): SweepState["params"] {
  return params.map((p) => ({
    robot: slotOf(p.target.robot),
    kind: p.target.kind,
    path: p.target.kind === "design" ? p.target.path : String(p.target.knob),
    values: (p.values ?? []).join(", "),
    min: p.min ?? 0,
    max: p.max ?? 1,
  }));
}

function loadSettings(file: BatchResultsFile): void {
  const { base, params, configs, seeds, random } = file.settings;
  const baseSeed = file.settings.baseSeed ?? 6220;
  const common: Partial<CommonRun> = { name: `${file.name} (copy)`, nameTouched: true, baseSeed, profile: base.profile ?? session.game.game.defaultProfile };
  const lhs = params.some((p) => p.values === undefined);
  if (random) {
    archetype = {
      ...defaultArchetypeSetup(random.subjects),
      ...common,
      pool: random.pool,
      matches: random.matches,
      others: random.others.kind === "fixed" ? "fixed" : random.others.skill ? "skill" : "random",
      skill: random.others.kind === "random" && random.others.skill ? random.others.skill : "average",
      fixedProfile: random.others.kind === "fixed" ? random.others.profile.id : "balanced",
      subjectProfile: random.subjectProfile?.id ?? "balanced",
      params: rowsFromParams(params, () => 0),
      mode: lhs ? "lhs" : "grid",
      lhsCount: configs.length,
    };
    screenMode = "archetype";
  } else {
    const fresh = defaultBatchSetup();
    const n = session.game.game.robotsPerAlliance;
    const slotIndex = (r: { alliance: Alliance; station: number }) => (r.alliance === "blue" ? 0 : n) + r.station;
    fresh.slots.forEach((slot) => (slot.design = null));
    base.robots.forEach((r, i) => {
      const slot = fresh.slots[slotIndex(r)];
      if (!slot) return;
      slot.design = r.design;
      const d = base.drivers[i];
      slot.driver = d?.kind === "agent" ? (PROFILE_PRESETS.some((p) => p.id === d.profile.id) ? d.profile.id : "balanced") : "idle";
    });
    setup = {
      ...fresh,
      ...common,
      params: rowsFromParams(params, (robot) => slotIndex(base.robots[robot]!)),
      mode: lhs ? "lhs" : "grid",
      lhsCount: lhs ? configs.length : fresh.lhsCount,
      matchesPerConfig: seeds.length,
    };
    screenMode = "lineup";
  }
  toast(`Loaded the settings from "${file.name}". Change what you like and start a new run.`);
  if (rerenderScreen) rerenderScreen();
  else navigate("/lab/batch");
}

labHooks.duplicateSettings = loadSettings;
labHooks.testArchetype = (designNames) => {
  const designs = allDesigns().filter((d) => designNames.includes(d.name));
  archetype = defaultArchetypeSetup(designs);
  screenMode = "archetype";
  if (rerenderScreen) rerenderScreen();
  else navigate("/lab/batch");
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function batchScreen(root: HTMLElement): () => void {
  setup ??= defaultBatchSetup();
  archetype ??= defaultArchetypeSetup();
  const designs = allDesigns();
  const body = h("div", { class: "lab" });
  root.appendChild(body);
  let unsub: (() => void) | null = null;

  const render = () => {
    clear(body);
    unsub?.();
    unsub = null;
    const cur = setup!;
    const arch = archetype!;
    put(
      body,
      h(
        "div",
        { class: "row center" },
        title("h1", "Batch & sweeps", { class: "grow" }),
        h("button", { class: "btn", onclick: () => importResultsFile(onImported) }, "Import a saved run…"),
        h("button", { class: "btn", disabled: !labState.runs.length, onclick: () => navigate("/lab/dashboard") }, `Results (${labState.runs.length})`),
      ),
      h(
        "p",
        { class: "lab-intro muted" },
        "Run lots of simulated matches at once to find out which robot designs and settings really matter. Pick who plays, choose what to change, press Start, and read the answer on the Results page. Matches run on this device; export a run to keep it.",
      ),
      glossaryPanel("Short explanations of every term on these pages."),
      h(
        "div",
        { class: "row center" },
        h(
          "div",
          { class: "lab-seg" },
          h("button", { class: screenMode === "lineup" ? "sel" : "", onclick: () => ((screenMode = "lineup"), render()) }, "Compare a lineup"),
          h("button", { class: screenMode === "archetype" ? "sel" : "", onclick: () => ((screenMode = "archetype"), render()) }, "Test an archetype"),
        ),
        help(
          "Compare a lineup: you choose all six robots and play that exact matchup over and over (different random seeds). Test an archetype: you choose the design to study; each match puts it on a random alliance with random partners and opponents using random strategies, so you learn how good the design is in general.",
        ),
      ),
      h(
        "p",
        { class: "small muted", style: "margin:0" },
        screenMode === "lineup"
          ? "You pick all six robots. The same matchup is replayed with different seeds, so differences come from your settings."
          : "You pick the design(s) to study. Every match shuffles which alliance and station it plays on, and who its partners and opponents are. Good for \"how does this design do in general?\"",
      ),
    );
    if (active) put(body, progressPanel());
    if (screenMode === "lineup") put(body, h("div", { class: "grid2" }, robotsPanel(cur), h("div", { class: "col" }, lineupSweep(cur), lineupRun(cur))));
    else put(body, h("div", { class: "grid2" }, archetypePanel(arch), h("div", { class: "col" }, archetypeSweep(arch), archetypeRun(arch))));
    put(body, runsPanel({ onOpen: (i) => ((labState.selectedRun = i), navigate("/lab/dashboard")), onChange: render, selected: labState.selectedRun }));
  };
  rerenderScreen = render;

  const onImported = (file: BatchResultsFile) => {
    const total = plannedOf(file);
    const done = completedJobIds(file).size;
    addRun(file);
    const remaining = total - done;
    toast(`Imported "${file.name}": ${done} of ${total} matches finished.`);
    if (remaining > 0 && !active)
      body.prepend(
        h(
          "div",
          { class: "panel hint row center" },
          h("span", { class: "grow" }, `"${file.name}" has ${remaining} unfinished matches.`),
          h("button", { class: "btn primary", onclick: () => resume(file) }, "Finish this run"),
        ),
      );
    else render();
  };

  const plannedOf = plannedMatches;

  const resume = (file: BatchResultsFile) => {
    try {
      const jobs = jobsFromFile(file); // throws on a broken sweep definition
      const { base, params, configs, seeds, random, baseSeed } = file.settings;
      startBatch({ name: file.name, base: { ...base, game: base.game }, params, configs, seeds, jobs, random, baseSeed, executor: makeExecutor(setup!), skip: completedJobIds(file), previous: file });
      render();
    } catch (e) {
      toast((e as Error).message, 6000);
    }
  };

  // ---- lineup mode --------------------------------------------------------

  const robotsPanel = (cur: BatchSetup) =>
    h(
      "div",
      { class: "panel col" },
      h("div", { class: "row center" }, h("h2", { class: "grow" }, "Who plays"), help("Each row is a spot on the field. Pick a robot design and how its computer driver plays. A driver set to Idle just sits still. Leave a slot empty to take that robot off the field.")),
      h("p", { class: "small muted", style: "margin:0" }, "Pick a design and a driver for each spot. Empty spots stay off the field."),
      cur.slots.map((slot) =>
        h(
          "div",
          { class: "slot" },
          h("span", { class: `who ${slot.alliance}` }, slotName(slot.alliance, slot.station)),
          h(
            "select",
            {
              "aria-label": `Design for ${slotName(slot.alliance, slot.station)}`,
              onchange: (e: Event) => {
                const v = (e.target as HTMLSelectElement).value;
                slot.design = v === "" ? null : (designs[Number(v)] ?? null);
                cur.params = cur.params.filter((p) => cur.slots[p.robot]?.design);
                render();
              },
            },
            h("option", { value: "", selected: !slot.design }, "— empty —"),
            designs.map((d, i) => h("option", { value: String(i), selected: slot.design === d }, d.name)),
          ),
          h(
            "select",
            { disabled: !slot.design, "aria-label": `Driver for ${slotName(slot.alliance, slot.station)}`, onchange: (e: Event) => ((slot.driver = (e.target as HTMLSelectElement).value), render()) },
            h("option", { value: "idle", selected: slot.driver === "idle" }, "Idle (doesn't move)"),
            PROFILE_PRESETS.map((p) => h("option", { value: p.id, selected: slot.driver === p.id }, p.label)),
          ),
        ),
      ),
    );

  const lineupOwners = (cur: BatchSetup): Owner[] =>
    cur.slots.flatMap((slot, i) => (slot.design ? [{ index: i, label: slotName(slot.alliance, slot.station), design: slot.design, driverId: slot.driver, agent: slot.driver !== "idle" }] : []));

  const lineupDeps = (cur: BatchSetup): SweepDeps => ({
    s: cur,
    owners: lineupOwners(cur),
    ownerSelectable: true,
    baseSeed: cur.baseSeed,
    rerender: render,
    intro: "Pick a robot and one of its settings. The sim plays the whole matchup at each value so you can see how that one setting changes the results.",
  });

  const lineupSweep = (cur: BatchSetup) => sweepEditor(lineupDeps(cur));

  const buildLineup = (cur: BatchSetup) => {
    const robots: MatchRobot[] = [];
    const drivers: DriverSpec[] = [];
    const indexMap = new Map<number, number>();
    cur.slots.forEach((slot, i) => {
      if (!slot.design) return;
      indexMap.set(i, robots.length);
      robots.push({ design: structuredClone(slot.design), alliance: slot.alliance, station: slot.station });
      drivers.push(slot.driver === "idle" ? { kind: "idle" } : { kind: "agent", profile: { ...profileById(slot.driver) } as DriverProfile });
    });
    if (!robots.length) throw new Error("Put at least one robot in a slot.");
    const params = buildSweepParams(lineupDeps(cur), (i) => indexMap.get(i));
    const configs = buildConfigs(cur, params, cur.baseSeed);
    const seeds = seedsFrom(Math.max(1, Math.round(cur.matchesPerConfig)), cur.baseSeed);
    const base: Omit<MatchSpec, "seed"> = { game: session.game.game.id, robots, drivers, profile: cur.profile };
    return { base, params, configs, seeds };
  };

  const lineupName = (cur: BatchSetup) => {
    if (cur.nameTouched && cur.name) return cur.name;
    const deps = lineupDeps(cur);
    return autoName("lineup", cur.params, (p) => optionFor(p, deps.owners.find((o) => o.index === p.robot)), []);
  };

  const lineupRun = (cur: BatchSetup) => {
    let total = 0;
    let error = "";
    try {
      const r = buildLineup(cur);
      total = r.configs.length * r.seeds.length;
    } catch (e) {
      error = (e as Error).message;
    }
    const start = () => {
      try {
        const r = buildLineup(cur);
        if (r.configs.length * r.seeds.length > 5000 && !confirm(`This is ${r.configs.length * r.seeds.length} matches. Run anyway?`)) return;
        // Check every path resolves before spawning workers.
        for (const p of r.params) if (p.target.kind === "design" && getAtPath(r.base.robots[p.target.robot]!.design, p.target.path.replace(/\/[^/]+$/, "")) === undefined) throw new Error(`Setting "${p.label ?? p.id}" does not exist on that design.`);
        startBatch({ name: lineupName(cur), ...r, baseSeed: cur.baseSeed, executor: makeExecutor(cur), onDone: (file) => toast(`"${file.name}" finished: ${file.results.length} matches. Export it to keep it.`) });
        render();
      } catch (e) {
        toast((e as Error).message, 6000);
      }
    };
    return runPanel(cur, { nameValue: lineupName(cur), matchesLabel: "Matches per setting", matchesHelp: "Each setting is played this many times, each with a different seed. More matches give a more trustworthy answer but take longer.", matches: cur.matchesPerConfig, setMatches: (v) => (cur.matchesPerConfig = Math.max(1, Math.round(v))), total, error, start, totalText: `${total} matches in total (${total ? Math.round(total / Math.max(1, buildSafeConfigs(cur))) : 0} per setting).` });
  };

  const buildSafeConfigs = (cur: BatchSetup): number => {
    try {
      const r = buildLineup(cur);
      return r.configs.length;
    } catch {
      return 1;
    }
  };

  // ---- archetype mode -----------------------------------------------------

  const checklist = (list: RobotDesign[], chosen: RobotDesign[], onToggle: (d: RobotDesign, on: boolean) => void) =>
    h(
      "div",
      { class: "lab-pick col", style: "gap:2px" },
      list.map((d) =>
        h(
          "label",
          { class: "lab-check" },
          h("input", { type: "checkbox", checked: chosen.includes(d), onchange: (e: Event) => (onToggle(d, (e.target as HTMLInputElement).checked), render()) }),
          d.name,
        ),
      ),
    );

  const archetypePanel = (arch: ArchetypeSetup) =>
    h(
      "div",
      { class: "panel col" },
      h("div", { class: "row center" }, h("h2", { class: "grow" }, "Who to test"), help("The robot(s) under test appear in every match, on a random alliance and station. Everyone else is drawn at random from the 'other robots' pool and driven by random strategies.")),
      h("h3", { style: "margin-top:4px" }, "Robot(s) to test"),
      checklist(designs, arch.subjects, (d, on) => (arch.subjects = on ? [...arch.subjects, d] : arch.subjects.filter((x) => x !== d))),
      h("h3", { style: "margin-top:8px" }, "Other robots on the field"),
      h("div", { class: "controls" }, h("button", { class: "btn small", onclick: () => ((arch.pool = [...designs]), render()) }, "All designs"), h("button", { class: "btn small", onclick: () => ((arch.pool = []), render()) }, "None")),
      checklist(designs, arch.pool, (d, on) => (arch.pool = on ? [...arch.pool, d] : arch.pool.filter((x) => x !== d))),
      h("h3", { style: "margin-top:8px" }, "How the other drivers play"),
      h(
        "div",
        { class: "col", style: "gap:4px" },
        h("label", { class: "lab-check" }, h("input", { type: "radio", name: "others", checked: arch.others === "random", onchange: () => ((arch.others = "random"), render()) }), "Random strategies and skill levels (like a real event)"),
        h(
          "label",
          { class: "lab-check" },
          h("input", { type: "radio", name: "others", checked: arch.others === "skill", onchange: () => ((arch.others = "skill"), render()) }),
          "Random strategies, all at one skill level:",
          h("select", { disabled: arch.others !== "skill", onchange: (e: Event) => (arch.skill = (e.target as HTMLSelectElement).value as SkillLevel) }, (Object.keys(SKILL_LABELS) as SkillLevel[]).map((k) => h("option", { value: k, selected: arch.skill === k }, SKILL_LABELS[k]))),
        ),
        h(
          "label",
          { class: "lab-check" },
          h("input", { type: "radio", name: "others", checked: arch.others === "fixed", onchange: () => ((arch.others = "fixed"), render()) }),
          "Everyone plays the same strategy:",
          h("select", { disabled: arch.others !== "fixed", onchange: (e: Event) => (arch.fixedProfile = (e.target as HTMLSelectElement).value) }, PROFILE_PRESETS.map((p) => h("option", { value: p.id, selected: arch.fixedProfile === p.id }, p.label))),
        ),
      ),
      labeled(
        "How the robot under test is driven",
        h("select", { onchange: (e: Event) => (arch.subjectProfile = (e.target as HTMLSelectElement).value) }, PROFILE_PRESETS.map((p) => h("option", { value: p.id, selected: arch.subjectProfile === p.id }, p.label))),
        undefined,
        "The same driver is used for the robot under test in every match, so differences come from the design.",
      ),
    );

  const archetypeOwners = (arch: ArchetypeSetup): Owner[] =>
    arch.subjects.length === 1 ? [{ index: 0, label: "Test robot", design: arch.subjects[0]!, driverId: arch.subjectProfile, agent: true }] : [];

  const archetypeDeps = (arch: ArchetypeSetup): SweepDeps => ({
    s: arch,
    owners: archetypeOwners(arch),
    ownerSelectable: false,
    baseSeed: arch.baseSeed,
    rerender: render,
    intro: "Optional: also change one of the robot under test's settings. Every setting is played on the same random lineups, so the comparison is fair.",
  });

  const archetypeSweep = (arch: ArchetypeSetup) =>
    arch.subjects.length === 1
      ? sweepEditor(archetypeDeps(arch))
      : h("div", { class: "panel col" }, h("h2", null, "What to change"), h("p", { class: "small muted" }, arch.subjects.length ? "Changing settings works with one robot under test. Pick just one robot to add settings." : "Pick a robot to test first."));

  const randomSettings = (arch: ArchetypeSetup, params: SweepParam[], configs: SweepConfig[]): RandomAllianceSettings => {
    const others: ProfileMode = arch.others === "fixed" ? { kind: "fixed", profile: { ...profileById(arch.fixedProfile) } } : { kind: "random", skill: arch.others === "skill" ? arch.skill : undefined };
    return {
      subjects: arch.subjects.map((d) => structuredClone(d)),
      pool: arch.pool.map((d) => structuredClone(d)),
      matches: Math.max(1, Math.round(arch.matches)),
      baseSeed: arch.baseSeed,
      others,
      subjectProfile: { ...profileById(arch.subjectProfile) },
      game: session.game.game.id,
      profile: arch.profile,
      params,
      configs,
    };
  };

  const buildArchetype = (arch: ArchetypeSetup) => {
    if (!arch.subjects.length) throw new Error("Pick at least one robot to test.");
    if (!arch.pool.length) throw new Error("Pick at least one design for the other robots.");
    const params = buildSweepParams(archetypeDeps(arch), (i) => i);
    const configs = buildConfigs(arch, params, arch.baseSeed);
    const random = randomSettings(arch, params, configs);
    const jobs = randomAllianceJobs(random);
    const first = jobs[0]!.spec;
    const base: Omit<MatchSpec, "seed"> = { game: session.game.game.id, robots: first.robots, drivers: first.drivers, profile: arch.profile };
    return { base, params, configs, seeds: seedsFrom(Math.max(1, Math.round(arch.matches)), arch.baseSeed), jobs, random };
  };

  const archetypeName = (arch: ArchetypeSetup) => {
    if (arch.nameTouched && arch.name) return arch.name;
    const deps = archetypeDeps(arch);
    return autoName("archetype", arch.params, (p) => optionFor(p, deps.owners.find((o) => o.index === p.robot)), arch.subjects);
  };

  const archetypeRun = (arch: ArchetypeSetup) => {
    let total = 0;
    let error = "";
    try {
      total = buildArchetype(arch).jobs.length;
    } catch (e) {
      error = (e as Error).message;
    }
    const start = () => {
      try {
        const r = buildArchetype(arch);
        if (r.jobs.length > 5000 && !confirm(`This is ${r.jobs.length} matches. Run anyway?`)) return;
        startBatch({ name: archetypeName(arch), base: r.base, params: r.params, configs: r.configs, seeds: r.seeds, jobs: r.jobs, random: r.random, baseSeed: arch.baseSeed, executor: makeExecutor(arch), onDone: (file) => toast(`"${file.name}" finished: ${file.results.length} matches. Export it to keep it.`) });
        render();
      } catch (e) {
        toast((e as Error).message, 6000);
      }
    };
    return runPanel(arch, { nameValue: archetypeName(arch), matchesLabel: "Matches per robot and setting", matchesHelp: "How many random matches each tested robot plays (at each setting, if you change one). 40 or more gives a steadier picture because lineups vary a lot.", matches: arch.matches, setMatches: (v) => (arch.matches = Math.max(1, Math.round(v))), total, error, start, totalText: `${total} matches in total.` });
  };

  // ---- shared run panel ---------------------------------------------------

  const runPanel = (
    cur: CommonRun,
    o: { nameValue: string; matchesLabel: string; matchesHelp: string; matches: number; setMatches: (v: number) => void; total: number; error: string; start: () => void; totalText: string },
  ) => {
    const profiles = Object.keys(session.game.game.thresholdProfiles);
    return h(
      "div",
      { class: "panel col" },
      h("h2", null, "Run it"),
      h(
        "div",
        { class: "lab-form" },
        labeled(
          "Name this run",
          h("input", {
            type: "text",
            value: o.nameValue,
            onchange: (e: Event) => {
              const v = (e.target as HTMLInputElement).value.trim();
              cur.name = v;
              cur.nameTouched = v.length > 0;
              render();
            },
          }),
          undefined,
          "A name you will recognize later. It's used in the Results page and in the downloaded file.",
        ),
        labeled(o.matchesLabel, numberInput(o.matches, (v) => (o.setMatches(v), render()), { min: 1, max: 1000 }), undefined, o.matchesHelp),
        labeled("Random seed", numberInput(cur.baseSeed, (v) => ((cur.baseSeed = Math.round(v)), render())), undefined, "A seed is a number that decides every random thing in the matches. Use the same seed to get exactly the same run again; change it to try different luck."),
        labeled(
          "Bonus point rules",
          h("select", { onchange: (e: Event) => (cur.profile = (e.target as HTMLSelectElement).value) }, profiles.map((p) => h("option", { value: p, selected: p === cur.profile }, humanize(p)))),
          undefined,
          "Which event's bonus ranking point thresholds to use. Only affects the ranking point results.",
        ),
        labeled("Matches at once", numberInput(cur.workers, (v) => (cur.workers = Math.max(1, Math.min(cores, Math.round(v)))), { min: 1, max: cores }), `This device has ${cores} cores.`, "How many matches are simulated at the same time. More is faster but makes the device work harder."),
        h("label", { class: "lab-check" }, h("input", { type: "checkbox", checked: cur.throttle, onchange: (e: Event) => (cur.throttle = (e.target as HTMLInputElement).checked) }), "Go easy on a slow device (slower, cooler)"),
      ),
      o.error ? h("p", { class: "small red" }, o.error) : h("p", { class: "small muted" }, o.totalText),
      h("button", { class: "btn primary big", disabled: !!o.error || !!active, onclick: o.start }, active ? "A run is already going" : "Start"),
      workerSupported() ? null : h("p", { class: "small muted" }, "This browser can't run matches in the background, so matches run on the main page and it may feel sluggish."),
      saveNotice(),
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
      text.textContent = `${p.done} of ${p.total} matches done · ${p.failed} failed · ${p.running} running now · ${fmt(p.matchesPerMinute, 1)} matches/min · elapsed ${fmtDuration(p.elapsedMs)} · about ${fmtDuration(p.etaMs)} left`;
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
      h("div", { class: "controls" }, pauseBtn, h("button", { class: "btn", onclick: () => run.runner.cancel() }, "Stop and keep results so far")),
      h("p", { class: "small muted" }, "Pause lets the matches already running finish. Stopping keeps everything finished so far."),
    );
    update();
    return panel;
  };

  render();
  return () => {
    unsub?.();
    rerenderScreen = null;
  };
}
