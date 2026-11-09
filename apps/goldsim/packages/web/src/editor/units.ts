/** Display units. Designs are always stored in SI; only the editor's display changes. */
export type UnitSystem = "si" | "imperial";

export type Unit = "m" | "s" | "rad" | "rad/s" | "m/s" | "m/s^2" | "kg" | "kg m^2" | "pieces" | "pieces/s" | "level" | "";

const IMPERIAL: Partial<Record<Unit, { label: string; k: number }>> = {
  m: { label: "in", k: 39.3701 },
  rad: { label: "°", k: 180 / Math.PI },
  "rad/s": { label: "°/s", k: 180 / Math.PI },
  "m/s": { label: "ft/s", k: 3.28084 },
  "m/s^2": { label: "ft/s²", k: 3.28084 },
  kg: { label: "lb", k: 2.20462 },
  "kg m^2": { label: "lb·in²", k: 3417.17 },
};

const SI_LABEL: Partial<Record<Unit, string>> = { "m/s^2": "m/s²", "kg m^2": "kg·m²" };

const KEY = "goldsim.units";

export function loadUnits(): UnitSystem {
  try {
    return localStorage.getItem(KEY) === "si" ? "si" : "imperial";
  } catch {
    return "imperial";
  }
}

export function saveUnits(u: UnitSystem): void {
  try {
    localStorage.setItem(KEY, u);
  } catch {
    // storage unavailable; the choice lasts for this page only
  }
}

export function factor(unit: Unit, sys: UnitSystem): number {
  return sys === "imperial" ? (IMPERIAL[unit]?.k ?? 1) : 1;
}

export function unitLabel(unit: Unit, sys: UnitSystem): string {
  return sys === "imperial" ? (IMPERIAL[unit]?.label ?? unit) : (SI_LABEL[unit] ?? unit);
}

export function toDisplay(v: number, unit: Unit, sys: UnitSystem): number {
  return v * factor(unit, sys);
}

export function fromDisplay(v: number, unit: Unit, sys: UnitSystem): number {
  return v / factor(unit, sys);
}

/** Rounds a display value to a sensible number of decimals for its step. */
export function fmt(v: number, step: number): string {
  const decimals = Math.max(0, Math.min(4, Math.ceil(-Math.log10(step))));
  return v.toFixed(decimals);
}
