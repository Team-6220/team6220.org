import { matchFromReplay, ReplayDriver, shapeCenter, type Match, type MatchEvent, type MatchSnapshot } from "@goldsim/core";
import { Replay, validate, formatIssues, type Alliance } from "@goldsim/schema";
import { session } from "../app-state.js";
import { FieldRenderer, type Overlay } from "../render/field-renderer.js";
import { getRotation, rotateView, rotationLabel } from "../render/view-rotation.js";
import { navigate } from "../router.js";
import { clear, fmtTime, h, title, toast } from "../ui/dom.js";
import { download, pickJsonFile } from "../ui/files.js";
import { matchClock } from "../ui/match-clock.js";
import { onThemeChange } from "../ui/theme.js";

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
const SNAPSHOT_SECONDS = 2;
const OVERLAY_SECONDS = 1.5;

type ListedType = "piece_scored" | "foul" | "climb_level" | "climb_assessed" | "phase_start" | "groups_decided" | "shot_launched" | "piece_acquired";
const FILTERS: { type: ListedType; label: string; on: boolean }[] = [
  { type: "piece_scored", label: "Scores", on: true },
  { type: "foul", label: "Fouls", on: true },
  { type: "climb_level", label: "Climbs", on: true },
  { type: "climb_assessed", label: "Climb points", on: true },
  { type: "phase_start", label: "Phases", on: true },
  { type: "groups_decided", label: "Game decisions", on: true },
  { type: "shot_launched", label: "Shots", on: false },
  { type: "piece_acquired", label: "Pickups", on: false },
];

export function replayScreen(main: HTMLElement): () => void {
  let disposed = false;
  let match: Match | null = null;
  let replay: Replay | null = null;
  let renderer: FieldRenderer | null = null;
  let snapshots: MatchSnapshot[] = [];
  let events: MatchEvent[] = [];
  let totalTicks = 0;
  let ready = false;
  let playing = false;
  let speed = 1;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let follow = -1;
  let zoom = 2.5;
  let lastList = -1;
  let emptyEl: HTMLElement | null = null;

  const canvas = h("canvas");
  const status = h("div", { class: "muted small" }, "");
  const scoreEl = { blue: h("span", { class: "pts" }, "0"), red: h("span", { class: "pts" }, "0") };
  const timeEl = h("div", { class: "time" }, "0:00");
  const phaseEl = h("div", { class: "phase" }, "");
  const hud = h(
    "div",
    { class: "hud" },
    h("div", { class: "score blue" }, scoreEl.blue),
    h("div", { class: "clock" }, timeEl, phaseEl),
    h("div", { class: "score red" }, scoreEl.red),
  );
  const scrub = h("input", { type: "range", min: "0", max: "0", value: "0", step: "1", style: "width:100%" });
  const markers = h("div", { style: "position:relative; height:10px; background:#000; border:1px solid var(--gray-4)" });
  const scrubTime = h("div", { class: "small muted mono" }, "");
  const playBtn = h("button", { class: "btn primary", disabled: true, onclick: () => setPlaying(!playing) }, "Play");
  const rotateBtn = h("button", { class: "btn", title: "Rotate the field view 90° (R, or Shift+R for the other way)", onclick: () => doRotate(1) }, `Rotate ${rotationLabel()}`);
  const doRotate = (direction: 1 | -1) => {
    rotateView(direction);
    rotateBtn.textContent = `Rotate ${rotationLabel()}`;
    draw();
  };
  const speedBtns = SPEEDS.map((s) => h("button", { class: `btn${s === speed ? " sel" : ""}`, onclick: () => setSpeed(s) }, `${s}x`));
  const followSel = h("select", { onchange: (e: Event) => (follow = Number((e.target as HTMLSelectElement).value)) }, h("option", { value: "-1" }, "Whole field"));
  const zoomInput = h("input", { type: "range", min: "1.5", max: "5", step: "0.25", value: String(zoom), oninput: (e: Event) => (zoom = Number((e.target as HTMLInputElement).value)) });
  const listEl = h("div", { class: "col", style: "gap:0; max-height: 34vh; overflow:auto" });
  const filterBox = h(
    "div",
    { class: "controls" },
    FILTERS.map((f) =>
      h(
        "label",
        { class: "row center small", style: "gap:4px" },
        h("input", { type: "checkbox", checked: f.on, onchange: (e: Event) => ((f.on = (e.target as HTMLInputElement).checked), renderList()) }),
        f.label,
      ),
    ),
  );
  const info = h("div", { class: "small muted" });

  main.append(
    h(
      "div",
      { class: "match" },
      h("div", { class: "stage" }, hud, h("div", { class: "stage-canvas" }, canvas)),
      h(
        "aside",
        { class: "side" },
        title("h2", "Replay"),
        h(
          "div",
          { class: "controls" },
          h("button", { class: "btn", onclick: () => importFile() }, "Import replay"),
          h("button", { class: "btn", disabled: true, id: "replay-export", onclick: () => replay && download(`goldsim-replay-${replay.seed}.json`, replay) }, "Export"),
        ),
        info,
        status,
        h("div", { class: "col" }, markers, scrub, scrubTime),
        h("div", { class: "controls" }, playBtn, ...speedBtns, rotateBtn),
        h("label", { class: "small muted" }, "Camera"),
        h("div", { class: "row center" }, followSel, h("div", { class: "grow" }, zoomInput)),
        h("h3", null, "Events"),
        filterBox,
        listEl,
      ),
    ),
  );

  scrub.addEventListener("input", () => seek(Number(scrub.value)));

  function setSpeed(s: number) {
    speed = s;
    speedBtns.forEach((b, i) => b.classList.toggle("sel", SPEEDS[i] === s));
  }
  function setPlaying(p: boolean) {
    if (!ready || !match) return;
    if (p && match.tick >= totalTicks) seek(0);
    playing = p;
    playBtn.textContent = playing ? "Pause" : "Play";
  }

  const freshDrivers = (m: Match, r: Replay) => (m.drivers = r.robots.map((_, i) => new ReplayDriver(r, i)));

  /** Jump to a tick: restore the nearest earlier snapshot, then re-simulate forward. */
  function seek(tick: number) {
    if (!match || !replay || !ready) return;
    tick = Math.max(0, Math.min(totalTicks, Math.round(tick)));
    if (tick < match.tick || tick - match.tick > SNAPSHOT_SECONDS * match.hz) {
      let snap = snapshots[0]!;
      for (const s of snapshots) if (s.state.tick <= tick) snap = s;
      if (!(snap.state.tick <= match.tick && match.tick <= tick)) {
        match.restore(snap);
        freshDrivers(match, replay);
      }
    }
    while (match.tick < tick && !match.isOver) match.step();
    acc = 0;
    draw();
  }

  async function load(r: Replay) {
    emptyEl?.remove();
    emptyEl = null;
    canvas.style.display = "";
    cancelAnimationFrame(raf);
    match?.dispose();
    match = null;
    ready = false;
    playing = false;
    playBtn.disabled = true;
    playBtn.textContent = "Play";
    replay = r;
    (document.getElementById("replay-export") as HTMLButtonElement | null)?.removeAttribute("disabled");
    const g = session.game.game;
    if (r.module.id !== g.id) {
      toast(`This replay is for "${r.module.id}", but the loaded game module is "${g.id}".`, 8000);
      return;
    }
    const warnings: string[] = [];
    if (r.module.version !== g.version) warnings.push(`module v${r.module.version} (loaded v${g.version})`);
    info.textContent = `Seed ${r.seed} · ${r.robots.length} robots · ${r.module.id} v${r.module.version} · engine ${r.engineVersion}${r.recordedAt ? ` · recorded ${r.recordedAt.slice(0, 16).replace("T", " ")}` : ""}`;
    if (warnings.length) toast(`Version differs: ${warnings.join(", ")}. The re-simulation may not match the original exactly.`, 8000);

    const m = await matchFromReplay(r, session.game);
    if (disposed) return m.dispose();
    match = m;
    renderer = new FieldRenderer(canvas, m.game.field.length, m.game.field.width);
    clear(followSel);
    followSel.append(h("option", { value: "-1" }, "Whole field"), ...r.robots.map((rb, i) => h("option", { value: String(i) }, `${rb.alliance === "blue" ? "B" : "R"}${rb.station + 1}: ${rb.design.name}`)));
    follow = -1;

    // Analysis pass: simulate to the end in slices, keeping snapshots for scrubbing.
    snapshots = [m.snapshot()];
    const every = Math.round(SNAPSHOT_SECONDS * m.hz);
    await new Promise<void>((resolve) => {
      const slice = () => {
        if (disposed) return resolve();
        const t0 = performance.now();
        while (!m.isOver && m.tick < r.durationTicks + m.hz * 15 && performance.now() - t0 < 14) {
          m.step();
          if (m.tick % every === 0) snapshots.push(m.snapshot());
        }
        status.textContent = `Analyzing… ${fmtTime(m.tick / m.hz)} simulated`;
        draw();
        if (m.isOver || m.tick >= r.durationTicks + m.hz * 15) resolve();
        else setTimeout(slice, 0);
      };
      slice();
    });
    if (disposed) return;
    events = [...m.events];
    totalTicks = m.tick;
    scrub.max = String(totalTicks);
    buildMarkers();
    status.textContent = `${events.filter((e) => e.type === "piece_scored").length} pieces scored · ${events.filter((e) => e.type === "foul").length} fouls · final ${m.score.blue.total}–${m.score.red.total}`;
    m.restore(snapshots[0]!);
    freshDrivers(m, r);
    ready = true;
    playBtn.disabled = false;
    renderList();
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function buildMarkers() {
    clear(markers);
    const color: Partial<Record<MatchEvent["type"], string>> = { piece_scored: "var(--gold)", foul: "var(--red)", climb_level: "var(--green)", phase_start: "var(--gray-5)" };
    for (const e of events) {
      const c = color[e.type];
      if (!c || (e.type === "piece_scored" && !e.active)) continue;
      markers.append(h("div", { style: `position:absolute; top:0; bottom:0; width:2px; left:${(e.tick / Math.max(1, totalTicks)) * 100}%; background:${c}`, title: describe(e) }));
    }
  }

  function describe(e: MatchEvent): string {
    const who = "robot" in e && typeof e.robot === "number" && replay ? robotName(e.robot) : "";
    switch (e.type) {
      case "piece_scored":
        return `${e.alliance === "blue" ? "Blue" : "Red"} scored in ${e.target}${e.active ? "" : " (inactive, no points)"}${who ? ` · ${who}` : ""}`;
      case "foul":
        return `${e.severity} foul ${e.rule} · ${who}`;
      case "climb_level":
        return `${who} reached level ${e.level}`;
      case "climb_assessed":
        return `${who} assessed at level ${e.level} (${e.period})`;
      case "phase_start":
        return `${e.phase} starts`;
      case "groups_decided":
        return `${e.groupA === "blue" ? "Blue" : "Red"} is group A (${e.reason})`;
      case "shot_launched":
        return `${who} shot${e.hit ? " on target" : ""}`;
      case "piece_acquired":
        return `${who} picked up ${e.piece}`;
      default:
        return e.type;
    }
  }

  function robotName(i: number): string {
    const r = replay!.robots[i];
    return r ? `${r.alliance === "blue" ? "B" : "R"}${r.station + 1}` : `#${i}`;
  }

  function renderList() {
    clear(listEl);
    const on = new Set(FILTERS.filter((f) => f.on).map((f) => f.type));
    const hz = match?.hz ?? 120;
    for (const e of events) {
      if (!on.has(e.type as ListedType)) continue;
      const alliance = "alliance" in e ? (e.alliance as Alliance) : null;
      listEl.append(
        h(
          "div",
          {
            class: "robotrow",
            style: "cursor:pointer",
            "data-tick": String(e.tick),
            onclick: () => {
              setPlaying(false);
              seek(Math.max(0, e.tick - Math.round(hz)));
            },
          },
          h("span", { class: "mono muted", style: "width:44px; flex:none" }, fmtTime(e.tick / hz)),
          h("span", { class: alliance ?? "" }, describe(e)),
        ),
      );
    }
    lastList = -1;
  }

  function highlightList() {
    if (!match) return;
    const sec = Math.floor(match.tick / match.hz);
    if (sec === lastList) return;
    lastList = sec;
    for (const row of Array.from(listEl.children) as HTMLElement[]) {
      const t = Number(row.dataset.tick);
      row.style.background = Math.abs(t - match.tick) < match.hz ? "var(--gray-3)" : "";
    }
  }

  function overlays(m: Match): Overlay[] {
    const window = OVERLAY_SECONDS * m.hz;
    const out: Overlay[] = [];
    const views = m.robotViews();
    for (let k = events.length - 1; k >= 0; k--) {
      const e = events[k]!;
      if (e.tick > m.tick) continue;
      if (m.tick - e.tick > window) break;
      const age = (m.tick - e.tick) / window;
      const at = "robot" in e && typeof e.robot === "number" ? views[e.robot]?.pose : undefined;
      switch (e.type) {
        case "shot_launched":
          out.push({ x: e.x, y: e.y, kind: "shot", age });
          break;
        case "piece_scored": {
          const el = m.elements.find((x) => x.id === e.target);
          const c = el?.kind === "sink" ? shapeCenter(el.target.shape) : null;
          if (c) out.push({ ...c, kind: "score", age, label: e.active ? "+" : "×" });
          break;
        }
        case "foul":
          if (at) out.push({ x: at.x, y: at.y, kind: "foul", age, label: e.rule });
          break;
        case "piece_acquired":
          if (at) out.push({ x: at.x, y: at.y, kind: "pickup", age });
          break;
        case "climb_level":
          if (at) out.push({ x: at.x, y: at.y, kind: "climb", age, label: `L${e.level}` });
          break;
      }
    }
    return out;
  }

  function draw() {
    if (!match || !renderer) return;
    const view = follow >= 0 ? (() => {
      const p = match.robotPose(follow);
      return { cx: p.x, cy: p.y, zoom };
    })() : undefined;
    renderer.render(match, { view, overlays: ready ? overlays(match) : [], showShooterRange: follow >= 0, rotation: getRotation() });
    scoreEl.blue.textContent = String(match.score.blue.total);
    scoreEl.red.textContent = String(match.score.red.total);
    const clock = matchClock(match);
    timeEl.textContent = fmtTime(clock.timeLeft);
    timeEl.classList.toggle("gold", clock.scoring);
    phaseEl.textContent = clock.label;
    if (ready) {
      scrub.value = String(match.tick);
      scrubTime.textContent = `${fmtTime(match.tick / match.hz)} / ${fmtTime(totalTicks / match.hz)}`;
      highlightList();
    }
  }

  function frame(now: number) {
    if (disposed || !match) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing && ready) {
      acc += dt * speed;
      let n = 0;
      const max = Math.ceil(match.hz * 0.1 * Math.max(1, speed));
      while (acc >= match.dt && n < max && match.tick < totalTicks) {
        match.step();
        acc -= match.dt;
        n++;
      }
      if (n >= max) acc = 0;
      if (match.tick >= totalTicks) setPlaying(false);
    }
    draw();
    raf = requestAnimationFrame(frame);
  }

  async function importFile() {
    try {
      const { data } = await pickJsonFile(20_000_000);
      const r = validate(Replay, data);
      if (!r.ok) {
        toast(`Not a valid GoldSim replay:\n${formatIssues(r.issues.slice(0, 5))}`, 9000);
        return;
      }
      session.replay = r.value;
      await load(r.value);
    } catch (e) {
      toast((e as Error).message, 6000);
    }
  }

  const unTheme = onThemeChange(() => renderer?.refreshPalette());
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === "Space") {
      e.preventDefault();
      setPlaying(!playing);
    }
    if (e.code === "KeyR" && !e.ctrlKey && !e.metaKey) doRotate(e.shiftKey ? -1 : 1);
    if (match && e.code === "ArrowLeft") seek(match.tick - match.hz * 2);
    if (match && e.code === "ArrowRight") seek(match.tick + match.hz * 2);
  };
  window.addEventListener("keydown", onKey);

  if (session.replay) {
    load(session.replay).catch((e) => toast(`Could not load the replay: ${(e as Error).message}`, 8000));
  } else {
    status.textContent = "No replay loaded. Import a replay file, or finish a match and choose Watch replay.";
    canvas.style.display = "none";
    emptyEl = h(
        "div",
        { class: "hero" },
        title("h1", "Replay viewer"),
        h("p", { class: "tagline" }, "Replays store the seed and every driver input, so the match re-simulates exactly. Scrub, follow a robot, and jump to events."),
        h("div", { class: "row center" }, h("button", { class: "btn primary big", onclick: () => importFile() }, "Import replay"), h("button", { class: "btn big", onclick: () => navigate("/play") }, "Play a match")),
      );
    main.querySelector(".stage-canvas")!.append(emptyEl);
  }

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKey);
    unTheme();
    match?.dispose();
  };
}
