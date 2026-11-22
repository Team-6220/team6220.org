// Keeping the headless app's redirect list tidy as preview links come and go (scripts/wix-allow-preview.mjs).
import { describe, expect, it } from "vitest";
import { callbackFor, MAX_PREVIEWS, MAX_URIS, nextRedirectUris } from "./wix-allow-preview.mjs";

const live = ["https://www.team6220.org/api/auth/callback", "https://team6220.org/api/auth/callback", "http://localhost:4321/api/auth/callback"];
const preview = (n: number) => `https://p${n}-losalteam6220.wixsite.com/api/auth/callback`;

describe("preview redirect list", () => {
  it("turns a preview address into its callback, and refuses anything else", () => {
    expect(callbackFor("https://abc-losalteam6220.wixsite.com")).toBe("https://abc-losalteam6220.wixsite.com/api/auth/callback");
    expect(callbackFor("https://abc.wix-site-host.com/apps/calendar?x=1")).toBe("https://abc.wix-site-host.com/api/auth/callback");
    expect(callbackFor("http://abc.wixsite.com")).toBeNull();
    expect(callbackFor("https://www.team6220.org")).toBeNull();
    expect(callbackFor("not a url")).toBeNull();
  });

  it("adds a preview and keeps the live entries", () => {
    expect(nextRedirectUris(live, preview(1))).toEqual([...live, preview(1)]);
  });

  it("adds it once, even when it is already there", () => {
    expect(nextRedirectUris([...live, preview(1)], preview(1))).toEqual([...live, preview(1)]);
  });

  it("drops the oldest previews, never the live entries, and stays within Wix's limit", () => {
    let list = [...live];
    for (let n = 1; n <= 30; n++) list = nextRedirectUris(list, preview(n));
    expect(list.length).toBeLessThanOrEqual(MAX_URIS);
    expect(list.filter((u) => u.includes("wixsite")).length).toBe(MAX_PREVIEWS);
    expect(list).toEqual(expect.arrayContaining(live));
    expect(list.at(-1)).toBe(preview(30));
    expect(list).not.toContain(preview(1));
  });

  it("makes room when many live entries are kept", () => {
    const many = Array.from({ length: 15 }, (_, i) => `https://site${i}.example.com/api/auth/callback`);
    const next = nextRedirectUris([...many, preview(1), preview(2), preview(3), preview(4), preview(5), preview(6)], preview(7));
    expect(next.length).toBe(MAX_URIS);
    expect(next.slice(0, 15)).toEqual(many);
    expect(next.at(-1)).toBe(preview(7));
  });
});
