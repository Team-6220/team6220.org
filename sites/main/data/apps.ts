// The team apps shown on the Resources page and in the Resources menu.
// There is ONE list of apps: apps/dashboard/src/apps.ts (also used by the /apps dashboard).
// Add or change apps there; this file only picks the live ones for the main site
// (Web Admin apps stay out of the public menu).
import { APPS as ALL_APPS } from "@team6220/dashboard/apps";

export interface TeamApp {
  name: string;
  href: string;
  /** One short line shown on the Resources page. */
  blurb: string;
}

/** The apps dashboard (also where "Log In" goes). */
export const APPS_DASHBOARD = { name: "Apps", href: "/apps" };

export const APPS: TeamApp[] = ALL_APPS.filter((a) => a.status === "live" && a.href && a.access !== "web-admin").map((a) => ({
  name: a.name,
  href: a.href as string,
  blurb: a.description,
}));
