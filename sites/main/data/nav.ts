// Main menu. Structure from the team's site review (GitHub issue #69).
// Clicking a tab opens its page; tabs with `children` also show a dropdown (hover, keyboard focus, or the + button).
// An item inside a dropdown can have `children` too (a second dropdown, like Apps under Resources).
import { LOGIN_URL, SUMMER_CAMP_ENABLED } from "../config/site";
import { APPS, APPS_DASHBOARD } from "./apps";
import { RESOURCES } from "./resources";

export interface NavLink {
  label: string;
  href: string;
  /** Opens another site in a new tab */
  external?: boolean;
}

/** A dropdown item that opens a second dropdown of its own */
export interface NavGroup extends NavLink {
  children: NavLink[];
}

export interface NavTab extends NavLink {
  /** Matches the `page` prop of MainLayout to highlight the current tab */
  id: string;
  children?: (NavLink | NavGroup)[];
}

const tabs: (NavTab | false)[] = [
  { id: "home", label: "Home", href: "/" },
  SUMMER_CAMP_ENABLED && { id: "summer-camp", label: "Summer Camp", href: "/summer-camp" },
  {
    id: "about",
    label: "About",
    href: "/about",
    children: [
      { label: "History", href: "/about/history" },
      { label: "Outreach", href: "/about/outreach" },
      { label: "Join", href: "/about/join" },
      { label: "Contact", href: "#contact" },
    ],
  },
  { id: "robots", label: "Robots", href: "/robots" },
  { id: "sponsors", label: "Sponsors", href: "/sponsors" },
  { id: "merch", label: "Merch", href: "/merch" },
  {
    id: "resources",
    label: "Resources",
    href: "/resources",
    children: [
      { label: "Media", href: "/resources/media" },
      // "Apps" goes to the dashboard and opens a second dropdown with every app.
      { label: APPS_DASHBOARD.name, href: APPS_DASHBOARD.href, children: APPS.map((a) => ({ label: a.name, href: a.href })) },
      ...RESOURCES.filter((r) => r.menuLabel).map((r) => ({ label: r.menuLabel!, href: r.href, external: r.external })),
    ],
  },
];

export const NAV: NavTab[] = tabs.filter((t): t is NavTab => Boolean(t));

export const LOGIN: NavLink = { label: "Log In", href: LOGIN_URL };
