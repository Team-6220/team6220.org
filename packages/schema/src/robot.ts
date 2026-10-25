import { Type, type Static } from "@sinclair/typebox";
import { Num } from "./common.js";

export const ROBOT_SCHEMA_VERSION = 1;

const RectFrame = Type.Object({
  type: Type.Literal("rect"),
  length: Num("frame length along the robot's +x (forward) axis, meters, bumpers excluded", { exclusiveMinimum: 0 }),
  width: Num("frame width along the robot's +y (left) axis, meters, bumpers excluded", { exclusiveMinimum: 0 }),
});

const PolygonFrame = Type.Object({
  type: Type.Literal("polygon"),
  points: Type.Array(Type.Object({ x: Type.Number(), y: Type.Number() }), {
    minItems: 3,
    description: "Convex frame outline in the chassis frame (meters, origin at robot center).",
  }),
});

export const Drivetrain = Type.Object(
  {
    type: Type.Union([Type.Literal("swerve"), Type.Literal("tank"), Type.Literal("mecanum")], {
      description: "swerve and mecanum are holonomic; tank cannot strafe.",
    }),
    maxSpeed: Num("top translational speed, m/s", { exclusiveMinimum: 0 }),
    maxAccel: Num("translational acceleration limit, m/s^2", { exclusiveMinimum: 0 }),
    maxAngularSpeed: Num("top rotational speed, rad/s", { exclusiveMinimum: 0 }),
    maxAngularAccel: Type.Optional(Num("rotational acceleration limit, rad/s^2 (default 4 x maxAngularSpeed)")),
    traction: Num("wheel friction coefficient; caps pushing force at traction x weight", { exclusiveMinimum: 0 }),
    strafeFactor: Type.Optional(Num("mecanum only: sideways speed as a fraction of maxSpeed (default 0.8)")),
  },
  { description: "Drivetrain model. Motor and gearbox limits are expressed as speed and acceleration caps." },
);
export type Drivetrain = Static<typeof Drivetrain>;

export const MechanismParamValue = Type.Union([Type.Number(), Type.Boolean(), Type.String()]);

export const Mechanism = Type.Object(
  {
    id: Type.String({ minLength: 1, description: "Unique within the robot, e.g. 'intake1'." }),
    type: Type.String({
      minLength: 1,
      description:
        "Core type (intake, storage, transfer, shooter, placer, climber, blocker) or a custom type id from the game module's mechanisms.json.",
    }),
    mount: Type.Object(
      {
        x: Num("meters forward of robot center"),
        y: Num("meters left of robot center"),
        theta: Num("radians; the direction the mechanism faces relative to robot forward"),
      },
      { description: "Where the mechanism sits on the chassis, in the chassis frame." },
    ),
    params: Type.Record(Type.String(), MechanismParamValue, {
      description: "Type-specific parameters. Missing values use the type's defaults.",
    }),
    stateMachine: Type.Optional(Type.String({ description: "Preset state machine id, e.g. 'intake.default'." })),
  },
  { description: "A mechanism mounted on the chassis." },
);
export type Mechanism = Static<typeof Mechanism>;

export const RobotDesign = Type.Object(
  {
    schemaVersion: Type.Literal(ROBOT_SCHEMA_VERSION),
    name: Type.String({ minLength: 1 }),
    description: Type.Optional(Type.String()),
    chassis: Type.Object({
      frame: Type.Union([RectFrame, PolygonFrame]),
      height: Num("driving height in meters (used for height-gated passages)", { exclusiveMinimum: 0 }),
      bumpers: Type.Object({
        thickness: Num("bumper thickness beyond the frame, meters", { minimum: 0 }),
        mass: Num("bumper mass, kg", { minimum: 0 }),
      }),
      mass: Num("robot mass without bumpers, kg", { exclusiveMinimum: 0 }),
      momentOfInertia: Type.Union([Type.Literal("auto"), Num("kg m^2")], {
        description: "'auto' computes it from the footprint assuming uniform density.",
      }),
      drivetrain: Drivetrain,
    }),
    mechanisms: Type.Array(Mechanism),
    preload: Type.Optional(Num("game pieces held at match start (capped by the game's preload limit)", { minimum: 0 })),
  },
  { description: "A 2D robot design. Geometry drives behavior; nothing here is checked against robot rules." },
);
export type RobotDesign = Static<typeof RobotDesign>;
