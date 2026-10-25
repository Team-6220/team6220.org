import { createAgent, profileById } from "@goldsim/agents";
import { ENGINE_VERSION, Match } from "@goldsim/core";
import type { MatchRobot } from "@goldsim/schema";
import { session } from "../app-state.js";
import { APP_NAME } from "../config.js";
import { h, title, toast } from "../ui/dom.js";
import { copyText } from "../ui/files.js";

/** Proposed minimum batch speed per worker on a Chromebook-class device (PRD §17, decision 0001). */
const TARGET_X = 10;

interface Scenario {
  id: string;
  label: string;
  agents: boolean;
}

const SCENARIOS: Scenario[] = [
  { id: "agents", label: "6 agent robots (realistic batch)", agents: true },
  { id: "idle", label: "6 idle robots (physics only)", agents: false },
];

interface Outcome {
  scenario: string;
  simSeconds: number;
  busySeconds: number;
  xRealtime: number;
  matchesPerMinute: number;
  pieces: number;
}

/**
 * Runs the Phase 0 scenario headlessly in this browser so the team can measure a device by opening the site.
 * Work runs in short slices so the page stays responsive.
 */
export function benchmarkScreen(main: HTMLElement): () => void {
  let cancelled = false;
  let running = false;
  const durationSel = h(
    "select",
    null,
    h("option", { value: "40" }, "Quick (40 s of match time)"),
    h("option", { value: "full", selected: true }, "Full match"),
  );
  const progress = h("div", { class: "meter", style: "width:100%" }, h("div", { class: "lbl" }, h("span", null, "Idle"), h("span", null, "")), h("div", { class: "bar" }, h("div", { style: "width:0%" })));
  const resultsBody = h("tbody");
  const output = h("textarea", { readonly: true, rows: 12, style: "width:100%; font-family: var(--font-mono); font-size: 12px; background: var(--gray-3); color: var(--text); border: 2px solid var(--gray-4); padding: 8px; resize: vertical" });
  const runBtn = h("button", { class: "btn primary big", onclick: () => run() }, "Run benchmark");
  const copyBtn = h("button", { class: "btn", disabled: true, onclick: async () => toast((await copyText(output.value, output)) ? "Copied." : "Select the text and copy it manually.") }, "Copy result");

  const device = {
    logicalCores: navigator.hardwareConcurrency ?? null,
    deviceMemoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
  };

  main.append(
    h(
      "div",
      { style: "max-width: 860px; margin: 0 auto;" },
      title("h1", "Benchmark"),
      h(
        "p",
        { class: "muted" },
        `Measures how fast this device simulates ${session.game.game.name} matches with full physics, in one browser thread. Open this page on a school Chromebook, run it, and paste the result block to the team. Close other tabs first.`,
      ),
      h(
        "div",
        { class: "panel col" },
        h("div", { class: "row center" }, h("label", { class: "small muted" }, "Length"), durationSel, h("div", { class: "grow" }), runBtn),
        progress,
        h(
          "table",
          null,
          h("thead", null, h("tr", null, ["Scenario", "Sim time", "Compute time", "× real time", "Matches / min / core", `≥ ${TARGET_X}×`].map((t, i) => h("th", { class: i ? "num" : "" }, t)))),
          resultsBody,
        ),
        h("p", { class: "small muted", style: "margin:0" }, `Device: ${device.logicalCores ?? "?"} logical cores${device.deviceMemoryGB ? `, ~${device.deviceMemoryGB} GB memory` : ""}. A batch run uses about ${Math.max(1, (device.logicalCores ?? 2) - 1)} workers on this device.`),
      ),
      h("div", { class: "panel col", style: "margin-top:12px" }, h("div", { class: "row center" }, h("h2", { class: "grow", style: "margin:0" }, "Result block"), copyBtn), output),
    ),
  );

  async function runScenario(sc: Scenario, onProgress: (frac: number) => void): Promise<Outcome> {
    const game = session.game;
    const presets = session.presets;
    const per = game.game.robotsPerAlliance;
    const robots: MatchRobot[] = (["blue", "red"] as const).flatMap((alliance, a) =>
      Array.from({ length: per }, (_, station) => ({ design: presets[(station + a) % presets.length]!, alliance, station })),
    );
    const m = await Match.create({ game, robots, seed: 6220, record: false });
    if (sc.agents) m.drivers = robots.map((_, i) => createAgent(m, i, profileById("balanced")));
    const enabled = game.game.timeline.phases.reduce((s, p) => s + p.duration, 0);
    const simTarget = durationSel.value === "full" ? Infinity : Number(durationSel.value);
    const goalTicks = Math.min(m.totalTicks, Math.round((Number.isFinite(simTarget) ? simTarget : enabled + 10) * m.hz));
    const pieces = m.piecePositions().length;
    let busy = 0;
    await new Promise<void>((resolve) => {
      const slice = () => {
        if (cancelled) return resolve();
        const t0 = performance.now();
        while (!m.isOver && m.tick < goalTicks && performance.now() - t0 < 12) m.step();
        busy += performance.now() - t0;
        onProgress(m.tick / goalTicks);
        if (m.isOver || m.tick >= goalTicks) resolve();
        else setTimeout(slice, 0);
      };
      slice();
    });
    const simSeconds = m.tick / m.hz;
    m.dispose();
    const busySeconds = busy / 1000;
    const xRealtime = simSeconds / Math.max(1e-6, busySeconds);
    const fullMatch = (m.totalTicks / m.hz) || enabled;
    return { scenario: sc.label, simSeconds, busySeconds, xRealtime, matchesPerMinute: 60 / (fullMatch / xRealtime), pieces };
  }

  async function run() {
    if (running) return;
    running = true;
    runBtn.disabled = true;
    copyBtn.disabled = true;
    resultsBody.replaceChildren();
    const outcomes: Outcome[] = [];
    const label = progress.querySelector(".lbl")!.children;
    const bar = progress.querySelector(".bar > div") as HTMLElement;
    try {
      for (const [k, sc] of SCENARIOS.entries()) {
        label[0]!.textContent = sc.label;
        const o = await runScenario(sc, (f) => {
          bar.style.width = `${((k + f) / SCENARIOS.length) * 100}%`;
          label[1]!.textContent = `${Math.round(f * 100)}%`;
        });
        if (cancelled) return;
        outcomes.push(o);
        resultsBody.append(
          h(
            "tr",
            null,
            h("td", null, o.scenario),
            h("td", { class: "num" }, `${o.simSeconds.toFixed(0)} s`),
            h("td", { class: "num" }, `${o.busySeconds.toFixed(1)} s`),
            h("td", { class: "num" }, o.xRealtime.toFixed(1)),
            h("td", { class: "num" }, o.matchesPerMinute.toFixed(1)),
            h("td", { class: "num" }, h("span", { class: `tag ${o.xRealtime >= TARGET_X ? "good" : "bad"}` }, o.xRealtime >= TARGET_X ? "yes" : "no")),
          ),
        );
      }
      label[0]!.textContent = "Done";
      label[1]!.textContent = "";
      output.value = JSON.stringify(
        {
          app: APP_NAME,
          engineVersion: ENGINE_VERSION,
          game: `${session.game.game.id} v${session.game.game.version}`,
          physicsHz: 120,
          date: new Date().toISOString(),
          device,
          results: outcomes.map((o) => ({
            scenario: o.scenario,
            pieces: o.pieces,
            simSeconds: +o.simSeconds.toFixed(1),
            computeSeconds: +o.busySeconds.toFixed(2),
            xRealtime: +o.xRealtime.toFixed(2),
            matchesPerMinutePerCore: +o.matchesPerMinute.toFixed(2),
          })),
        },
        null,
        2,
      );
      copyBtn.disabled = false;
    } catch (e) {
      toast(`Benchmark failed: ${(e as Error).message}`, 8000);
    } finally {
      running = false;
      runBtn.disabled = false;
    }
  }

  return () => {
    cancelled = true;
  };
}
