import { PROFILE_PRESETS } from "@goldsim/agents";
import { allDesigns, defaultSetup, randomSeed, session, type DriverChoice, type SlotConfig } from "../app-state.js";
import { connectedPads } from "../input/drivers.js";
import { navigate } from "../router.js";
import { clear, h, title } from "../ui/dom.js";

export function encodeDriver(d: DriverChoice): string {
  switch (d.kind) {
    case "idle":
      return "idle";
    case "keyboard":
      return "keyboard";
    case "gamepad":
      return `pad:${d.index}`;
    case "agent":
      return `agent:${d.profile}`;
  }
}

export function decodeDriver(v: string): DriverChoice {
  if (v === "keyboard") return { kind: "keyboard" };
  if (v.startsWith("pad:")) return { kind: "gamepad", index: Number(v.slice(4)) };
  if (v.startsWith("agent:")) return { kind: "agent", profile: v.slice(6) };
  return { kind: "idle" };
}

export function driverLabel(d: DriverChoice): string {
  switch (d.kind) {
    case "idle":
      return "Idle";
    case "keyboard":
      return "Keyboard";
    case "gamepad":
      return `Controller ${d.index + 1}`;
    case "agent":
      return `Agent: ${PROFILE_PRESETS.find((p) => p.id === d.profile)?.label ?? d.profile}`;
  }
}

export function setupScreen(main: HTMLElement): () => void {
  const setup = (session.setup ??= defaultSetup());
  const designs = allDesigns();
  const slotsBox = h("div");
  const padInfo = h("p", { class: "muted small" });

  const driverSelect = (slot: SlotConfig) => {
    const pads = connectedPads();
    const options: DriverChoice[] = [
      { kind: "idle" },
      ...pads.map((p) => ({ kind: "gamepad", index: p.index }) as DriverChoice),
      { kind: "keyboard" },
      ...PROFILE_PRESETS.map((p) => ({ kind: "agent", profile: p.id }) as DriverChoice),
    ];
    const current = encodeDriver(slot.driver);
    if (!options.some((o) => encodeDriver(o) === current)) options.splice(1, 0, slot.driver);
    return h(
      "select",
      { onchange: (e: Event) => (slot.driver = decodeDriver((e.target as HTMLSelectElement).value)) },
      options.map((o) => h("option", { value: encodeDriver(o), selected: encodeDriver(o) === current }, driverLabel(o))),
    );
  };

  const renderSlots = () => {
    clear(slotsBox);
    const pads = connectedPads();
    padInfo.textContent = pads.length
      ? `Controllers: ${pads.map((p) => `${p.index + 1}: ${p.id}`).join(" · ")}`
      : "No controllers detected. Plug in an Xbox-type controller and press any button.";
    for (const alliance of ["blue", "red"] as const) {
      slotsBox.append(h("h3", { class: alliance, style: "margin-top:8px" }, `${alliance === "blue" ? "Blue" : "Red"} alliance`));
      for (const slot of setup.slots.filter((s) => s.alliance === alliance)) {
        slotsBox.append(
          h(
            "div",
            { class: "slot" },
            h("div", { class: `who ${alliance}` }, `${alliance === "blue" ? "B" : "R"}${slot.station + 1}`),
            h(
              "select",
              {
                onchange: (e: Event) => (slot.design = designs[Number((e.target as HTMLSelectElement).value)]!),
                title: slot.design.description ?? "",
              },
              designs.map((d, i) => h("option", { value: String(i), selected: d === slot.design }, d.name)),
            ),
            driverSelect(slot),
          ),
        );
      }
    }
  };

  const profiles = Object.keys(session.game.game.thresholdProfiles);
  const seedInput = h("input", { type: "number", value: String(setup.seed), style: "width: 140px", onchange: (e: Event) => (setup.seed = Number((e.target as HTMLInputElement).value) || 0) });

  main.append(
    h(
      "div",
      { style: "max-width: 860px; margin: 0 auto;" },
      title("h1", "Match setup"),
      h("p", { class: "muted" }, "Pick a design and a driver for each station. Nothing is saved yet; team workspaces arrive with accounts."),
      h(
        "div",
        { class: "row" },
        h("div", { class: "panel grow" }, slotsBox, padInfo),
        h(
          "div",
          { class: "panel col", style: "width: 260px" },
          h("h2", null, "Options"),
          h("label", { class: "small muted" }, "Bonus RP thresholds"),
          h(
            "select",
            { onchange: (e: Event) => (setup.profile = (e.target as HTMLSelectElement).value) },
            profiles.map((p) => h("option", { value: p, selected: p === setup.profile }, p)),
          ),
          h("label", { class: "small muted" }, "Seed (same seed + same inputs = same match)"),
          h("div", { class: "row center" }, seedInput, h("button", { class: "btn", onclick: () => ((setup.seed = randomSeed()), (seedInput.value = String(setup.seed))) }, "New")),
          h("hr"),
          h("button", { class: "btn primary big", onclick: () => navigate("/match") }, "Start match"),
          h("button", { class: "btn", onclick: () => ((session.setup = defaultSetup()), navigate("/play")) }, "Reset"),
        ),
      ),
    ),
  );
  renderSlots();
  const onPad = () => renderSlots();
  window.addEventListener("gamepadconnected", onPad);
  window.addEventListener("gamepaddisconnected", onPad);
  return () => {
    window.removeEventListener("gamepadconnected", onPad);
    window.removeEventListener("gamepaddisconnected", onPad);
  };
}
