// Receiving a BOM line into Inventory, in demo mode (both apps on made-up data in memory).
import { beforeEach, describe, expect, it } from "vitest";
import { bom, ops, stock } from "../src/index";

describe("receiving into Inventory", () => {
  beforeEach(() => {
    ops.resetMock();
    stock.reset();
  });

  /** The demo order's zip ties: ordered, 3 of them, none received yet. */
  async function orderedLine() {
    const [first] = await bom.listBoms();
    const [order] = await bom.listOrders(first._id);
    const detail = (await bom.getOrder(order._id))!;
    return detail.sections.flatMap((s) => s.lines).find((l) => l.orderedAt && l.receivedQty === 0)!;
  }

  it("adds the quantity to an existing Inventory part and remembers the link", async () => {
    const line = await orderedLine();
    const [part] = await stock.list();
    const message = await bom.receiveIntoInventory(line, 2, { kind: "existing", itemId: part.id });
    expect(message).toContain(`${part.name} is now ${part.quantity + 2}`);
    expect((await stock.list()).find((p) => p.id === part.id)!.quantity).toBe(part.quantity + 2);
    expect(await orderedLineById(line._id)).toMatchObject({ receivedQty: 2, inventoryItemId: part.id });
  });

  it("creates a new Inventory part when asked", async () => {
    const line = await orderedLine();
    const before = (await stock.list()).length;
    await bom.receiveIntoInventory(line, 3, { kind: "new" });
    const after = await stock.list();
    expect(after).toHaveLength(before + 1);
    const created = after.find((p) => p.name === line.name)!;
    expect(created.quantity).toBe(3);
    expect(await orderedLineById(line._id)).toMatchObject({ receivedQty: 3, inventoryItemId: created.id });
  });

  it("leaves Inventory alone for things the team doesn't track", async () => {
    const line = await orderedLine();
    const before = JSON.stringify(await stock.list());
    expect(await bom.receiveIntoInventory(line, 1, { kind: "none" })).toContain("Not tracked");
    expect(JSON.stringify(await stock.list())).toBe(before);
  });

  it("does not touch Inventory when the BOM refuses the receive", async () => {
    const line = await orderedLine();
    const [part] = await stock.list();
    await expect(bom.receiveIntoInventory(line, 99, { kind: "existing", itemId: part.id })).rejects.toThrow(/left to receive/);
    expect((await stock.list()).find((p) => p.id === part.id)!.quantity).toBe(part.quantity);
  });

  async function orderedLineById(id: string) {
    const [first] = await bom.listBoms();
    const [order] = await bom.listOrders(first._id);
    return (await bom.getOrder(order._id))!.sections.flatMap((s) => s.lines).find((l) => l._id === id)!;
  }
});
