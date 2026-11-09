import "./lab.css";
import { batchScreen } from "./batch.js";
import { calibrationScreen } from "./calibration.js";
import { dashboardScreen } from "./dashboard.js";
import { pathplanScreen } from "./pathplan.js";

export { batchScreen, calibrationScreen, dashboardScreen, pathplanScreen };
export { labState } from "./util.js";

export type LabScreen = (root: HTMLElement) => void | (() => void);

/** Routes for the lab screens; wire these into the app router. */
export const labRoutes: { path: string; label: string; render: LabScreen }[] = [
  { path: "/lab/batch", label: "Batch", render: batchScreen },
  { path: "/lab/dashboard", label: "Dashboard", render: dashboardScreen },
  { path: "/lab/calibration", label: "Calibration", render: calibrationScreen },
  { path: "/lab/paths", label: "PathPlanner", render: pathplanScreen },
];
