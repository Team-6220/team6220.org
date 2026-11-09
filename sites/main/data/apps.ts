// The team apps listed on the Resources page and in the Resources menu.
// To add an app, add one entry here. The apps themselves live in apps/<name> and src/pages/apps/.

export interface TeamApp {
  name: string;
  href: string;
  /** One short line shown on the Resources page. */
  blurb: string;
}

/** The apps dashboard (also where "Log In" goes). */
export const APPS_DASHBOARD = { name: "Apps", href: "/apps" };

export const APPS: TeamApp[] = [
  { name: "Attendance", href: "/apps/attendance", blurb: "Check in and out at meetings." },
  { name: "Inventory", href: "/apps/inventory", blurb: "Parts, tools and stock audits." },
  { name: "GoldSim", href: "/apps/goldsim", blurb: "Open-source 2D FRC strategy and robot-design simulator." },
  { name: "WingIt", href: "/apps/wingit", blurb: "Build-season roguelite that teaches our design principles." },
];
