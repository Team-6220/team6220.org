import type { MatchSummary } from "./summary.js";
import type { ParameterEffect } from "./sweep.js";

/** One measurable result of a match, in plain words. `robot` is the index of the robot being studied. */
export interface OutcomeDef {
  id: string;
  label: string;
  /** One-sentence explanation shown next to the picker. */
  help: string;
  unit: string;
  /** True for per-robot metrics (they follow the studied robot); false for whole-alliance/match metrics. */
  perRobot: boolean;
  /** Value for one match, or null when it does not apply (e.g. accuracy with no shots). */
  value: (summary: MatchSummary, robot: number) => number | null;
  format: (v: number) => string;
}

const num = (v: number, digits = 1) => (Number.isInteger(v) ? String(v) : v.toFixed(Math.abs(v) >= 100 ? 0 : digits));
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Metrics a sweep or archetype test can be measured by. `piece` is the game's name for a game piece (e.g. "Fuel"). */
export function outcomeDefs(piece = "piece"): OutcomeDef[] {
  return [
    {
      id: "robotPoints",
      label: "Robot's points",
      help: "Points this robot scored itself (game pieces and endgame), not counting fouls.",
      unit: "points",
      perRobot: true,
      value: (s, r) => s.robots[r]?.points ?? null,
      format: (v) => num(v),
    },
    {
      id: "scored",
      label: `${piece}s scored`,
      help: `How many ${piece}s this robot got into an active goal.`,
      unit: `${piece}s`,
      perRobot: true,
      value: (s, r) => s.robots[r]?.scoredActive ?? null,
      format: (v) => num(v),
    },
    {
      id: "shots",
      label: `${piece}s shot`,
      help: `How many ${piece}s this robot launched, scored or not.`,
      unit: `${piece}s`,
      perRobot: true,
      value: (s, r) => s.robots[r]?.shots ?? null,
      format: (v) => num(v),
    },
    {
      id: "accuracy",
      label: "Shot accuracy",
      help: "Share of this robot's shots that scored (matches with no shots are left out).",
      unit: "%",
      perRobot: true,
      value: (s, r) => s.robots[r]?.accuracy ?? null,
      format: pct,
    },
    {
      id: "climb",
      label: "Climb level",
      help: "Highest level this robot reached in the endgame (0 = no climb).",
      unit: "level",
      perRobot: true,
      value: (s, r) => s.robots[r]?.climbLevel ?? null,
      format: (v) => num(v, 2),
    },
    {
      id: "allianceScore",
      label: "Alliance score",
      help: "Total points of the robot's whole alliance, including help from partners.",
      unit: "points",
      perRobot: true,
      value: (s, r) => {
        const x = s.robots[r];
        return x ? x.allianceScore : null;
      },
      format: (v) => num(v),
    },
    {
      id: "margin",
      label: "Winning margin",
      help: "The robot's alliance score minus the opposing alliance's score (negative = lost).",
      unit: "points",
      perRobot: true,
      value: (s, r) => {
        const x = s.robots[r];
        return x ? x.allianceScore - x.opponentScore : null;
      },
      format: (v) => num(v),
    },
    {
      id: "win",
      label: "Win rate",
      help: "Share of matches the robot's alliance won (a tie counts as half a win).",
      unit: "%",
      perRobot: true,
      value: (s, r) => {
        const x = s.robots[r];
        return x ? (x.won ? 1 : x.tied ? 0.5 : 0) : null;
      },
      format: pct,
    },
    {
      id: "rp",
      label: "Ranking points",
      help: "Ranking points the robot's alliance earned (win/tie plus bonus points).",
      unit: "RP",
      perRobot: true,
      value: (s, r) => {
        const x = s.robots[r];
        return x ? s.alliances[x.alliance].rp : null;
      },
      format: (v) => num(v, 2),
    },
    {
      id: "pickups",
      label: `${piece}s picked up`,
      help: `How many ${piece}s this robot collected from the field.`,
      unit: `${piece}s`,
      perRobot: true,
      value: (s, r) => s.robots[r]?.acquired ?? null,
      format: (v) => num(v),
    },
  ];
}

export function outcomeById(id: string, piece = "piece"): OutcomeDef {
  return outcomeDefs(piece).find((o) => o.id === id) ?? outcomeDefs(piece)[0]!;
}

const signed = (v: number, f: (n: number) => string) => `${v >= 0 ? "+" : "−"}${f(Math.abs(v))}`;

/**
 * One plain-English sentence for a parameter's effect, e.g.
 * "Raising Exit speed from 4 to 29 m/s changed Blue 1's points by +6 (95% range −8 to +20): no clear effect."
 * `subject` may be omitted for whole-match outcomes.
 */
export function effectHeadline(
  e: ParameterEffect,
  opts: { paramLabel: string; unit?: string; outcome: OutcomeDef; subject?: string; meanOutcome?: number },
): string {
  const { paramLabel, unit, outcome, subject, meanOutcome } = opts;
  const nice = (v: number) => num(v, 2);
  const u = unit ? ` ${unit}` : "";
  const who = subject ? `${subject}'s ` : "";
  const label = subject ? outcome.label.replace(/^Robot's /, "") : outcome.label;
  const noun = label.charAt(0).toLowerCase() + label.slice(1);
  const change = outcome.unit === "%" ? `${signed(e.change * 100, (n) => n.toFixed(1))} percentage points` : signed(e.change, outcome.format);
  const range = outcome.unit === "%" ? `${signed(e.lo * 100, (n) => n.toFixed(1))} to ${signed(e.hi * 100, (n) => n.toFixed(1))}` : `${signed(e.lo, outcome.format)} to ${signed(e.hi, outcome.format)}`;
  const small = meanOutcome !== undefined && Math.abs(meanOutcome) > 0 && Math.abs(e.change) < 0.03 * Math.abs(meanOutcome);
  const verdict = !e.clear
    ? "no clear effect (the matches are too noisy to tell this apart from chance)"
    : small
      ? `a clear but very small ${e.change > 0 ? "increase" : "decrease"}`
      : `a clear ${e.change > 0 ? "increase" : "decrease"}`;
  return `Raising ${paramLabel} from ${nice(e.from)} to ${nice(e.to)}${u} changed ${who}${noun} by ${change} (95% range ${range}): ${verdict}.`;
}
