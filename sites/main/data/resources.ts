// Team resources: the cards on /resources. Entries with `inMenu: true` are also listed in the
// Resources dropdown, which links straight to them.

export interface Resource {
  /** Small label above the title */
  kind: string;
  title: string;
  href: string;
  blurb: string;
  external?: boolean;
  /** Short label for the Resources dropdown; leave out to keep it off the menu */
  menuLabel?: string;
}

export const RESOURCES: Resource[] = [
  {
    kind: "CAD",
    title: "CAD on Onshape",
    href: "https://cad.onshape.com/documents/cfcf30c88841d74e4322e2ee/w/0293e4f8d98a6db63dfa9e5e/e/e391d6c1d5b644ac4d583e63",
    blurb: "Our robot CAD, open to view in your browser.",
    external: true,
    menuLabel: "CAD on Onshape",
  },
  {
    kind: "CODE",
    title: "GitHub",
    href: "https://github.com/Team-6220",
    blurb: "Robot code, plus our 2026 robot wiki.",
    external: true,
    menuLabel: "GitHub",
  },
  {
    kind: "RESULTS",
    title: "The Blue Alliance",
    href: "https://www.thebluealliance.com/team/6220",
    blurb: "Every event, match, and award since our 2016 rookie season.",
    external: true,
    menuLabel: "The Blue Alliance",
  },
  {
    kind: "HISTORY",
    title: "Team history",
    href: "/about/history",
    blurb: "Every era since 2016, from Regional Winner to rebuild.",
  },
];
