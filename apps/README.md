# Apps

Each app is a React package that mounts at its own route under `team6220.org/apps`.

| Folder | Route | Status |
| --- | --- | --- |
| `apps/attendance` | `/apps/attendance` | Moves in from Apps Script (screen only) |
| `apps/inventory` | `/apps/inventory` | Moves in from Apps Script |
| `apps/goldsim` | `/apps/goldsim` | **Imported** with history (Nov 2026). Still builds with its own npm workspace; not yet mounted on the site |
| `apps/wingit` | `/apps/wingit` | **Imported** with history (Nov 2026). Static HTML/JS game; not yet mounted on the site |
| `apps/scouting`, `apps/pit`, `apps/production` | | Planned |

Rules (from the migration plan):

- Apps never import the Wix SDK. They call functions from `@team6220/data`.
- Each app owns its folder, with its own line in `.github/CODEOWNERS`.
- Brand colors and fonts come from `@team6220/ui`.
- The Wix integration needs **React 18** (`@wix/astro` peers on `^18.3.1`), so don't use React 19 here.

## Folder layout for one app

```
apps/<name>/
  src/        the app's code
  media/      images, icons and files only this app uses  ->  /assets/<name>/<file>
  package.json
```

Media that several parts of the site use goes in [`packages/assets`](../packages/assets/README.md) instead
(`/assets/shared/...`). The main website's own files are in `sites/main/`, never inside an app.

## Imported apps (GoldSim, WingIt)

They came from their own repos with full history and keep their own tooling for now:

- `apps/goldsim` uses npm workspaces (`npm ci`, `npm run dev`). It is excluded from the root pnpm workspace in
  `pnpm-workspace.yaml`, so root installs and CI don't touch it.
- `apps/wingit` is static files (`index.html`, `js/`, `css/`); run it by opening `index.html` or any static server.
- Issues from the old GoldSim repo were moved here with the label `APP: GOLDSIM`. Use `APP: WINGIT` for WingIt.
- The old repos are archived with a README pointing here. Don't commit there.
- To mount them on the site (Phase 1), build each to static files and publish them under `/apps/goldsim` and
  `/apps/wingit` (their old GitHub Pages addresses should redirect there).
- **Merge pull requests that add or move whole imported folders with "Create a merge commit"**, not squash or rebase,
  or the imported history is lost.
