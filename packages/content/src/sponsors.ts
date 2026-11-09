import { z } from "zod";
import { escapeAttr, escapeText, isExternalHref, isSafeHref } from "./inline.ts";
import { imageField, imgSrc } from "./image.ts";

export const TIERS = ["", "Lion", "Eagle", "Griffin"] as const;

export const sponsor = z.object({
  name: z.string().trim().min(1, "Can't be empty").max(120).meta({ title: "Name", description: "Also the logo's alt text." }),
  logo: imageField("Logo (color)", {
    optional: true,
    description: "png, jpg, webp, gif or avif up to 2 MB. Leave empty to show the name as text.",
  }),
  logoKey: z
    .string()
    .trim()
    .max(40)
    .regex(/^[a-z0-9-]*$/, "Only lowercase letters, digits and -")
    .meta({
      title: "Logo size key",
      description: "Developers: a key such as rtx gives the logo the CSS class lg-rtx (size tweaks in site.css). Leave empty for the default size.",
    }),
  tier: z.enum(TIERS).meta({ title: "Tier", description: "Kept for the sponsor list; not shown on the pages yet." }),
  link: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => v === "" || isSafeHref(v), "Use a full https:// link or a path starting with /")
    .meta({ title: "Link", description: "Optional. When set, the logo on the Sponsors page links there." }),
  season: z.string().trim().max(20).meta({ title: "Season", description: "For example 2025–26. Kept for the sponsor list; not shown on the pages yet." }),
});
export type Sponsor = z.infer<typeof sponsor>;

/** sites/main/content/sponsors.json. The order of the list is the order on the pages. */
export const sponsors = z.object({
  sponsors: z.array(sponsor).max(100).meta({ title: "Sponsors (top to bottom = left to right on the pages)" }),
});
export type Sponsors = z.infer<typeof sponsors>;

const logoClass = (s: Sponsor) => (s.logoKey ? `lg lg-${s.logoKey}` : "lg");

function linked(href: string, inner: string): string {
  const target = isExternalHref(href) ? ` target="_blank" rel="noopener"` : "";
  return `<a href="${escapeAttr(href)}"${target}>${inner}</a>`;
}

/**
 * The logos on the Sponsors page (inside `<ul class="wall">`). Entry i gets the reveal delay --d:min(i,5).
 * A sponsor with a link wraps its logo in a link; a sponsor without a logo shows its name as text.
 */
export function renderSponsorWall(list: Sponsor[]): string {
  return list
    .map((s, i) => {
      const style = ` style="--d:${Math.min(i, 5)}"`;
      if (!s.logo) return `<li class="rv lg-text"${style}>${s.link ? linked(s.link, escapeText(s.name)) : escapeText(s.name)}</li>`;
      const img = `<img class="${logoClass(s)}" src="${imgSrc(s.logo)}" alt="${escapeAttr(s.name)}">`;
      return `<li class="rv"${style}>${s.link ? linked(s.link, img) : img}</li>`;
    })
    .join("");
}

/**
 * The scrolling strip on the home page: the list twice. The second copy is hidden from screen readers
 * (empty alt, the name moves to data-a). Logos here are not links, so the hidden copy has nothing to tab to.
 */
export function renderSponsorMarquee(list: Sponsor[]): string {
  const one = (hidden: boolean) =>
    list
      .map((s) => {
        if (!s.logo) return `<li class="lg-text">${escapeText(s.name)}</li>`;
        const alt = hidden ? `alt="" data-a="${escapeAttr(s.name)}"` : `alt="${escapeAttr(s.name)}"`;
        return `<li><img class="${logoClass(s)}" src="${imgSrc(s.logo)}" ${alt}></li>`;
      })
      .join("");
  return `<ul>${one(false)}</ul><ul aria-hidden="true">${one(true)}</ul>`;
}

/** Every image a sponsors file points to (CI checks that each exists in sites/main/media/). */
export function sponsorImages(value: Sponsors): string[] {
  return value.sponsors.map((s) => s.logo).filter(Boolean);
}
