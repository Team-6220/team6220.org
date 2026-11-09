// Main menu. Structure from the team's site review (GitHub issue #69).
// Clicking a tab opens its page; tabs with `children` also show a dropdown (hover, keyboard focus, or the + button).
import { LOGIN_URL, MERCH_STORE_URL, SUMMER_CAMP_ENABLED } from "../config/site";
import { APPS, APPS_DASHBOARD } from "./apps";
import { RESOURCES } from "./resources";

export interface NavLink {
  label: string;
  href: string;
  /** Opens another site in a new tab */
  external?: boolean;
}

export interface NavTab extends NavLink {
  /** Matches the `page` prop of MainLayout to highlight the current tab */
  id: string;
  children?: NavLink[];
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
      { label: "Contact", href: "/about/contact" },
    ],
  },
  { id: "robots", label: "Robots", href: "/robots" },
  { id: "sponsors", label: "Sponsors", href: "/sponsors" },
  { id: "merch", label: "Merch", href: MERCH_STORE_URL, external: true },
  {
    id: "resources",
    label: "Resources",
    href: "/resources",
    children: [
      { label: "Media", href: "/resources/media" },
      { label: APPS_DASHBOARD.name, href: APPS_DASHBOARD.href },
      ...APPS.map((a) => ({ label: a.name, href: a.href })),
      ...RESOURCES.filter((r) => r.menuLabel).map((r) => ({ label: r.menuLabel!, href: r.href, external: r.external })),
    ],
  },
];

export const NAV: NavTab[] = tabs.filter((t): t is NavTab => Boolean(t));

export const LOGIN: NavLink = { label: "Log In", href: LOGIN_URL };
