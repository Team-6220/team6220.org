import { createAgent, profileById } from "@goldsim/agents";
import { Match, type Driver, type MatchResult } from "@goldsim/core";
import type { Alliance } from "@goldsim/schema";
import { defaultSetup, session, type MatchSetup } from "../app-state.js";
import { DEFAULT_BINDINGS, prettyButton, XboxButton } from "../input/bindings.js";
import { GamepadDriver, KeyboardDriver } from "../input/drivers.js";
import { FieldRenderer } from "../render/field-renderer.js";
import { navigate } from "../router.js";
import { clear, fmtTime, h, openModal, title, toast } from "../ui/dom.js";
import { onThemeChange } from "../ui/theme.js";
import { download } from "../ui/files.js";
import { matchClock } from "../ui/match-clock.js";
import { coverageTable } from "./rules.js";
import { driverLabel } from "./setup.js";

const SPEEDS = [0.5, 1, 2, 4];
const ALLIANCES: Alliance[] = ["blue", "red"];

function buildDrivers(match: Match, setup: MatchSetup): (Driver | null)[] {
  return setup.slots.map((slot, i) => {
    switch (slot.driver.kind) {
      case "idle":
        return null;
      case "keyboard":
        return new KeyboardDriver(slot.alliance);
      case "gamepad":
        return new GamepadDriver(slot.driver.index, slot.alliance);
      case "agent":
        return createAgent(match, i, profileById(slot.driver.profile));
    }
  });
}

export function matchScreen(main: HTMLElement): () => void {
  const setup = (session.setup ??= defaultSetup());
  let match: Match | null = null;
  let renderer: FieldRenderer | null = null;
  let raf = 0;
  let disposed = false;
  let paused = false;
  let speed = 1;
  let acc = 0;
  let last = performance.now();
  let lastHud = 0;
  let resultsShown = false;
  let showRange = true;
  let startHeld = false;

  // ---- Layout ----
  const canvas = h("canvas");
  const stageCanvas = h("div", { class: "stage-canvas" }, canvas);
  const scoreEl = { blue: h("span", { class: "pts" }, "0"), red: h("span", { class: "pts" }, "0") };
  const hubEl = { blue: h("span", { class: "hubchip" }, "HUB"), red: h("span", { class: "hubchip" }, "HUB") };
  const rpEl = { blue: h("div", { class: "row", style: "gap:6px" }), red: h("div", { class: "row", style: "gap:6px" }) };
  const timeEl = h("div", { class: "time" }, "0:00");
  const phaseEl = h("div", { class: "phase" }, "");
  const timelineEl = h("div", { class: "timeline" });
  const robotsEl = h("div");
  const speedBtns = SPEEDS.map((s) => h("button", { class: `btn${s === speed ? " sel" : ""}`, onclick: () => setSpeed(s) }, `${s}x`));
  const pauseBtn = h("button", { class: "btn", onclick: () => togglePause() }, "Pause");

  const scoreBox = (a: Alliance) =>
    h(
      "div",
      { class: `score ${a}` },
      a === "red" ? rpEl[a] : null,
      a === "red" ? hubEl[a] : null,
      scoreEl[a],
      a === "blue" ? hubEl[a] : null,
      a === "blue" ? rpEl[a] : null,
    );

  const hud = h("div", { class: "hud" }, scoreBox("blue"), h("div", { class: "clock" }, timeEl, phaseEl, timelineEl), scoreBox("red"));

  const b = DEFAULT_BINDINGS;
  const help = h(
    "div",
    { class: "small col" },
    h("h3", null, "Controller"),
    h("div", null, "Left stick: drive (up = up on screen)"),
    h("div", null, "Right stick X: rotate"),
    h("div", null, h("span", { class: "kbd" }, prettyButton(b.actions.intake)), " intake  ", h("span", { class: "kbd" }, prettyButton(b.actions.shoot)), " shoot"),
    h("div", null, h("span", { class: "kbd" }, prettyButton(b.climb)), " climb / come down"),
    h("div", null, "POV down/right/up: climb L1/L2/L3, left: max"),
    h("div", null, h("span", { class: "kbd" }, prettyButton(b.actions.deploy)), " deploy  ", h("span", { class: "kbd" }, prettyButton(b.actions.place)), " place  ", h("span", { class: "kbd" }, "Start"), " pause"),
    h("h3", { style: "margin-top:6px" }, "Keyboard (dev only)"),
    h("div", null, "WASD drive, Q/E rotate, Shift intake, Space shoot, C climb, 1-3 climb level, P pause"),
  );

  const rangeToggle = h("input", { type: "checkbox", checked: showRange, onchange: (e: Event) => (showRange = (e.target as HTMLInputElement).checked) });

  main.append(
    h(
      "div",
      { class: "match" },
      h("div", { class: "stage" }, hud, stageCanvas),
      h(
        "aside",
        { class: "side" },
        h("div", { class: "controls" }, pauseBtn, ...speedBtns),
        h(
          "div",
          { class: "controls" },
          h("button", { class: "btn", onclick: () => restart() }, "Restart"),
          h("button", { class: "btn", onclick: () => match && download(`goldsim-replay-${match.seed}.json`, match.replay()) }, "Replay JSON"),
          h("button", { class: "btn", onclick: () => navigate("/play") }, "Setup"),
        ),
        h("label", { class: "row center small" }, rangeToggle, "Show shooter range"),
        h("div", null, h("h2", null, "Robots"), robotsEl),
        help,
      ),
    ),
  );

  // ---- Controls ----
  function setSpeed(s: number) {
    speed = s;
    speedBtns.forEach((btn, i) => btn.classList.toggle("sel", SPEEDS[i] === s));
  }
  function togglePause() {
    paused = !paused;
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    pauseBtn.classList.toggle("sel", paused);
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.code === "KeyP" && !(e.target instanceof HTMLInputElement)) togglePause();
  };
  window.addEventListener("keydown", onKey);

  const unTheme = onThemeChange(() => renderer?.refreshPalette());
  const onResize = () => renderer && match && renderer.render(match, { showShooterRange: showRange, highlight: humanSet() });
  window.addEventListener("resize", onResize);

  const humanSet = () => new Set(setup.slots.flatMap((s, i) => (s.driver.kind === "keyboard" || s.driver.kind === "gamepad" ? [i] : [])));

  function buildTimeline(m: Match) {
    clear(timelineEl);
    const total = m.phases.reduce((s, p) => s + p.duration, 0);
    m.phases.forEach((p, i) => {
      const seg = h("div", { title: p.label, style: `width:${(p.duration / total) * 100}%; background: var(--gray-4)` });
      seg.dataset.i = String(i);
      timelineEl.append(seg);
    });
  }

  function updateHud(m: Match) {
    for (const a of ALLIANCES) {
      scoreEl[a].textContent = String(m.score[a].total);
      const hub = m.elements.find((e) => e.kind === "sink" && "scoresFor" in e && e.scoresFor === a);
      if (hub) {
        const on = m.isActive(hub.id);
        hubEl[a].textContent = on ? "HUB ACTIVE" : m.isScoringActive(hub.id) ? "HUB CLOSING" : "HUB INACTIVE";
        hubEl[a].classList.toggle("on", on);
      }
      clear(rpEl[a]);
      const thresholds = m.game.game.thresholdProfiles[m.profile] ?? {};
      for (const bonus of m.game.scoring.rankingPoints.bonus) {
        const need = thresholds[bonus.thresholdKey] ?? 0;
        const have = m.counters[a][bonus.counter] ?? 0;
        const frac = need > 0 ? Math.min(1, have / need) : 0;
        rpEl[a].append(
          h(
            "div",
            { class: `meter${frac >= 1 ? " done" : ""}`, title: `${bonus.label}: ${have} / ${need}`, style: "min-width:80px" },
            h("div", { class: "lbl" }, h("span", null, bonus.label), h("span", null, `${have}/${need}`)),
            h("div", { class: "bar" }, h("div", { style: `width:${frac * 100}%` })),
          ),
        );
      }
    }
    const clock = matchClock(m);
    timeEl.textContent = fmtTime(clock.timeLeft);
    timeEl.classList.toggle("gold", clock.scoring);
    phaseEl.textContent = m.inPostMatch || clock.scoring ? clock.label : `${m.phase.label} · ${fmtTime(m.phaseTimeLeft)}`;
    const idx = m.phases.indexOf(m.phase);
    Array.from(timelineEl.children).forEach((seg, i) => {
      (seg as HTMLElement).style.background = i < idx || m.inPostMatch ? "var(--gray-5)" : i === idx ? "var(--gold)" : "var(--gray-4)";
    });

    clear(robotsEl);
    for (const v of m.robotViews()) {
      const slot = setup.slots[v.index]!;
      const obs = m.observe(v.index);
      robotsEl.append(
        h(
          "div",
          { class: "robotrow" },
          h("div", { class: "sw", style: `background: var(--${v.alliance})` }),
          h(
            "div",
            { class: "grow" },
            h("div", null, v.name),
            h(
              "div",
              { class: "muted" },
              `${driverLabel(slot.driver)} · ${obs.self.stored}/${obs.self.capacity}`,
              v.climbState !== "idle" ? ` · ${v.climbState} L${v.climbLevel}` : "",
            ),
          ),
        ),
      );
    }
  }

  function showResults(m: Match) {
    resultsShown = true;
    const r = m.result();
    const winnerText = r.winner === "tie" ? "Tie" : `${r.winner === "blue" ? "Blue" : "Red"} wins`;
    const row = (label: string, key: keyof MatchResult["score"]["blue"]) =>
      h("tr", null, h("td", null, label), h("td", { class: "num blue" }, r.score.blue[key]), h("td", { class: "num red" }, r.score.red[key]));
    const content = h(
      "div",
      { class: "col", style: "min-width: 760px" },
      title("h1", winnerText, { class: r.winner === "tie" ? "gold" : r.winner }),
      h("p", { class: "muted small" }, `Seed ${r.seed} · ${r.module.id} v${r.module.version} · engine ${r.engineVersion} · thresholds: ${r.profile}`),
      h(
        "div",
        { class: "grid2" },
        h(
          "div",
          { class: "panel" },
          h("h2", null, "Score"),
          h(
            "table",
            null,
            h("thead", null, h("tr", null, h("th", null, ""), h("th", { class: "num" }, "Blue"), h("th", { class: "num" }, "Red"))),
            h("tbody", null, row("Auto", "auto"), row("Teleop", "teleop"), row("End game", "endgame"), row("Fouls (awarded)", "foul"), row("Total", "total")),
          ),
        ),
        h(
          "div",
          { class: "panel" },
          h("h2", null, "Ranking points"),
          ALLIANCES.map((a) =>
            h(
              "div",
              { style: "margin-bottom:8px" },
              h("div", { class: a }, `${a === "blue" ? "Blue" : "Red"}: ${r.rp[a].total} RP (${r.rp[a].outcome})`),
              Object.entries(r.rp[a].bonus).map(([id, got]) => h("span", { class: `tag ${got ? "good" : ""}` }, id)),
            ),
          ),
        ),
      ),
      h(
        "div",
        { class: "panel" },
        h("h2", null, "Robots"),
        h(
          "table",
          null,
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              ["Robot", "Driver", "Points", "Picked up", "Shots", "Scored", "Wasted", "Climb", "Fouls"].map((t, i) => h("th", { class: i > 1 ? "num" : "" }, t)),
            ),
          ),
          h(
            "tbody",
            null,
            r.robots.map((x) =>
              h(
                "tr",
                null,
                h("td", { class: x.alliance }, x.name),
                h("td", { class: "muted small" }, driverLabel(setup.slots[x.index]!.driver)),
                ...[x.points, x.acquired, x.shots, x.scoredActive, x.scoredInactive, x.climbLevel ? `L${x.climbLevel}` : "-", x.fouls].map((v) => h("td", { class: "num" }, v)),
              ),
            ),
          ),
        ),
      ),
      h("div", { class: "panel" }, h("h2", null, "Rule coverage for this result"), coverageTable(r.coverage)),
      h(
        "div",
        { class: "row" },
        h("button", { class: "btn primary", onclick: () => (close(), restart()) }, "Play again"),
        h("button", { class: "btn", onclick: () => ((session.replay = m.replay()), close(), navigate("/replay")) }, "Watch replay"),
        h("button", { class: "btn", onclick: () => download(`goldsim-replay-${r.seed}.json`, m.replay()) }, "Export replay"),
        h("button", { class: "btn", onclick: () => download(`goldsim-result-${r.seed}.json`, r) }, "Export results"),
        h("button", { class: "btn", onclick: () => (close(), navigate("/play")) }, "Back to setup"),
      ),
    );
    const close = openModal(content);
  }

  // ---- Loop ----
  function pollStart() {
    // Start button on any controller in use toggles pause (edge-triggered).
    const pads = navigator.getGamepads?.() ?? [];
    let held = false;
    for (const s of setup.slots) if (s.driver.kind === "gamepad") held ||= !!pads[s.driver.index]?.buttons[XboxButton.kStart]?.pressed;
    if (held && !startHeld) togglePause();
    startHeld = held;
  }

  function frame(now: number) {
    if (disposed || !match || !renderer) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    pollStart();
    if (!paused && !match.isOver) {
      acc += dt * speed;
      const maxSteps = Math.ceil(match.hz * 0.1 * Math.max(1, speed));
      let n = 0;
      while (acc >= match.dt && n < maxSteps && !match.isOver) {
        match.step();
        acc -= match.dt;
        n++;
      }
      if (n >= maxSteps) acc = 0;
    }
    renderer.render(match, { showShooterRange: showRange, highlight: humanSet() });
    if (now - lastHud > 100 || match.isOver) {
      lastHud = now;
      updateHud(match);
    }
    if (match.isOver && !resultsShown) showResults(match);
    raf = requestAnimationFrame(frame);
  }

  async function start() {
    resultsShown = false;
    acc = 0;
    const m = await Match.create({ game: setup.game, robots: setup.slots.map((s) => ({ design: s.design, alliance: s.alliance, station: s.station })), seed: setup.seed, profile: setup.profile });
    if (disposed) {
      m.dispose();
      return;
    }
    m.drivers = buildDrivers(m, setup);
    match = m;
    renderer = new FieldRenderer(canvas, m.game.field.length, m.game.field.width);
    buildTimeline(m);
    updateHud(m);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function restart() {
    cancelAnimationFrame(raf);
    match?.dispose();
    match = null;
    start().catch((e) => toast(`Could not start the match: ${(e as Error).message}`, 8000));
  }

  start().catch((e) => toast(`Could not start the match: ${(e as Error).message}`, 8000));

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    unTheme();
    match?.dispose();
  };
}
