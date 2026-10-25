/** Xbox controller buttons and axes, named like WPILib's XboxController (PRD §10). Indexes follow the Gamepad API standard mapping. */
export const XboxButton = {
  kA: 0,
  kB: 1,
  kX: 2,
  kY: 3,
  kLeftBumper: 4,
  kRightBumper: 5,
  kLeftTrigger: 6,
  kRightTrigger: 7,
  kBack: 8,
  kStart: 9,
  kLeftStick: 10,
  kRightStick: 11,
  kPovUp: 12,
  kPovDown: 13,
  kPovLeft: 14,
  kPovRight: 15,
} as const;
export type XboxButtonName = keyof typeof XboxButton;

export const XboxAxis = { kLeftX: 0, kLeftY: 1, kRightX: 2, kRightY: 3 } as const;
export type XboxAxisName = keyof typeof XboxAxis;

export type DriveFrame = "screen" | "driverStation";

export interface Bindings {
  translateX: XboxAxisName;
  translateY: XboxAxisName;
  rotate: XboxAxisName;
  deadband: number;
  driveFrame: DriveFrame;
  /** Held actions. */
  actions: { intake: XboxButtonName; shoot: XboxButtonName; deploy: XboxButtonName; place: XboxButtonName };
  /** Press to start a climb, press again to come down. */
  climb: XboxButtonName;
  /** Optional climb target selection (sticky). */
  climbLevel: { 1: XboxButtonName; 2: XboxButtonName; 3: XboxButtonName; max: XboxButtonName };
}

/** Default scheme: left stick translates, right stick rotates, triggers intake/shoot, A climbs. */
export const DEFAULT_BINDINGS: Bindings = {
  translateX: "kLeftX",
  translateY: "kLeftY",
  rotate: "kRightX",
  deadband: 0.1,
  driveFrame: "screen",
  actions: { intake: "kLeftTrigger", shoot: "kRightTrigger", deploy: "kX", place: "kB" },
  climb: "kA",
  climbLevel: { 1: "kPovDown", 2: "kPovRight", 3: "kPovUp", max: "kPovLeft" },
};

export function prettyButton(name: string): string {
  return name.replace(/^k/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
}
