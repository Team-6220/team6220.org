/**
 * Driver profile: the knobs of a parameterized policy (PRD §11.3). Saved to the team workspace and sweepable.
 */
export interface DriverProfile {
  id: string;
  label: string;
  /** auto: decided from the robot's mechanisms. */
  role: "auto" | "scorer" | "defender" | "feeder";
  /** Fraction of top speed the driver actually uses. */
  speedScale: number;
  /** Seconds between decisions (reaction latency). */
  reactionTime: number;
  /** Heading error (rad) the driver accepts before shooting. */
  aimTolerance: number;
  /** Standard deviation (rad) of the driver's aim bias, drawn once per shooting sequence. */
  aimError: number;
  /** Start a shooting run once this fraction of capacity is stored. */
  shootThreshold: number;
  /** Shoot even when the own goal is inactive (wasted shots). */
  shootWhenInactive: boolean;
  /** Where to look for pieces first. */
  pickup: "nearest" | "neutral" | "depot" | "outpost";
  /** 0 = shadow only, 1 = drive through opponents. */
  defenseAggression: number;
  /** Extra seconds kept in reserve before going to climb. */
  endgameBuffer: number;
  climb: boolean;
  /** Climb Level 1 at the end of AUTO, then come down in TELEOP. */
  autoClimb: boolean;
}

export const DEFAULT_PROFILE: DriverProfile = {
  id: "balanced",
  label: "Balanced",
  role: "auto",
  speedScale: 0.9,
  reactionTime: 0.15,
  aimTolerance: 0.04,
  aimError: 0.01,
  shootThreshold: 0.8,
  shootWhenInactive: false,
  pickup: "nearest",
  defenseAggression: 0.5,
  endgameBuffer: 4,
  climb: true,
  autoClimb: false,
};

export const PROFILE_PRESETS: DriverProfile[] = [
  DEFAULT_PROFILE,
  {
    ...DEFAULT_PROFILE,
    id: "aggressive",
    label: "Aggressive",
    speedScale: 1,
    reactionTime: 0.1,
    aimTolerance: 0.06,
    shootThreshold: 0.6,
    endgameBuffer: 1.5,
  },
  {
    ...DEFAULT_PROFILE,
    id: "cautious",
    label: "Cautious",
    speedScale: 0.75,
    reactionTime: 0.3,
    aimTolerance: 0.025,
    shootThreshold: 1,
    endgameBuffer: 6,
  },
  { ...DEFAULT_PROFILE, id: "defender", label: "Defender", role: "defender", defenseAggression: 0.8, climb: true },
  { ...DEFAULT_PROFILE, id: "outpost-feeder", label: "Outpost feeder", pickup: "outpost" },
];

/** Numeric knobs with ranges, for sweeps and the profile editor. */
export const PROFILE_KNOBS: { key: keyof DriverProfile; label: string; min: number; max: number; step: number }[] = [
  { key: "speedScale", label: "Speed used", min: 0.3, max: 1, step: 0.05 },
  { key: "reactionTime", label: "Reaction time (s)", min: 0.05, max: 1, step: 0.05 },
  { key: "aimTolerance", label: "Aim tolerance (rad)", min: 0.01, max: 0.2, step: 0.005 },
  { key: "aimError", label: "Aim error (rad)", min: 0, max: 0.15, step: 0.005 },
  { key: "shootThreshold", label: "Shoot at capacity fraction", min: 0.1, max: 1, step: 0.05 },
  { key: "defenseAggression", label: "Defense aggression", min: 0, max: 1, step: 0.05 },
  { key: "endgameBuffer", label: "Endgame buffer (s)", min: 0, max: 15, step: 0.5 },
];

export function profileById(id: string): DriverProfile {
  return PROFILE_PRESETS.find((p) => p.id === id) ?? DEFAULT_PROFILE;
}
