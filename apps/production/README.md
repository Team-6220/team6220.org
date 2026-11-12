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

## Not built yet

- **Cut planner** and **Cut optimizer** (the screens are there and point to Inventory's planner for now), and
  updating Inventory stock on **Confirm cut**.
- Import from **Onshape** or an **STL**.
- Materials from Inventory's lists (the form offers a fixed list and accepts any text).
- Tracking each copy of a part separately ("3 of 4 done"). A part is claimed and finished as a whole for now.
- **Add to BOM** when stock is missing (that needs the cut planner).
- Copying Inventory's old cut-planner jobs (`inventory_production`) into this app.

## Where things are

```
apps/production/src/
  Production.tsx    loads parts, the Design / Manufacturing screens, the tracker's filters
  RequestForm.tsx   Design > Request a part
  PartCard.tsx      one part and the buttons for its next steps
  production.css
packages/data/src/production/
  index.ts          listParts, requestParts, step
  rules.ts          the life of a part: newPart, release, claim, handBack, markCut, failPrint, markDone, cancel
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
