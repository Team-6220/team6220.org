# BOM (`/apps/bom`)

What the team is buying. It replaces the BOM Google Sheets (one sheet per season, one tab per order). The plan and
the reasons behind the rules are in [docs/operations/BOM.md](../../docs/operations/BOM.md).

## What is built

- BOMs, orders (named `Order 3`, `<project> 2` or a custom name) and vendor sections, laid out like the sheet.
- Adding, editing and removing lines.
- **Two signatures per line**, from two different people, each a Mentor or a Booster. To sign many lines: tick
  them, shift-click from one to another, drag down the tick boxes, or use **Choose section** / **Choose all I can
  sign**, then **Sign chosen**.
- **Approval to Order** per vendor, then **Mark ordered** with the buyer's checklist, order date and final total.
- **Receive**, in full or in part.
- **Open all links** for a vendor.
- **Export** an order as CSV in the old sheet's layout, and **import** a tab of an old sheet (CSV).
- Supervisors can look and change nothing.

## Not built yet

These are in the plan and come with later build steps:

- Adding received items to Inventory, the catalog of remembered prices, saved lists, **Add to BOM** from Inventory
  and from tasks (step 4).
- XLSX export with one tab per order, and exporting a whole BOM at once.
- Sending a line back for signatures when the checkout price differs.
- A budget per BOM.

## Where things are

```
apps/bom/src/
  Bom.tsx          loads who is looking; picks the BOM and the order; new BOM, new order, import, export
  OrderView.tsx    one order: a table per vendor and every action on lines and sections
  LineForm.tsx     the add / edit form for a line
  OrderForm.tsx    the buyer's checklist and "mark ordered" form
  useSelection.ts  tick, shift-click and drag selection of rows
  bom.css
packages/data/src/bom/
  index.ts         the functions the screens call
  rules.ts         small helpers: costs, line states, order names
  export.ts        an order -> the rows of the team's sheet
  import.ts        a sheet tab (CSV) -> an order
  mock.ts          demo data and the demo copy of the rules
backend/apps-script/ops-api/Bom.gs   the real rules (who may sign, order, receive)
```

The rules exist twice, in `Bom.gs` (real) and `mock.ts` (demo). `packages/data/test/bom-rules.test.ts` runs the same
checks against both, so change them together and that test will tell you if they drift apart.

## Run it

```sh
pnpm dev                                 # http://localhost:4321/apps/bom  (demo data, signed in as a lead)
pnpm --filter @team6220/data test        # the rules, the sheet layout
```

Add `?demo=mentor`, `booster`, `member`, `lead`, `supervisor`, `pending` or `signed-out` to see each role. Demo
data resets when the page reloads.

## Going live

See [docs/operations/SETUP.md](../../docs/operations/SETUP.md). Until the ops API is deployed and its URL is in
`packages/data/src/config.ts`, the deployed page shows "Not connected to the team server yet".
