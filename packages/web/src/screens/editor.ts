import { bumperPolygon, checkDesignRunnable, CORE_TYPES, MECHANISM_SPECS, resolveMechanism, type CoreMechanismType } from "@goldsim/core";
import { formatIssues, RobotDesign, validate, type Mechanism } from "@goldsim/schema";
import { allDesigns, randomSeed, session, type DriverChoice } from "../app-state.js";
import { EditorCanvas } from "../editor/editor-canvas.js";
import { fmt, fromDisplay, loadUnits, saveUnits, toDisplay, unitLabel, type Unit, type UnitSystem } from "../editor/units.js";
import { connectedPads } from "../input/drivers.js";
import { navigate } from "../router.js";
import { appendAll, clear, h, title, toast } from "../ui/dom.js";
import { download, pickJsonFile } from "../ui/files.js";
import { onThemeChange } from "../ui/theme.js";

function blankDesign(): RobotDesign {
  return {
    schemaVersion: 1,
    name: "New robot",
    description: "",
    chassis: {
      frame: { type: "rect", length: 0.7, width: 0.7 },
      height: 0.5,
      bumpers: { thickness: 0.0889, mass: 4.5 },
      mass: 50,
      momentOfInertia: "auto",
      drivetrain: { type: "swerve", maxSpeed: 4.5, maxAccel: 8, maxAngularSpeed: 9, traction: 1.1 },
    },
    mechanisms: [],
    preload: session.game.pieces.preload.max,
  };
}

interface NumSpec {
  label: string;
  unit: Unit;
  min: number;
  max: number;
  step: number;
  get: () => number;
  set: (v: number) => void;
  help?: string;
  integer?: boolean;
}

export function editorScreen(main: HTMLElement): () => void {
  let design: RobotDesign = (session.editorDesign ??= structuredClone(session.presets[0] ?? blankDesign()));
  let units: UnitSystem = loadUnits();
  let clipboard: Mechanism | null = null;
  const custom = session.game.mechanisms;

  const canvas = h("canvas", { tabindex: "0" });
  const listBox = h("div", { class: "col" });
  const propsBox = h("div", { class: "col" });
  const checkBox = h("div", { class: "col small" });
  const deployInput = h("input", { type: "range", min: "0", max: "1", step: "0.01", value: "1" });
  const unitsBtn = h("button", { class: "btn", title: "Display units (designs are stored in SI)", onclick: () => setUnits(units === "si" ? "imperial" : "si") }, "");

  const view = new EditorCanvas(canvas, () => design, custom, () => renderProps(), () => edited());
  deployInput.addEventListener("input", () => {
    view.deploy = Number(deployInput.value);
    view.render();
  });

  const palette = h(
    "div",
    { class: "controls" },
    CORE_TYPES.map((t) => h("button", { class: "btn", title: `Add ${MECHANISM_SPECS[t].label}`, onclick: () => addMechanism(t) }, `+ ${MECHANISM_SPECS[t].label}`)),
    custom.types.map((t) => h("button", { class: "btn", title: `${t.label} (builds on ${t.base}, from the game module)`, onclick: () => addMechanism(t.id) }, `+ ${t.label}`)),
  );

  main.append(
    h(
      "div",
      { class: "row", style: "height:100%; gap:0; align-items:stretch" },
      h(
        "aside",
        { class: "side", style: "width:240px; border-left:0; border-right:2px solid var(--gray-4)" },
        title("h2", "Designs"),
        h(
          "div",
          { class: "controls" },
          h("button", { class: "btn", onclick: () => open(blankDesign(), null) }, "New blank"),
          h("button", { class: "btn", onclick: () => importDesign() }, "Import"),
          h("button", { class: "btn", onclick: () => download(`${slug(design.name)}.robot.json`, design) }, "Export"),
        ),
        listBox,
      ),
      h(
        "div",
        { class: "grow col", style: "gap:0; min-width:0" },
        h(
          "div",
          { class: "hud", style: "grid-template-columns: 1fr auto; gap:8px" },
          h("div", { class: "col", style: "gap:4px" }, palette),
          h(
            "div",
            { class: "row center" },
            h("label", { class: "small muted" }, "Deploy preview"),
            h("div", { style: "width:120px" }, deployInput),
            unitsBtn,
          ),
        ),
        h("div", { class: "stage-canvas" }, canvas),
        h(
          "div",
          { class: "hud", style: "grid-template-columns: 1fr auto" },
          h("div", { class: "small muted" }, "Drag a mount to move it; drag the round handle to rotate (Shift: 15° steps, Alt: free). Keys: arrows move, Q/E rotate, Del delete, Ctrl+C/V/D copy, paste, duplicate."),
          h(
            "div",
            { class: "row center" },
            h("button", { class: "btn", onclick: () => save(false) }, "Save"),
            h("button", { class: "btn", onclick: () => save(true) }, "Save as copy (A/B)"),
            h("button", { class: "btn primary", onclick: () => testDrive() }, "Test drive"),
          ),
        ),
      ),
      h("aside", { class: "side", style: "width:340px" }, propsBox, h("hr"), checkBox),
    ),
  );

  // ---------------------------------------------------------------------------

  function setUnits(u: UnitSystem) {
    units = u;
    saveUnits(u);
    unitsBtn.textContent = u === "si" ? "Units: SI" : "Units: in / lb / °";
    renderProps();
  }

  function open(d: RobotDesign, customIndex: number | null) {
    design = structuredClone(d);
    session.editorDesign = design;
    session.editorIndex = customIndex;
    view.selected = -1;
    renderList();
    renderProps();
    edited();
  }

  function renderList() {
    clear(listBox);
    const item = (d: RobotDesign, onClick: () => void, active: boolean, extra?: HTMLElement) =>
      h("div", { class: `card${active ? " sel" : ""}`, onclick: onClick, title: d.description ?? "" }, h("div", null, d.name), h("div", { class: "small muted" }, summary(d)), extra);
    listBox.append(h("h3", null, "Presets"));
    session.presets.forEach((d) => listBox.append(item(d, () => open(d, null), false)));
    listBox.append(h("h3", { style: "margin-top:8px" }, "This session"));
    if (!session.customDesigns.length) listBox.append(h("p", { class: "small muted" }, "Saved designs appear here and in Play setup. They are not stored after you close the tab until team accounts arrive."));
    session.customDesigns.forEach((d, i) =>
      listBox.append(
        item(
          d,
          () => open(d, i),
          session.editorIndex === i,
          h(
            "button",
            {
              class: "btn",
              style: "margin-top:6px; padding:2px 8px",
              onclick: (e: Event) => {
                e.stopPropagation();
                session.customDesigns.splice(i, 1);
                if (session.editorIndex === i) session.editorIndex = null;
                else if (session.editorIndex !== null && session.editorIndex > i) session.editorIndex--;
                renderList();
              },
            },
            "Delete",
          ),
        ),
      ),
    );
  }

  function summary(d: RobotDesign): string {
    const dt = d.chassis.drivetrain;
    return `${dt.type} · ${d.mechanisms.map((m) => m.type).join(", ") || "no mechanisms"}`;
  }

  function edited() {
    view.render();
    renderChecks();
  }

  // ---- Properties -------------------------------------------------------------

  function numField(s: NumSpec): HTMLElement {
    const k = (v: number) => toDisplay(v, s.unit, units);
    const dStep = s.step * (units === "imperial" && s.unit === "m" ? 39.37 / 4 : units === "imperial" && (s.unit === "rad" || s.unit === "rad/s") ? 57.3 : units === "imperial" && s.unit === "kg" ? 2.2 : 1);
    const step = s.integer ? 1 : Math.max(1e-4, +dStep.toPrecision(1));
    const range = h("input", { type: "range", min: String(k(s.min)), max: String(k(s.max)), step: String(step), value: String(k(s.get())) });
    const num = h("input", { type: "number", step: String(step), value: fmt(k(s.get()), step), style: "width:90px" });
    const apply = (raw: number, from: "range" | "num") => {
      if (!Number.isFinite(raw)) return;
      let v = fromDisplay(raw, s.unit, units);
      if (s.integer) v = Math.round(v);
      s.set(v);
      if (from === "range") num.value = fmt(raw, step);
      else range.value = String(raw);
      edited();
    };
    range.addEventListener("input", () => apply(Number(range.value), "range"));
    num.addEventListener("change", () => apply(Number(num.value), "num"));
    return h(
      "div",
      { class: "col", style: "gap:2px", title: s.help ?? "" },
      h("div", { class: "row center small", style: "justify-content:space-between" }, h("span", null, s.label), h("span", { class: "row center", style: "gap:4px" }, num, h("span", { class: "muted", style: "width:42px" }, unitLabel(s.unit, units)))),
      range,
    );
  }

  function textField(label: string, get: () => string, set: (v: string) => void): HTMLElement {
    return h(
      "label",
      { class: "col small", style: "gap:2px" },
      label,
      h("input", { type: "text", value: get(), onchange: (e: Event) => (set((e.target as HTMLInputElement).value), edited(), renderList()) }),
    );
  }

  function renderProps() {
    clear(propsBox);
    const mech = design.mechanisms[view.selected];
    if (mech) renderMechanismProps(mech);
    else renderChassisProps();
  }

  function renderChassisProps() {
    const ch = design.chassis;
    const dt = ch.drivetrain;
    appendAll(propsBox, 
      title("h2", "Robot"),
      textField("Name", () => design.name, (v) => (design.name = v.trim() || "Unnamed robot")),
      textField("Description", () => design.description ?? "", (v) => (design.description = v)),
      h("h3", null, "Frame"),
      h(
        "select",
        {
          onchange: (e: Event) => {
            const t = (e.target as HTMLSelectElement).value;
            if (t === "rect") ch.frame = { type: "rect", length: 0.7, width: 0.7 };
            else ch.frame = { type: "polygon", points: [{ x: 0.35, y: 0.35 }, { x: -0.35, y: 0.35 }, { x: -0.35, y: -0.35 }, { x: 0.35, y: -0.35 }] };
            renderProps();
            edited();
          },
        },
        h("option", { value: "rect", selected: ch.frame.type === "rect" }, "Rectangle"),
        h("option", { value: "polygon", selected: ch.frame.type === "polygon" }, "Polygon"),
      ),
    );
    if (ch.frame.type === "rect") {
      const f = ch.frame;
      appendAll(propsBox, 
        numField({ label: "Length (front to back)", unit: "m", min: 0.2, max: 2.5, step: 0.005, get: () => f.length, set: (v) => (f.length = v) }),
        numField({ label: "Width", unit: "m", min: 0.2, max: 2.5, step: 0.005, get: () => f.width, set: (v) => (f.width = v) }),
      );
    } else {
      const f = ch.frame;
      const k = toDisplay(1, "m", units);
      const area = h("textarea", { rows: 6, style: "width:100%; font-family:var(--font-mono); background:var(--gray-3); color:var(--text); border:2px solid var(--gray-4)" });
      area.value = f.points.map((p) => `${fmt(p.x * k, 0.01)}, ${fmt(p.y * k, 0.01)}`).join("\n");
      area.addEventListener("change", () => {
        const pts = area.value
          .split("\n")
          .map((l) => l.split(",").map((x) => Number(x.trim()) / k))
          .filter((a) => a.length === 2 && a.every(Number.isFinite))
          .map(([x, y]) => ({ x: x!, y: y! }));
        if (pts.length >= 3) {
          f.points = pts;
          edited();
        } else toast("A polygon needs at least 3 points, one 'x, y' per line.");
      });
      appendAll(propsBox, h("label", { class: "small" }, `Corners, one "x, y" per line (${unitLabel("m", units)}; +x forward, +y left)`), area);
    }
    appendAll(propsBox, 
      numField({ label: "Height", unit: "m", min: 0.1, max: 3, step: 0.005, get: () => ch.height, set: (v) => (ch.height = v), help: "Driving height; decides whether the robot fits under height-limited passages." }),
      numField({ label: "Bumper thickness", unit: "m", min: 0, max: 0.25, step: 0.001, get: () => ch.bumpers.thickness, set: (v) => (ch.bumpers.thickness = v) }),
      numField({ label: "Bumper mass", unit: "kg", min: 0, max: 20, step: 0.1, get: () => ch.bumpers.mass, set: (v) => (ch.bumpers.mass = v) }),
      numField({ label: "Mass (no bumpers)", unit: "kg", min: 5, max: 200, step: 0.5, get: () => ch.mass, set: (v) => (ch.mass = v) }),
      h(
        "label",
        { class: "row center small" },
        h("input", {
          type: "checkbox",
          checked: ch.momentOfInertia === "auto",
          onchange: (e: Event) => {
            ch.momentOfInertia = (e.target as HTMLInputElement).checked ? "auto" : 6;
            renderProps();
            edited();
          },
        }),
        "Moment of inertia from footprint",
      ),
      ch.momentOfInertia !== "auto"
        ? numField({ label: "Moment of inertia", unit: "kg m^2", min: 0.5, max: 40, step: 0.1, get: () => ch.momentOfInertia as number, set: (v) => (ch.momentOfInertia = v) })
        : null,
      h("h3", null, "Drivetrain"),
      h(
        "select",
        {
          onchange: (e: Event) => {
            dt.type = (e.target as HTMLSelectElement).value as typeof dt.type;
            renderProps();
            edited();
          },
        },
        (["swerve", "tank", "mecanum"] as const).map((t) => h("option", { value: t, selected: dt.type === t }, t)),
      ),
      numField({ label: "Top speed", unit: "m/s", min: 0.5, max: 8, step: 0.05, get: () => dt.maxSpeed, set: (v) => (dt.maxSpeed = v) }),
      numField({ label: "Acceleration", unit: "m/s^2", min: 1, max: 25, step: 0.1, get: () => dt.maxAccel, set: (v) => (dt.maxAccel = v) }),
      numField({ label: "Turn speed", unit: "rad/s", min: 1, max: 25, step: 0.1, get: () => dt.maxAngularSpeed, set: (v) => (dt.maxAngularSpeed = v) }),
      numField({ label: "Traction (friction)", unit: "", min: 0.3, max: 2, step: 0.01, get: () => dt.traction, set: (v) => (dt.traction = v), help: "Caps pushing force at traction × weight." }),
      dt.type === "mecanum"
        ? numField({ label: "Strafe speed fraction", unit: "", min: 0.3, max: 1, step: 0.01, get: () => dt.strafeFactor ?? 0.8, set: (v) => (dt.strafeFactor = v) })
        : null,
      h("h3", null, "Match start"),
      numField({
        label: `Preloaded ${session.game.pieces.preload.piece}`,
        unit: "pieces",
        min: 0,
        max: Math.max(1, session.game.pieces.preload.max),
        step: 1,
        integer: true,
        get: () => design.preload ?? session.game.pieces.preload.max,
        set: (v) => (design.preload = v),
      }),
      h("p", { class: "small muted" }, "Select a mechanism on the canvas to edit it."),
    );
  }

  function renderMechanismProps(mech: Mechanism) {
    let resolved;
    try {
      resolved = resolveMechanism(mech, custom);
    } catch (e) {
      appendAll(propsBox, h("p", { class: "red" }, (e as Error).message));
      return;
    }
    const spec = MECHANISM_SPECS[resolved.base];
    const customType = custom.types.find((t) => t.id === mech.type);
    appendAll(propsBox, 
      title("h2", customType?.label ?? spec.label),
      h("div", { class: "small muted" }, customType ? `Game-module type "${customType.id}" (builds on ${resolved.base})` : `Core type "${resolved.base}"`),
      textField("Id", () => mech.id, (v) => {
        const id = v.trim();
        if (!id) return;
        if (design.mechanisms.some((m) => m !== mech && m.id === id)) toast(`Another mechanism is already named "${id}".`);
        else mech.id = id;
      }),
      h("h3", null, "Mount"),
      numField({ label: "Forward (x)", unit: "m", min: -1.5, max: 1.5, step: 0.005, get: () => mech.mount.x, set: (v) => (mech.mount.x = v) }),
      numField({ label: "Left (y)", unit: "m", min: -1.5, max: 1.5, step: 0.005, get: () => mech.mount.y, set: (v) => (mech.mount.y = v) }),
      numField({ label: "Facing", unit: "rad", min: -Math.PI, max: Math.PI, step: 0.01, get: () => mech.mount.theta, set: (v) => (mech.mount.theta = v), help: "0 = robot front, π = robot back." }),
      h("h3", null, "Parameters"),
      Object.entries(spec.params).map(([key, p]) =>
        numField({
          label: p.label,
          unit: p.unit as Unit,
          min: p.min,
          max: p.max,
          step: p.step,
          help: p.help,
          integer: p.unit === "pieces" || p.unit === "level",
          get: () => {
            const v = mech.params[key];
            return typeof v === "number" ? v : (resolved.p[key] ?? p.default);
          },
          set: (v) => (mech.params[key] = v),
        }),
      ),
      h(
        "div",
        { class: "controls", style: "margin-top:6px" },
        h("button", { class: "btn", onclick: () => duplicate() }, "Duplicate"),
        h("button", { class: "btn", onclick: () => ((clipboard = structuredClone(mech)), toast(`Copied ${mech.id}.`)) }, "Copy"),
        h("button", { class: "btn", onclick: () => removeSelected() }, "Delete"),
        h("button", { class: "btn", onclick: () => select(-1) }, "Robot settings"),
      ),
    );
  }

  function renderChecks() {
    clear(checkBox);
    const schema = validate(RobotDesign, design);
    const issues = schema.ok ? checkDesignRunnable(design, custom).map((i) => `${i.path}: ${i.message}`) : schema.issues.map((i) => `${i.path}: ${i.message}`);
    checkBox.append(
      h("h3", null, "Ready to run?"),
      issues.length ? h("div", { class: "col" }, issues.map((i) => h("div", { class: "red" }, i))) : h("div", { class: "green" }, "Yes. This design can be simulated."),
    );
    let outline = "";
    try {
      const b = bumperPolygon(design);
      const xs = b.map((p) => p.x);
      const ys = b.map((p) => p.y);
      const len = toDisplay(Math.max(...xs) - Math.min(...xs), "m", units);
      const wid = toDisplay(Math.max(...ys) - Math.min(...ys), "m", units);
      outline = `${fmt(len, 0.1)} × ${fmt(wid, 0.1)} ${unitLabel("m", units)}`;
    } catch {
      outline = "—";
    }
    const ch = design.chassis;
    const perimeter = ch.frame.type === "rect" ? 2 * (ch.frame.length + ch.frame.width) : ch.frame.points.reduce((s, p, i, a) => s + Math.hypot(p.x - a[(i + 1) % a.length]!.x, p.y - a[(i + 1) % a.length]!.y), 0);
    const capacity = design.mechanisms.reduce((n, m) => {
      try {
        const r = resolveMechanism(m, custom);
        return r.base === "storage" ? n + Math.floor(r.p.capacity!) : n;
      } catch {
        return n;
      }
    }, 0);
    checkBox.append(
      h("h3", { style: "margin-top:6px" }, "Measurements (information only)"),
      h(
        "table",
        null,
        h(
          "tbody",
          null,
          row("Frame perimeter", `${fmt(toDisplay(perimeter, "m", units), 0.1)} ${unitLabel("m", units)}`),
          row("Bumper outline", outline),
          row("Height", `${fmt(toDisplay(ch.height, "m", units), 0.1)} ${unitLabel("m", units)}`),
          row("Total mass", `${fmt(toDisplay(ch.mass + ch.bumpers.mass, "kg", units), 0.1)} ${unitLabel("kg", units)}`),
          row("Piece capacity", String(capacity || 1)),
        ),
      ),
      h("p", { class: "muted", style: "margin-top:6px" }, "GoldSim never blocks or changes a design for robot-rule reasons. Unusual designs are allowed on purpose."),
    );
  }

  function row(label: string, value: string) {
    return h("tr", null, h("td", { class: "muted" }, label), h("td", { class: "num" }, value));
  }

  // ---- Editing actions --------------------------------------------------------

  function uniqueId(base: string): string {
    let n = 1;
    while (design.mechanisms.some((m) => m.id === `${base}${n}`)) n++;
    return `${base}${n}`;
  }

  function addMechanism(type: string) {
    const base = (custom.types.find((t) => t.id === type)?.base ?? type) as CoreMechanismType;
    let x = 0;
    try {
      const front = Math.max(...bumperPolygon(design).map((p) => p.x));
      if (base === "intake" || base === "blocker") x = front;
      if (base === "shooter") x = -0.1;
    } catch {
      x = 0;
    }
    design.mechanisms.push({ id: uniqueId(type.replace(/[^a-zA-Z]/g, "")), type, mount: { x: +x.toFixed(3), y: 0, theta: 0 }, params: {} });
    select(design.mechanisms.length - 1);
    edited();
  }

  function select(i: number) {
    view.selected = i;
    renderProps();
    view.render();
  }

  function duplicate() {
    const m = design.mechanisms[view.selected];
    if (!m) return;
    paste(structuredClone(m));
  }

  function paste(m: Mechanism | null) {
    if (!m) return;
    const copy = structuredClone(m);
    copy.id = uniqueId(copy.id.replace(/\d+$/, ""));
    copy.mount.y = +(copy.mount.y - 0.1).toFixed(3);
    design.mechanisms.push(copy);
    select(design.mechanisms.length - 1);
    edited();
  }

  function removeSelected() {
    if (view.selected < 0) return;
    design.mechanisms.splice(view.selected, 1);
    select(-1);
    edited();
  }

  function save(asCopy: boolean) {
    const schema = validate(RobotDesign, design);
    if (!schema.ok) return toast(`Fix these first:\n${formatIssues(schema.issues.slice(0, 4))}`, 7000);
    const copy = structuredClone(design);
    if (asCopy || session.editorIndex === null) {
      if (asCopy) copy.name = `${copy.name} (copy)`;
      session.customDesigns.push(copy);
      session.editorIndex = session.customDesigns.length - 1;
      if (asCopy) design = session.editorDesign = structuredClone(copy);
    } else session.customDesigns[session.editorIndex] = copy;
    renderList();
    renderProps();
    toast(`Saved "${copy.name}" for this session. It is available in Play setup.`);
  }

  async function importDesign() {
    try {
      const { data, name } = await pickJsonFile(1_000_000);
      const r = validate(RobotDesign, data);
      if (!r.ok) return toast(`${name} is not a valid robot design:\n${formatIssues(r.issues.slice(0, 5))}`, 9000);
      open(r.value, null);
      toast(`Imported "${r.value.name}". Save it to use it in matches.`);
    } catch (e) {
      toast((e as Error).message, 6000);
    }
  }

  function testDrive() {
    const schema = validate(RobotDesign, design);
    const issues = schema.ok ? checkDesignRunnable(design, custom) : schema.issues;
    if (issues.length) return toast(`This design cannot run yet: ${issues[0]!.path}: ${issues[0]!.message}`, 7000);
    const pad = connectedPads()[0];
    const driver: DriverChoice = pad ? { kind: "gamepad", index: pad.index } : { kind: "keyboard" };
    const opponent = allDesigns().find((d) => d !== design) ?? design;
    session.setup = {
      game: session.game,
      profile: session.game.game.defaultProfile,
      seed: randomSeed(),
      slots: [
        { alliance: "blue", station: 1, design: structuredClone(design), driver },
        { alliance: "red", station: 1, design: opponent, driver: { kind: "idle" } },
      ],
    };
    navigate("/match");
  }

  // ---- Keyboard ---------------------------------------------------------------

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    const mech = design.mechanisms[view.selected];
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === "KeyV") return (e.preventDefault(), paste(clipboard));
    if (!mech) return;
    const step = e.shiftKey ? 0.025 : 0.005;
    const rot = ((e.shiftKey ? 15 : 5) * Math.PI) / 180;
    let handled = true;
    if (ctrl && e.code === "KeyC") {
      clipboard = structuredClone(mech);
      toast(`Copied ${mech.id}.`);
    } else if (ctrl && e.code === "KeyD") duplicate();
    else if (e.code === "ArrowUp") mech.mount.y += step;
    else if (e.code === "ArrowDown") mech.mount.y -= step;
    else if (e.code === "ArrowLeft") mech.mount.x -= step;
    else if (e.code === "ArrowRight") mech.mount.x += step;
    else if (e.code === "KeyQ") mech.mount.theta += rot;
    else if (e.code === "KeyE") mech.mount.theta -= rot;
    else if (e.code === "Delete" || e.code === "Backspace") removeSelected();
    else if (e.code === "Escape") select(-1);
    else handled = false;
    if (handled) {
      e.preventDefault();
      mech.mount.x = +mech.mount.x.toFixed(4);
      mech.mount.y = +mech.mount.y.toFixed(4);
      mech.mount.theta = +Math.atan2(Math.sin(mech.mount.theta), Math.cos(mech.mount.theta)).toFixed(5);
      if (design.mechanisms.includes(mech)) renderProps();
      edited();
    }
  };
  window.addEventListener("keydown", onKey);
  const onResize = () => view.render();
  window.addEventListener("resize", onResize);
  const unTheme = onThemeChange(() => view.render());

  setUnits(units);
  renderList();
  requestAnimationFrame(() => edited());

  return () => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    unTheme();
  };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "robot";
}
