import { describe, expect, it, vi } from "vitest";
import { AREAS, jsonSchemaOf, parseContent } from "@team6220/content";
// @ts-expect-error plain JS integration, no types
import siteApi from "../../../integrations/site-api.mjs";
import { defaultFor, move, setAt, variantTag, variants, type Schema } from "../src/schema";

const schema = jsonSchemaOf("summer-camp") as Schema;

describe("form helpers", () => {
  it("builds valid-shaped defaults for every kind of block", () => {
    const blocks = variants(schema.properties!.blocks!.items)!;
    expect(blocks.map(variantTag)).toEqual(["heading", "paragraph", "list", "buttons"]);
    expect(defaultFor(blocks[0]!)).toEqual({ type: "heading", text: "" });
    expect(defaultFor(blocks[2]!)).toEqual({ type: "list", ordered: false, items: [""] });
    expect(defaultFor(blocks[3]!)).toEqual({ type: "buttons", buttons: [{ label: "", href: "" }] });
  });

  it("a new empty block is refused by the schema until it is filled in", () => {
    const draft = structuredClone(AREAS["summer-camp"].initial) as { blocks: unknown[] };
    const next = setAt(draft, ["blocks", draft.blocks.length], defaultFor(variants(schema.properties!.blocks!.items)![1]!));
    expect(parseContent("summer-camp", next).ok).toBe(false);
    expect(parseContent("summer-camp", setAt(next, ["blocks", draft.blocks.length, "text"], "Hello")).ok).toBe(true);
  });

  it("setAt changes one value and leaves the original alone", () => {
    const a = { title: "x", blocks: [{ type: "heading", text: "a" }] };
    const b = setAt(a, ["blocks", 0, "text"], "b");
    expect(b.blocks[0]!.text).toBe("b");
    expect(a.blocks[0]!.text).toBe("a");
  });

  it("move reorders and ignores moves off the ends", () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(move([1, 2, 3], 2, 3)).toEqual([1, 2, 3]);
  });
});

describe("site-api integration", () => {
  const run = (output: string) => {
    const injectRoute = vi.fn();
    const info = vi.fn();
    siteApi().hooks["astro:config:setup"]({ config: { output }, injectRoute, logger: { info } });
    return injectRoute;
  };
  it("adds /api/site only when the site runs as a server", () => {
    expect(run("static")).not.toHaveBeenCalled();
    expect(run("server")).toHaveBeenCalledWith({ pattern: "/api/site", entrypoint: "./src/server/site-route.ts", prerender: false });
  });
});
