// The BOM sheet layout: exporting an order and reading a sheet back.
import { describe, expect, it } from "vitest";
import { orderToSheetRows, toCsv } from "../src/bom/export";
import { parseCsv, parseSheetRows } from "../src/bom/import";
import { linesToTsv, parsePastedRows } from "../src/bom/paste";
import { cantSign, lineState, orderName, totalCost } from "../src/bom/rules";
import type { Line, OrderDetail, Section, Stamp } from "../src/bom/types";

const stamp = (name: string): Stamp => ({ memberId: name, name, at: "2027-01-10T00:00:00.000Z" });
const line = (over: Partial<Line>): Line => ({
  _id: "l1", sectionId: "s1", name: "Item", link: "", vendorPartNumber: "", unitCost: 1, quantity: 1, comments: "",
  requestedBy: stamp("Student"), signatures: [], orderedAt: "", receivedQty: 0, receivedAt: "", receivedBy: null, inventoryItemId: "", ...over,
});
const section = (over: Partial<Section>): Section => ({
  _id: "s1", orderId: "o1", vendor: "Amazon", sortOrder: 0, approval: null, orderedBy: null, orderDate: "", finalTotal: null,
  expectedArrival: "", ...over,
});

describe("BOM helpers", () => {
  it("adds money in cents", () => {
    expect(totalCost([{ unitCost: 0.1, quantity: 1 }, { unitCost: 0.2, quantity: 1 }])).toBe(0.3);
    expect(totalCost([{ unitCost: 12.99, quantity: 3 }])).toBe(38.97);
  });

  it("names orders in sequence, by project, or by a custom name", () => {
    const projects = [{ _id: "p1", name: "Summer Bot" }];
    expect(orderName({ customName: "", projectId: "", sequence: 3 }, projects)).toBe("Order 3");
    expect(orderName({ customName: "", projectId: "p1", sequence: 2 }, projects)).toBe("Summer Bot 2");
    expect(orderName({ customName: "Mouser Order", projectId: "p1", sequence: 2 }, projects)).toBe("Mouser Order");
  });

  it("follows a line through its states", () => {
    expect(lineState(line({}))).toBe("draft");
    expect(lineState(line({ signatures: [stamp("A")] }))).toBe("signed-once");
    expect(lineState(line({ signatures: [stamp("A"), stamp("B")] }))).toBe("approved");
    expect(lineState(line({ orderedAt: "x", quantity: 3 }))).toBe("ordered");
    expect(lineState(line({ orderedAt: "x", quantity: 3, receivedQty: 1 }))).toBe("partly-received");
    expect(lineState(line({ orderedAt: "x", quantity: 3, receivedQty: 3 }))).toBe("received");
    expect(cantSign(line({ signatures: [stamp("A")] }), "A")).toBe("You already signed this line.");
    expect(cantSign(line({ signatures: [stamp("A")] }), "B")).toBe("");
  });
});

describe("BOM sheet layout", () => {
  const detail: OrderDetail = {
    order: { _id: "o1", bomId: "b1", projectId: "", sequence: 1, customName: "", createdAt: "" },
    sections: [
      {
        section: section({ approval: stamp("Tamas V"), orderDate: "2027-01-12", finalTotal: 61.37 }),
        lines: [
          line({ name: 'Gloves, 12 "pairs"', link: "https://a.example/1", unitCost: 17.98, signatures: [stamp("Tamas V"), stamp("Laura H")], orderedAt: "x", receivedQty: 1 }),
          line({ _id: "l2", name: "Zip ties", unitCost: 12.99, quantity: 3, signatures: [stamp("Tamas V"), stamp("Laura H")], orderedAt: "x", comments: "gold" }),
        ],
      },
      { section: section({ _id: "s2", vendor: "REV Robotics", sortOrder: 1 }), lines: [line({ _id: "l3", sectionId: "s2", name: "NEO Vortex", unitCost: 90, quantity: 4 })] },
    ],
  };

  it("exports the columns, vendor headings and totals of the team's sheet", () => {
    const rows = orderToSheetRows(detail);
    expect(rows[0]).toEqual(["Item Name", "Link", "Item Cost", "Qty", "Cost", "Two Mentor Signature", "", "Ordered", "Received", "Store Subtotal", "Store Total", "Total", "Comments"]);
    expect(rows[1]).toEqual(["Amazon", "", "", "", "", "", "", "", "", "", "", "$61.37", ""]);
    expect(rows[2]).toEqual(['Gloves, 12 "pairs"', "https://a.example/1", "$17.98", "1", "$17.98", "Tamas V", "Laura H", "TRUE", "TRUE", "$56.95", "$61.37", "", ""]);
    expect(rows[3]).toEqual(["Zip ties", "", "$12.99", "3", "$38.97", "Tamas V", "Laura H", "TRUE", "FALSE", "Order Date:", "Approval to Order:", "", "gold"]);
    expect(rows[4]).toEqual(["", "", "", "", "$0.00", "", "", "FALSE", "FALSE", "2027-01-12", "Tamas V", "", ""]);
    expect(rows[5][0]).toBe("REV Robotics");
    expect(rows[5][11]).toBe(""); // the grand total is only on the first vendor's row
    expect(rows.every((r) => r.length === 13)).toBe(true);
  });

  it("reads its own export back", () => {
    const read = parseSheetRows(parseCsv(toCsv(orderToSheetRows(detail))));
    expect(read.warnings).toEqual([]);
    expect(read.sections).toMatchObject([
      {
        vendor: "Amazon", orderDate: "2027-01-12", approvalName: "Tamas V", finalTotal: 61.37,
        lines: [
          { name: 'Gloves, 12 "pairs"', unitCost: 17.98, quantity: 1, signatureNames: ["Tamas V", "Laura H"], ordered: true, received: true },
          { name: "Zip ties", unitCost: 12.99, quantity: 3, comments: "gold", ordered: true, received: false },
        ],
      },
      { vendor: "REV Robotics", finalTotal: 0, lines: [{ name: "NEO Vortex", signatureNames: [], ordered: false }] },
    ]);
  });

  it("reads the Mouser tab, which has an extra part-number column", () => {
    const read = parseSheetRows([
      ["Item Name", "Mouser #", "Link", "Item Cost", "Qty", "Cost", "Two Mentor Signature ", "", "Ordered", "Received", "Store Subtotal", "Store Total", "Total", "Comments "],
      ["Mouser Electronics", "", "", "", "", "", "", "", "", "", "", "", "$0.00", ""],
      ["Anderson Battery Connector", "879-6385G1", "https://www.mouser.com/x", "$19.82", "10", "$198.20", "Bruce R", "Tamas V", "FALSE", "FALSE", "$2,622.08", "$0.00", "", ""],
    ]);
    expect(read.sections[0].lines[0]).toMatchObject({ vendorPartNumber: "879-6385G1", link: "https://www.mouser.com/x", unitCost: 19.82, quantity: 10, signatureNames: ["Bruce R", "Tamas V"] });
  });

  it("refuses a file that isn't a BOM sheet, and warns about rows it can't read", () => {
    expect(() => parseSheetRows([["Name", "Email"]])).toThrow(/doesn't look like a BOM sheet/);
    const read = parseSheetRows([orderToSheetRows(detail)[0], ["Amazon"], ["Mystery item", "", "call for price", "2"]]);
    expect(read.warnings.join(" ")).toContain("Mystery item");
  });
});

describe("copying and pasting rows", () => {
  it("copies lines as tab-separated text in the sheet's column order", () => {
    const text = linesToTsv([line({ name: "Zip\tties", link: "https://a.example/1", unitCost: 12.99, quantity: 3, signatures: [stamp("Tamas V")], comments: "gold" })]);
    expect(text.split("\t")).toEqual(["Zip ties", "https://a.example/1", "$12.99", "3", "$38.97", "Tamas V", "", "FALSE", "FALSE", "", "", "", "gold"]);
  });

  it("pastes rows copied from the sheet, from this app, or a short list", () => {
    const fromApp = linesToTsv([line({ name: "NEO Vortex", unitCost: 90, quantity: 4, comments: "shooter" })]);
    const fromSheet = "Item Name\tLink\tItem Cost\tQty\nAmazon\t\t\t\nGloves\thttps://a.example/2\t$1,017.98\t1\t$1,017.98\tTamas V\tLaura H\tTRUE\tTRUE";
    const shortList = "Bearing\t\t2.5\t4\r\nMystery\t\tcall\t2\n\n";
    const pasted = parsePastedRows([fromApp, fromSheet, shortList].join("\n"));
    expect(pasted.lines).toEqual([
      { name: "NEO Vortex", link: "", vendorPartNumber: "", unitCost: 90, quantity: 4, comments: "shooter" },
      { name: "Gloves", link: "https://a.example/2", vendorPartNumber: "", unitCost: 1017.98, quantity: 1, comments: "" },
      { name: "Bearing", link: "", vendorPartNumber: "", unitCost: 2.5, quantity: 4, comments: "" },
    ]);
    expect(pasted.skipped).toEqual(['"Mystery": the cost or quantity isn\'t a number']);
  });
});
