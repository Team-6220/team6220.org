// Production's Cut planner working on Inventory's demo stock: plan, reserve, confirm the cut.
import { beforeEach, describe, expect, it } from "vitest";
import { cutting, ops, production } from "../src/index";
import { inventoryForOtherApps } from "../src/inventory/connection";

beforeEach(() => {
  ops.resetMock();
  cutting.reset();
});

async function aluminum() {
  const data = await cutting.load();
  const material = data.materials.find((m) => m.name === "6061 Aluminum")!;
  return { data, material };
}

describe("cutting parts from Inventory's stock", () => {
  it("lists the materials and thicknesses there is stock of, and the spots already reserved", async () => {
    const { data, material } = await aluminum();
    expect(material.thicknesses).toEqual([0.125]);
    expect(data.materials.map((m) => m.name)).toContain("Polycarbonate");
    expect(data.reserved.map((r) => r.partName)).toContain("Gusset plate"); // Inventory's own demo job
    expect(data.pieces.find((p) => p.points.length === 5)).toBeTruthy(); // the traced offcut, in inches
  });

  it("plans around reserved spots, reserves new ones, and confirms a cut into Inventory", async () => {
    const { data, material } = await aluminum();
    const choice = { materialTypeId: material.id, thicknessIn: 0.125, method: "handmade" as const };
    const plan = cutting.plan(data, { ...choice, parts: [{ key: "p1", name: "Motor plate", length: 6, width: 5 }] });
    expect(plan.unplaced).toEqual([]);
    const [placed] = plan.placed;
    expect(placed.part).toMatchObject({ w: 6.25, h: 5.25 }); // 1/4" extra for handmade
    // It must not sit on the reserved gusset spot (0,0 4.25 x 3.25) of the same copy.
    const gusset = data.reserved.find((r) => r.partName === "Gusset plate")!;
    if (placed.stock.id === gusset.pieceId && placed.stock.copy === gusset.copy) {
      expect(placed.placement.x >= 4.25 || placed.placement.y >= 3.25).toBe(true);
    }

    const jobs = await cutting.reserve(plan, choice);
    const jobId = jobs.get("p1")!;
    expect((await cutting.load()).reserved.map((r) => r.jobId)).toContain(jobId);

    const before = (await cutting.load()).pieces.filter((p) => p.materialTypeId === material.id);
    const result = await cutting.confirmCut(jobId);
    expect(result.leftovers).toBeGreaterThan(0);
    const inv = await inventoryForOtherApps();
    const { tables } = await inv.loadAll();
    expect(tables.production.find((j) => j.id === jobId)?.status).toBe("cut");
    // The leftovers are flagged for the next audit.
    const flagged = tables.rawMaterials.filter((r) => r.materialTypeId === material.id && r.needsCheck && !r.archivedAt);
    expect(flagged.length).toBeGreaterThan(0);
    const after = (await cutting.load()).pieces.filter((p) => p.materialTypeId === material.id);
    expect(JSON.stringify(after)).not.toEqual(JSON.stringify(before));
    await expect(cutting.confirmCut(jobId)).rejects.toThrow(/isn't reserved any more/);
  });

  it("confirms a Production part's cut through Inventory, and gives the spot back when a part is cancelled", async () => {
    const viewer = await ops.getViewer();
    if (viewer.kind !== "member") throw new Error("expected the demo lead");
    const me = viewer.me;
    const { data, material } = await aluminum();
    const [a, b] = await production.requestParts(
      ["Plate A", "Plate B"].map((partName) => ({
        partName, projectId: "", taskId: "", cadLink: "", fileLinks: "", material: "Aluminum sheet", thickness: '1/8"', length: 3, width: 2,
        quantity: 1, method: "handmade" as const, accuracy: "", priority: "normal" as const, dueDate: "", details: "",
      })),
      me,
    );
    const choice = { materialTypeId: material.id, thicknessIn: 0.125, method: "handmade" as const };
    const plan = cutting.plan(data, { ...choice, parts: [a, b].map((p) => ({ key: p._id, name: p.partName, length: p.length, width: p.width })) });
    const jobs = await cutting.reserve(plan, choice);
    await production.rememberCutJobs([a, b].map((p) => ({ partId: p._id, jobIds: [jobs.get(p._id)!], stock: '6061 Aluminum 1/8"' })), me);

    const fresh = async (id: string) => (await production.listParts()).find((p) => p._id === id)!;
    const claimed = await production.step(a._id, me, (p) => production.claim(p, me));
    expect(claimed.cutJobIds).toEqual([jobs.get(a._id)]);
    expect(await production.confirmCut(await fresh(a._id), me)).toMatch(/cut\. Inventory updated/);
    expect((await fresh(a._id)).status).toBe("cut");

    await production.cancelPart(await fresh(b._id), me);
    expect(await fresh(b._id)).toMatchObject({ status: "cancelled", cutJobIds: [] });
    expect((await cutting.load()).reserved.map((r) => r.jobId)).not.toContain(jobs.get(b._id));
  });
});
