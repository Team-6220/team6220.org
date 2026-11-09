// Team resources: the cards on /resources, from sites/main/content/resources.json (edited in the Site Manager,
// /apps/site). Entries with a menu label are also listed in the Resources dropdown, which links straight to them.
// The apps on the same page and in the same menu are NOT in the file: data/apps.ts picks them from
// apps/dashboard/src/apps.ts, so a new app appears without anyone editing resources.
import { isExternalHref, resources } from "@team6220/content";
import json from "../content/resources.json";

export interface Resource {
  /** Small label above the title */
  kind: string;
  title: string;
  href: string;
  blurb: string;
  /** Absolute links open in a new tab */
  external?: boolean;
  /** Short label for the Resources dropdown; left out to keep it off the menu */
  menuLabel?: string;
}

const data = resources.parse(json);

export const RESOURCES: Resource[] = data.links.map((l) => ({
  kind: l.kind,
  title: l.title,
  href: l.href,
  blurb: l.blurb,
  ...(isExternalHref(l.href) ? { external: true } : {}),
  ...(l.menuLabel ? { menuLabel: l.menuLabel } : {}),
}));

/** Archive of technical and team binders (empty until the team adds some). */
export const ARCHIVE = data.archive;
