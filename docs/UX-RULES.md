# UX rules for the team apps

How every team app should behave. These came out of the redesign prototype (Home, Calendar, Icarus, Attendance, Inventory, BOM, Production, WingIt, and the site editor) and the review comments on it. Colors, fonts and logos live in [BRANDING.md](BRANDING.md); this file is only about interaction and layout.

If a rule here and a screen disagree, fix the screen, or change the rule in the same PR so the next person sees why.

## 1. Icons over words

- Use an icon (with a tooltip and `aria-label`) instead of a text button whenever the icon is widely understood: trash = remove, pencil = edit, magnifying glass = search or zoom, check = mark done, plus = add, bomb/BOM mark = add to BOM, drill = Production.
- Words are fine where an icon would be ambiguous or the action is rare and important (for example "Open pull request", "Finalize order"). Primary page actions keep a label.
- Destructive actions are always a trash icon, never the word "Remove" or "Delete" in a row. Confirm when it cannot be undone.
- The same icon means the same thing in every app. The rail icon for an app is also its logo inside that app (Icarus = the wing, Production = the drill).
- Do not use an icon and a label that say the same thing side by side, except in the sidebar.

## 2. Buttons, inputs and chips

- Buttons and inputs use the Jura font. Do not let the browser default leak through.
- **Chips are filters or statuses, not navigation.** A row of chips is one choice (or a multi-choice) over the list below it: "All subteams / My subteam / Hide done". Do not use chips for page tabs; use tabs.
- **Tabs switch the content of a page** (Open / Closed, Edit / Review / Order). Selecting one never changes data.
- A status chip is also a control: clicking it opens the allowed next statuses. Do not make the user find a separate "change status" screen.
- A **toggle** (checkbox switch) turns a view option on or off and never saves anything: "Show subtasks", "Show owners", "Just my tasks". Put it next to the filters it affects. Remember the choice per person when it is a preference.
- A task that is done is marked with an explicit "Mark done" icon button with a "Mark done" label in the table header. A bare checkbox is not clear enough.
- A required field that is not filled in disables the action it blocks and says why, instead of failing after the click.
- Dropdowns that choose between big things (which BOM, which season) sit in the top bar of the app, with "+ New …" as the last entry of the dropdown rather than a separate button.

## 3. Lists and tables

- Newest or most urgent first. Group by something people recognize (day, project, subteam), with a small heading and a count: "Season tasks · 6".
- Column headers show sort and filter arrows; clicking one opens a small menu (Sort A to Z, Group by …).
- Rows that can be done show the same icon button in the same last column in every table.
- Empty groups are hidden when a filter would leave them with nothing ("Just my tasks" hides a project you have no tasks in).
- Sub-items (subtasks, sub-items in a packing list) are drawn with tree lines: a vertical line down the left and a short horizontal line into the name, stopping at the middle of the last child. Do not use arrows or plain indentation alone.
- Ids (`t14`, `p2`, `#243`) are coloured by what they are (see "Projects" below), link to their page, and never get covered by other text.
- Phone: every table becomes a stack of cards with the same title, status and actions. Nothing may need horizontal scrolling.

## 4. Click behavior

- A card or row that represents a place opens that place when clicked anywhere on it (Home's "Your tasks" opens Tasks; "Team meeting" opens the calendar; "Parts to make" opens that Production page). Inner buttons still work and do not also open the card.
- Clicking empty space pins or unpins the sidebar. It never triggers an action.
- Double click edits in place (names, notes, categories). Enter saves, Escape cancels.
- Click a category or group name to rename it. No separate "Rename" button.
- Clicking a count or progress bar that summarizes a list opens that list.
- Ctrl/Cmd-click and middle-click open links in a new tab wherever the real site would.

## 5. Drag behavior

- Anything with an order or a date can be dragged: Kanban cards between columns (changes status), Gantt bars (move) and their ends (resize), table rows (reorder when order matters).
- Dragging is never the only way. Every drag has a keyboard or form equivalent (a status chip, a date field).
- Drag **select** is for tables you can copy from: dragging across rows or cells selects them, then Ctrl/Cmd+C copies and Ctrl/Cmd+V pastes (BOM order rows, spreadsheets-style tables).
- Show where the item will land while dragging, and a grab handle (⋮⋮) when the whole card is not draggable.
- Vertical scroll over a wide chart (the Gantt) scrolls it horizontally, so it is usable with a plain mouse wheel. Provide a fullscreen toggle for wide charts.
- A drop that changes shared data (moving a task's dates, changing status) shows a short undo, and `Ctrl+Z` works too.

## 6. Right-click and context menus

- Right-click on a row, bar or card opens the same actions as its "…" menu, and nothing that only exists in the right-click. Never rely on right-click alone: it does not exist on phones.
- Right-click on a selection (after drag select) acts on the whole selection: copy, paste, delete, add note.
- Menu items match the icons in section 1 and put the destructive one last, separated and red.
- On phone, long press opens the same menu.

## 7. Keybinds

- Keybinds are for fast repeat actions, never the only way in. Show a keybind in the tooltip where that makes sense (for example the New task button shows `T`). Not every keybind has something to hang a tooltip on; all of them are listed in Account → Keybinds.
- Plain letters work only when no field has focus. Inside a field, letters type.
- Defaults:
  - `T` new task, `P` new project (anywhere in the apps).
  - `S` opens the pins menu; with it open, `1…9` open that pin.
  - `Tab` hides or shows the menu panel (the sidebar). `F` hides or shows the app rail. `Ctrl+F` goes full screen anywhere.
  - `Ctrl+K` opens search.
  - `Ctrl+Z` undoes the last change (`Ctrl+Shift+Z` or `Ctrl+Y` redoes it). See section 13.
  - `Shift+1…9` jump to an app in rail order (`Shift+1` is Home). `Shift`+arrows move to the next or previous app.
  - `1…9` jump to that sidebar screen inside the current app, unless the pins menu is open. Arrow keys move between sidebar screens.
  - Esc closes the top-most pop-up, then clears the selection.
- Keybinds are configurable in Account → Keybinds (the word is "keybinds", not "hotkeys"). To change one, click it, then press the new key. Conflicts are shown right there. Each app lists its own keybinds (GoldSim included).
- Do not claim a key that browsers or the OS use (Ctrl+T, Ctrl+W, Ctrl+R, F5, F11).

## 8. Mentions and linking between things

- Typing `t`, `p`, `#` or `@` in a text box opens a picker for tasks, projects, issues or people. Wait briefly after the character before opening it, so normal typing is not interrupted.
- Anything that has an id is shown as that id plus its name everywhere, and the id is a link. Never show a bare number the reader cannot open.
- If a task or project mentions something that has no GitHub issue yet, offer "Create issue" (opens GitHub with the form prefilled, then shows a green dot once linked). Do not create issues without the user's click.
- Never mark a GitHub issue as done from the apps without the user doing it explicitly.

## 9. How apps work together

- **One source of truth.** A task, a part, an order or a person is stored once and shown in several apps. Editing it in one place changes it everywhere.
- **Parts are tasks.** A part in the Production tracker links to a task in Icarus. Claiming the part claims the task; finishing it marks the task done. The reverse works too.
- **Production feeds from the BOM and Inventory.** "Parts to make" lists parts from the BOM. The cut planner and optimizer can pick stock from Inventory and import parts to cut from the Production tracker.
- **Orders belong to the BOM.** Anything that needs to be bought becomes a BOM item (the BOM mark / bomb icon next to edit). Vendor, price and links are never retyped in another app.
- **Show the other app's state, don't copy it.** Icarus shows "8 parts being made" from Production; it does not keep its own count.
- Switching apps keeps your place: the rail remembers the last page you had open in each app.
- Apps share the same pickers (season, BOM, people), the same status words, and the same project colours.
- A page that reaches another app says so with that app's icon, and opens it on the right page, not its home.

## 10. Projects, tasks and colours that carry meaning

- Tasks belong to the robot season by default. Projects are special extra work and are optional; a task never needs a project.
- Each project has its own colour (sky, purple, teal, …). **Gold is reserved** for tasks that are not in a project, so gold never means a project.
- A task id (`t3`) is coloured with its project's colour; a task with no project uses the default id colour. Colour is applied by the same helper everywhere, never by hand.
- A task needs at least one date to appear on the Gantt chart. Tasks with no dates are listed in their own "No dates" group on Tasks.
- The people on a task are called **People** everywhere (not "assignees" or "owners").
- Status colours: not started = grey, in progress = blue, done = green, overdue / blocked = red. Do not reuse these for anything else.

## 11. Roles and approvals

- **It depends on the page.** Some pages are hidden completely from people who cannot use them, and do not show up in the rail, sidebar, search or keybinds (Site management, the Attendance kiosk). On other pages that everyone can open, show the action but disable it with a reason (for example Ordered on the BOM for someone who is not a booster).
- Decide per page when you add it and write the choice in that page's notes. Rule of thumb: hide the page if nothing on it is useful or safe for that person; disable the action if seeing it helps them understand the process.
- BOM: leads and members edit; mentors and boosters approve; boosters place orders. Marking an order Ordered needs the order total (with tax and shipping) first, but only in Order mode, not in Review.
- Anything requiring a signature or name (final check on a packing list) asks for the name first, then unlocks.
- A role switch used for demos is labelled as a demo, and the real apps read the role from the account.

## 12. Notes, text and editors

- Anywhere a long note can be written it uses the same editor: Write / Preview, bullets that continue on Enter, Tab to indent a bullet (and Shift+Tab to outdent), checklists that can convert an item to a task or subtask.
- A note can have a colour (default gold) chosen from the note's pencil icon, with a custom colour option.
- Notes that apply to a past step ("notes for next time") are never shown on pages where they do not help (not on the final check).
- Autocomplete suggests from what already exists (previous orders, existing parts) and fills in links and quantity, never prices.

## 13. Feedback, errors and undo

- Every action gives feedback in place: a button that copies says "Copied" for a moment; a save shows "Saved" next to the button.
- Errors say what to do next in plain words. No error codes.
- `Ctrl+Z` (Cmd+Z on Mac) undoes the last change in the app you are in: edits, status changes, drags and deletes. Show a short "Undone" message with a redo option. Inside a text field it undoes typing instead.
- Anything deleted can be undone for a few seconds, or asks first when it cannot be undone.
- Pending, spent and requested amounts are always shown with their meaning: "Pending", "Spent", not bare numbers.
- A button that opens something outside the app (GitHub, Onshape, a vendor) is marked with the ↗ symbol.

## 14. Phone and small screens

- Every screen has a phone layout designed from the start, not squeezed from desktop. The prototype keeps both side by side.
- Tap targets are at least 40px. Hover-only actions must also be reachable by tap.
- Show the most-used action as a floating or top button; move the rest into a menu.
- Where a letter picker or short label is clearer than a long list (cut lengths A, B, C…), use it on desktop too so both match.

## 15. Naming

- Use the team's own words: "Tasks" (one page, with a "Just my tasks" toggle), "Log", "Tracker", "Cut planner", "Keybinds", "FRC Robotics Camp", "LEGO Robotics Camp".
- Title Case for proper names, sentence case for everything else.
- Do not repeat the page title in the first line below it.
- Part numbers are not shown in the UI.

## Checklist before a screen ships

- [ ] Icons for common actions, with tooltips and `aria-label`.
- [ ] Chips are filters; tabs are for pages.
- [ ] Keyboard path for every drag and every right-click action.
- [ ] Phone layout works without horizontal scroll.
- [ ] Ids are coloured, linked and shown with names.
- [ ] Empty states and hidden-when-empty groups are handled.
- [ ] Role limits chosen on purpose: page hidden, or action disabled with a reason.
- [ ] `Ctrl+Z` undoes it.
- [ ] Anything shared with another app is read from it, not copied.
