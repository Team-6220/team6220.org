// BOM: the list of things to buy. Plan: docs/operations/BOM.md.
//
// Members can read the bom_* collections but not write them, so every change goes through here and the rules
// below are real:
//   - a line needs two signatures from two DIFFERENT people, each a Mentor or a Booster;
//   - changing what is being bought (item, link, cost, quantity) removes the signatures;
//   - only fully signed lines in a vendor section with "Approval to Order" can be marked ordered;
//   - Supervisors can look and nothing else (they never reach these functions: see actions_ in Code.gs).
// The demo backend follows the same rules: packages/data/src/bom/mock.ts. Change both together.

const COLLECTION_BOMS = "bom_boms";
const COLLECTION_ORDERS = "bom_orders";
const COLLECTION_SECTIONS = "bom_sections";
const COLLECTION_LINES = "bom_lines";
const BOM_COLLECTIONS = [COLLECTION_BOMS, COLLECTION_ORDERS, COLLECTION_SECTIONS, COLLECTION_LINES];

/** The vendor sections a new order starts with (the headings of the team's BOM Template sheet). */
const DEFAULT_VENDORS = [
  "Amazon", "McMaster-Carr", "AndyMark", "REV Robotics", "The ThriftyBot", "WestCoast Products",
  "Ganahl Lumber (in-person)", "Single Items",
];
const SIGNATURES_NEEDED = 2;
const MAX_LINES_PER_REQUEST = 200;

function bomGet_(collection, id, what) {
  const row = typeof id === "string" && id ? wixQuery_(collection, { _id: id }, 1)[0] : null;
  if (!row) throw apiError_("bad-request", "That " + what + " doesn't exist any more. Reload the page.");
  return row;
}

function person_(actor) {
  return { memberId: actor.id, name: actor.name, at: new Date().toISOString() };
}

/** A number of dollars with at most two decimals, 0 or more. */
function money_(value, name) {
  const n = Number(value);
  if (!isFinite(n) || n < 0 || n > 1000000) throw apiError_("bad-request", name + " must be an amount of money.");
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------------------------------------
// BOMs, orders and vendor sections (Leads set these up; any team member can add a vendor section)
// ---------------------------------------------------------------------------------------------------------

/** { bom: { _id?, name, season, status } } -> { bom } */
function saveBom_(body, actor) {
  const input = body.bom || {};
  const existing = input._id ? bomGet_(COLLECTION_BOMS, input._id, "BOM") : null;
  const bom = wixSave_(COLLECTION_BOMS, Object.assign({}, existing, {
    name: text_(input.name, "BOM name", 100),
    season: text_(input.season, "season", 40, true),
    status: input.status === "closed" ? "closed" : "open",
  }));
  writeHistory_(actor, { kind: "bom", id: bom._id }, existing ? "updated" : "created", bom.name);
  return { bom: bom };
}

/**
 * { order: { bomId, projectId?, customName? } } -> { order, sections }
 * A new order is numbered in sequence: "Order 3", or "<project name> 2" when it belongs to a project.
 * It starts with the default vendor sections.
 */
function createOrder_(body, actor) {
  const input = body.order || {};
  const bom = bomGet_(COLLECTION_BOMS, input.bomId, "BOM");
  const projectId = text_(input.projectId, "project", 100, true);
  return withLock_(function () {
    const siblings = wixQuery_(COLLECTION_ORDERS, { bomId: bom._id }).filter(function (o) {
      return (o.projectId || "") === projectId;
    });
    const order = wixInsert_(COLLECTION_ORDERS, {
      bomId: bom._id,
      projectId: projectId,
      sequence: siblings.length + 1,
      customName: text_(input.customName, "order name", 80, true),
      createdAt: new Date().toISOString(),
    });
    const sections = DEFAULT_VENDORS.map(function (vendor, i) {
      return wixInsert_(COLLECTION_SECTIONS, newSection_(order._id, vendor, i));
    });
    writeHistory_(actor, { kind: "order", id: order._id }, "created", order.customName || "");
    return { order: order, sections: sections };
  });
}

function newSection_(orderId, vendor, sortOrder) {
  return {
    orderId: orderId, vendor: vendor, sortOrder: sortOrder,
    approval: null, orderedBy: null, orderDate: "", finalTotal: null, expectedArrival: "",
  };
}

/** { orderId, vendor } -> { section } */
function addSection_(body) {
  const order = bomGet_(COLLECTION_ORDERS, body.orderId, "order");
  const vendor = text_(body.vendor, "vendor name", 80);
  const existing = wixQuery_(COLLECTION_SECTIONS, { orderId: order._id });
  if (existing.some(function (s) { return s.vendor.toLowerCase() === vendor.toLowerCase(); })) {
    throw apiError_("bad-request", "This order already has a section for " + vendor + ".");
  }
  return { section: wixInsert_(COLLECTION_SECTIONS, newSection_(order._id, vendor, existing.length)) };
}

// ---------------------------------------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------------------------------------

/** { line: { _id?, sectionId, name, link, vendorPartNumber, unitCost, quantity, comments } } -> { line, signaturesCleared } */
function saveLine_(body, actor) {
  const input = body.line || {};
  const existing = input._id ? bomGet_(COLLECTION_LINES, input._id, "line") : null;
  if (existing && existing.orderedAt) throw apiError_("conflict", "This line was already ordered and can't be changed.");
  const section = bomGet_(COLLECTION_SECTIONS, existing ? existing.sectionId : input.sectionId, "vendor section");
  const quantity = Math.floor(Number(input.quantity));
  if (!(quantity >= 1 && quantity <= 100000)) throw apiError_("bad-request", "Quantity must be 1 or more.");
  const line = Object.assign({}, existing, {
    sectionId: section._id,
    name: text_(input.name, "item name", 300),
    link: text_(input.link, "link", 2000, true),
    vendorPartNumber: text_(input.vendorPartNumber, "part number", 80, true),
    unitCost: money_(input.unitCost, "Item cost"),
    quantity: quantity,
    comments: text_(input.comments, "comments", 500, true),
  });
  // Changing what is being bought means the earlier signatures no longer apply.
  const changed = existing && ["name", "link", "unitCost", "quantity"].some(function (f) { return existing[f] !== line[f]; });
  const signaturesCleared = !!(changed && existing.signatures && existing.signatures.length);
  if (!existing) {
    line.requestedBy = person_(actor);
    line.signatures = [];
    line.orderedAt = "";
    line.receivedQty = 0;
    line.receivedAt = "";
    line.receivedBy = null;
  } else if (signaturesCleared) {
    line.signatures = [];
  }
  const saved = wixSave_(COLLECTION_LINES, line);
  const what = existing ? (signaturesCleared ? "edited (signatures removed)" : "edited") : "added";
  writeHistory_(actor, { kind: "bomLine", id: saved._id }, what, saved.quantity + " x " + saved.name);
  return { line: saved, signaturesCleared: signaturesCleared };
}

/** { lineId } -> {}. Only a line nobody has signed can be removed. */
function removeLine_(body, actor) {
  const line = bomGet_(COLLECTION_LINES, body.lineId, "line");
  if (line.orderedAt || (line.signatures || []).length) {
    throw apiError_("conflict", "A signed or ordered line can't be removed. A lead can reopen it first.");
  }
  wixRemove_(COLLECTION_LINES, line._id);
  writeHistory_(actor, { kind: "bomLine", id: line._id }, "removed", line.name);
  return {};
}

/** { lineId } -> { line }. A Lead takes a line back to "not signed, not ordered", for example after a mistake. */
function reopenLine_(body, actor) {
  const line = bomGet_(COLLECTION_LINES, body.lineId, "line");
  if (line.receivedQty > 0) throw apiError_("conflict", "This line was already received.");
  const saved = wixSave_(COLLECTION_LINES, Object.assign({}, line, { signatures: [], orderedAt: "" }));
  writeHistory_(actor, { kind: "bomLine", id: line._id }, "reopened", line.name);
  return { line: saved };
}

/**
 * { lineIds: [...] } -> { signed: [lines], skipped: [{ lineId, reason }], total }
 * A Mentor or Booster signs many lines in one request. Lines that can't be signed are skipped with the reason,
 * so one bad line never blocks the rest. `total` is the cost of the lines that were signed, worked out here.
 */
function signLines_(body, actor) {
  const ids = Array.isArray(body.lineIds) ? body.lineIds.map(String) : [];
  if (!ids.length || ids.length > MAX_LINES_PER_REQUEST) {
    throw apiError_("bad-request", "Choose between 1 and " + MAX_LINES_PER_REQUEST + " lines.");
  }
  return withLock_(function () {
    const signed = [];
    const skipped = [];
    let cents = 0;
    ids.forEach(function (id) {
      const line = wixQuery_(COLLECTION_LINES, { _id: id }, 1)[0];
      const reason = cantSign_(line, actor);
      if (reason) return skipped.push({ lineId: id, reason: reason });
      const saved = wixSave_(COLLECTION_LINES, Object.assign({}, line, {
        signatures: (line.signatures || []).concat([person_(actor)]),
      }));
      writeHistory_(actor, { kind: "bomLine", id: id }, "signed", saved.signatures.length + " of " + SIGNATURES_NEEDED);
      signed.push(saved);
      cents += Math.round(saved.unitCost * 100) * saved.quantity;
    });
    return { signed: signed, skipped: skipped, total: cents / 100 };
  });
}

/** Why this person can't sign this line, or "" when they can. */
function cantSign_(line, actor) {
  if (!line) return "The line no longer exists.";
  if (line.orderedAt) return "Already ordered.";
  const signatures = line.signatures || [];
  if (signatures.length >= SIGNATURES_NEEDED) return "Already has two signatures.";
  if (signatures.some(function (s) { return s.memberId === actor.id; })) return "You already signed this line.";
  if (!line.name || !(line.quantity >= 1)) return "The line isn't filled in yet.";
  return "";
}

// ---------------------------------------------------------------------------------------------------------
// Ordering and receiving
// ---------------------------------------------------------------------------------------------------------

/** { sectionId } -> { section }. A Mentor or Booster gives "Approval to Order" for one vendor section. */
function approveSection_(body, actor) {
  const section = bomGet_(COLLECTION_SECTIONS, body.sectionId, "vendor section");
  const saved = wixSave_(COLLECTION_SECTIONS, Object.assign({}, section, { approval: person_(actor) }));
  writeHistory_(actor, { kind: "bomSection", id: section._id }, "approved to order", section.vendor);
  return { section: saved };
}

/**
 * { sectionId, orderDate, finalTotal, expectedArrival? } -> { section, ordered: [lines], notReady }
 * Marks every fully signed line of the section as ordered and records what was really paid (with tax and
 * shipping). Lines without two signatures are left alone and counted in `notReady`. Can be sent again to
 * correct the total or the dates.
 */
function markOrdered_(body, actor) {
  return withLock_(function () {
    const section = bomGet_(COLLECTION_SECTIONS, body.sectionId, "vendor section");
    if (!section.approval) throw apiError_("conflict", "This section needs Approval to Order first.");
    const lines = wixQuery_(COLLECTION_LINES, { sectionId: section._id });
    const ready = lines.filter(function (l) { return !l.orderedAt && (l.signatures || []).length >= SIGNATURES_NEEDED; });
    const already = lines.filter(function (l) { return l.orderedAt; });
    if (!ready.length && !already.length) throw apiError_("conflict", "No line in this section has two signatures yet.");
    const now = new Date().toISOString();
    const ordered = ready.map(function (line) {
      writeHistory_(actor, { kind: "bomLine", id: line._id }, "ordered", line.name);
      return wixSave_(COLLECTION_LINES, Object.assign({}, line, { orderedAt: now }));
    });
    const saved = wixSave_(COLLECTION_SECTIONS, Object.assign({}, section, {
      orderedBy: person_(actor),
      orderDate: text_(body.orderDate, "order date", 10),
      finalTotal: money_(body.finalTotal, "The final total"),
      expectedArrival: text_(body.expectedArrival, "expected arrival", 10, true),
    }));
    writeHistory_(actor, { kind: "bomSection", id: section._id }, "ordered", section.vendor + " $" + saved.finalTotal);
    return { section: saved, ordered: ordered, notReady: lines.length - ready.length - already.length };
  });
}

/**
 * { items: [{ lineId, quantity }] } -> { lines }
 * Records that ordered items arrived. Part of a line can be received ("6 of 10").
 */
function receiveLines_(body, actor) {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > MAX_LINES_PER_REQUEST) {
    throw apiError_("bad-request", "Choose between 1 and " + MAX_LINES_PER_REQUEST + " lines.");
  }
  return withLock_(function () {
    const lines = items.map(function (item) {
      const line = bomGet_(COLLECTION_LINES, String(item.lineId), "line");
      if (!line.orderedAt) throw apiError_("conflict", "'" + line.name + "' hasn't been ordered yet.");
      const quantity = Math.floor(Number(item.quantity));
      const left = line.quantity - (line.receivedQty || 0);
      if (!(quantity >= 1 && quantity <= left)) {
        throw apiError_("bad-request", "'" + line.name + "' has " + left + " left to receive.");
      }
      const saved = wixSave_(COLLECTION_LINES, Object.assign({}, line, {
        receivedQty: (line.receivedQty || 0) + quantity,
        receivedAt: new Date().toISOString(),
        receivedBy: person_(actor),
      }));
      writeHistory_(actor, { kind: "bomLine", id: line._id }, "received", saved.receivedQty + " of " + saved.quantity);
      return saved;
    });
    return { lines: lines };
  });
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
function importOrder_(body, actor) {
  const bom = bomGet_(COLLECTION_BOMS, body.bomId, "BOM");
  const sections = Array.isArray(body.sections) ? body.sections : [];
  const lineCount = sections.reduce(function (n, s) { return n + (Array.isArray(s.lines) ? s.lines.length : 0); }, 0);
  if (!lineCount || lineCount > 500) throw apiError_("bad-request", "An import needs between 1 and 500 lines.");
  const imported = function (name) { return { memberId: "", name: name, at: "", imported: true }; };
  return withLock_(function () {
    const plain = wixQuery_(COLLECTION_ORDERS, { bomId: bom._id }).filter(function (o) { return !o.projectId; });
    const order = wixInsert_(COLLECTION_ORDERS, {
      bomId: bom._id, projectId: "", sequence: plain.length + 1,
      customName: text_(body.customName, "order name", 80, true),
      createdAt: new Date().toISOString(),
    });
    sections.forEach(function (input, i) {
      const approvalName = text_(input.approvalName, "approval", 80, true);
      const section = wixInsert_(COLLECTION_SECTIONS, Object.assign(newSection_(order._id, text_(input.vendor, "vendor", 80), i), {
        approval: approvalName ? imported(approvalName) : null,
        orderDate: text_(input.orderDate, "order date", 40, true),
        finalTotal: input.finalTotal === null || input.finalTotal === undefined ? null : money_(input.finalTotal, "Store total"),
      }));
      (input.lines || []).forEach(function (l) {
        const quantity = Math.floor(Number(l.quantity));
        if (!(quantity >= 1)) throw apiError_("bad-request", "Quantity must be 1 or more.");
        wixInsert_(COLLECTION_LINES, {
          sectionId: section._id,
          name: text_(l.name, "item name", 300),
          link: text_(l.link, "link", 2000, true),
          vendorPartNumber: text_(l.vendorPartNumber, "part number", 80, true),
          unitCost: money_(l.unitCost, "Item cost"),
          quantity: quantity,
          comments: text_(l.comments, "comments", 500, true),
          requestedBy: imported("Imported from a sheet"),
          signatures: (Array.isArray(l.signatureNames) ? l.signatureNames : []).slice(0, SIGNATURES_NEEDED).map(function (n) {
            return imported(text_(n, "signature", 80));
          }),
          orderedAt: l.ordered || l.received ? "imported" : "",
          receivedQty: l.received ? quantity : 0,
          receivedAt: "",
          receivedBy: null,
        });
      });
    });
    writeHistory_(actor, { kind: "order", id: order._id }, "imported", lineCount + " lines");
    return { order: order };
  });
}
