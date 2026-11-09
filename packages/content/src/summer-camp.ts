import { z } from "zod";
import { anchor, escapeText, inlineHrefs, isSafeHref, renderInline } from "./inline.ts";

const href = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine(isSafeHref, "Use a full https:// link or a path starting with /")
  .meta({ title: "Link" });

/** Text with **bold** and [label](link) markup. Every link inside must be safe. */
const richText = z
  .string()
  .min(1, "Can't be empty")
  .max(4000)
  .superRefine((text, ctx) => {
    for (const h of inlineHrefs(text)) {
      if (!isSafeHref(h)) ctx.addIssue({ code: "custom", message: `Unsafe link "${h}": use https:// or a path starting with /` });
    }
  })
  .meta({ ui: "textarea", description: "Use **bold** and [label](https://link) for formatting." });

const plainText = (title: string, max: number) => z.string().trim().min(1, "Can't be empty").max(max).meta({ title });

export const heading = z.object({ type: z.literal("heading"), text: plainText("Heading", 200) }).meta({ title: "Heading" });
export const paragraph = z.object({ type: z.literal("paragraph"), text: richText }).meta({ title: "Paragraph" });
export const list = z
  .object({
    type: z.literal("list"),
    ordered: z.boolean().meta({ title: "Numbered list" }),
    items: z.array(richText).min(1).max(50).meta({ title: "Items" }),
  })
  .meta({ title: "List" });
export const buttons = z
  .object({
    type: z.literal("buttons"),
    buttons: z
      .array(z.object({ label: plainText("Button text", 120), href }))
      .min(1)
      .max(10)
      .meta({ title: "Buttons (registration links)" }),
  })
  .meta({ title: "Buttons" });

export const block = z.discriminatedUnion("type", [heading, paragraph, list, buttons]);
export type Block = z.infer<typeof block>;

/** sites/main/content/summer-camp.json */
export const summerCamp = z.object({
  enabled: z.boolean().meta({
    title: "Show summer camp on the site",
    description: "On: the menu item and the home page banner appear. Off: both are hidden (the /summer-camp page still exists).",
  }),
  title: plainText("Title (with the year)", 120),
  blocks: z.array(block).max(100).meta({ title: "Page content" }),
});
export type SummerCamp = z.infer<typeof summerCamp>;

/** The HTML for one block of the summer camp page. Pure string output so the page stays byte-for-byte predictable. */
export function renderBlock(b: Block): string {
  switch (b.type) {
    case "heading":
      return `<h2 class="title-calm">${escapeText(b.text)}</h2>`;
    case "paragraph":
      return `<p>${renderInline(b.text)}</p>`;
    case "list": {
      const tag = b.ordered ? "ol" : "ul";
      return `<${tag}>${b.items.map((i) => `<li>${renderInline(i)}</li>`).join("")}</${tag}>`;
    }
    case "buttons":
      return b.buttons.map((x) => anchor(x.href, escapeText(x.label), "btn btn-black")).join("");
  }
}

export function renderBlocks(blocks: Block[]): string {
  return blocks.map(renderBlock).join("");
}
