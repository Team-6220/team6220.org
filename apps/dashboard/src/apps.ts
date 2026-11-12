// THE list of team apps. The /apps dashboard draws one card per entry, in this order.
// The main site's Resources menu can import it too: import { APPS } from "@team6220/dashboard/apps".
//
// To add an app: copy an entry, give it a unique `id`, and set `href` to its route under /apps.
// Use status "planned" (no link, greyed out) until the app is actually live.
// Optional `icon`: a file in apps/<id>/media/, published at /assets/<id>/<file>.

export type AppAccess =
  /** Anyone, signed in or not (e.g. GoldSim). */
  | "public"
  /** Approved members with the Team Member badge. */
  | "team"
  /** Approved members with the Web Admin badge. The dashboard hides these cards from everyone else, and the
   *  main site's Resources menu and page leave them out. */
  | "web-admin";

export interface AppEntry {
  id: string;
  name: string;
  description: string;
  /** Route on this site (or a full URL). Required unless status is "planned". */
  href?: string;
  status: "live" | "planned";
  access: AppAccess;
  /** Shown as a small note on the card, e.g. who can take admin actions. */
  note?: string;
  icon?: string;
}

export const APPS: AppEntry[] = [
  {
    id: "attendance",
    name: "Attendance",
    description: "Sign in at meetings and check who's here.",
    href: "/apps/attendance",
    status: "live",
    access: "team",
    note: "Attendance Admins open the sign-in kiosk",
  },
  {
    id: "inventory",
    name: "Inventory",
    description: "Parts, tools and stock audits.",
    href: "/apps/inventory",
    status: "live",
    access: "team",
  },
  {
    id: "site",
    name: "Site Manager",
    description: "Change the public website's content with forms. Submitting opens a pull request.",
    href: "/apps/site",
    status: "live",
    access: "web-admin",
    note: "Web Admins only",
  },
  {
    id: "goldsim",
    name: "GoldSim",
    description: "Open-source 2D FRC strategy and robot-design simulator.",
    href: "/apps/goldsim/",
    status: "live",
    access: "public",
  },
  {
    id: "wingit",
    name: "WingIt",
    description: "Build-season roguelite that teaches our design principles.",
    href: "/apps/wingit/",
    status: "live",
    access: "public",
  },
  {
    id: "scouting",
    name: "Scouting",
    description: "Match data from the stands, even with bad Wi-Fi.",
    status: "planned",
    access: "team",
  },
  {
    id: "pit",
    name: "Pit display",
    description: "Match schedule and stats for the pit TV.",
    status: "planned",
    access: "public",
  },
  {
    id: "production",
    name: "Production Tracker",
    description: "Follow each robot part from design to finished.",
    status: "planned",
    access: "team",
  },
];
