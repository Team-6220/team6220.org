// Demo backend for the BOM app: made-up data and the same rules as backend/apps-script/ops-api/Bom.gs,
// in memory. If you change a rule here, change it there too (packages/data/test/bom-rules.test.ts runs the
// same checks against both).
import { mockActions, seedMock, type MockActor, type MockDb } from "../ops/mock";
import { OpsError, type ApiRequest, type Draft } from "../ops/types";
import { cantSign, DEFAULT_VENDORS, SIGNATURES_NEEDED } from "./rules";
import type { ImportedSection } from "./import";
import type { Bom, Line, Order, Section, Stamp } from "./types";

const stamp = (actor: MockActor): Stamp => ({ memberId: actor.id, name: actor.name, at: new Date().toISOString() });

function get<T extends { _id: string }>(db: MockDb, collection: string, id: unknown, what: string): T {
  const row = db.rows(collection).find((r) => r._id === id);
  if (!row) throw new OpsError("bad-request", `That ${what} doesn't exist any more. Reload the page.`);
  return row as unknown as T;
}

function text(value: unknown, name: string, optional = false): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s && !optional) throw new OpsError("bad-request", `Missing ${name}.`);
  return s;
}

function money(value: unknown, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new OpsError("bad-request", `${name} must be an amount of money.`);
  return Math.round(n * 100) / 100;
}

function newSection(orderId: string, vendor: string, sortOrder: number): Draft<Section> {
  return { orderId, vendor, sortOrder, approval: null, orderedBy: null, orderDate: "", finalTotal: null, expectedArrival: "" };
}

function createOrder(db: MockDb, actor: MockActor, input: Record<string, unknown>) {
  const bom = get<Bom>(db, "bom_boms", input.bomId, "BOM");
  const projectId = text(input.projectId, "project", true);
  const siblings = db.rows<Order>("bom_orders").filter((o) => o.bomId === bom._id && o.projectId === projectId);
  const order = db.save<Order>("bom_orders", {
    bomId: bom._id,
    projectId,
    sequence: siblings.length + 1,
    customName: text(input.customName, "order name", true),
    createdAt: new Date().toISOString(),
  });
  const sections = DEFAULT_VENDORS.map((vendor, i) => db.save<Section>("bom_sections", newSection(order._id, vendor, i)));
  db.writeHistory(actor, { kind: "order", id: order._id }, "created", order.customName);
  return { order, sections };
}

function saveLine(db: MockDb, actor: MockActor, input: Record<string, unknown>) {
  const existing = input._id ? get<Line>(db, "bom_lines", input._id, "line") : null;
  if (existing?.orderedAt) throw new OpsError("conflict", "This line was already ordered and can't be changed.");
  const section = get<Section>(db, "bom_sections", existing ? existing.sectionId : input.sectionId, "vendor section");
  const quantity = Math.floor(Number(input.quantity));
  if (!(quantity >= 1 && quantity <= 100_000)) throw new OpsError("bad-request", "Quantity must be 1 or more.");
  const fields = {
    sectionId: section._id,
    name: text(input.name, "item name"),
    link: text(input.link, "link", true),
    vendorPartNumber: text(input.vendorPartNumber, "part number", true),
    unitCost: money(input.unitCost, "Item cost"),
    quantity,
    comments: text(input.comments, "comments", true),
  };
  // Changing what is being bought means the earlier signatures no longer apply.
  const changed = !!existing && (["name", "link", "unitCost", "quantity"] as const).some((f) => existing[f] !== fields[f]);
  const signaturesCleared = changed && existing!.signatures.length > 0;
  const line = db.save<Line>("bom_lines", existing
    ? { ...existing, ...fields, signatures: signaturesCleared ? [] : existing.signatures }
    : { ...fields, requestedBy: stamp(actor), signatures: [], orderedAt: "", receivedQty: 0, receivedAt: "", receivedBy: null, inventoryItemId: "" });
  const what = existing ? (signaturesCleared ? "edited (signatures removed)" : "edited") : "added";
  db.writeHistory(actor, { kind: "bomLine", id: line._id }, what, `${line.quantity} x ${line.name}`);
  return { line, signaturesCleared };
}

function signLines(db: MockDb, actor: MockActor, request: ApiRequest) {
  const ids = Array.isArray(request.lineIds) ? request.lineIds.map(String) : [];
  if (!ids.length || ids.length > 200) throw new OpsError("bad-request", "Choose between 1 and 200 lines.");
  const signed: Line[] = [];
  const skipped: { lineId: string; reason: string }[] = [];
  let cents = 0;
  for (const id of ids) {
    const line = db.rows<Line>("bom_lines").find((l) => l._id === id);
    const reason = line ? cantSign(line, actor.id) : "The line no longer exists.";
    if (!line || reason) {
      skipped.push({ lineId: id, reason });
      continue;
    }
    const saved = db.save<Line>("bom_lines", { ...line, signatures: [...line.signatures, stamp(actor)] });
    db.writeHistory(actor, { kind: "bomLine", id }, "signed", `${saved.signatures.length} of ${SIGNATURES_NEEDED}`);
    signed.push(saved);
    cents += Math.round(saved.unitCost * 100) * saved.quantity;
  }
  return { signed, skipped, total: cents / 100 };
}

function markOrdered(db: MockDb, actor: MockActor, request: ApiRequest) {
  const section = get<Section>(db, "bom_sections", request.sectionId, "vendor section");
  if (!section.approval) throw new OpsError("conflict", "This section needs Approval to Order first.");
  const lines = db.rows<Line>("bom_lines").filter((l) => l.sectionId === section._id);
  const ready = lines.filter((l) => !l.orderedAt && l.signatures.length >= SIGNATURES_NEEDED);
  const already = lines.filter((l) => l.orderedAt);
  if (!ready.length && !already.length) throw new OpsError("conflict", "No line in this section has two signatures yet.");
  const now = new Date().toISOString();
  const ordered = ready.map((line) => {
    db.writeHistory(actor, { kind: "bomLine", id: line._id }, "ordered", line.name);
    return db.save<Line>("bom_lines", { ...line, orderedAt: now });
  });
  const saved = db.save<Section>("bom_sections", {
    ...section,
    orderedBy: stamp(actor),
    orderDate: text(request.orderDate, "order date"),
    finalTotal: money(request.finalTotal, "The final total"),
    expectedArrival: text(request.expectedArrival, "expected arrival", true),
  });
  db.writeHistory(actor, { kind: "bomSection", id: section._id }, "ordered", `${section.vendor} $${saved.finalTotal}`);
  return { section: saved, ordered, notReady: lines.length - ready.length - already.length };
}

function receiveLines(db: MockDb, actor: MockActor, request: ApiRequest) {
  const items = (Array.isArray(request.items) ? request.items : []) as { lineId?: unknown; quantity?: unknown; inventoryItemId?: unknown }[];
  if (!items.length || items.length > 200) throw new OpsError("bad-request", "Choose between 1 and 200 lines.");
  // Check every item first, so a bad one never leaves the others half-received (as Bom.gs does).
  const checked = items.map((item) => {
    const line = get<Line>(db, "bom_lines", String(item.lineId), "line");
    if (!line.orderedAt) throw new OpsError("conflict", `'${line.name}' hasn't been ordered yet.`);
    const quantity = Math.floor(Number(item.quantity));
    const left = line.quantity - line.receivedQty;
    if (!(quantity >= 1 && quantity <= left)) throw new OpsError("bad-request", `'${line.name}' has ${left} left to receive.`);
    return { item, line, quantity };
  });
  const lines = checked.map(({ item, line, quantity }) => {
    const saved = db.save<Line>("bom_lines", {
      ...line,
      receivedQty: line.receivedQty + quantity,
      receivedAt: new Date().toISOString(),
      receivedBy: stamp(actor),
      inventoryItemId: item.inventoryItemId === undefined ? line.inventoryItemId : text(item.inventoryItemId, "inventory item", true),
    });
    db.writeHistory(actor, { kind: "bomLine", id: line._id }, "received", `${saved.receivedQty} of ${saved.quantity}`);
    return saved;
  });
  return { lines };
}

/** Saves one tab of an old sheet as an order. Typed names become "imported" stamps with no member behind them. */
function importOrder(db: MockDb, actor: MockActor, request: ApiRequest) {
  const bom = get<Bom>(db, "bom_boms", request.bomId, "BOM");
  const sections = (Array.isArray(request.sections) ? request.sections : []) as ImportedSection[];
  const lineCount = sections.reduce((n, s) => n + (s.lines?.length ?? 0), 0);
  if (!lineCount || lineCount > 500) throw new OpsError("bad-request", "An import needs between 1 and 500 lines.");
  const imported = (name: string): Stamp => ({ memberId: "", name, at: "", imported: true });
  const plain = db.rows<Order>("bom_orders").filter((o) => o.bomId === bom._id && !o.projectId);
  const order = db.save<Order>("bom_orders", {
    bomId: bom._id,
    projectId: "",
    sequence: plain.length + 1,
    customName: text(request.customName, "order name", true),
    createdAt: new Date().toISOString(),
  });
  sections.forEach((input, i) => {
    const section = db.save<Section>("bom_sections", {
      ...newSection(order._id, text(input.vendor, "vendor"), i),
      approval: input.approvalName ? imported(input.approvalName) : null,
      orderDate: input.orderDate ?? "",
      finalTotal: input.finalTotal == null ? null : money(input.finalTotal, "Store total"),
    });
    for (const l of input.lines ?? []) {
      const quantity = Math.floor(Number(l.quantity));
      if (!(quantity >= 1)) throw new OpsError("bad-request", "Quantity must be 1 or more.");
      db.save<Line>("bom_lines", {
        sectionId: section._id,
        name: text(l.name, "item name"),
        link: text(l.link, "link", true),
        vendorPartNumber: text(l.vendorPartNumber, "part number", true),
        unitCost: money(l.unitCost, "Item cost"),
        quantity,
        comments: text(l.comments, "comments", true),
        requestedBy: imported("Imported from a sheet"),
        signatures: (l.signatureNames ?? []).slice(0, SIGNATURES_NEEDED).map(imported),
        orderedAt: l.ordered || l.received ? "imported" : "",
        receivedQty: l.received ? quantity : 0,
        receivedAt: "",
        receivedBy: null,
        inventoryItemId: "",
      });
    }
  });
  db.writeHistory(actor, { kind: "order", id: order._id }, "imported", `${lineCount} lines`);
  return { order };
}

mockActions({
  saveBom: {
    who: "lead",
    run: (request, actor, db) => {
      const input = (request.bom ?? {}) as Record<string, unknown>;
      const existing = input._id ? get<Bom>(db, "bom_boms", input._id, "BOM") : null;
      const bom = db.save<Bom>("bom_boms", {
        ...existing,
        name: text(input.name, "BOM name"),
        season: text(input.season, "season", true),
        status: input.status === "closed" ? "closed" : "open",
      });
      db.writeHistory(actor, { kind: "bom", id: bom._id }, existing ? "updated" : "created", bom.name);
      return { bom };
    },
  },
  createOrder: { who: "lead", run: (request, actor, db) => createOrder(db, actor, (request.order ?? {}) as Record<string, unknown>) },
  addSection: {
    who: "team",
    run: (request, _actor, db) => {
      const order = get<Order>(db, "bom_orders", request.orderId, "order");
      const vendor = text(request.vendor, "vendor name");
      const existing = db.rows<Section>("bom_sections").filter((s) => s.orderId === order._id);
      if (existing.some((s) => s.vendor.toLowerCase() === vendor.toLowerCase())) {
        throw new OpsError("bad-request", `This order already has a section for ${vendor}.`);
      }
      return { section: db.save<Section>("bom_sections", newSection(order._id, vendor, existing.length)) };
    },
  },
  saveLine: { who: "team", run: (request, actor, db) => saveLine(db, actor, (request.line ?? {}) as Record<string, unknown>) },
  addLines: {
    who: "team",
    run: (request, actor, db) => {
      const inputs = (Array.isArray(request.lines) ? request.lines : []) as Record<string, unknown>[];
      if (!inputs.length || inputs.length > 100) throw new OpsError("bad-request", "Paste between 1 and 100 rows at a time.");
      const section = get<Section>(db, "bom_sections", request.sectionId, "vendor section");
      // Every row is checked before any is saved, so a bad row never leaves half a paste behind.
      const cleaned = inputs.map((input, i) => {
        const quantity = Math.floor(Number(input.quantity));
        if (!(quantity >= 1 && quantity <= 100_000)) throw new OpsError("bad-request", `Row ${i + 1}: quantity must be 1 or more.`);
        return {
          sectionId: section._id,
          name: text(input.name, `item name in row ${i + 1}`),
          link: text(input.link, "link", true),
          vendorPartNumber: text(input.vendorPartNumber, "part number", true),
          unitCost: money(input.unitCost, `Row ${i + 1}: item cost`),
          quantity,
          comments: text(input.comments, "comments", true),
          requestedBy: stamp(actor),
          signatures: [], orderedAt: "", receivedQty: 0, receivedAt: "", receivedBy: null, inventoryItemId: "",
        };
      });
      const lines = cleaned.map((line) => db.save<Line>("bom_lines", line));
      db.writeHistory(actor, { kind: "bomSection", id: section._id }, "pasted lines", `${lines.length} into ${section.vendor}`);
      return { lines };
    },
  },
  removeLine: {
    who: "team",
    run: (request, actor, db) => {
      const line = get<Line>(db, "bom_lines", request.lineId, "line");
      if (line.orderedAt || line.signatures.length) {
        throw new OpsError("conflict", "A signed or ordered line can't be removed. A lead can reopen it first.");
      }
      db.remove("bom_lines", line._id);
      db.writeHistory(actor, { kind: "bomLine", id: line._id }, "removed", line.name);
      return {};
    },
  },
  reopenLine: {
    who: "lead",
    run: (request, actor, db) => {
      const line = get<Line>(db, "bom_lines", request.lineId, "line");
      if (line.receivedQty > 0) throw new OpsError("conflict", "This line was already received.");
      const saved = db.save<Line>("bom_lines", { ...line, signatures: [], orderedAt: "" });
      db.writeHistory(actor, { kind: "bomLine", id: line._id }, "reopened", line.name);
      return { line: saved };
    },
  },
  signLines: { who: "approver", run: (request, actor, db) => signLines(db, actor, request) },
  approveSection: {
    who: "approver",
    run: (request, actor, db) => {
      const section = get<Section>(db, "bom_sections", request.sectionId, "vendor section");
      const saved = db.save<Section>("bom_sections", { ...section, approval: stamp(actor) });
      db.writeHistory(actor, { kind: "bomSection", id: section._id }, "approved to order", section.vendor);
      return { section: saved };
    },
  },
  markOrdered: { who: "approver", run: (request, actor, db) => markOrdered(db, actor, request) },
  receiveLines: { who: "team", run: (request, actor, db) => receiveLines(db, actor, request) },
  linkLineToInventory: {
    who: "team",
    run: (request, actor, db) => {
      const line = get<Line>(db, "bom_lines", request.lineId, "line");
      const saved = db.save<Line>("bom_lines", { ...line, inventoryItemId: text(request.inventoryItemId, "inventory item", true) });
      db.writeHistory(actor, { kind: "bomLine", id: line._id }, "linked to inventory", line.name);
      return { line: saved };
    },
  },
  importOrder: { who: "lead", run: (request, actor, db) => importOrder(db, actor, request) },
});

// ----- made-up starting data: one BOM with one order in every stage of the flow -----

seedMock((db) => {
  const lead: MockActor = { id: "demo-lead", name: "Demo Lead", badges: [], agent: false };
  const mentor: MockActor = { id: "demo-mentor", name: "Demo Mentor", badges: [], agent: false };
  const booster: MockActor = { id: "demo-booster", name: "Demo Booster", badges: [], agent: false };
  const bom = db.save<Bom>("bom_boms", { name: "2027 Competition BOM", season: "2027", status: "open" });
  const { order, sections } = createOrder(db, lead, { bomId: bom._id });
  const section = (vendor: string) => sections.find((s) => s.vendor === vendor)!;
  const add = (vendor: string, name: string, unitCost: number, quantity: number, link: string) =>
    saveLine(db, lead, { sectionId: section(vendor)._id, name, unitCost, quantity, link }).line;

  // Amazon: ordered, one line received.
  const gloves = add("Amazon", "Safety work gloves, 12 pairs", 17.98, 1, "https://www.amazon.com/dp/EXAMPLE1");
  const ties = add("Amazon", "12 inch gold zip ties, 100 pack", 12.99, 3, "https://www.amazon.com/dp/EXAMPLE2");
  for (const signer of [mentor, booster]) signLines(db, signer, { action: "signLines", lineIds: [gloves._id, ties._id] });
  db.save<Section>("bom_sections", { ...section("Amazon"), approval: stamp(mentor) });
  markOrdered(db, booster, { action: "markOrdered", sectionId: section("Amazon")._id, orderDate: "2027-01-12", finalTotal: 61.37 });
  receiveLines(db, lead, { action: "receiveLines", items: [{ lineId: gloves._id, quantity: 1 }] });

  // REV Robotics: one line fully signed, one signed once, one new.
  const neo = add("REV Robotics", "NEO Vortex brushless motor", 90, 4, "https://www.revrobotics.com/rev-21-1652/");
  const flex = add("REV Robotics", "SPARK Flex motor controller", 100, 4, "https://www.revrobotics.com/rev-11-2159/");
  add("REV Robotics", "MAXSpline shaft, 12 in", 14, 2, "https://www.revrobotics.com/");
  signLines(db, mentor, { action: "signLines", lineIds: [neo._id, flex._id] });
  signLines(db, booster, { action: "signLines", lineIds: [neo._id] });

  // McMaster-Carr: nothing signed yet.
  add("McMaster-Carr", "10-32 x 1/2 in socket head screws, 100 pack", 11.42, 2, "https://www.mcmaster.com/91251A342/");
  add("McMaster-Carr", "1/2 in hex shaft collar", 3.87, 10, "https://www.mcmaster.com/");

  void order;
});
