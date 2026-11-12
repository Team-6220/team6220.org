// Production: the life of a part, and requesting parts in demo mode.
import { beforeEach, describe, expect, it } from "vitest";
import { ops, production } from "../src/index";
import type { Part, PartRequest } from "../src/production/types";

const hedy = { id: "p-hedy", name: "Hedy" };
const ryan = { id: "p-ryan", name: "Ryan" };
const request = (over: Partial<PartRequest> = {}): PartRequest => ({
  partName: "Elevator upright", projectId: "", taskId: "", cadLink: "", fileLinks: "", material: "Aluminum tube", thickness: "",
  length: 38.5, width: 1, quantity: 2, method: "handmade", accuracy: "", priority: "normal", dueDate: "", details: "", ...over,
});
const part = (over: Partial<PartRequest> = {}): Part => ({ ...production.newPart(request(over), 123, hedy), _id: "part-1" });

describe("the life of a part", () => {
  it("starts ready, or pending setup for the Shapeoko", () => {
    expect(part()).toMatchObject({ status: "ready", designerName: "Hedy", print: null });
    expect(part({ method: "shapeoko" }).status).toBe("pending-setup");
    expect(part({ method: "print", print: { filament: "PETG" } }).print).toMatchObject({ filament: "PETG", printer: "" });
    expect(production.partLabel(part())).toBe("PR-0123");
    expect(() => production.newPart(request({ partName: " " }), 1, hedy)).toThrow(/needs a name/);
    expect(() => production.newPart(request({ quantity: 0 }), 1, hedy)).toThrow(/Quantity/);
  });

  it("needs setup notes before a Shapeoko part can be cut, and records who set it up", () => {
    const pending = part({ method: "shapeoko" });
    expect(() => production.claim(pending, ryan)).toThrow(/can't be claimed/);
    expect(() => production.release(pending, ryan, " ")).toThrow(/stock size/);
    expect(production.release(pending, ryan, "Stock 9 x 6")).toMatchObject({ status: "ready", setupBy: "Ryan", setupNotes: "Stock 9 x 6" });
  });

  it("keeps the name of someone who didn't finish, then lets the next person pick it up", () => {
    const claimed = production.claim(part(), ryan);
    expect(claimed.status).toBe("in-progress");
    expect(production.currentWork(claimed)?.name).toBe("Ryan");
    expect(() => production.claim(claimed, hedy)).toThrow(/can't be claimed/);
    expect(() => production.handBack(claimed, "", "")).toThrow(/what is left/);

    const back = production.handBack(claimed, "One of two cut", "Blue bin");
    expect(back).toMatchObject({ status: "handed-back", work: [{ name: "Ryan", result: "unfinished", note: "One of two cut", leftAt: "Blue bin" }] });
    expect(production.currentWork(back)).toBeUndefined();

    const cut = production.markCut(production.claim(back, hedy));
    expect(cut.status).toBe("cut");
    expect(cut.work.map((w) => [w.name, w.result])).toEqual([["Ryan", "unfinished"], ["Hedy", "finished"]]);
    expect(production.markDone(cut).status).toBe("done");
    expect(() => production.cancel(production.markDone(cut))).toThrow(/already closed/);
  });

  it("puts a failed print back in the queue with the reason", () => {
    const printing = production.claim(part({ method: "print" }), ryan);
    expect(() => production.failPrint(printing, "")).toThrow(/what went wrong/);
    const failed = production.failPrint(printing, "Lifted off the bed");
    expect(failed).toMatchObject({ status: "ready", print: { failReason: "Lifted off the bed" } });
    expect(production.markCut(production.claim(failed, ryan)).print?.failReason).toBe("");
    expect(() => production.failPrint(production.claim(part(), ryan), "x")).toThrow(/Only a print/);
  });

  it("refuses steps that skip ahead", () => {
    expect(() => production.markCut(part())).toThrow(/Claim the part/);
    expect(() => production.markDone(part())).toThrow();
    expect(() => production.handBack(part(), "a", "b")).toThrow();
  });

  it("lists the most urgent and soonest due first", () => {
    const parts = [
      { ...part({ priority: "normal", dueDate: "2027-02-01" }), number: 1 },
      { ...part({ priority: "urgent" }), number: 2 },
      { ...part({ priority: "normal", dueDate: "2027-01-15" }), number: 3 },
      { ...part({ priority: "normal" }), number: 4 },
    ];
    expect(parts.sort(production.byUrgency).map((p) => p.number)).toEqual([2, 3, 1, 4]);
  });
});

describe("Production in demo mode", () => {
  beforeEach(() => ops.resetMock());

  it("numbers requested parts in a row and logs each step under the person who did it", async () => {
    const viewer = await ops.getViewer();
    if (viewer.kind !== "member") throw new Error("expected the demo lead");
    const before = await production.listParts();
    const top = Math.max(...before.map((p) => p.number));
    const [a, b] = await production.requestParts([request({ partName: "Plate A" }), request({ partName: "Plate B", method: "shapeoko" })], viewer.me);
    expect([a.number, b.number]).toEqual([top + 1, top + 2]);
    expect(b.status).toBe("pending-setup");

    const claimed = await production.step(a._id, viewer.me, (p) => production.claim(p, viewer.me));
    expect(claimed.status).toBe("in-progress");
    await expect(production.step(a._id, viewer.me, (p) => production.claim(p, viewer.me))).rejects.toThrow(/can't be claimed/);
    expect((await ops.listHistory({ kind: "part", id: a._id })).map((h) => h.action)).toEqual(["in progress", "requested"]);
    await expect(production.step("missing", viewer.me, (p) => p)).rejects.toThrow(/doesn't exist/);
  });

  it("has demo parts in every open stage", async () => {
    const statuses = new Set((await production.listParts()).map((p) => p.status));
    for (const status of ["pending-setup", "ready", "in-progress", "handed-back", "cut"]) expect(statuses).toContain(status);
  });
});
