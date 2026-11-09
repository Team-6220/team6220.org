import { afterEach, describe, expect, it } from "vitest";
import { connectInventory, getInventorySession, inventoryBackend, setInventorySessionProvider } from "../src/inventory/index.ts";

afterEach(() => setInventorySessionProvider(null));

describe("inventory session and backend", () => {
  it("uses the mock backend in tests and dev", () => {
    expect(inventoryBackend()).toBe("mock");
  });

  it("the demo session is an approved team member (no separate manager role)", async () => {
    const s = await getInventorySession("mock");
    expect(s).toMatchObject({ loggedIn: true, approved: true, badges: ["Team Member"] });
  });

  it("a registered provider wins", async () => {
    setInventorySessionProvider(async () => ({ loggedIn: false, approved: false, badges: [] }));
    expect((await getInventorySession("wix")).loggedIn).toBe(false);
  });

  it("refuses to connect to Wix without an approved member", async () => {
    await expect(connectInventory({ loggedIn: false, approved: false, badges: [] }, "wix")).rejects.toThrow(/approved/);
    await expect(connectInventory({ loggedIn: true, approved: false, badges: [] }, "wix")).rejects.toThrow(/approved/);
  });

  it("refuses a session without a Wix client", async () => {
    await expect(connectInventory({ loggedIn: true, approved: true, badges: ["Team Member"] }, "wix")).rejects.toThrow(/Wix client/);
  });
});
