/**
 * Parametric projectile model for shooters (PRD §7.6).
 *
 * A piece leaves the shooter at height h0 (launchHeight), elevation angle a (launchAngle) and speed v.
 * Height after travelling horizontal distance x:
 *
 *   z(x) = h0 + x·tan(a) − g·x² / (2·v²·cos²(a))
 *
 * Speed needed to pass through height H at distance d:
 *
 *   v² = g·d² / (2·cos²(a)·(h0 + d·tan(a) − H))        (impossible if h0 + d·tan(a) ≤ H)
 *
 * Distance where the piece crosses height H (k = g / (2·v²·cos²(a))):
 *
 *   x = (tan(a) ± sqrt(tan²(a) − 4·k·(H − h0))) / (2·k)  (+ = descending, − = ascending)
 *
 * For a top-entry goal the piece must be falling at the opening; that needs d ≥ 2·(H − h0) / tan(a)
 * (the trajectory's apex must be before the target). Time of flight to x is x / (v·cos(a)).
 */

import { G } from "./math.js";

export interface ShotParams {
  /** Maximum exit speed the shooter can produce, m/s. */
  exitSpeed: number;
  /** Elevation, radians. */
  launchAngle: number;
  /** Height the piece leaves the robot, m. */
  launchHeight: number;
  /** Closest aim distance the shooter's controls allow, m (horizontal, to the target center). */
  rangeMin: number;
  /** Farthest aim distance the shooter's controls allow, m. */
  rangeMax: number;
}

export type Entry = "top" | "front";

/** Exit speed needed to pass through height H at horizontal distance d, or null if this angle can't. */
export function requiredSpeed(distance: number, targetHeight: number, p: Pick<ShotParams, "launchAngle" | "launchHeight">, g = G): number | null {
  const c = Math.cos(p.launchAngle);
  const rise = p.launchHeight + distance * Math.tan(p.launchAngle) - targetHeight;
  if (distance <= 0 || rise <= 1e-9 || c <= 1e-9) return null;
  return Math.sqrt((g * distance * distance) / (2 * c * c * rise));
}

/** Horizontal distance where a piece launched at `speed` crosses `height`, or null if it never gets that high. */
export function crossingDistance(
  speed: number,
  height: number,
  p: Pick<ShotParams, "launchAngle" | "launchHeight">,
  which: "descending" | "ascending" = "descending",
  g = G,
): number | null {
  const c = Math.cos(p.launchAngle);
  const t = Math.tan(p.launchAngle);
  if (speed <= 1e-9 || c <= 1e-9) return null;
  const k = g / (2 * speed * speed * c * c);
  const disc = t * t - 4 * k * (height - p.launchHeight);
  if (disc < 0) return null;
  const x = (t + (which === "descending" ? 1 : -1) * Math.sqrt(disc)) / (2 * k);
  return x > 0 ? x : null;
}

/** Horizontal distance where a piece launched at `speed` hits the carpet. */
export function groundDistance(speed: number, p: Pick<ShotParams, "launchAngle" | "launchHeight">, g = G): number {
  return crossingDistance(speed, 0, p, "descending", g) ?? 0;
}

export function flightTime(distance: number, speed: number, launchAngle: number): number {
  return distance / Math.max(1e-6, speed * Math.cos(launchAngle));
}

/** Shortest distance at which a top-entry shot is still falling through the opening (apex before target). */
export function minTopEntryDistance(targetHeight: number, p: Pick<ShotParams, "launchAngle" | "launchHeight">): number {
  return Math.max(0, (2 * (targetHeight - p.launchHeight)) / Math.tan(p.launchAngle));
}

/** Farthest distance the shooter can reach height H at full exit speed (on the descending side). */
export function maxReachDistance(targetHeight: number, p: Pick<ShotParams, "exitSpeed" | "launchAngle" | "launchHeight">, g = G): number {
  return crossingDistance(p.exitSpeed, targetHeight, p, "descending", g) ?? 0;
}

export interface ShotEnvelope {
  /** Closest aim distance (horizontal, shooter to target center) that can score, m. */
  minDistance: number;
  /** Farthest aim distance that can score, m. */
  maxDistance: number;
  /** False when nothing in the shooter's window can reach the target. */
  reachable: boolean;
}

/**
 * Distances from which a shooter can put a piece into a target opening of the given height.
 * Combines physics (exit speed, angle, height) with the shooter's aim window (rangeMin/rangeMax).
 * Agents use this to pick shot positions; the editor uses it to show reach.
 */
export function shotEnvelope(p: ShotParams, targetHeight: number, entry: Entry = "top"): ShotEnvelope {
  const physMin = entry === "top" ? minTopEntryDistance(targetHeight, p) : 0;
  const physMax = maxReachDistance(targetHeight, p);
  const minDistance = Math.max(p.rangeMin, physMin);
  const maxDistance = Math.min(p.rangeMax, physMax);
  return { minDistance, maxDistance, reachable: maxDistance > minDistance };
}

/**
 * Speed the shooter's flywheel commands to aim at distance d: the speed that passes through the target
 * height there, limited by the aim window and by exitSpeed. A too-far target gets full speed (falls short);
 * a too-close target gets the window minimum (overshoots).
 */
export function commandedSpeed(distance: number, targetHeight: number, p: ShotParams, entry: Entry = "top"): number {
  const env = shotEnvelope(p, targetHeight, entry);
  const lo = Math.max(env.minDistance, 0.05);
  const hi = Math.max(lo, env.maxDistance);
  const d = Math.min(Math.max(distance, lo), hi);
  const v = requiredSpeed(d, targetHeight, p);
  return Math.min(p.exitSpeed, v ?? p.exitSpeed);
}
