# BOM app (`/apps/bom`): plan

> **Plan only, not built.** Part of the [Team Operations plan](README.md). Source: issues
> [#147](https://github.com/Team-6220/team6220.org/issues/147) and
> [#156](https://github.com/Team-6220/team6220.org/issues/156), and the BOM sheets in Google Drive ("BOM Template",
> "2026 Offseason BOM", "2026 Competition BOM").
>
> "BOM" here means what the team's sheets mean: the **list of things to buy**, grouped into orders.

## What it replaces

One Google Sheet per season (for example "2026 Offseason BOM"). Each **tab is one order** ("Order 1", "Summer Bot
(Order 2)", "Order 5 (Super Pit)", "Mouser Order"). Inside a tab, lines are grouped under **vendor headings**:
Amazon, McMaster-Carr, AndyMark, REV Robotics, The ThriftyBot, WestCoast Products, Ganahl Lumber (in-person) and
Single Items. Columns:

`Item Name · Link · Item Cost · Qty · Cost · Two Mentor Signature (two columns) · Ordered · Received · Store Subtotal
· Store Total · Total · Comments`

Each vendor block also has an **Order Date** and an **Approval to Order** cell, a subtotal (before tax and shipping)
and a total (what was really paid). The tab shows a grand total. The Mouser tab adds a vendor part number column.

## Words

| Word | Meaning |
| --- | --- |
| BOM | One season's purchasing: "2027 Competition BOM" |
| Order | One round of buying inside a BOM (a tab today) |
| Vendor section | The lines for one vendor inside an order |
| Line | One item: name, link, unit cost, quantity |
| Catalog item | A remembered thing the team buys, with its supplier options and last prices |
| Saved list | A reusable set of catalog items ("common items", "kickoff order") |

**Order names.** By default orders are numbered in sequence: `Order 1`, `Order 2`. An order can belong to a project,
and is then named after it with its own count: `Summer Bot 1`, `Summer Bot 2`. Or it can have a custom name
("Mouser Order").

## Roles

| Who | Can |
| --- | --- |
| Team Member | See BOMs; add, edit and remove lines that are not yet signed; comment; mark lines received |
| Mentor (badge, #156) | Sign lines. Two **different** mentors are needed per line |
| Supervisor (badge, #156) | Give "Approval to Order", mark vendor sections ordered, enter order date and the final total |
| Lead | Create BOMs and orders, edit saved lists, reopen a signed line |

Mentor and Supervisor are new Wix badges and give no other permissions (#156). These checks are real: they run in
the backend, not only in the browser ([ARCHITECTURE.md](ARCHITECTURE.md#who-can-do-what)).

## A line's life

```
Draft ─▶ Signed 1/2 ─▶ Signed 2/2 (approved) ─▶ Ordered ─▶ Received (all or part) ─▶ in Inventory / not tracked
  ▲           │
  └── edited ─┘   changing the item, link, cost or quantity of a signed line removes its signatures
```

- A line needs a name, a link (or "in person"), a unit cost and a quantity before it can be signed.
- A mentor cannot sign the same line twice. A mentor who added a line may sign it; the second signature must be
  someone else.
- Only approved lines can be marked Ordered. A vendor section also needs a supervisor's Approval to Order.
- Editing a signed line clears its signatures and says so before saving, so nobody approves one price and orders
  another.

### Signing many lines at once

Mentors rarely sign one line at a time, so (decision 5):

- **Drag** down the signature column to select a run of lines.
- **Click** one line, then **shift-click** another to select everything between them.
- **Sign section** on a vendor heading, or **Sign order** at the top.
- Then one **Sign selected (12 lines, $431.20)** button with a confirm step that lists the lines and the total.
- On a phone: long-press to start selecting, then tap or drag.

Lines the mentor has already signed, or that are not ready, are skipped and counted in the confirm step.

### Ordering

The supervisor's view of a vendor section has:

- **Open all links** for that vendor (#147), and a copyable list of part numbers and quantities.
- A short checklist for whoever is ordering, including future booster volunteers (#147): the options (size, color,
  pack count) match the line; the price matches; then enter the **final total including tax and shipping**.
- **Mark ordered**: sets the order date, who ordered, the final total and, if known, the expected arrival date.
- If the price at checkout is different from the signed price by more than a small amount (**Proposed:** $5 or 5%),
  the line goes back for signatures.

### Receiving into Inventory

Marking lines **Received** opens a confirm step (decision 14). For each line:

| The line is | The step offers |
| --- | --- |
| Linked to an Inventory item | "Add 10 to *Anderson Battery Connector* (now 4 → 14)". The quantity can be changed for a short shipment |
| Not linked, but a similar Inventory item exists | Pick the match, or create a new item |
| Not linked | **Create Inventory item**, prefilled with name, supplier and link; the member picks category and location |
| A consumable or a one-off | **Don't track** |

Part of an order can be received; the line then shows "6 of 10 received". A pack ("100-pack zip ties, qty 3") asks
how many units to add.

## Adding lines faster

- **Catalog and remembered prices** (decision 17). Every received line teaches the catalog: item, vendor, link, last
  price paid and date. Typing a name suggests catalog items. An item with several supplier options shows them side
  by side with the cheapest known price marked, and the member chooses.
- **From Inventory:** a low-stock item has **Add to BOM**, which uses its catalog entry.
- **From a task or the cut planner:** **Add to BOM** for a shortfall, with a link back to the task or part.
- **Saved lists:** "Buy common items" opens a saved list with quantities to adjust, then adds the chosen lines to an
  order. Lists can be marked as suggested for a time of year (kickoff, before first event), which is how this plan
  reads "default BOM orders for certain times" in #147 (open question 3).
- **Paste a link:** the vendor is guessed from the link's website and long tracking parameters are trimmed from
  Amazon links.
- **New vendor:** adding a vendor adds a section; vendors are shared with Inventory's supplier list.

## Export and import

- **Export** one order or a whole BOM as CSV or XLSX in **exactly today's layout**: the same columns in the same
  order, vendor heading rows, the Order Date and Approval to Order cells, Store Subtotal, Store Total and the grand
  total, with one tab per order in the XLSX. Signatures export as the mentors' names ("Tamas V"), as in the sheets.
  A test compares the export of an imported 2026 BOM with the original sheet.
- **Import** an existing BOM sheet (downloaded as XLSX or CSV): the importer reads tabs as orders and heading rows
  as vendors, shows what it understood, and saves after a confirm step. Imported signatures are kept as text and
  marked "imported", since they were not made by a signed-in mentor.
- The website is the source of truth. There is no live sync with Google Sheets (decision 6).

## Connections

| With | How |
| --- | --- |
| Inventory | Receiving adds stock or creates items; low stock starts lines; suppliers are one shared list; an item page shows its open BOM lines |
| Tasks | A task's "needs materials" can point at a line and shows its state; a project page shows its orders and what was spent |
| Production | The cut planner can start a line for missing stock |
| Apollo | Reads BOMs and totals, adds draft lines, reports "what is waiting for signatures" and "what was ordered but not received". Apollo can never sign, approve or mark ordered |

## Money shown

Per vendor section: subtotal of lines, final total paid. Per order and per BOM: total requested, approved, ordered
and received. Per project: total across its orders. **Proposed:** a budget amount per BOM with a bar showing what is
left.

## Not in the first release

Live prices and shipping estimates, receipt uploads and tax categories, a cart-filling agent, live Google Sheets
sync, vendor accounts or payment of any kind. The app never stores card numbers or vendor passwords.

## Done means

- A mentor can sign thirty lines in one action by dragging or shift-clicking, and cannot provide both signatures
  for a line.
- A line cannot be marked Ordered without two mentor signatures, even by someone calling the backend directly.
- Receiving a linked line raises the Inventory count with no second entry.
- The exported file for an imported 2026 order matches the original sheet's layout cell for cell.
- Someone who has never ordered for the team can place a vendor order using only the app's checklist.
