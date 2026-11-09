import { z } from "zod";
import { escapeAttr, escapeText, isExternalHref, isSafeHref } from "./inline.ts";
import { imageField, imgSrc } from "./image.ts";

const text = (title: string, max: number) => z.string().trim().min(1, "Can't be empty").max(max).meta({ title });

export const merchItem = z.object({
  image: imageField("Photo", { description: "png, jpg, webp, gif or avif up to 2 MB. Shown in the card; it has no caption (empty alt text)." }),
  kind: text("Category", 40).meta({ description: "The small label above the name, for example Apparel." }),
  name: text("Name", 120),
  detail: text("Description (one line)", 160),
  price: text("Price (as shown)", 40).meta({ description: "Typed exactly as it should read, for example From $35 or $26." }),
  href: z
    .string()
    .trim()
    .min(1, "Can't be empty")
    .max(1000)
    .refine(isSafeHref, "Use a full https:// link or a path starting with /")
    .meta({ title: "Store link" }),
});
export type MerchItem = z.infer<typeof merchItem>;

/** sites/main/content/merch.json. The order of the list is the order on the /merch page. */
export const merch = z.object({
  items: z.array(merchItem).max(60).meta({ title: "Items (top to bottom = left to right, row by row)" }),
});
export type Merch = z.infer<typeof merch>;

/** "11 items" (the eyebrow above the grid). */
export function merchCount(n: number): string {
  return `${n} ${n === 1 ? "item" : "items"}`;
}

/**
 * The cards of the /merch grid (inside `<ul class="merch">`). Position decides the look: every second card is
 * tilted (`tl-l`) and the reveal delay cycles 0 to 3, as in the old hand-written page.
 */
export function renderMerchItems(items: MerchItem[]): string {
  return items
    .map((m, i) => {
      const tilt = i % 2 === 1 ? " tl-l" : "";
      const target = isExternalHref(m.href) ? ` target="_blank" rel="noopener"` : "";
      return (
        `<li class="photo-card${tilt} rv" style="--d:${i % 4}"><a class="pc-in item" href="${escapeAttr(m.href)}"${target}>` +
        `<span class="pic"><img src="${imgSrc(m.image)}" alt="" loading="lazy"></span>` +
        `<span class="k">${escapeText(m.kind)}</span><h3>${escapeText(m.name)}</h3><span class="brand">${escapeText(m.detail)}</span>` +
        `<span class="row"><b class="price">${escapeText(m.price)}</b><span class="go">Shop <span aria-hidden="true">↗</span></span></span></a></li>`
      );
    })
    .join("");
}

export function merchImages(value: Merch): string[] {
  return value.items.map((m) => m.image);
}
