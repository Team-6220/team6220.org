// THE list of team apps lives in packages/assets/data/apps.json (this file gives it its types).
// The /apps dashboard (Home, All apps), the shared frame (packages/assets/scripts/app-sidebar.js: the apps rail and each
// app's menu) and the main site's Resources menu all read it.
//
// To add an app: copy an entry in apps.json, give it a unique `id`, a `category`, an `icon` (a name from
// packages/assets/scripts/icons.js) and its menu (`sections`: groups of items, each opening /apps/<id>/<view>).
// Use status "planned" (greyed out, "Coming soon") until the app is live; set `ready: true` once its menu works.

import list from "../../../packages/assets/data/apps.json" with { type: "json" };

export type AppAccess =
  /** Anyone, signed in or not (e.g. GoldSim). */
  | "public"
  /** Members with the Team Member badge. */
  | "team"
  /** Members with the Web Admin badge. Hidden from everyone else, and left out of the main site's Resources. */
  | "web-admin";

export interface AppMenuItem {
  name: string;
  /** A name from packages/assets/scripts/icons.js. */
  icon: string;
  /** The screen it opens: /apps/<id>/<view> ("" is the app's first page). */
  view: string;
}

export interface AppEntry {
  id: string;
  name: string;
  description: string;
  /** Route on this site. */
  href?: string;
  status: "live" | "planned";
  access: AppAccess;
  /** Also open to guests (Guest badge), view-only. */
  guests?: boolean;
  /** Anyone can open it for a public view (signed out, waiting for approval, guests, alumni): the Calendar. The app
   *  itself decides what that view shows. */
  publicView?: boolean;
  /** Shown as a small note on the card, e.g. who can take admin actions. */
  note?: string;
  /** Operations, Mechanical, Strategy, Fun or Admin (null for Home). */
  category: string | null;
  icon: string;
  filledIcon?: boolean;
  /** Off in everyone's apps list until they turn it on (Account → Visible apps). */
  hiddenByDefault?: boolean;
  /** Its menu is built: the frame shows it, and keybinds can open its screens. */
  ready?: boolean;
  sections: { label: string | null; items: AppMenuItem[] }[];
}

export const APPS = list as AppEntry[];

/** The section titles on All apps (the rail and menus use the short name). */
export const CATEGORY_TITLES: Record<string, string> = { Mechanical: "Mechanical: Design/Manufacturing" };
