import type { Rng } from "@goldsim/core";

export type SkillLevel = "rookie" | "average" | "experienced" | "elite";

/**
 * Driver profile: the knobs of a parameterized policy (PRD §11.3). Saved to the team workspace and sweepable.
 * Every knob is a typical value; each match the driver's actual "form" is drawn around it (see formVariation),
 * so repeated matches differ the way real drivers do.
 */
export interface DriverProfile {
  id: string;
  label: string;
  /** Plain-language skill tier this profile was built from (informational). */
  skill?: SkillLevel;
  /** auto: decided from the robot's mechanisms. */
  role: "auto" | "scorer" | "defender" | "feeder";
  /** Fraction of top speed the driver actually uses. */
  speedScale: number;
  /** Seconds between decisions (reaction latency). */
  reactionTime: number;
  /** Heading error (rad) the driver accepts before shooting. */
  aimTolerance: number;
  /** Size (rad) of the driver's aiming wobble: a slowly drifting error, so every shot lands a little differently. */
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
  /** How much the driver's form changes from match to match (0 = a robot, 0.25 = very streaky). */
  formVariation: number;
  /** How often the driver picks a worse-than-best piece or spot. 0 = always the best choice; higher = sloppier. */
  decisionNoise: number;
  /** 0 = waits until perfectly settled to shoot; 1 = fires while still moving and turning. */
  impatience: number;
  /** Chance of short pauses while deciding what to do next (0 = never, 1 = often). */
  hesitation: number;
  /** Typical miss distance (m) when lining up on a piece; big values mean more missed pickups. */
  drivingError: number;
  /** Typical error (s) in judging when to leave for the endgame; can make the driver early or late. */
  endgameTiming: number;
  /** Expected mistakes or minor breakdowns per match (stuck, jammed, drove into something). Each costs the robot a few seconds, sometimes far more. */
  mishaps: number;
}

/** A typical, decent driver. Used when nothing else is chosen. */
export const DEFAULT_PROFILE: DriverProfile = {
  id: "balanced",
  label: "Balanced",
  skill: "average",
  role: "auto",
  speedScale: 0.88,
  reactionTime: 0.2,
  aimTolerance: 0.05,
  aimError: 0.035,
  shootThreshold: 0.8,
  shootWhenInactive: false,
  pickup: "nearest",
  defenseAggression: 0.5,
  endgameBuffer: 4,
  climb: true,
  autoClimb: false,
  formVariation: 0.22,
  decisionNoise: 0.7,
  impatience: 0.3,
  hesitation: 0.2,
  drivingError: 0.07,
  endgameTiming: 2,
  mishaps: 1.2,
};

/** Skill-only knob values for each tier (combine with a strategy via withSkill). */
export const SKILL_KNOBS: Record<SkillLevel, Partial<DriverProfile>> = {
  rookie: {
    speedScale: 0.7,
    reactionTime: 0.38,
    aimTolerance: 0.09,
    aimError: 0.07,
    formVariation: 0.3,
    decisionNoise: 1.6,
    impatience: 0.6,
    hesitation: 0.55,
    drivingError: 0.16,
    endgameTiming: 4,
    endgameBuffer: 3,
    mishaps: 2.2,
  },
  average: {
    speedScale: 0.85,
    reactionTime: 0.22,
    aimTolerance: 0.055,
    aimError: 0.04,
    formVariation: 0.22,
    decisionNoise: 0.8,
    impatience: 0.35,
    hesitation: 0.25,
    drivingError: 0.08,
    endgameTiming: 2.5,
    endgameBuffer: 4,
    mishaps: 1.2,
  },
  experienced: {
    speedScale: 0.93,
    reactionTime: 0.15,
    aimTolerance: 0.04,
    aimError: 0.022,
    formVariation: 0.15,
    decisionNoise: 0.4,
    impatience: 0.2,
    hesitation: 0.1,
    drivingError: 0.05,
    endgameTiming: 1.5,
    endgameBuffer: 4,
    mishaps: 0.6,
  },
  elite: {
    speedScale: 1,
    reactionTime: 0.1,
    aimTolerance: 0.03,
    aimError: 0.012,
    formVariation: 0.1,
    decisionNoise: 0.15,
    impatience: 0.1,
    hesitation: 0.03,
    drivingError: 0.03,
    endgameTiming: 1,
    endgameBuffer: 3.5,
    mishaps: 0.25,
  },
};

export const SKILL_LABELS: Record<SkillLevel, string> = {
  rookie: "Rookie",
  average: "Average",
  experienced: "Experienced",
  elite: "Elite",
};

/** A strategy profile driven at a given skill level. */
export function withSkill(profile: DriverProfile, skill: SkillLevel): DriverProfile {
  return {
    ...profile,
    ...SKILL_KNOBS[skill],
    skill,
    id: `${profile.id}-${skill}`,
    label: `${profile.label} (${SKILL_LABELS[skill]})`,
  };
}

const skillPreset = (skill: SkillLevel): DriverProfile => ({
  ...DEFAULT_PROFILE,
  ...SKILL_KNOBS[skill],
  skill,
  id: skill,
  label: `${SKILL_LABELS[skill]} driver`,
});

export const PROFILE_PRESETS: DriverProfile[] = [
  DEFAULT_PROFILE,
  skillPreset("rookie"),
  skillPreset("average"),
  skillPreset("experienced"),
  skillPreset("elite"),
  {
    ...DEFAULT_PROFILE,
    id: "aggressive",
    label: "Aggressive",
    speedScale: 0.97,
    reactionTime: 0.14,
    aimTolerance: 0.07,
    shootThreshold: 0.6,
    endgameBuffer: 2,
    impatience: 0.55,
  },
  {
    ...DEFAULT_PROFILE,
    id: "cautious",
    label: "Cautious",
    speedScale: 0.75,
    reactionTime: 0.3,
    aimTolerance: 0.03,
    shootThreshold: 1,
    endgameBuffer: 6,
    impatience: 0.1,
  },
  { ...DEFAULT_PROFILE, id: "defender", label: "Defender", role: "defender", defenseAggression: 0.8, climb: true },
  { ...DEFAULT_PROFILE, id: "outpost-feeder", label: "Outpost feeder", pickup: "outpost" },
];

export interface ProfileKnob {
  key: keyof DriverProfile;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Plain-English explanation for people who haven't read the code. */
  help: string;
}

/** Numeric knobs with ranges, for sweeps and the profile editor. */
export const PROFILE_KNOBS: ProfileKnob[] = [
  { key: "speedScale", label: "Speed used", min: 0.3, max: 1, step: 0.05, help: "How much of the robot's top speed the driver actually uses. 1 = flat out." },
  { key: "reactionTime", label: "Reaction time (s)", min: 0.05, max: 1, step: 0.05, help: "Seconds between the driver's decisions. Slower drivers react late to openings and changes." },
  { key: "aimTolerance", label: "Aim tolerance (rad)", min: 0.01, max: 0.2, step: 0.005, help: "How far off-target (in radians; 0.05 ≈ 3°) the driver is willing to shoot. Bigger = shoots sooner but misses more." },
  { key: "aimError", label: "Aim wobble (rad)", min: 0, max: 0.15, step: 0.005, help: "How much the driver's aim drifts while shooting (radians; 0.035 ≈ 2°). Bigger = less accurate." },
  { key: "shootThreshold", label: "Shoot when this full", min: 0.1, max: 1, step: 0.05, help: "Fraction of the robot's storage the driver fills before going to shoot. Low = many short trips, high = fewer long ones." },
  { key: "defenseAggression", label: "Defense aggression", min: 0, max: 1, step: 0.05, help: "Defenders only. 0 = stays in the way without contact, 1 = drives straight into opponents." },
  { key: "endgameBuffer", label: "Endgame head start (s)", min: 0, max: 15, step: 0.5, help: "Extra seconds the driver leaves for the endgame climb. Too little and the climb may not finish." },
  { key: "formVariation", label: "Match-to-match variation", min: 0, max: 0.4, step: 0.01, help: "How much the driver's performance changes between matches. 0 = identical every match." },
  { key: "decisionNoise", label: "Decision sloppiness", min: 0, max: 3, step: 0.1, help: "How often the driver goes for a worse piece or spot than the best one. 0 = always the best choice." },
  { key: "impatience", label: "Impatience", min: 0, max: 1, step: 0.05, help: "0 = waits until perfectly still and lined up to shoot; 1 = fires while still moving and turning." },
  { key: "hesitation", label: "Hesitation", min: 0, max: 1, step: 0.05, help: "How often the driver pauses briefly while deciding what to do next." },
  { key: "drivingError", label: "Pickup line-up error (m)", min: 0, max: 0.4, step: 0.01, help: "Typical distance the driver misses by when lining up on a piece. Bigger = more missed pickups." },
  { key: "endgameTiming", label: "Endgame timing error (s)", min: 0, max: 8, step: 0.5, help: "How badly the driver can misjudge when to leave for the endgame (early or late)." },
  { key: "mishaps", label: "Mishaps per match", min: 0, max: 4, step: 0.1, help: "How many mistakes or minor breakdowns to expect in one match (getting stuck, a jam, driving into something). Each one stops the robot for a few seconds, and now and then for much longer. 0 = flawless." },
];

export function profileById(id: string): DriverProfile {
  return PROFILE_PRESETS.find((p) => p.id === id) ?? DEFAULT_PROFILE;
}

export interface RandomProfileOptions {
  /** What the robot can do; roles it can't play are never picked. Default: everything. */
  capabilities?: { shooter: boolean; intake: boolean; climber: boolean };
  /** Force a skill tier instead of drawing one. */
  skill?: SkillLevel;
}

const SKILL_WEIGHTS: [SkillLevel, number][] = [
  ["rookie", 0.25],
  ["average", 0.4],
  ["experienced", 0.25],
  ["elite", 0.1],
];

function pickWeighted<T>(rng: Rng, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1]![0];
}

/** A random strategy at a random (or given) skill: "random bots with random strategies". Deterministic for an rng. */
export function randomProfile(rng: Rng, opts: RandomProfileOptions = {}): DriverProfile {
  const caps = opts.capabilities ?? { shooter: true, intake: true, climber: true };
  const skill = opts.skill ?? pickWeighted(rng, SKILL_WEIGHTS);
  const canScore = caps.shooter && caps.intake;
  const role: DriverProfile["role"] = canScore
    ? pickWeighted<DriverProfile["role"]>(rng, [
        ["scorer", 0.75],
        ["feeder", 0.1],
        ["defender", 0.15],
      ])
    : "defender";
  const pickup: DriverProfile["pickup"] =
    role === "feeder"
      ? "outpost"
      : pickWeighted<DriverProfile["pickup"]>(rng, [
          ["nearest", 0.5],
          ["neutral", 0.3],
          ["depot", 0.2],
        ]);
  const roleLabel = role === "scorer" ? "scorer" : role === "feeder" ? "feeder" : "defender";
  return {
    ...DEFAULT_PROFILE,
    ...SKILL_KNOBS[skill],
    id: `random-${skill}-${roleLabel}`,
    label: `Random: ${SKILL_LABELS[skill]} ${roleLabel}`,
    skill,
    role,
    pickup,
    shootThreshold: Math.round(rng.range(0.4, 1) * 20) / 20,
    defenseAggression: Math.round(rng.range(0.2, 1) * 20) / 20,
    climb: caps.climber && rng.next() < 0.9,
    autoClimb: caps.climber && rng.next() < 0.2,
  };
}
