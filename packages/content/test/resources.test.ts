import { describe, expect, it } from "vitest";
import { AREAS, describeChange, diffContent, jsonSchemaOf, parseContent, renderResourceCards, type Resources } from "../src/index";

const file = () => structuredClone(AREAS.resources.initial) as Resources;
const link = (over: Record<string, string> = {}) => ({ kind: "CODE", title: "GitHub", href: "https://github.com/Team-6220", blurb: "Robot code.", menuLabel: "", ...over });

describe("resources schema", () => {
  it("accepts the current content: 7 links, empty archive", () => {
    expect(parseContent("resources", file()).ok).toBe(true);
    expect(file().links).toHaveLength(7);
    expect(file().archive).toEqual([]);
  });

  it("refuses missing text and unsafe links in either list", () => {
    for (const bad of [{ title: "" }, { blurb: " " }, { kind: "" }, { href: "javascript:alert(1)" }, { href: "//evil.example" }, { href: "" }]) {
      expect(parseContent("resources", { links: [link(bad)], archive: [] }).ok, JSON.stringify(bad)).toBe(false);
      expect(parseContent("resources", { links: [], archive: [{ kind: "BINDER", title: "t", href: "https://x.example", blurb: "b", ...bad }] }).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("allows an empty menu label (kept out of the menu) and both lists empty", () => {
    expect(parseContent("resources", { links: [link()], archive: [] }).ok).toBe(true);
    expect(parseContent("resources", { links: [], archive: [] }).ok).toBe(true);
  });

  it("describes itself for the form", () => {
    const s = jsonSchemaOf("resources") as any;
    expect(Object.keys(s.properties)).toEqual(["links", "archive"]);
    expect(Object.keys(s.properties.links.items.properties)).toEqual(["kind", "title", "href", "blurb", "menuLabel"]);
    expect(Object.keys(s.properties.archive.items.properties)).toEqual(["kind", "title", "href", "blurb"]);
  });
});

describe("resource cards", () => {
  it("renders an external card exactly like the old template", () => {
    const html = renderResourceCards(file().links.filter((l) => l.kind === "CAD" || l.kind === "CODE"));
    expect(html.startsWith(`<a class="rv" style="--d:0" href="https://cad.onshape.com/documents/`)).toBe(true);
    expect(html).toContain(`target="_blank" rel="noopener"><span class="k">CODE</span><h3>GitHub ↗</h3><p>Robot code, plus our 2026 robot wiki.</p></a>`);
  });

  it("renders a site path without a new tab or arrow, and escapes text", () => {
    expect(renderResourceCards([{ kind: "HISTORY", title: "Team history", href: "/about/history", blurb: "A & B <i>" }])).toBe(
      `<a class="rv" style="--d:0" href="/about/history"><span class="k">HISTORY</span><h3>Team history</h3><p>A &amp; B &lt;i&gt;</p></a>`,
    );
  });

  it("numbers the reveal delay by position (so reordering changes it)", () => {
    expect([...renderResourceCards(file().links).matchAll(/--d:(\d)/g)].map((m) => m[1])).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
  });
});

describe("resources diff", () => {
  it("reports an edit, a new archive item and a reorder", () => {
    const before = file();
    const after = structuredClone(before);
    after.links[1]!.blurb = "New text";
    after.archive.push({ kind: "BINDER", title: "2026 binder", href: "https://x.example/b", blurb: "Technical binder" });
    [after.links[0], after.links[6]] = [after.links[6]!, after.links[0]!];
    const lines = diffContent(before, after).map(describeChange);
    expect(lines).toContain(`archive[0].title: added "2026 binder"`);
    expect(lines).toContain(`links[0].title: "Master link" -> "Team history"`);
    expect(lines.some((l) => l.startsWith("links[1].blurb"))).toBe(true);
  });
});
