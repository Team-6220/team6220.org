import { describe, expect, it } from "vitest";
import { IMAGE_RULES, isImageFile } from "@team6220/content";
import { imageProblem, prepareImage } from "../src/images";

const png = (bytes: number[] = [137, 80, 78, 71], name = "logo.png", type = "image/png") => new File([new Uint8Array(bytes)], name, { type });

describe("image uploader checks", () => {
  it("accepts png, jpg, webp, gif and avif", () => {
    for (const type of IMAGE_RULES.mimeTypes) expect(imageProblem({ type, size: 100 })).toBeNull();
  });
  it("refuses other types, empty files and files over 2 MB", () => {
    expect(imageProblem({ type: "image/svg+xml", size: 100, name: "a.svg" })).toMatch(/isn't a/);
    expect(imageProblem({ type: "application/pdf", size: 100 })).toMatch(/isn't a/);
    expect(imageProblem({ type: "image/png", size: 0 })).toMatch(/empty/);
    expect(imageProblem({ type: "image/png", size: 2_000_001, name: "big.png" })).toMatch(/limit is 2 MB/);
    expect(imageProblem({ type: "image/png", size: 2_000_000 })).toBeNull();
  });
  it("names files after their content and keeps the path valid for the server", async () => {
    const a = await prepareImage(png());
    const b = await prepareImage(png([137, 80, 78, 71], "other-name.png"));
    const c = await prepareImage(png([1, 2, 3], "x.jpg", "image/jpeg"));
    expect(a.path).toBe(b.path);
    expect(a.path).toMatch(/^[0-9a-f]{10}\.png$/);
    expect(c.path).toMatch(/\.jpg$/);
    expect(isImageFile(a.path)).toBe(true);
    expect(a.base64).toBe(btoa(String.fromCharCode(137, 80, 78, 71)));
    expect(a.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
  it("rejects a bad file before reading it", async () => {
    await expect(prepareImage(png([1], "a.svg", "image/svg+xml"))).rejects.toThrow(/isn't a/);
  });
});
