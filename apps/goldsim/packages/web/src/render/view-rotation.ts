/** Field view rotation in quarter turns (0-3, counter-clockwise), remembered for the session. */

const KEY = "goldsim.fieldRotation";
let rotation = load();

function load(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    if (Number.isInteger(n) && n >= 0 && n <= 3) return n;
  } catch {
    // storage unavailable; start unrotated
  }
  return 0;
}

export function getRotation(): number {
  return rotation;
}

/** Rotates the view one quarter turn clockwise (+1) or counter-clockwise (-1). */
export function rotateView(direction: 1 | -1 = 1): number {
  // Quarter turns are counter-clockwise internally, so a clockwise button press subtracts one.
  rotation = (((rotation - direction) % 4) + 4) % 4;
  try {
    localStorage.setItem(KEY, String(rotation));
  } catch {
    // not persisted; still applies this session
  }
  return rotation;
}

/** Current rotation in degrees clockwise, which is what the Rotate button does (0°, 90°, 180°, 270°). */
export function rotationLabel(): string {
  return `${((4 - rotation) % 4) * 90}°`;
}

/** Rotates a screen-space direction (right, up) into field space for the current view rotation. */
export function screenToField(right: number, up: number, turns = rotation): { vx: number; vy: number } {
  switch (((turns % 4) + 4) % 4) {
    case 1:
      // The view maps field (x, y) to screen (-y, x), so screen (right, up) is field (up, -right).
      return { vx: up, vy: -right };
    case 2:
      return { vx: -right, vy: -up };
    case 3:
      return { vx: -up, vy: right };
    default:
      return { vx: right, vy: up };
  }
}
