# Production app (`/apps/production`): plan

> **Plan only, not built.** Part of the [Team Operations plan](README.md). Source: issue
> [#207](https://github.com/Team-6220/team6220.org/issues/207), the "Production Form" and "Production List" in
> Google Drive, the "Production Tracker/To do list" doc, and the cut planner that already exists inside Inventory
> ([DATA-MODEL.md](../../apps/inventory/docs/DATA-MODEL.md)).
>
> Issue #207 suggests the name "Production" in place of "Production Tracker". This plan uses **Production**.

## What it replaces

| Today | Becomes |
| --- | --- |
| Production Form (Google Form) | **Design → Request a part** |
| "Production List" sheet (Status, Manufacturer, Submitted, Designer, Part Name, CAD Link, Project, Materials, Quantity, Accuracy, Priority, Due Date, Method, Files) | **Manufacturing → Tracker** |
| "To do list" doc where people type their name next to a part and "(unfinished)" | Claiming a part, and handing it back with a note |
| Cut planner and "Mark as cut" inside Inventory (`inventory_production`) | **Manufacturing → Cut planner** and **Confirm cut** |
| A free cut-list website (like opticutter.com) for manual planning | **Manufacturing → Cut optimizer** |

## Layout

Two main sections (from #207). Which screen goes in which section was set by the team on Nov 12, 2026 and differs
from the issue: cutting belongs to Manufacturing, printing to Design.

```
/apps/production
  Design          Request a part · Import from Onshape / STL · Print queue · My requests
  Manufacturing   Tracker · Shapeoko pending · Cut planner · Cut optimizer
```

Every Team Member can use every screen, including Shapeoko setup. There are no Production badges. The app records
who did each step.

## A part

| Field | Notes |
| --- | --- |
| Number | `PR-0123`, given by the server (kept from Inventory's `PR` prefix) |
| Part name | "Same as CAD", as the form says |
| Designer | The signed-in member who submitted it |
| Project | From the shared project list (`p10`) |
| Task | Optional link to a task (`t42`) |
| CAD link, files | Onshape link; files stay in Google Drive or Onshape as links (Migration Plan) |
| Material | Material type and thickness, from Inventory's lists (aluminum sheet, polycarbonate, tube, hex shaft, filament...) |
| Size | Length and width (flat parts and tube), or length (shaft) |
| Quantity | Each copy is tracked, so 3 of 4 can be done |
| Method | **Handmade**, **Shapeoko (CNC)**, **3D print**, **Lathe / other** |
| Accuracy | Tolerance, as on the form |
| Priority, due date | As on the form |
| Important details | Free text |
| Stock piece | The Inventory raw material chosen by the cut planner |
| Status | See below |
| Manufacturer(s) | Everyone who worked on it, in order, with "finished" or "unfinished" and a note |

### Status

```
Requested ─▶ (Shapeoko only) Pending setup ─▶ Ready ─▶ In progress ─▶ Cut / Printed ─▶ Done
                                                          │  ▲
                                                          ▼  │
                                                     Handed back (unfinished, with a note and where the piece is)
any state ─▶ Cancelled
```

- **Pending setup** (Shapeoko): a member who knows the Shapeoko sets the real stock size and toolpath, attaches the file, then
  moves it to Ready (#207). The app records who released it.
- **In progress:** a member taps **Claim**. Their name is stored even if they do not finish, which is what the
  to-do doc did by hand.
- **Handed back:** the member says it is unfinished, why, and where they left it.
- **Cut / Printed:** see [Confirm cut](#confirm-cut-updates-inventory). **Done** is after any finishing (deburr,
  tap, bend) and a check against the accuracy.

## Design section

### Request a part

One form, short on a phone. It replaces the Google Form and never breaks the tracker's headings. Material, method
and project are pickers, not typing. A designer can submit several parts at once.

### Import from Onshape or an STL

- **Onshape:** paste a document link. The backend reads the parts list with names, materials and bounding sizes
  (API keys stay in the backend). The designer ticks the parts to request, fixes names, picks a method for each and
  submits. Each part keeps its Onshape link.
- **STL:** upload a file. The app reads it in the browser, shows a preview and the bounding size, and prefills the
  form. The file itself is linked from Drive, not stored in Wix.
- Working out the 2D outline of each flat part from an STL and nesting it automatically is **not** in this release
  ([#220](https://github.com/Team-6220/team6220.org/issues/220), label `later`). Until then flat parts use their bounding rectangle or a DXF drawn by the designer.

### Print queue

A separate screen for 3D printed parts: file link, filament type and color, printer, estimated time and grams,
order in the queue, who started it and when, result (printed, failed and why). Failed prints go back in the queue.
Starting or watching a printer from the app comes later.

## Manufacturing section

### Tracker

One list with filters (#207): material (sheet metal, polycarbonate, hex shaft, tube, 3D print), method, project,
status, priority, "mine", "unclaimed". Sorted by priority, then due date. Each row shows part name, quantity done,
material, method, who has it and the due date; opening it shows everything, the cut layout and the history.

Big buttons for the shop floor: **Claim**, **Hand back**, **Confirm cut**, **Done**.

### Shapeoko pending

The list of Shapeoko parts waiting for setup. Any member can set the stock size, attach the
toolpath and release a part to Ready. Everyone can see the list.

### Cut planner

Moved from Inventory and rebuilt in React. It works on the parts designers have requested.

- For **tube** (and shafts): a 1D plan that fits the requested lengths into the stock lengths in Inventory with the
  least waste, allowing for the saw's kerf.
- For **flat parts on polycarbonate or aluminum sheet**: a 2D plan that places rectangles (or traced outlines the
  planner already supports) on the stock pieces in Inventory, choosing pieces with the least waste.
- The member planning the cuts picks requested parts from the tracker, sees the proposed layout drawn to scale, can
  change which stock piece is used, and confirms. Handmade parts become **Ready**; Shapeoko parts land in
  **Pending setup**. Parts can also be typed straight into the planner, named there, and added to the tracker.
- Stock that is whole (rectangles, full lengths) is preferred over odd scraps, and the stock list can be filtered
  the same way (#207).
- **PDF / print export** of the cut list and layout for the shop.

### Cut optimizer

The same engine on its own page: type stock sizes and part sizes by hand, get a layout and a printable cut list,
with nothing saved to the tracker or Inventory. This replaces the free website for one-off jobs.

The engine is a small package with no screen code, so the planner, the optimizer page and tests all share it. It
starts from the geometry already in Inventory (`JsPlanner.html`, `JsGeometry.html`) and uses open-source packing
code where that is better ([ARCHITECTURE.md](ARCHITECTURE.md#cut-engine)).

### Confirm cut updates Inventory

When a member confirms a cut that used a stock piece:

1. They check or correct the leftover shapes the planner predicted (or tap "no usable leftover").
2. Inventory's raw material is replaced by the leftover pieces. This is the existing "Mark as cut" rule, reused.
3. The leftovers are flagged **check at next audit** unless the member measured them right then (#207).
4. Other planned parts that were placed on that stock piece are moved to a leftover if they still fit, or sent back
   to the planner if they do not.

Parts cut from stock that is not in Inventory (a member brought their own piece) skip steps 2 to 4.

## Connections

| With | How |
| --- | --- |
| Inventory | Reads raw materials, material lists and locations; writes leftovers on Confirm cut. Inventory's Raw Materials tab gets a **Plan cuts** link here and loses its own planner |
| Icarus | A part can belong to a task and a project; the task shows the part's status. A part's due date defaults to its task's due date |
| BOM | If no stock piece fits, the planner offers **Add to BOM** for the material |
| Apollo | Lists parts by status, creates requests, reports "what is unclaimed and due this week" |

## Moving the existing data

- `inventory_production` rows (cut-planner jobs) are copied into the new `production_parts` collection once, keeping
  their `PR` numbers. Inventory's planner keeps working until the new one has been used at a real meeting, then it
  is removed from Inventory's screen (the same rule Inventory used for the old Apps Script app).
- The Production List sheet has no rows today, so nothing is imported from it. Old production tracker sheets stay in
  Drive as history.

## Not in the first release

Automatic 2D outlines and nesting from STL files, printer hookup, G-code generation, machine time estimates,
tool wear tracking.

## Done means

- A designer can request a part from a phone in under a minute, and from an Onshape link without retyping sizes.
- A manufacturer can see what to make next, claim it, and hand it back unfinished with a note.
- Confirming a cut changes the stock piece in Inventory with no second entry.
- A Shapeoko part shows who set it up and released it.
- The cut planner's result for a test set of tubes and plates wastes no more material than the Inventory planner
  does today.
