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
  | "team";

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
    description: "Check in and out at meetings.",
    href: "/apps/attendance",
    status: "live",
    access: "team",
    note: "Attendance Admins start and stop sessions",
  },
  {
    id: "inventory",
    name: "Inventory",
    description: "Parts, tools and stock audits.",
    href: "/apps/inventory",
    status: "live",
    access: "team",
    note: "Inventory Managers edit",
  },
  {
    id: "goldsim",
    name: "GoldSim",
    description: "2D FRC strategy and robot-design simulator.",
    href: "/apps/goldsim/",
    status: "live",
    access: "public",
  },
  {
    id: "wingit",
    name: "WingIt",
    description: "The team's WingIt app.",
    href: "/apps/wingit/",
    status: "live",
    access: "team",
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
