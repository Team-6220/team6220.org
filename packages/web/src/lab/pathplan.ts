import { Match, resolveElements, shapePoints, startPose, type MatchEvent, type Pose, type ResolvedElement } from "@goldsim/core";
import { AutoExecutor, collectNamedCommands, collectPathNames, namedCommandMap, parseAuto, parsePath, samplePath, type PPAuto, type PPPath, type SampledPath } from "@goldsim/pathplan";
import type { Alliance, NamedCommand } from "@goldsim/schema";
import { allDesigns, session } from "../app-state.js";
import { clear, cssVar, h, title, toast } from "../ui/dom.js";
import { onThemeChange } from "../ui/theme.js";
import { dropZone, fmt, labeled, numberInput, pickFiles, put, readFiles } from "./util.js";

// Imported files live in memory for the session; saving them to the team workspace arrives in Phase 2.
const files = {
  paths: new Map<string, { path: PPPath; sampled: SampledPath; warnings: string[] }>(),
  autos: new Map<string, { auto: PPAuto; warnings: string[] }>(),
  errors: [] as string[],
  selected: null as { kind: "path" | "auto"; name: string } | null,
  overrides: {} as Record<string, NamedCommand | null>,
  run: { designIndex: 0, station: -1, seed: 1 },
};

const ACTIONS = ["intake", "shoot", "climb", "deploy", "place"] as const;

function baseName(fileName: string): string {
  return fileName.replace(/\\/g, "/").split("/").pop()!.replace(/\.(path|auto|json)$/i, "");
}

async function importFiles(list: FileList): Promise<void> {
  const loaded = await readFiles(list, 2_000_000);
  const errors: string[] = [];
  let count = 0;
  for (const { name, text } of loaded) {
    const n = baseName(name);
    const isAuto = /\.auto$/i.test(name) || (/\.json$/i.test(name) && text.includes('"command"'));
    if (isAuto) {
      const r = parseAuto(text, n);
      if (r.ok) {
        files.autos.set(n, { auto: r.value, warnings: r.warnings });
        files.selected ??= { kind: "auto", name: n };
        count++;
      } else errors.push(`${name}: ${r.errors.join("; ")}`);
    } else {
      const r = parsePath(text, n);
      if (r.ok) {
        try {
          files.paths.set(n, { path: r.value, sampled: samplePath(r.value), warnings: r.warnings });
          files.selected ??= { kind: "path", name: n };
          count++;
        } catch (e) {
          errors.push(`${name}: ${(e as Error).message}`);
        }
      } else errors.push(`${name}: ${r.errors.join("; ")}`);
    }
  }
  files.errors = errors;
  toast(`Imported ${count} file${count === 1 ? "" : "s"}${errors.length ? `, ${errors.length} failed` : ""}.`);
}

const lookupPath = (name: string) => files.paths.get(name)?.path;

function selectedPaths(): SampledPath[] {
  const sel = files.selected;
  if (!sel) return [];
  if (sel.kind === "path") return [files.paths.get(sel.name)?.sampled].filter((p): p is SampledPath => !!p);
  const a = files.autos.get(sel.name);
  if (!a) return [];
  return collectPathNames(a.auto.command)
    .map((n) => files.paths.get(n)?.sampled)
    .filter((p): p is SampledPath => !!p);
}

// ---------------------------------------------------------------------------
// Field preview (self-contained drawing; paths, markers, and robots on the field outline)
// ---------------------------------------------------------------------------

interface Overlay {
  robots?: { bumper: { x: number; y: number }[]; alliance: Alliance }[];
  pieces?: { x: number; y: number }[];
  trail?: { x: number; y: number }[];
}

function drawField(canvas: HTMLCanvasElement, elements: ResolvedElement[], paths: SampledPath[], overlay: Overlay = {}): void {
  const field = session.game.field;
  const ctx = canvas.getContext("2d")!;
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth || 640;
  const ch = Math.round((cw * field.width) / field.length);
  canvas.style.height = `${ch}px`;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  const s = (canvas.width - 8 * dpr) / field.length;
  const ox = 4 * dpr;
  const oy = 4 * dpr;
  const px = (x: number, y: number): [number, number] => [ox + x * s, oy + (field.width - y) * s];
  const poly = (pts: { x: number; y: number }[]) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(...px(p.x, p.y)) : ctx.moveTo(...px(p.x, p.y))));
    ctx.closePath();
  };
  ctx.fillStyle = cssVar("--carpet");
  ctx.fillRect(ox, oy, field.length * s, field.width * s);
  for (const el of elements) {
    if (el.kind === "zone" && el.alliance) {
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = cssVar(el.alliance === "blue" ? "--blue" : "--red");
      poly(shapePoints(el.shape));
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const solid = el.kind === "wall" || ((el.kind === "sink" || el.kind === "climbStructure") && el.solid);
    if (solid || el.kind === "gate" || el.kind === "terrain") {
      poly(shapePoints(el.shape));
      ctx.fillStyle = cssVar(solid ? "--gray-4" : "--gray-3");
      ctx.fill();
    }
  }
  ctx.strokeStyle = cssVar("--field-line");
  ctx.setLineDash([6 * dpr, 4 * dpr]);
  ctx.beginPath();
  ctx.moveTo(...px(field.centerLineX, 0));
  ctx.lineTo(...px(field.centerLineX, field.width));
  ctx.stroke();
  ctx.setLineDash([]);

  if (overlay.pieces) {
    ctx.fillStyle = cssVar("--gold");
    const r = Math.max(1.2 * dpr, 0.075 * s);
    for (const p of overlay.pieces) {
      ctx.beginPath();
      ctx.arc(...px(p.x, p.y), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const gold = cssVar("--gold");
  const text = cssVar("--text");
  for (const p of paths) {
    ctx.strokeStyle = gold;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    p.points.forEach((q, i) => (i ? ctx.lineTo(...px(q.x, q.y)) : ctx.moveTo(...px(q.x, q.y))));
    ctx.stroke();
    // Start (square) and end (outlined square)
    const [sx, sy] = px(p.start.x, p.start.y);
    ctx.fillStyle = gold;
    ctx.fillRect(sx - 4 * dpr, sy - 4 * dpr, 8 * dpr, 8 * dpr);
    const [ex, ey] = px(p.end.x, p.end.y);
    ctx.strokeStyle = text;
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(ex - 5 * dpr, ey - 5 * dpr, 10 * dpr, 10 * dpr);
    ctx.font = `${11 * dpr}px ${cssVar("--font-body")}`;
    ctx.fillStyle = text;
    for (const m of p.markers) {
      const q = p.points[Math.min(p.points.length - 1, Math.round(m.s / p.spacing))]!;
      const [mx, my] = px(q.x, q.y);
      ctx.fillRect(mx - 3 * dpr, my - 3 * dpr, 6 * dpr, 6 * dpr);
      ctx.fillText(m.name, mx + 6 * dpr, my - 6 * dpr);
    }
  }
  if (overlay.trail?.length) {
    ctx.strokeStyle = text;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    overlay.trail.forEach((q, i) => (i ? ctx.lineTo(...px(q.x, q.y)) : ctx.moveTo(...px(q.x, q.y))));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const r of overlay.robots ?? []) {
    poly(r.bumper);
    ctx.fillStyle = cssVar(r.alliance === "blue" ? "--blue" : "--red");
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function pathplanScreen(root: HTMLElement): () => void {
  const body = h("div", { class: "lab" });
  root.appendChild(body);
  const elements = resolveElements(session.game.field);
  const designs = allDesigns();
  const canvas = h("canvas", { class: "lab-field" });
  let stopRun: (() => void) | null = null;
  let lastOverlay: Overlay = {};
  const redraw = () => drawField(canvas, elements, selectedPaths(), lastOverlay);

  const render = () => {
    clear(body);
    lastOverlay = {};
    const drop = h(
      "div",
      { class: "panel lab-drop col" },
      h("h2", null, "Files"),
      h("button", { class: "btn", onclick: () => pickFiles(".path,.auto,.json", true, onFiles) }, "Import .path / .auto…"),
      h("p", { class: "small muted" }, "Or drop files here. Paths are referenced by file name, like PathPlanner does. Files are treated as untrusted and validated."),
      files.errors.length ? h("ul", { class: "small red" }, files.errors.map((e) => h("li", null, e))) : null,
      listSection("Autos", [...files.autos.keys()], "auto"),
      listSection("Paths", [...files.paths.keys()], "path"),
    );
    dropZone(drop, onFiles);
    put(
      body,
      title("h1", "PathPlanner"),
      h("p", { class: "muted" }, "Run PathPlanner autos in the sim. The robot follows the path geometry with its own speed limits, so timing reflects the design (PRD §16)."),
      h("div", { class: "lab-pp" }, drop, h("div", { class: "col grow" }, h("div", { class: "panel" }, canvas, selectionInfo()), autoPanel())),
    );
    requestAnimationFrame(redraw);
  };

  const onFiles = async (list: FileList) => {
    try {
      await importFiles(list);
    } catch (e) {
      toast((e as Error).message, 6000);
    }
    render();
  };

  const listSection = (label: string, names: string[], kind: "path" | "auto") =>
    h(
      "div",
      { class: "col" },
      h("h3", null, label),
      names.length
        ? names.map((n) =>
            h(
              "div",
              {
                class: `card small ${files.selected?.kind === kind && files.selected.name === n ? "sel" : ""}`,
                onclick: () => ((files.selected = { kind, name: n }), render()),
              },
              n,
              (kind === "auto" ? files.autos.get(n)!.warnings : files.paths.get(n)!.warnings).length ? h("span", { class: "tag warn", style: "margin-left:6px" }, "warnings") : null,
            ),
          )
        : h("p", { class: "small muted" }, "None."),
    );

  const selectionInfo = () => {
    const sel = files.selected;
    if (!sel) return h("p", { class: "small muted" }, "Import a file to preview it.");
    if (sel.kind === "path") {
      const p = files.paths.get(sel.name)!;
      return h(
        "div",
        { class: "small" },
        h("b", null, sel.name),
        ` · ${fmt(p.sampled.length)} m · ${p.sampled.markers.length} markers · end velocity ${fmt(p.sampled.goalEndVelocity)} m/s${p.sampled.reversed ? " · reversed" : ""}`,
        warningList(p.warnings),
      );
    }
    const a = files.autos.get(sel.name)!;
    const missing = collectPathNames(a.auto.command).filter((n) => !files.paths.has(n));
    return h(
      "div",
      { class: "small" },
      h("b", null, sel.name),
      ` · paths: ${collectPathNames(a.auto.command).join(", ") || "none"}`,
      missing.length ? h("p", { class: "red" }, `Missing path files: ${missing.join(", ")}. Import them too.`) : null,
      warningList(a.warnings),
    );
  };

  const warningList = (w: string[]) => (w.length ? h("ul", { class: "small gold" }, w.slice(0, 12).map((x) => h("li", null, x))) : null);

  const autoPanel = () => {
    const sel = files.selected;
    if (sel?.kind !== "auto") return h("div", { class: "panel" }, h("p", { class: "small muted" }, "Select an auto to map its named commands and run it."));
    const a = files.autos.get(sel.name)!;
    const names = collectNamedCommands(a.auto, lookupPath);
    const map = namedCommandMap(session.game.namedCommands.namedCommands, files.overrides);
    const rows = names.map((n) => mappingRow(n, map[n]));
    const resultBox = h("div", { class: "col" });
    return h(
      "div",
      { class: "col" },
      h(
        "div",
        { class: "panel col" },
        h("h2", null, "Named commands"),
        names.length ? h("table", null, h("thead", null, h("tr", null, ["Name", "Action", "On/off", "Duration (s)", "Level", ""].map((c) => h("th", null, c)))), h("tbody", null, rows)) : h("p", { class: "small muted" }, "This auto uses no named commands."),
        h("p", { class: "small muted" }, "Defaults come from the game module's named-commands.json. Unmapped commands are reported and skipped."),
      ),
      h(
        "div",
        { class: "panel col" },
        h("h2", null, "Run"),
        h(
          "div",
          { class: "lab-form" },
          labeled("Robot", h("select", { onchange: (e: Event) => (files.run.designIndex = Number((e.target as HTMLSelectElement).value)) }, designs.map((d, i) => h("option", { value: String(i), selected: i === files.run.designIndex }, d.name)))),
          labeled(
            "Start position",
            h(
              "select",
              { onchange: (e: Event) => (files.run.station = Number((e.target as HTMLSelectElement).value)) },
              h("option", { value: "-1", selected: files.run.station < 0 }, "Nearest to the auto's start"),
              session.game.field.startPositions.map((_, i) => h("option", { value: String(i), selected: i === files.run.station }, `Blue ${i + 1}`)),
            ),
          ),
          labeled("Seed", numberInput(files.run.seed, (v) => (files.run.seed = Math.round(v)))),
        ),
        h(
          "div",
          { class: "controls" },
          h("button", { class: "btn primary", onclick: () => runAuto(a.auto, resultBox, true) }, "Watch auto"),
          h("button", { class: "btn", onclick: () => runAuto(a.auto, resultBox, false) }, "Run headless"),
        ),
        h("p", { class: "small muted" }, "Autos run as the blue alliance with PathPlanner's blue-origin coordinates. The sim does not teleport the robot; if it starts away from the path, it drives there first."),
        resultBox,
      ),
    );
  };

  const mappingRow = (name: string, cmd: NamedCommand | undefined) => {
    const set = (next: NamedCommand | null) => {
      files.overrides[name] = next;
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
          { onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; set(v ? { ...(c ?? {}), action: v } : null); } },
          h("option", { value: "", selected: !c }, "— unmapped —"),
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
          h("option", { value: "", selected: !c?.state }, "—"),
          h("option", { value: "on", selected: c?.state === "on" }, "on"),
          h("option", { value: "off", selected: c?.state === "off" }, "off"),
        ),
      ),
      h("td", null, numberInput(c?.durationSeconds ?? 0, (v) => { if (!c) return; const { durationSeconds: _d, ...rest } = c; set(v > 0 ? { ...rest, durationSeconds: v } : rest); }, { disabled: !c, min: 0, step: 0.1, style: "width:80px" })),
      h("td", null, numberInput(c?.level ?? 0, (v) => { if (!c) return; const { level: _l, ...rest } = c; set(v >= 1 ? { ...rest, level: Math.round(v) } : rest); }, { disabled: !c || c.action !== "climb", min: 0, max: 3, style: "width:60px" })),
      h("td", null, files.overrides[name] !== undefined ? h("button", { class: "btn small", onclick: () => { delete files.overrides[name]; render(); } }, "Reset") : null),
    );
  };

  const nearestStation = (auto: PPAuto): number => {
    const first = collectPathNames(auto.command).map((n) => files.paths.get(n)?.sampled).find(Boolean);
    const start = auto.startingPose ?? (first ? { x: first.start.x, y: first.start.y } : null);
    if (!start) return 0;
    let best = 0;
    let bestD = Infinity;
    session.game.field.startPositions.forEach((_, i) => {
      const p: Pose = startPose(session.game.field, "blue", i);
      const d = Math.hypot(p.x - start.x, p.y - start.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  const runAuto = async (auto: PPAuto, out: HTMLElement, watch: boolean) => {
    stopRun?.();
    clear(out);
    const design = designs[files.run.designIndex];
    if (!design) return toast("Pick a robot.");
    const station = files.run.station >= 0 ? files.run.station : nearestStation(auto);
    let match: Match;
    try {
      match = await Match.create({ game: session.game, robots: [{ design: structuredClone(design), alliance: "blue", station }], seed: files.run.seed, record: false });
    } catch (e) {
      return toast((e as Error).message, 6000);
    }
    const exec = new AutoExecutor(auto, { lookupPath, namedCommands: session.game.namedCommands.namedCommands, overrides: files.overrides });
    match.drivers = [exec];
    const trail: { x: number; y: number }[] = [];
    const sampleTrail = () => {
      if (match.tick % 6 === 0) {
        const p = match.robotPose(0);
        trail.push({ x: p.x, y: p.y });
      }
    };
    const finish = () => {
      stopRun = null;
      showResult(out, match, exec, auto);
      lastOverlay = { robots: match.robotViews().map((r) => ({ bumper: r.bumper, alliance: r.alliance })), trail };
      redraw();
      match.dispose();
    };
    if (!watch) {
      while (!match.isOver && match.period === "auto") {
        match.step();
        sampleTrail();
      }
      finish();
      return;
    }
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      while (acc >= match.dt && match.period === "auto" && !match.isOver) {
        match.step();
        sampleTrail();
        acc -= match.dt;
      }
      lastOverlay = { robots: match.robotViews().map((r) => ({ bumper: r.bumper, alliance: r.alliance })), pieces: match.piecePositions(), trail };
      redraw();
      if (match.period !== "auto" || match.isOver) finish();
      else raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    stopRun = () => {
      cancelAnimationFrame(raf);
      stopRun = null;
      match.dispose();
    };
  };

  const showResult = (out: HTMLElement, match: Match, exec: AutoExecutor, auto: PPAuto) => {
    const count = (t: MatchEvent["type"]) => match.events.filter((e) => e.type === t && "robot" in e && e.robot === 0).length;
    const pose = match.robotPose(0);
    const pathNames = collectPathNames(auto.command);
    const lastPath = files.paths.get(pathNames[pathNames.length - 1] ?? "")?.sampled;
    const endErr = lastPath ? Math.hypot(pose.x - lastPath.end.x, pose.y - lastPath.end.y) : null;
    const fouls = match.events.filter((e) => e.type === "foul");
    put(
      out,
      h(
        "div",
        { class: "panel col" },
        h("h3", null, exec.finished ? "Auto finished" : "Auto did not finish before AUTO ended"),
        h(
          "p",
          { class: "small" },
          `Score ${match.score.blue.total} (auto ${match.score.blue.auto}) · acquired ${count("piece_acquired")} · launched ${count("shot_launched")} · scored ${match.events.filter((e) => e.type === "piece_scored" && e.robot === 0).length}`,
          endErr !== null ? ` · ended ${fmt(endErr)} m from the last path's end` : "",
        ),
        fouls.length ? h("p", { class: "small red" }, `Fouls: ${fouls.map((f) => (f.type === "foul" ? `${f.rule} (${f.severity})` : "")).join(", ")}`) : null,
        exec.unmapped.size ? h("p", { class: "small gold" }, `Unmapped named commands (skipped): ${[...exec.unmapped].join(", ")}`) : null,
        warningList(exec.warnings),
        h("details", null, h("summary", { class: "small" }, `Command log (${exec.log.length})`), h("ul", { class: "small mono lab-log" }, exec.log.map((l) => h("li", null, `${fmt(l.tick / match.hz)}s  ${l.message}`)))),
      ),
    );
  };

  render();
  const offTheme = onThemeChange(() => redraw());
  const onResize = () => redraw();
  window.addEventListener("resize", onResize);
  return () => {
    stopRun?.();
    offTheme();
    window.removeEventListener("resize", onResize);
  };
}
