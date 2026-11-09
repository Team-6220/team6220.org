import { checkDesignRunnable, Match, type MatchEvent } from "@goldsim/core";
import {
  AutoExecutor,
  collectNamedCommands,
  collectPathNames,
  namedCommandMap,
  parseAuto,
  parsePath,
  samplePath,
  type PPAuto,
  type PPPath,
  type SampledPath,
} from "@goldsim/pathplan";
import type { NamedCommand, Pose, RobotDesign } from "@goldsim/schema";
import { session } from "../app-state.js";
import { FieldRenderer } from "../render/field-renderer.js";
import { getRotation, rotateView } from "../render/view-rotation.js";
import { appendAll, clear, h, openModal, title, toast } from "../ui/dom.js";
import { onThemeChange } from "../ui/theme.js";

/** Imported PathPlanner files live in memory for the session (saving to a team workspace arrives with accounts). */
const store = {
  paths: new Map<string, { path: PPPath; sampled: SampledPath }>(),
  autos: new Map<string, { auto: PPAuto; warnings: string[] }>(),
  errors: [] as string[],
  selected: null as string | null,
  overrides: {} as Record<string, NamedCommand | null>,
  seed: 1,
  speed: 2,
};

const ACTIONS = ["intake", "shoot", "climb", "deploy", "place"] as const;
const MAX_FILE_BYTES = 2_000_000;

const baseName = (file: string) => file.replace(/\\/g, "/").split("/").pop()!.replace(/\.(path|auto|json)$/i, "");
const fmt = (v: number, d = 2) => v.toFixed(d);

async function importFiles(list: FileList | File[]): Promise<void> {
  const errors: string[] = [];
  let count = 0;
  for (const file of Array.from(list)) {
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name}: file is too large (over 2 MB).`);
      continue;
    }
    const text = await file.text();
    const name = baseName(file.name);
    const isAuto = /\.auto$/i.test(file.name) || (/\.json$/i.test(file.name) && text.includes('"command"'));
    if (isAuto) {
      const r = parseAuto(text, name);
      if (r.ok) {
        store.autos.set(name, { auto: r.value, warnings: r.warnings });
        store.selected ??= name;
        count++;
      } else errors.push(`${file.name}: ${r.errors.join("; ")}`);
    } else {
      const r = parsePath(text, name);
      if (!r.ok) {
        errors.push(`${file.name}: ${r.errors.join("; ")}`);
        continue;
      }
      try {
        store.paths.set(name, { path: r.value, sampled: samplePath(r.value) });
        count++;
      } catch (e) {
        errors.push(`${file.name}: ${(e as Error).message}`);
      }
    }
  }
  store.errors = errors;
  toast(`Imported ${count} file${count === 1 ? "" : "s"}${errors.length ? `, ${errors.length} failed` : ""}.`);
}

function pickFiles(onFiles: (files: FileList) => void): void {
  const input = h("input", { type: "file", accept: ".path,.auto,.json", multiple: true });
  input.addEventListener("change", () => input.files && input.files.length && onFiles(input.files));
  input.click();
}

/** Where the robot should start: the auto's starting pose, else the first path's start, facing along it. */
function startFor(auto: PPAuto): Pose | null {
  const first = collectPathNames(auto.command)
    .map((n) => store.paths.get(n))
    .find(Boolean);
  const start = auto.startingPose ?? (first ? { x: first.sampled.start.x, y: first.sampled.start.y, rotationDegrees: undefined } : null);
  if (!start) return null;
  let theta = 0;
  if (auto.startingPose) theta = (auto.startingPose.rotationDegrees * Math.PI) / 180;
  else if (first) {
    const pts = first.sampled.points;
    const a = pts[0];
    const b = pts[Math.min(pts.length - 1, 8)];
    if (a && b) theta = Math.atan2(b.y - a.y, b.x - a.x) + (first.sampled.reversed ? Math.PI : 0);
  }
  return { x: start.x, y: start.y, theta };
}

/**
 * Opens the "Test autos" panel: import PathPlanner files, map named commands to robot actions,
 * and watch the auto run live with the design being edited.
 */
export function openTestAutos(getDesign: () => RobotDesign): void {
  let stop: (() => void) | null = null;
  let liveMatch: Match | null = null;
  let unTheme: (() => void) | null = null;
  const lookupPath = (name: string) => store.paths.get(name)?.path;

  const left = h("div", { class: "col", style: "width:250px; flex:none" });
  const right = h("div", { class: "col grow", style: "min-width:0" });
  const canvas = h("canvas", { style: "width:100%; height:340px; border:2px solid var(--gray-4); background:var(--gray-1)" });
  const result = h("div", { class: "col" });
  const body = h("div", { class: "row", style: "width:min(880px, 80vw); align-items:flex-start" }, left, right);
  let renderer: FieldRenderer | null = null;

  const close = openModal(
    h("div", { class: "col" }, h("div", { class: "row center", style: "justify-content:space-between" }, title("h1", "Test autos"), h("button", { class: "btn", onclick: () => close() }, "Close")), body),
    () => {
      stop?.();
      liveMatch?.dispose();
      liveMatch = null;
      unTheme?.();
    },
  );

  const selectedAuto = () => (store.selected ? store.autos.get(store.selected) : undefined);

  function render() {
    clear(left);
    clear(right);
    const dropArea = h(
      "div",
      { class: "panel col" },
      h("button", { class: "btn primary", onclick: () => pickFiles(onFiles) }, "Import .auto / .path files…"),
      h("p", { class: "help-line" }, "Or drop files here. Import the .auto and every .path it uses; paths are matched by file name. Files are validated and never run as code."),
    );
    dropArea.addEventListener("dragover", (e) => (e.preventDefault(), dropArea.classList.add("sel")));
    dropArea.addEventListener("dragleave", () => dropArea.classList.remove("sel"));
    dropArea.addEventListener("drop", (e) => {
      e.preventDefault();
      dropArea.classList.remove("sel");
      if (e.dataTransfer?.files.length) void onFiles(e.dataTransfer.files);
    });
    appendAll(
      left,
      dropArea,
      store.errors.length ? h("ul", { class: "small red" }, store.errors.map((x) => h("li", null, x))) : null,
      h("h3", null, "Autos"),
      store.autos.size
        ? [...store.autos.keys()].map((n) => h("div", { class: `card small${store.selected === n ? " sel" : ""}`, onclick: () => ((store.selected = n), render()) }, n))
        : h("p", { class: "small muted" }, "None yet."),
      h("h3", { style: "margin-top:6px" }, "Paths"),
      store.paths.size ? h("div", { class: "small muted" }, [...store.paths.keys()].join(", ")) : h("p", { class: "small muted" }, "None yet."),
    );

    const sel = selectedAuto();
    if (!sel) {
      appendAll(right, h("div", { class: "panel" }, h("p", { class: "muted" }, "Import a PathPlanner .auto file (and its .path files) to run it with this robot. The robot starts where the auto says and follows the path using its own speed and acceleration, so slower robots finish later.")));
      return;
    }
    const names = collectNamedCommands(sel.auto, lookupPath);
    const missing = collectPathNames(sel.auto.command).filter((n) => !store.paths.has(n));
    const map = namedCommandMap(session.game.namedCommands.namedCommands, store.overrides);
    appendAll(
      right,
      h("div", { class: "panel col" }, h("b", null, store.selected), missing.length ? h("p", { class: "small red" }, `Missing path files: ${missing.join(", ")}. Import them too.`) : null, sel.warnings.length ? h("ul", { class: "small gold" }, sel.warnings.slice(0, 6).map((x) => h("li", null, x))) : null, canvas),
      h(
        "div",
        { class: "row center" },
        h("button", { class: "btn primary", onclick: () => void run(sel.auto) }, "Run auto"),
        h("button", { class: "btn", onclick: () => stop?.() }, "Stop"),
        h("button", { class: "btn", title: "Rotate the field view 90°", onclick: () => (rotateView(1), draw()) }, "Rotate view"),
        h(
          "label",
          { class: "small row center" },
          "Speed ",
          h("select", { onchange: (e: Event) => (store.speed = Number((e.target as HTMLSelectElement).value)) }, [1, 2, 4, 8].map((x) => h("option", { value: String(x), selected: store.speed === x }, `${x}x`))),
        ),
        h("label", { class: "small row center" }, "Seed ", h("input", { type: "number", value: String(store.seed), style: "width:80px", onchange: (e: Event) => (store.seed = Math.round(Number((e.target as HTMLInputElement).value)) || 1) })),
      ),
      h(
        "div",
        { class: "panel col" },
        h("h3", null, "Named commands"),
        names.length
          ? h("table", null, h("thead", null, h("tr", null, ["Name in the auto", "Robot does", "On / off", "For (s)"].map((c) => h("th", null, c)))), h("tbody", null, names.map((n) => mapRow(n, map[n]))))
          : h("p", { class: "small muted" }, "This auto uses no named commands."),
        h("p", { class: "help-line" }, "A named command is a button in your robot code (for example \"IntakeOn\"). Tell the sim what that button does on this robot. Unmapped names do nothing and are listed in the results."),
      ),
      result,
    );
    requestAnimationFrame(draw);
  }

  function mapRow(name: string, cmd: NamedCommand | undefined) {
    const set = (next: NamedCommand | null) => {
      store.overrides[name] = next;
      render();
    };
    const c = cmd ?? null;
    return h(
      "tr",
      null,
      h("td", { class: "mono" }, name),
      h(
        "td",
        null,
        h(
          "select",
          { onchange: (e: Event) => ((v) => set(v ? { ...(c ?? {}), action: v } : null))((e.target as HTMLSelectElement).value) },
          h("option", { value: "", selected: !c }, "nothing (unmapped)"),
          ACTIONS.map((x) => h("option", { value: x, selected: c?.action === x }, x)),
        ),
      ),
      h(
        "td",
        null,
        h(
          "select",
          {
            disabled: !c,
            onchange: (e: Event) => {
              const v = (e.target as HTMLSelectElement).value;
              const { state: _s, ...rest } = c!;
              set(v ? { ...rest, state: v as "on" | "off" } : rest);
            },
          },
          h("option", { value: "", selected: !c?.state }, "just once"),
          h("option", { value: "on", selected: c?.state === "on" }, "turn on"),
          h("option", { value: "off", selected: c?.state === "off" }, "turn off"),
        ),
      ),
      h("td", null, h("input", { type: "number", min: "0", step: "0.1", value: String(c?.durationSeconds ?? 0), disabled: !c, style: "width:70px", onchange: (e: Event) => { if (!c) return; const v = Number((e.target as HTMLInputElement).value); const { durationSeconds: _d, ...rest } = c; set(v > 0 ? { ...rest, durationSeconds: v } : rest); } })),
    );
  }

  async function onFiles(list: FileList | File[]) {
    try {
      await importFiles(list);
    } catch (e) {
      toast((e as Error).message, 6000);
    }
    render();
  }

  // ---- Running ------------------------------------------------------------------

  const draw = () => {
    if (!renderer || !liveMatch) return;
    renderer.render(liveMatch, { rotation: getRotation(), highlight: new Set([0]) });
  };

  async function run(auto: PPAuto) {
    stop?.();
    liveMatch?.dispose();
    liveMatch = null;
    clear(result);
    const design = getDesign();
    const issues = checkDesignRunnable(design, session.game.mechanisms);
    if (issues.length) return toast(`This design cannot run yet: ${issues[0]!.path}: ${issues[0]!.message}`, 7000);
    const start = startFor(auto);
    // The sim never teleports a robot, so start it where the auto begins by giving the match a field with that start pose.
    const base = session.game;
    const game = start ? { ...base, field: { ...base.field, startPositions: [start, ...base.field.startPositions.slice(1)] } } : base;
    let match: Match;
    try {
      match = await Match.create({ game, robots: [{ design: structuredClone(design), alliance: "blue", station: 0 }], seed: store.seed, record: false });
    } catch (e) {
      return toast((e as Error).message, 6000);
    }
    const exec = new AutoExecutor(auto, { lookupPath, namedCommands: session.game.namedCommands.namedCommands, overrides: store.overrides });
    match.drivers = [exec];
    liveMatch = match;
    renderer = new FieldRenderer(canvas, match.game.field.length, match.game.field.width);
    unTheme?.();
    unTheme = onThemeChange(() => (renderer?.refreshPalette(), draw()));

    let raf = 0;
    let acc = 0;
    let last = performance.now();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      stop = null;
      summarize(match, exec, auto);
      draw();
    };
    const frame = (now: number) => {
      acc += Math.min(0.1, (now - last) / 1000) * store.speed;
      last = now;
      let n = 0;
      const cap = 30 * store.speed;
      while (acc >= match.dt && match.period === "auto" && !match.isOver && n++ < cap) {
        match.step();
        acc -= match.dt;
      }
      if (n >= cap) acc = 0;
      draw();
      if (match.period !== "auto" || match.isOver) finish();
      else raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    stop = () => {
      finished = true;
      cancelAnimationFrame(raf);
      stop = null;
      liveMatch = null;
      match.dispose();
    };
  }

  function summarize(match: Match, exec: AutoExecutor, auto: PPAuto) {
    const mine = (t: MatchEvent["type"]) => match.events.filter((e) => e.type === t && "robot" in e && e.robot === 0).length;
    const pose = match.robotPose(0);
    const names = collectPathNames(auto.command);
    const lastPath = store.paths.get(names[names.length - 1] ?? "")?.sampled;
    const endErr = lastPath ? Math.hypot(pose.x - lastPath.end.x, pose.y - lastPath.end.y) : null;
    const fouls = match.events.filter((e) => e.type === "foul");
    clear(result);
    appendAll(
      result,
      h(
        "div",
        { class: "panel col" },
        h("h3", { class: exec.finished ? "green" : "gold" }, exec.finished ? "Auto finished" : "The auto did not finish before AUTO ended"),
        h(
          "p",
          { class: "small" },
          `Points ${match.score.blue.total} (AUTO ${match.score.blue.auto}) · picked up ${mine("piece_acquired")} · launched ${mine("shot_launched")} · scored ${match.events.filter((e) => e.type === "piece_scored" && e.robot === 0).length}`,
          endErr !== null ? ` · ended ${fmt(endErr)} m from the last path's end` : "",
        ),
        fouls.length ? h("p", { class: "small red" }, `Fouls: ${fouls.map((f) => (f.type === "foul" ? `${f.rule} (${f.severity})` : "")).join(", ")}`) : null,
        exec.unmapped.size ? h("p", { class: "small gold" }, `Unmapped named commands (did nothing): ${[...exec.unmapped].join(", ")}`) : null,
        exec.warnings.length ? h("ul", { class: "small gold" }, exec.warnings.slice(0, 8).map((x) => h("li", null, x))) : null,
        h("details", null, h("summary", { class: "small" }, `Step-by-step log (${exec.log.length})`), h("ul", { class: "small mono", style: "max-height:180px; overflow:auto" }, exec.log.map((l) => h("li", null, `${fmt(l.tick / match.hz)} s  ${l.message}`)))),
      ),
    );
  }

  render();
}
