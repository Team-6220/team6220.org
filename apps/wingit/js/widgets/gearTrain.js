// Pure math for the gear / belt widgets.
export const DP = 20;
export const NEO_RPM = 5676;
export const SMALL_MOTOR_RPM = 11000;
export const WHEEL_DIA = 4;
export const ROLLER_DIA = 2;
export const PINIONS = [10, 12, 14, 16, 20];
export const GEARS = [36, 40, 48, 50, 60];
export const INTAKE_RATIOS = [2, 3, 4, 6];
export const BELT_STOCK = [100, 105, 110, 115];

export function ratio(n1, n2, n3, n4) { return (n2 / n1) * (n4 / n3); }
// 0.85 factor accounts for loaded speed loss.
export function driveSpeed(r) { return ((NEO_RPM * 0.85) / r) * Math.PI * WHEEL_DIA / 12 / 60; }
export function rollerSpeed(r) { return ((SMALL_MOTOR_RPM * 0.8) / r) * Math.PI * ROLLER_DIA / 12 / 60; }
export function center(n1, n2) { return (n1 + n2) / (2 * DP); }
export function round3(x) { return Math.round(x * 1000) / 1000; }

// HTD5M belt between two pulleys: required length in teeth for a given center distance (mm).
export function beltTeeth(t1, t2, cMm) {
  const d1 = (t1 * 5) / Math.PI, d2 = (t2 * 5) / Math.PI;
  const len = 2 * cMm + (Math.PI * (d1 + d2)) / 2 + ((d2 - d1) ** 2) / (4 * cMm);
  return len / 5;
}
