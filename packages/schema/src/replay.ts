import { Type, type Static } from "@sinclair/typebox";
import { Alliance } from "./common.js";
import { RobotDesign } from "./robot.js";

export const REPLAY_SCHEMA_VERSION = 1;

export const MatchRobot = Type.Object({
  design: RobotDesign,
  alliance: Alliance,
  station: Type.Integer({ minimum: 0, description: "0-based driver station / start position index." }),
});
export type MatchRobot = Static<typeof MatchRobot>;

export const Replay = Type.Object(
  {
    schemaVersion: Type.Literal(REPLAY_SCHEMA_VERSION),
    engineVersion: Type.String(),
    module: Type.Object({ id: Type.String(), version: Type.String() }),
    seed: Type.Integer(),
    hz: Type.Integer({ minimum: 1 }),
    profile: Type.String({ description: "Threshold profile used." }),
    robots: Type.Array(MatchRobot),
    actionNames: Type.Array(Type.String(), { description: "Bit i of an input's action mask is actionNames[i]." }),
    inputs: Type.Array(
      Type.Tuple([Type.Integer(), Type.Integer(), Type.Integer(), Type.Integer(), Type.Integer(), Type.Integer()]),
      {
        description:
          "Input changes only: [tick, robotIndex, vx, vy, omega, actionMask]. vx/vy/omega are quantized to -127..127. An input holds until the next change for that robot.",
      },
    ),
    durationTicks: Type.Integer({ minimum: 0 }),
    recordedAt: Type.Optional(Type.String()),
  },
  { description: "A match replay: seed + versions + input log. Re-simulates deterministically." },
);
export type Replay = Static<typeof Replay>;
