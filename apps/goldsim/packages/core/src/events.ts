import type { Alliance } from "@goldsim/schema";

export type Period = "auto" | "teleop";

interface Base {
  tick: number;
  t: number;
  phase: string;
  period: Period;
}

export type MatchEvent = Base &
  (
    | { type: "phase_start" }
    | { type: "phase_end" }
    | { type: "piece_acquired"; robot: number; alliance: Alliance; piece: string; source: "field" }
    | { type: "shot_launched"; robot: number; alliance: Alliance; x: number; y: number; heading: number; target: string | null; hit: boolean }
    | {
        type: "piece_scored";
        robot: number | null;
        alliance: Alliance;
        target: string;
        targetBase: string;
        active: boolean;
        piece: string;
      }
    | { type: "piece_landed"; robot: number; alliance: Alliance; x: number; y: number; outOfField: boolean }
    | { type: "piece_emitted"; source: string; x: number; y: number }
    | { type: "climb_started"; robot: number; alliance: Alliance; structure: string; targetLevel: number }
    | { type: "climb_level"; robot: number; alliance: Alliance; level: number }
    | { type: "climb_released"; robot: number; alliance: Alliance }
    | { type: "climb_assessed"; robot: number; alliance: Alliance; level: number; structure: string }
    | { type: "foul"; robot: number; alliance: Alliance; rule: string; severity: string }
    | { type: "groups_decided"; groupA: Alliance; reason: string }
    | { type: "match_end" }
  );

export type MatchEventType = MatchEvent["type"];
