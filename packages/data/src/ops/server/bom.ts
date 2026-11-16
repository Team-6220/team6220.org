// BOM: the list of things to buy. Plan: docs/operations/BOM.md. SERVER ONLY.
// Ported from backend/apps-script/ops-api/Bom.gs; the answers are the same.
//
// Members can read the bom_* collections but not write them, so every change goes through here and the rules
// below are real:
//   - a line needs two signatures from two DIFFERENT people, each a Mentor or a Booster;
//   - changing what is being bought (item, link, cost, quantity) removes the signatures;
//   - only fully signed lines in a vendor section with "Approval to Order" can be marked ordered;
//   - Supervisors can look and nothing else (they never reach these functions: see the action table in handler.ts).
// The demo backend follows the same rules: packages/data/src/bom/mock.ts. Change both together.
//
// There is no lock on Wix hosting, so a read-and-change can interleave with another request. The worst case is two
// people signing the same line at the very same moment and only one signature being kept: the line then shows "1 of 2"
// and the other person signs again.
import { getRecord, money, text, wholeNumber, type Actor, type Ctx } from "./context";
import { apiError, withId, type Doc } from "./env";

export const COLLECTION_BOMS = "bom_boms";
export const COLLECTION_ORDERS = "bom_orders";
export const COLLECTION_SECTIONS = "bom_sections";
export const COLLECTION_LINES = "bom_lines";
export const BOM_COLLECTIONS = [COLLECTION_BOMS, COLLECTION_ORDERS, COLLECTION_SECTIONS, COLLECTION_LINES];
const COLLECTION_INVENTORY_PARTS = "inventory_parts";

/** The vendor sections a new order starts with (the headings of the team's BOM Template sheet). */
const DEFAULT_VENDORS = [
  "Amazon", "McMaster-Carr", "AndyMark", "REV Robotics", "The ThriftyBot", "WestCoast Products",
  "Ganahl Lumber (in-person)", "Single Items",
];
export const SIGNATURES_NEEDED = 2;
const MAX_LINES_PER_REQUEST = 200;

function person(ctx: Ctx) {
  return { memberId: ctx.actor.id, name: ctx.actor.name, at: ctx.env.now().toISOString() };
}

const quantityOf = (value: unknown, message = "Quantity must be 1 or more.") => {
  const quantity = wholeNumber(value, 1, 100000);
  if (quantity === null) throw apiError("bad-request", message);
  return quantity;
};

// ---------------------------------------------------------------------------------------------------------
// BOMs, orders and vendor sections (Leads set these up; any team member can add a vendor section)
// ---------------------------------------------------------------------------------------------------------

/** { bom: { _id?, name, season, status } } -> { bom } */
export async function saveBom(ctx: Ctx, body: Doc) {
  const input = body.bom ?? {};
  const existing = input._id ? await getRecord(ctx, COLLECTION_BOMS, input._id, "BOM") : undefined;
  const bom = await ctx.data.save(COLLECTION_BOMS, {
    ...existing,
    name: text(input.name, "BOM name", 100),
    season: text(input.season, "season", 40, true),
    status: input.status === "closed" ? "closed" : "open",
  });
  ctx.log({ kind: "bom", id: String(bom._id) }, existing ? "updated" : "created", bom.name);
  return { bom };
}

/**
 * { order: { bomId, projectId?, customName? } } -> { order, sections }
 * A new order is numbered in sequence: "Order 3", or "<project name> 2" when it belongs to a project.
 * It starts with the default vendor sections.
 */
export async function createOrder(ctx: Ctx, body: Doc) {
  const input = body.order ?? {};
  const bom = await getRecord(ctx, COLLECTION_BOMS, input.bomId, "BOM");
  const projectId = text(input.projectId, "project", 100, true);
  const siblings = (await ctx.data.query(COLLECTION_ORDERS, { bomId: bom._id })).filter((o) => (o.projectId || "") === projectId);
  const order = await ctx.data.insert(
    COLLECTION_ORDERS,
    withId({
      bomId: bom._id,
      projectId,
      sequence: siblings.length + 1,
      customName: text(input.customName, "order name", 80, true),
      createdAt: ctx.env.now().toISOString(),
    }),
  );
  const sections = await ctx.data.insertMany(COLLECTION_SECTIONS, DEFAULT_VENDORS.map((vendor, i) => withId(newSection(String(order._id), vendor, i))));
  ctx.log({ kind: "order", id: String(order._id) }, "created", order.customName || "");
  return { order, sections };
}

function newSection(orderId: string, vendor: string, sortOrder: number): Doc {
  return { orderId, vendor, sortOrder, approval: null, orderedBy: null, orderDate: "", finalTotal: null, expectedArrival: "" };
}

/** { orderId, vendor } -> { section } */
export async function addSection(ctx: Ctx, body: Doc) {
  const order = await getRecord(ctx, COLLECTION_ORDERS, body.orderId, "order");
  const vendor = text(body.vendor, "vendor name", 80);
  const existing = await ctx.data.query(COLLECTION_SECTIONS, { orderId: order._id });
  if (existing.some((s) => String(s.vendor).toLowerCase() === vendor.toLowerCase())) {
    throw apiError("bad-request", `This order already has a section for ${vendor}.`);
  }
  return { section: await ctx.data.insert(COLLECTION_SECTIONS, newSection(String(order._id), vendor, existing.length)) };
}

// ---------------------------------------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------------------------------------

/** What a person types for one line, checked. `row` says which pasted row it is, for the messages. */
function cleanLine(input: Doc, sectionId: string, row?: number): Doc {
  const where = row === undefined ? "" : `Row ${row}: `;
  return {
    sectionId,
    name: text(input.name, row === undefined ? "item name" : `item name in row ${row}`, 300),
    link: text(input.link, "link", 2000, true),
    vendorPartNumber: text(input.vendorPartNumber, "part number", 80, true),
    unitCost: money(input.unitCost, row === undefined ? "Item cost" : `${where}item cost`),
    quantity: quantityOf(input.quantity, row === undefined ? undefined : `${where}quantity must be 1 or more.`),
    comments: text(input.comments, "comments", 500, true),
  };
}

/** { line: { _id?, sectionId, name, link, vendorPartNumber, unitCost, quantity, comments } } -> { line, signaturesCleared } */
export async function saveLine(ctx: Ctx, body: Doc) {
  const input = body.line ?? {};
  const existing = input._id ? await getRecord(ctx, COLLECTION_LINES, input._id, "line") : undefined;
  if (existing?.orderedAt) throw apiError("conflict", "This line was already ordered and can't be changed.");
  const section = await getRecord(ctx, COLLECTION_SECTIONS, existing ? existing.sectionId : input.sectionId, "vendor section");
  const line: Doc = { ...existing, ...cleanLine(input, String(section._id)) };
  // Changing what is being bought means the earlier signatures no longer apply.
  const changed = existing && ["name", "link", "unitCost", "quantity"].some((f) => existing[f] !== line[f]);
  const signaturesCleared = !!(changed && existing?.signatures?.length);
  if (!existing) {
    Object.assign(line, { requestedBy: person(ctx), signatures: [], orderedAt: "", receivedQty: 0, receivedAt: "", receivedBy: null, inventoryItemId: "" });
  } else if (signaturesCleared) {
    line.signatures = [];
  }
  const saved = await ctx.data.save(COLLECTION_LINES, line);
  const what = existing ? (signaturesCleared ? "edited (signatures removed)" : "edited") : "added";
  ctx.log({ kind: "bomLine", id: String(saved._id) }, what, `${saved.quantity} x ${saved.name}`);
  return { line: saved, signaturesCleared };
}

/**
 * { sectionId, lines: [{ name, link, vendorPartNumber, unitCost, quantity, comments }] } -> { lines }
 * Adds many new lines to one vendor section in one request (pasting rows from a spreadsheet).
 * Every row is checked before any is saved, so a bad row never leaves half a paste behind.
 */
export async function addLines(ctx: Ctx, body: Doc) {
  const inputs: Doc[] = Array.isArray(body.lines) ? body.lines : [];
  if (!inputs.length || inputs.length > 100) throw apiError("bad-request", "Paste between 1 and 100 rows at a time.");
  const section = await getRecord(ctx, COLLECTION_SECTIONS, body.sectionId, "vendor section");
  const requestedBy = person(ctx);
  const cleaned = inputs.map((input, i) => ({
    ...cleanLine(input, String(section._id), i + 1),
    requestedBy,
    signatures: [],
    orderedAt: "",
    receivedQty: 0,
    receivedAt: "",
    receivedBy: null,
    inventoryItemId: "",
  }));
  const lines = await ctx.data.insertMany(COLLECTION_LINES, cleaned);
  ctx.log({ kind: "bomSection", id: String(section._id) }, "pasted lines", `${lines.length} into ${section.vendor}`);
  return { lines };
}

/** { lineId } -> {}. Only a line nobody has signed can be removed. */
export async function removeLine(ctx: Ctx, body: Doc) {
  const line = await getRecord(ctx, COLLECTION_LINES, body.lineId, "line");
  if (line.orderedAt || (line.signatures ?? []).length) {
    throw apiError("conflict", "A signed or ordered line can't be removed. A lead can reopen it first.");
  }
  await ctx.data.remove(COLLECTION_LINES, String(line._id));
  ctx.log({ kind: "bomLine", id: String(line._id) }, "removed", line.name);
  return {};
}

/** { lineId } -> { line }. A Lead takes a line back to "not signed, not ordered", for example after a mistake. */
export async function reopenLine(ctx: Ctx, body: Doc) {
  const line = await getRecord(ctx, COLLECTION_LINES, body.lineId, "line");
  if (line.receivedQty > 0) throw apiError("conflict", "This line was already received.");
  const saved = await ctx.data.save(COLLECTION_LINES, { ...line, signatures: [], orderedAt: "" });
  ctx.log({ kind: "bomLine", id: String(line._id) }, "reopened", line.name);
  return { line: saved };
}

/** The ids of a request's list, as text, checked for length. */
function idList(value: unknown): string[] {
  const ids: string[] = Array.isArray(value) ? value.map(String) : [];
  if (!ids.length || ids.length > MAX_LINES_PER_REQUEST) throw apiError("bad-request", `Choose between 1 and ${MAX_LINES_PER_REQUEST} lines.`);
  return ids;
}

/**
 * { lineIds: [...] } -> { signed: [lines], skipped: [{ lineId, reason }], total }
 * A Mentor or Booster signs many lines in one request. Lines that can't be signed are skipped with the reason,
 * so one bad line never blocks the rest. `total` is the cost of the lines that were signed, worked out here.
 */
export async function signLines(ctx: Ctx, body: Doc) {
  const ids = idList(body.lineIds);
  const found = new Map((await ctx.data.queryIds(COLLECTION_LINES, ids)).map((l) => [String(l._id), l]));
  const signed: Doc[] = [];
  const skipped: { lineId: string; reason: string }[] = [];
  let cents = 0;
  for (const id of ids) {
    const line = found.get(id);
    const reason = cantSign(line, ctx.actor);
    if (reason || !line) {
      skipped.push({ lineId: id, reason });
      continue;
    }
    const next: Doc = { ...line, signatures: [...(line.signatures ?? []), person(ctx)] };
    found.set(id, next); // a line listed twice is seen as already signed the second time
    const at = signed.findIndex((s) => s._id === id);
    if (at === -1) signed.push(next);
    else signed[at] = next;
    ctx.log({ kind: "bomLine", id }, "signed", `${next.signatures.length} of ${SIGNATURES_NEEDED}`);
    cents += Math.round(next.unitCost * 100) * next.quantity;
  }
  await ctx.data.saveMany(COLLECTION_LINES, signed);
  return { signed, skipped, total: cents / 100 };
}

/** Why this person can't sign this line, or "" when they can. */
function cantSign(line: Doc | undefined, actor: Actor): string {
  if (!line) return "The line no longer exists.";
  if (line.orderedAt) return "Already ordered.";
  const signatures: Doc[] = line.signatures ?? [];
  if (signatures.length >= SIGNATURES_NEEDED) return "Already has two signatures.";
  if (signatures.some((s) => s.memberId === actor.id)) return "You already signed this line.";
  if (!line.name || !(line.quantity >= 1)) return "The line isn't filled in yet.";
  return "";
}

// ---------------------------------------------------------------------------------------------------------
// Ordering and receiving
// ---------------------------------------------------------------------------------------------------------

/** { sectionId } -> { section }. A Mentor or Booster gives "Approval to Order" for one vendor section. */
export async function approveSection(ctx: Ctx, body: Doc) {
  const section = await getRecord(ctx, COLLECTION_SECTIONS, body.sectionId, "vendor section");
  const saved = await ctx.data.save(COLLECTION_SECTIONS, { ...section, approval: person(ctx) });
  ctx.log({ kind: "bomSection", id: String(section._id) }, "approved to order", section.vendor);
  return { section: saved };
}

/**
 * { sectionId, orderDate, finalTotal, expectedArrival? } -> { section, ordered: [lines], notReady }
 * Marks every fully signed line of the section as ordered and records what was really paid (with tax and
 * shipping). Lines without two signatures are left alone and counted in `notReady`. Can be sent again to
 * correct the total or the dates.
 */
export async function markOrdered(ctx: Ctx, body: Doc) {
  const section = await getRecord(ctx, COLLECTION_SECTIONS, body.sectionId, "vendor section");
  if (!section.approval) throw apiError("conflict", "This section needs Approval to Order first.");
  const lines = await ctx.data.query(COLLECTION_LINES, { sectionId: section._id });
  const ready = lines.filter((l) => !l.orderedAt && (l.signatures ?? []).length >= SIGNATURES_NEEDED);
  const already = lines.filter((l) => l.orderedAt);
  if (!ready.length && !already.length) throw apiError("conflict", "No line in this section has two signatures yet.");
  const orderDate = text(body.orderDate, "order date", 10);
  const finalTotal = money(body.finalTotal, "The final total");
  const expectedArrival = text(body.expectedArrival, "expected arrival", 10, true);
  const now = ctx.env.now().toISOString();
  const ordered = await ctx.data.saveMany(COLLECTION_LINES, ready.map((line) => ({ ...line, orderedAt: now })));
  for (const line of ready) ctx.log({ kind: "bomLine", id: String(line._id) }, "ordered", line.name);
  const saved = await ctx.data.save(COLLECTION_SECTIONS, { ...section, orderedBy: person(ctx), orderDate, finalTotal, expectedArrival });
  ctx.log({ kind: "bomSection", id: String(section._id) }, "ordered", `${section.vendor} $${saved.finalTotal}`);
  return { section: saved, ordered, notReady: lines.length - ready.length - already.length };
}

/**
 * { items: [{ lineId, quantity, inventoryItemId?, addToInventory? }] } -> { lines }
 * Records that ordered items arrived. Part of a line can be received ("6 of 10").
 * inventoryItemId remembers which Inventory part the line refills ("" = not tracked in Inventory).
 * The website changes the stock count itself, in the browser (packages/data/src/inventory/stock.ts). Apollo has no
 * browser, so it sends addToInventory: true and this server adds the quantity to the linked Inventory part.
 */
export async function receiveLines(ctx: Ctx, body: Doc) {
  const items: Doc[] = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > MAX_LINES_PER_REQUEST) throw apiError("bad-request", `Choose between 1 and ${MAX_LINES_PER_REQUEST} lines.`);
  const lineIds = items.map((item) => String(item.lineId));
  const found = new Map((await ctx.data.queryIds(COLLECTION_LINES, lineIds)).map((l) => [String(l._id), l]));
  const wanted = items.map((item) => {
    const line = found.get(String(item.lineId));
    if (!line) throw apiError("bad-request", "That line doesn't exist any more. Reload the page.");
    return { item, line };
  });
  // Parts to refill (Apollo only), read once.
  const partIds = [...new Set(wanted.filter((w) => w.item.addToInventory === true).map((w) => linkedPartId(w.item, w.line)))];
  const parts = new Map((await ctx.data.queryIds(COLLECTION_INVENTORY_PARTS, partIds)).map((p) => [String(p._id), p]));

  // Check every item first, so a bad one never leaves the others half-received. A line listed twice counts both times.
  const receivedSoFar = new Map<string, number>();
  const checked = wanted.map(({ item, line }) => {
    const id = String(line._id);
    if (!line.orderedAt) throw apiError("conflict", `'${line.name}' hasn't been ordered yet.`);
    const left = line.quantity - (line.receivedQty || 0) - (receivedSoFar.get(id) ?? 0);
    const quantity = wholeNumber(item.quantity, 1, Number.MAX_SAFE_INTEGER);
    if (quantity === null || quantity > left) throw apiError("bad-request", `'${line.name}' has ${left} left to receive.`);
    receivedSoFar.set(id, (receivedSoFar.get(id) ?? 0) + quantity);
    const inventoryItemId = linkedPartId(item, line);
    if (item.addToInventory === true) {
      const part = parts.get(inventoryItemId);
      if (!inventoryItemId) throw apiError("bad-request", `'${line.name}' isn't linked to an Inventory part. Ask a person which part it is, or receive it without adding to Inventory.`);
      if (!part || part.archivedAt) throw apiError("bad-request", `The Inventory part for '${line.name}' no longer exists.`);
    }
    return { line, quantity, inventoryItemId, addToInventory: item.addToInventory === true };
  });

  const now = ctx.env.now().toISOString();
  const latest = new Map<string, Doc>();
  const stock = new Map<string, Doc>();
  for (const c of checked) {
    const id = String(c.line._id);
    const base = latest.get(id) ?? c.line;
    const next: Doc = { ...base, receivedQty: (base.receivedQty || 0) + c.quantity, receivedAt: now, receivedBy: person(ctx), inventoryItemId: c.inventoryItemId };
    latest.set(id, next);
    ctx.log({ kind: "bomLine", id }, "received", `${next.receivedQty} of ${next.quantity}`);
    if (c.addToInventory) {
      const part = stock.get(c.inventoryItemId) ?? parts.get(c.inventoryItemId)!;
      stock.set(c.inventoryItemId, { ...part, quantity: (Number(part.quantity) || 0) + c.quantity, version: (Number(part.version) || 0) + 1, updatedAt: ctx.env.now() });
      ctx.log({ kind: "inventoryItem", id: c.inventoryItemId }, "added stock", `${c.quantity} from BOM line ${c.line.name}`);
    }
  }
  const lines = await ctx.data.saveMany(COLLECTION_LINES, [...latest.values()]);
  await ctx.data.saveMany(COLLECTION_INVENTORY_PARTS, [...stock.values()]);
  return { lines };
}

/** The Inventory part a received line refills: what the request says, or what the line already remembers. */
function linkedPartId(item: Doc, line: Doc): string {
  return item.inventoryItemId === undefined ? line.inventoryItemId || "" : text(item.inventoryItemId, "inventory item", 100, true);
}

/** { lineId, inventoryItemId } -> { line }. Remembers which Inventory part a line refills. Changes nothing else. */
export async function linkLineToInventory(ctx: Ctx, body: Doc) {
  const line = await getRecord(ctx, COLLECTION_LINES, body.lineId, "line");
  const saved = await ctx.data.save(COLLECTION_LINES, { ...line, inventoryItemId: text(body.inventoryItemId, "inventory item", 100, true) });
  ctx.log({ kind: "bomLine", id: String(line._id) }, "linked to inventory", line.name);
  return { line: saved };
}

// ---------------------------------------------------------------------------------------------------------
// Import from an old Google Sheet
// ---------------------------------------------------------------------------------------------------------

/**
 * { bomId, customName, sections: [{ vendor, orderDate, approvalName, finalTotal, lines: [...] }] } -> { order }
 * A Lead saves one tab of an old BOM sheet as an order (the browser reads the file: packages/data/src/bom/import.ts).
 * Signatures and approvals from the sheet were typed names, so they are stored with no member and marked
 * "imported": nobody can mistake them for a signature made on the website.
 */
export async function importOrder(ctx: Ctx, body: Doc) {
  const bom = await getRecord(ctx, COLLECTION_BOMS, body.bomId, "BOM");
  const sections: Doc[] = Array.isArray(body.sections) ? body.sections : [];
  const lineCount = sections.reduce((n, s) => n + (Array.isArray(s.lines) ? s.lines.length : 0), 0);
  if (!lineCount || lineCount > 500) throw apiError("bad-request", "An import needs between 1 and 500 lines.");
  const imported = (name: string) => ({ memberId: "", name, at: "", imported: true });
  const customName = text(body.customName, "order name", 80, true);

  // Check everything before writing anything.
  const sectionDocs: Doc[] = [];
  const lineDocs: Doc[] = [];
  const orderId = crypto.randomUUID();
  sections.forEach((input, i) => {
    const approvalName = text(input.approvalName, "approval", 80, true);
    const section = withId({
      ...newSection(orderId, text(input.vendor, "vendor", 80), i),
      approval: approvalName ? imported(approvalName) : null,
      orderDate: text(input.orderDate, "order date", 40, true),
      finalTotal: input.finalTotal === null || input.finalTotal === undefined ? null : money(input.finalTotal, "Store total"),
    });
    sectionDocs.push(section);
    for (const l of (input.lines ?? []) as Doc[]) {
      const quantity = quantityOf(l.quantity);
      lineDocs.push({
        sectionId: section._id,
        name: text(l.name, "item name", 300),
        link: text(l.link, "link", 2000, true),
        vendorPartNumber: text(l.vendorPartNumber, "part number", 80, true),
        unitCost: money(l.unitCost, "Item cost"),
        quantity,
        comments: text(l.comments, "comments", 500, true),
        requestedBy: imported("Imported from a sheet"),
        signatures: (Array.isArray(l.signatureNames) ? l.signatureNames : []).slice(0, SIGNATURES_NEEDED).map((n: unknown) => imported(text(n, "signature", 80))),
        orderedAt: l.ordered || l.received ? "imported" : "",
        receivedQty: l.received ? quantity : 0,
        receivedAt: "",
        receivedBy: null,
        inventoryItemId: "",
      });
    }
  });

  const plain = (await ctx.data.query(COLLECTION_ORDERS, { bomId: bom._id })).filter((o) => !o.projectId);
  const order = await ctx.data.insert(COLLECTION_ORDERS, {
    _id: orderId,
    bomId: bom._id,
    projectId: "",
    sequence: plain.length + 1,
    customName,
    createdAt: ctx.env.now().toISOString(),
  });
  await ctx.data.insertMany(COLLECTION_SECTIONS, sectionDocs);
  await ctx.data.insertMany(COLLECTION_LINES, lineDocs);
  ctx.log({ kind: "order", id: String(order._id) }, "imported", `${lineCount} lines`);
  return { order };
}
