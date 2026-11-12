import { describe, expect, it } from "vitest";
import { AREAS, describeChange, diffContent, jsonSchemaOf, merchCount, parseContent, renderMerchItems, type Merch } from "../src/index";

const file = () => structuredClone(AREAS.merch.initial) as Merch;
const item = (over: Record<string, string> = {}) => ({ image: "abc.webp", kind: "Gift", name: "Card", detail: "Any item", price: "$10", href: "https://shop.example/x", ...over });

describe("merch schema", () => {
  it("accepts the current content (11 items)", () => {
    expect(parseContent("merch", file()).ok).toBe(true);
    expect(file().items).toHaveLength(11);
  });

  it("refuses missing fields, a bad photo and unsafe links", () => {
    for (const bad of [{ name: "" }, { price: " " }, { image: "" }, { image: "x.svg" }, { image: "../x.png" }, { href: "javascript:alert(1)" }, { href: "" }]) {
      expect(parseContent("merch", { items: [item(bad)] }).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("marks the photo as an image upload in the form schema", () => {
    const s = jsonSchemaOf("merch") as any;
    expect(Object.keys(s.properties.items.items.properties)).toEqual(["image", "kind", "name", "detail", "price", "href"]);
    expect(s.properties.items.items.properties.image.ui).toBe("image");
  });
});

describe("merch rendering", () => {
  it("renders the first two cards exactly like the old hand-written page", () => {
    const html = renderMerchItems(file().items);
    expect(html.startsWith(
      `<li class="photo-card rv" style="--d:0"><a class="pc-in item" href="https://dogaingear.com/products/los-alamitos-high-school-gildan-ultra-cotton-t-shirt-g2000-los-al-robotics" target="_blank" rel="noopener"><span class="pic"><img src="/assets/main/b96b316ce1.webp" alt="" loading="lazy"></span><span class="k">Apparel</span><h3>Team T-shirt</h3><span class="brand">Gildan Ultra Cotton tee</span><span class="row"><b class="price">From $35</b><span class="go">Shop <span aria-hidden="true">↗</span></span></span></a></li><li class="photo-card tl-l rv" style="--d:1">`,
    )).toBe(true);
  });

  it("alternates the tilt and cycles the reveal delay by position", () => {
    const html = renderMerchItems(Array.from({ length: 6 }, () => item()));
    expect([...html.matchAll(/<li class="photo-card( tl-l)? rv" style="--d:(\d)"/g)].map((m) => `${m[1] ? "L" : "-"}${m[2]}`)).toEqual(["-0", "L1", "-2", "L3", "-0", "L1"]);
  });

  it("escapes text, and only absolute links open a new tab", () => {
    const html = renderMerchItems([item({ name: "A & <B>", href: "/merch" })]);
    expect(html).toContain("<h3>A &amp; &lt;B&gt;</h3>");
    expect(html).toContain(`href="/merch">`);
    expect(html).not.toContain("target=");
  });

  it("counts items", () => {
    expect(merchCount(11)).toBe("11 items");
    expect(merchCount(1)).toBe("1 item");
    expect(merchCount(0)).toBe("0 items");
  });
});

describe("merch diff", () => {
  it("reports a price change and a removed item", () => {
    const before = file();
    const after = structuredClone(before);
    after.items[0]!.price = "From $36";
    after.items.pop();
    const lines = diffContent(before, after).map(describeChange);
    expect(lines).toContain(`items[0].price: "From $35" -> "From $36"`);
    expect(lines.some((l) => l.startsWith("items[10].name: removed"))).toBe(true);
  });
});
