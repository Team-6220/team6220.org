# Production (`/apps/production`)

Parts from request to finished. It replaces the Production Form (Google Form), the "Production List" sheet and the
to-do doc where people typed their name next to a part. The plan is in
[docs/operations/PRODUCTION.md](../../docs/operations/PRODUCTION.md).

## What is built

Two sections, as the team decided (Nov 12, 2026):

- **Design**
  - **Request a part**: the form's fields (name as in CAD, method, material, size, quantity, accuracy, priority, due
    date, project, CAD link, files, details).
  - **My requests**.
  - **Print queue**: 3D printed parts with filament, color, print time and grams; a failed print goes back in the
    queue with the reason.
- **Manufacturing**
  - **Tracker**: everything open, most urgent first, with filters (nobody has it / I have it, method, material).
    Big buttons: **Claim**, **Hand back** (what is left, where the piece is), **Confirm cut**, **Done**.
  - **Shapeoko pending**: Shapeoko parts wait here until someone writes the stock size and where the toolpath is.

A part requested from an Icarus task ("Request a part for this task") is linked to it: the task shows the part's
status and the part links back.

Every Team Member can do every step. Each step is written to the history log under the person who did it, and a
part keeps the name of everyone who worked on it, including people who did not finish.

## Cutting (step 5)

- **Manufacturing → Cut planner** works on Inventory's real raw stock. Choose the material, thickness and how it is
  cut; tick requested parts of that thickness from the tracker and/or type parts in. It draws each stock piece to scale
  with the new parts and the spots already reserved, lists the cuts, and **Reserve these spots** saves them. Typed
  parts become Production requests. **Print the cut list** prints only the drawings and the list.
- **Confirm cut** on a part with reserved spots also updates Inventory: the stock piece becomes what is left of it,
  other parts planned on it move to the leftover they sit on, and leftovers are flagged to be measured at the next
  audit. **Cancel part** gives its spots back.
- **Manufacturing → Cut optimizer** is the same engine on its own, for quick questions: sheets and plates (2D) or
  tube and shaft (1D, allowing for the saw blade). Nothing is saved. Rows can be pasted from a spreadsheet.
- **Request a part → Fill in the size from an STL file** reads the file in the browser and fills in length, width and
  thickness (choose whether it was exported in inches or millimetres).

The planner reserves spots as Inventory cut jobs (the same jobs Inventory's own planner makes) and confirms cuts with
Inventory's own "Mark as cut" rule, so the two planners always agree and the rule that changes stock exists once. The
geometry is `packages/cut-engine`, a port of Inventory's planner that is tested to give the same answers.

## Not built yet

- Import from **Onshape** (needs the team's Onshape API keys on a server).
- Working out a flat part's outline from an STL and nesting outlines, not rectangles: [#220](https://github.com/Team-6220/team6220.org/issues/220), label `later`.
- The planner uses one cut method for the whole plan; parts requested with the other method are planned with the
  chosen one.
- Tube and shaft in the Cut planner itself (Inventory stores tube as rectangles, so the 2D planner handles it; the
  1D planner is in the Cut optimizer).
- Removing the old planner from Inventory's own screen. Both planners share the same reservations, so they can live
  side by side until the team is happy with this one.
- Tracking each copy of a part separately ("3 of 4 done"). A part is claimed and finished as a whole.
- Copying Inventory's old cut-planner jobs into Production parts (they keep working in Inventory).

## Where things are

```
apps/production/src/
  Production.tsx    loads parts, the Design / Manufacturing screens, the tracker's filters
  RequestForm.tsx   Design > Request a part
  PartCard.tsx      one part and the buttons for its next steps
  CutPlanner.tsx    Manufacturing > Cut planner (Inventory stock)
  CutOptimizer.tsx  Manufacturing > Cut optimizer (typed stock, nothing saved)
  PieceDrawing.tsx  a stock piece drawn to scale with its parts
  production.css
packages/cut-engine/                the geometry: 2D sheets, leftovers, 1D tube (see its README)
packages/data/src/inventory/cutting.ts   Inventory's stock and cut jobs, for the planner
packages/data/src/production/
  index.ts          listParts, requestParts, step
  rules.ts          the life of a part: newPart, release, claim, handBack, markCut, failPrint, markDone, cancel
  stl.ts            reads an STL file's size
  mock.ts           demo parts, one in every stage
```

There is no Production code in the ops API: parts are written straight to Wix by members (collection
`production_parts`), and only the PR number and the history lines come from the server. The steps in `rules.ts` are
plain functions that take a part and return the changed part, so they are easy to read and to test.

## Run it

```sh
pnpm dev                                 # http://localhost:4321/apps/production  (demo data)
pnpm --filter @team6220/data test        # the steps of a part's life
```

## Going live

See [docs/operations/SETUP.md](../../docs/operations/SETUP.md).
