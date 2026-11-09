import { z } from "zod";
import { escapeAttr, escapeText, isExternalHref, isSafeHref } from "./inline.ts";

const text = (title: string, max: number) => z.string().trim().min(1, "Can't be empty").max(max).meta({ title });

const card = {
  kind: text("Label", 30).meta({ description: "The small label above the title, for example CAD or CODE." }),
  title: text("Title", 120),
  href: z
    .string()
    .trim()
    .min(1, "Can't be empty")
    .max(1000)
    .refine(isSafeHref, "Use a full https:// link or a path starting with /")
    .meta({ title: "Link", description: "A full https:// link opens in a new tab; a path starting with / stays on this site." }),
  blurb: text("Description", 200),
};

export const resourceLink = z.object({
  ...card,
  menuLabel: z
    .string()
    .trim()
    .max(60)
    .meta({ title: "Name in the Resources menu", description: "Leave empty to keep it out of the Resources dropdown." }),
});
export const archiveItem = z.object(card);
export type ResourceLink = z.infer<typeof resourceLink>;
export type ArchiveItem = z.infer<typeof archiveItem>;

/**
 * sites/main/content/resources.json: the cards of /resources. The order of each list is the order on the page.
 * The apps shown below them (and in the menu) are not here: they come from apps/dashboard/src/apps.ts automatically.
 */
export const resources = z.object({
  links: z.array(resourceLink).max(60).meta({ title: "Team resources" }),
  archive: z.array(archiveItem).max(100).meta({ title: "Archive items" }),
});
export type Resources = z.infer<typeof resources>;

/** A card of the /resources grid. An absolute link opens in a new tab and gets the ↗ mark. */
export function renderResourceCards(items: { kind: string; title: string; href: string; blurb: string }[]): string {
  return items
    .map((r, i) => {
      const external = isExternalHref(r.href);
      const target = external ? ` target="_blank" rel="noopener"` : "";
      return `<a class="rv" style="--d:${i}" href="${escapeAttr(r.href)}"${target}><span class="k">${escapeText(r.kind)}</span><h3>${escapeText(r.title)}${external ? " ↗" : ""}</h3><p>${escapeText(r.blurb)}</p></a>`;
    })
    .join("");
}
