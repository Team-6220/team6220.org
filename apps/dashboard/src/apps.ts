// THE list of team apps lives in packages/assets/data/apps.json (this file gives it its types).
// The /apps dashboard draws one card per entry, in this order, and the shared sidebar
// (packages/assets/scripts/app-sidebar.js) reads the same file from /assets/shared/data/apps.json.
// The main site's Resources menu can import it too: import { APPS } from "@team6220/dashboard/apps".
//
// To add an app: copy an entry in apps.json, give it a unique `id`, and set `href` to its route under /apps.
// Use status "planned" (no link, greyed out) until the app is actually live.
// Optional `icon`: a file in apps/<id>/media/, published at /assets/<id>/<file>.

import list from "../../../packages/assets/data/apps.json" with { type: "json" };

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
  /** Name of the icon the sidebar shows, from packages/assets/scripts/icons.js. */
  symbol?: string;
}

export const APPS = list as AppEntry[];
