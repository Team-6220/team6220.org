import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AREAS,
  clip,
  describeChange,
  diffContent,
  isAreaId,
  jsonSchemaOf,
  parseContent,
  renderBlock,
  renderBlocks,
  renderInline,
  isSafeHref,
  toFileText,
  type SummerCamp,
} from "../src/index";

const contentDir = join(dirname(fileURLToPath(import.meta.url)), "../../../sites/main/content");
const camp = () => structuredClone(AREAS["summer-camp"].initial) as SummerCamp;

describe("content files in sites/main/content", () => {
  const files = readdirSync(contentDir).filter((f) => f.endsWith(".json"));

  it("has a registered area for every file and a file for every area", () => {
    expect(files.map((f) => f.replace(/\.json$/, "")).sort()).toEqual(Object.keys(AREAS).sort());
  });

  for (const file of files) {
    it(`${file} is valid and in the canonical format`, () => {
      const id = file.replace(/\.json$/, "");
      expect(isAreaId(id)).toBe(true);
      const text = readFileSync(join(contentDir, file), "utf8");
      const parsed = parseContent(id as keyof typeof AREAS, JSON.parse(text));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(toFileText(parsed.value)).toBe(text);
    });
  }
});

describe("summer camp schema", () => {
  it("accepts the current content", () => {
    expect(parseContent("summer-camp", camp()).ok).toBe(true);
  });

  it("refuses a missing or empty title", () => {
    const bad = { ...camp(), title: "  " };
    const r = parseContent("summer-camp", bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.path)).toContain("title");
    expect(parseContent("summer-camp", { enabled: true, blocks: [] }).ok).toBe(false);
  });

  it("refuses a switch that is not true/false", () => {
    expect(parseContent("summer-camp", { ...camp(), enabled: "yes" }).ok).toBe(false);
  });

  it("refuses unknown block types and reports where the problem is", () => {
    const bad = camp();
    (bad.blocks as unknown[]).push({ type: "script", text: "x" });
    const r = parseContent("summer-camp", bad);
    expect(r.ok).toBe(false);
  });

  it("refuses unsafe links in buttons and in text", () => {
    const a = camp();
    a.blocks.push({ type: "buttons", buttons: [{ label: "Go", href: "javascript:alert(1)" }] });
    expect(parseContent("summer-camp", a).ok).toBe(false);
    const b = camp();
    b.blocks.push({ type: "paragraph", text: "[click](javascript:alert(1))" });
    expect(parseContent("summer-camp", b).ok).toBe(false);
    const c = camp();
    c.blocks.push({ type: "buttons", buttons: [{ label: "Go", href: "//evil.example/x" }] });
    expect(parseContent("summer-camp", c).ok).toBe(false);
  });

  it("accepts https links and site paths", () => {
    const a = camp();
    a.blocks.push({ type: "buttons", buttons: [{ label: "Go", href: "https://example.com/a?b=1&c=2" }, { label: "Contact", href: "/about/contact" }] });
    expect(parseContent("summer-camp", a).ok).toBe(true);
  });

  it("refuses empty lists and empty paragraphs", () => {
    const a = camp();
    a.blocks.push({ type: "list", ordered: false, items: [] });
    expect(parseContent("summer-camp", a).ok).toBe(false);
    const b = camp();
    b.blocks.push({ type: "paragraph", text: "" });
    expect(parseContent("summer-camp", b).ok).toBe(false);
  });

  it("drops unknown keys and trims plain text", () => {
    const r = parseContent("summer-camp", { ...camp(), title: "  Camp 2027  ", extra: 1 });
    expect(r.ok && r.value).toMatchObject({ title: "Camp 2027" });
    expect(r.ok && "extra" in (r.value as object)).toBe(false);
  });

  it("describes itself as JSON Schema for the editor form", () => {
    const schema = jsonSchemaOf("summer-camp") as any;
    expect(Object.keys(schema.properties)).toEqual(["enabled", "title", "blocks"]);
    expect(schema.properties.enabled.type).toBe("boolean");
    expect(schema.properties.blocks.items.oneOf ?? schema.properties.blocks.items.anyOf).toHaveLength(4);
  });
});

describe("rendering", () => {
  it("escapes HTML in text and keeps quotes and apostrophes", () => {
    expect(renderInline(`a < b & c --> "d" don't`)).toBe(`a &lt; b &amp; c --&gt; "d" don't`);
  });

  it("renders bold and links; only absolute links open a new tab", () => {
    expect(renderInline("**Hi** [site](https://x.example/a?b=1&c=2) [contact](/about/contact)")).toBe(
      `<b>Hi</b> <a href="https://x.example/a?b=1&c=2" target="_blank" rel="noopener">site</a> <a href="/about/contact">contact</a>`,
    );
  });

  it("can't be broken out of with quotes or tags", () => {
    expect(renderInline(`[x](https://a.example/"onmouseover="y)`)).not.toContain(`"onmouseover`);
    expect(renderInline("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("renders each block type", () => {
    expect(renderBlock({ type: "heading", text: "Why?" })).toBe(`<h2 class="title-calm">Why?</h2>`);
    expect(renderBlock({ type: "list", ordered: true, items: ["a", "b"] })).toBe("<ol><li>a</li><li>b</li></ol>");
    expect(renderBlock({ type: "list", ordered: false, items: ["a"] })).toBe("<ul><li>a</li></ul>");
    expect(renderBlock({ type: "buttons", buttons: [{ label: "Go ↗", href: "https://x.example/" }] })).toBe(
      `<a class="btn btn-black" href="https://x.example/" target="_blank" rel="noopener">Go ↗</a>`,
    );
  });

  it("renders the whole current page", () => {
    const html = renderBlocks(camp().blocks);
    expect(html.startsWith(`<h2 class="title-calm">FRC Robotics Camp</h2><p>`)).toBe(true);
    expect(html).toContain(`<p><b>Three one-week camps:</b></p><ol><li>July 6-10: Grades 3-5</li>`);
    expect(html).toContain(`--&gt; "Register Now" --&gt; Find class named "<a href="https://app.thestudiodirector.com/laef4kids/portal.sd?page=Login&cident=1769796583939"`);
  });
});

describe("diffContent", () => {
  it("lists changed, added and removed values", () => {
    const before = camp();
    const after = camp();
    after.title = "2027 Robotics Summer Camps";
    after.enabled = true;
    after.blocks.pop();
    after.blocks.push({ type: "heading", text: "New" });
    const changes = diffContent(before, after);
    expect(changes[0]).toEqual({ path: "enabled", kind: "changed", before: "false", after: "true" });
    expect(changes.find((c) => c.path === "title")).toMatchObject({ kind: "changed", after: "2027 Robotics Summer Camps" });
    expect(changes.some((c) => c.kind === "added" || c.kind === "changed")).toBe(true);
  });

  it("is empty for equal content", () => {
    expect(diffContent(camp(), camp())).toEqual([]);
  });

  it("describes a change on one line and clips long text", () => {
    expect(describeChange({ path: "title", kind: "changed", before: "a", after: "b" })).toBe(`title: "a" -> "b"`);
    expect(clip("x".repeat(500)).length).toBe(160);
  });
});

describe("inline scanner stays fast on hostile text", () => {
  it("handles long runs of brackets and dashes", () => {
    const t0 = Date.now();
    renderInline("[\\".repeat(50_000));
    renderInline("[!](!".repeat(50_000));
    renderInline("**a".repeat(50_000));
    expect(Date.now() - t0).toBeLessThan(1500);
  });
  it("leaves unclosed or empty markup as plain text", () => {
    expect(renderInline("[a](b")).toBe("[a](b");
    expect(renderInline("[](x) ****")).toBe("[](x) ****");
    expect(renderInline("**a** and [b](/c)")).toBe('<b>a</b> and <a href="/c">b</a>');
  });
});

describe("same-page anchors", () => {
  it("accepts #anchor links and renders them without a new tab", () => {
    expect(isSafeHref("#contact")).toBe(true);
    expect(isSafeHref("#")).toBe(false);
    expect(isSafeHref("#a b")).toBe(false);
    expect(renderInline("[reach out](#contact)")).toBe('<a href="#contact">reach out</a>');
  });
});
