// The team apps listed on the Resources page and in the Resources menu.
// TODO: once PR #83 is merged, import the list from apps/dashboard/src/apps.ts (`@team6220/dashboard/apps`)
// and delete this copy, so there is one list of apps.

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
