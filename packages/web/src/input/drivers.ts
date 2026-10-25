import type { Driver, DriverInput, Observation } from "@goldsim/core";
import type { Alliance } from "@goldsim/schema";
import { DEFAULT_BINDINGS, XboxAxis, XboxButton, type Bindings, type DriveFrame } from "./bindings.js";

function deadband(v: number, d: number): number {
  if (Math.abs(v) < d) return 0;
  return Math.sign(v) * ((Math.abs(v) - d) / (1 - d));
}

/**
 * Converts a stick/key vector to field-relative velocity.
 * "screen": up on the stick is up on the screen (+y). "driverStation": up is away from your alliance wall.
 */
function toField(right: number, up: number, frame: DriveFrame, alliance: Alliance): { vx: number; vy: number } {
  if (frame === "screen") return { vx: right, vy: up };
  return alliance === "blue" ? { vx: up, vy: -right } : { vx: -up, vy: right };
}

/** Human driver on an Xbox-type controller (browser Gamepad API, standard mapping). */
export class GamepadDriver implements Driver {
  private level = 0;
  constructor(
    readonly padIndex: number,
    readonly alliance: Alliance,
    public bindings: Bindings = DEFAULT_BINDINGS,
  ) {}

  getInput(_tick: number, _obs: Observation): DriverInput {
    const pad = navigator.getGamepads?.()[this.padIndex];
    if (!pad) return { vx: 0, vy: 0, omega: 0, actions: {} };
    const b = this.bindings;
    const axis = (name: keyof typeof XboxAxis) => deadband(pad.axes[XboxAxis[name]] ?? 0, b.deadband);
    const btn = (name: keyof typeof XboxButton) => {
      const x = pad.buttons[XboxButton[name]];
      return !!x && (x.pressed || x.value > 0.3);
    };
    for (const [lvl, name] of Object.entries(b.climbLevel)) if (btn(name)) this.level = lvl === "max" ? 0 : Number(lvl);
    const { vx, vy } = toField(axis(b.translateX), -axis(b.translateY), b.driveFrame, this.alliance);
    return {
      vx,
      vy,
      omega: -axis(b.rotate),
      actions: {
        intake: btn(b.actions.intake),
        shoot: btn(b.actions.shoot),
        deploy: btn(b.actions.deploy),
        place: btn(b.actions.place),
        climb: btn(b.climb),
        climbLevel: this.level,
      },
    };
  }

  get climbTarget(): number {
    return this.level;
  }
}

const held = new Set<string>();
let keyboardAttached = false;

function attachKeyboard(): void {
  if (keyboardAttached) return;
  keyboardAttached = true;
  const ignore = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
  window.addEventListener("keydown", (e) => {
    if (ignore(e)) return;
    held.add(e.code);
    if (["Space", "ShiftLeft"].includes(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => held.delete(e.code));
  window.addEventListener("blur", () => held.clear());
}

/** Keyboard input for development and debugging only (not a supported driver input, PRD §10). */
export class KeyboardDriver implements Driver {
  private level = 0;
  constructor(
    readonly alliance: Alliance,
    readonly frame: DriveFrame = "screen",
  ) {
    attachKeyboard();
  }

  getInput(): DriverInput {
    const k = (code: string) => held.has(code);
    if (k("Digit1")) this.level = 1;
    if (k("Digit2")) this.level = 2;
    if (k("Digit3")) this.level = 3;
    if (k("Digit0")) this.level = 0;
    const right = (k("KeyD") ? 1 : 0) - (k("KeyA") ? 1 : 0);
    const up = (k("KeyW") ? 1 : 0) - (k("KeyS") ? 1 : 0);
    const { vx, vy } = toField(right, up, this.frame, this.alliance);
    return {
      vx,
      vy,
      omega: (k("KeyQ") ? 1 : 0) - (k("KeyE") ? 1 : 0),
      actions: {
        intake: k("ShiftLeft") || k("KeyK"),
        shoot: k("Space") || k("KeyJ"),
        climb: k("KeyC"),
        deploy: k("KeyX"),
        place: k("KeyF"),
        climbLevel: this.level,
      },
    };
  }

  get climbTarget(): number {
    return this.level;
  }
}

export function connectedPads(): { index: number; id: string }[] {
  const pads = navigator.getGamepads?.() ?? [];
  return Array.from(pads)
    .filter((p): p is Gamepad => !!p)
    .map((p) => ({ index: p.index, id: p.id }));
}
