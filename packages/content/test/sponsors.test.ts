import { describe, expect, it } from "vitest";
import { AREAS, diffContent, describeChange, isImageFile, jsonSchemaOf, parseContent, renderSponsorMarquee, renderSponsorWall, type Sponsors } from "../src/index";

const file = () => structuredClone(AREAS.sponsors.initial) as Sponsors;
const one = (over: Record<string, string>) => ({ name: "Acme", show: "Full-color logo", logo: "abc.png", logoDark: "", logoKey: "", tier: "", link: "", season: "", ...over });

describe("image paths", () => {
  it("accepts plain image file names and sub folders", () => {
    for (const p of ["sponsors/laef.png", "team/4f1c.webp", "a-b_c.1.JPG", "x.avif", "x.gif", "x.jpeg"]) expect(isImageFile(p), p).toBe(true);
  });
  it("refuses anything else", () => {
    for (const p of ["", "../x.png", "a/../x.png", "a//x.png", "/x.png", "x.svg", "x.png.exe", "x", ".png", "a b.png", "x.png?1", "-x.png"]) expect(isImageFile(p), p).toBe(false);
  });
  it("is linear on long hostile input", () => {
    const start = Date.now();
    isImageFile("a" + ".".repeat(250) + "!");
    expect(Date.now() - start).toBeLessThan(50);
  });
});

describe("sponsors schema", () => {
  it("accepts the current content", () => {
    expect(parseContent("sponsors", file()).ok).toBe(true);
    expect(file().sponsors).toHaveLength(9);
  });

  it("accepts SVG only where a field allows it (committed logos), never by default", () => {
    expect(isImageFile("sponsors/rtx.svg")).toBe(false);
    expect(isImageFile("sponsors/rtx.svg", { svg: true })).toBe(true);
    expect(isImageFile("../x.svg", { svg: true })).toBe(false);
    expect(parseContent("sponsors", { sponsors: [one({ logo: "sponsors/rtx.svg" })] }).ok).toBe(true);
  });

  it("allows a text-only sponsor and an empty list", () => {
    expect(parseContent("sponsors", { sponsors: [one({ logo: "" })] }).ok).toBe(true);
    expect(parseContent("sponsors", { sponsors: [] }).ok).toBe(true);
  });

  it("refuses an empty name, a bad logo path, a bad tier and unsafe links", () => {
    for (const bad of [{ name: " " }, { logo: "../x.png" }, { logo: "x.svgz" }, { show: "Sticker" }, { tier: "King" }, { link: "javascript:alert(1)" }, { link: "//evil.example" }, { logoKey: "Has Space" }]) {
      expect(parseContent("sponsors", { sponsors: [one(bad)] }).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("reports where the problem is", () => {
    const r = parseContent("sponsors", { sponsors: [one({}), one({ name: "" })] });
    expect(!r.ok && r.issues.map((i) => i.path)).toContain("sponsors.1.name");
  });

  it("describes itself for the form: image uploader and tier choices", () => {
    const s = jsonSchemaOf("sponsors") as any;
    const item = s.properties.sponsors.items.properties;
    expect(item.logo.ui).toBe("image");
    expect(item.tier.enum).toEqual(["", "Lion", "Eagle", "Griffin"]);
    expect(item.show.enum).toEqual(["One-color logo", "Full-color logo", "Name"]);
  });

  it("lists the images the file uses", () => {
    expect(AREAS.sponsors.images!(file())).toHaveLength(8);
  });
});

describe("sponsor rendering", () => {
  it("renders the wall: one-color logos get lg-mono, full-color logos don't, names are text", () => {
    const html = renderSponsorWall(file().sponsors);
    expect(html.startsWith(`<li class="rv" style="--d:0"><a href="https://www.rtx.com" target="_blank" rel="noopener"><img class="lg lg-mono lg-rtx" src="/assets/main/sponsors/rtx.svg" alt="RTX (Raytheon)"></a></li><li class="rv" style="--d:1"><a href="https://www.boeing.com" target="_blank" rel="noopener"><img class="lg lg-boeing" src="/assets/main/sponsors/boeing.svg" alt="Boeing"></a>`)).toBe(true);
    expect(html.endsWith(`<li class="rv lg-text" style="--d:5">Brent Kinneman</li>`)).toBe(true);
    expect((html.match(/--d:5/g) ?? []).length).toBe(4);
  });

  it("shows a dark-page version next to the normal logo when one is set", () => {
    expect(renderSponsorWall([one({ logoDark: "abc-dark.png" })])).toBe(
      `<li class="rv" style="--d:0"><img class="lg lg-on-light" src="/assets/main/abc.png" alt="Acme"><img class="lg lg-on-dark" src="/assets/main/abc-dark.png" alt="Acme"></li>`,
    );
    expect(renderSponsorMarquee([one({ logoDark: "abc-dark.png" })])).toContain(`<img class="lg lg-on-light" src="/assets/main/abc.png" alt="" data-a="Acme"><img class="lg lg-on-dark" src="/assets/main/abc-dark.png" alt="" data-a="Acme">`);
  });

  it("shows the name when Show as is Name, even if a logo is set", () => {
    expect(renderSponsorWall([one({ show: "Name" })])).toBe(`<li class="rv lg-text" style="--d:0">Acme</li>`);
  });

  it("renders the marquee as two lists; the second is hidden from screen readers", () => {
    const html = renderSponsorMarquee(file().sponsors);
    expect(html.startsWith(`<ul><li><img class="lg lg-mono lg-rtx" src="/assets/main/sponsors/rtx.svg" alt="RTX (Raytheon)"></li>`)).toBe(true);
    expect(html).toContain(`</ul><ul aria-hidden="true"><li><img class="lg lg-mono lg-rtx" src="/assets/main/sponsors/rtx.svg" alt="" data-a="RTX (Raytheon)"></li>`);
    expect(html.endsWith(`<li class="lg-text">Brent Kinneman</li></ul>`)).toBe(true);
  });

  it("links a logo only on the wall, escapes names, and uses the default size without a key", () => {
    const list = [one({ name: `A "&" <b>`, link: "https://acme.example/?a=1&b=2" })];
    const wall = renderSponsorWall(list);
    expect(wall).toBe(`<li class="rv" style="--d:0"><a href="https://acme.example/?a=1&b=2" target="_blank" rel="noopener"><img class="lg" src="/assets/main/abc.png" alt="A &quot;&&quot; &lt;b&gt;"></a></li>`);
    expect(renderSponsorMarquee(list)).not.toContain("<a ");
    expect(renderSponsorWall([one({ logo: "", link: "/sponsors" })])).toBe(`<li class="rv lg-text" style="--d:0"><a href="/sponsors">Acme</a></li>`);
  });
});

describe("sponsors diff", () => {
  it("reports an added sponsor, a swapped logo and a reorder", () => {
    const before = file();
    const after = structuredClone(before);
    after.sponsors.push(one({ name: "New Co", logo: "0123456789.png" }));
    after.sponsors[0]!.logo = "ffffffffff.webp";
    const lines = diffContent(before, after).map(describeChange);
    expect(lines).toContain(`sponsors[0].logo: "sponsors/rtx.svg" -> "ffffffffff.webp"`);
    expect(lines).toContain(`sponsors[9].name: added "New Co"`);
    const swapped = structuredClone(before);
    [swapped.sponsors[0], swapped.sponsors[1]] = [swapped.sponsors[1]!, swapped.sponsors[0]!];
    expect(diffContent(before, swapped).map((c) => c.path)).toContain("sponsors[0].name");
  });
});
