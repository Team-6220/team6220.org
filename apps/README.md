# Apps

Each app is a React package that mounts at its own route under `team6220.org/apps`.

| Folder | Route | Status |
| --- | --- | --- |
| `apps/attendance` | `/apps/attendance` | Moves in from Apps Script (screen only) |
| `apps/inventory` | `/apps/inventory` | Moves in from Apps Script |
| `apps/goldsim` | `/apps/goldsim` | Import with `git subtree add` to keep history |
| `apps/wingit` | `/apps/wingit` | Import with `git subtree add` to keep history |
| `apps/scouting`, `apps/pit`, `apps/production` | | Planned |

Rules (from the migration plan):

- Apps never import the Wix SDK. They call functions from `@team6220/data`.
- Each app owns its folder, with its own line in `.github/CODEOWNERS`.
- Brand colors and fonts come from `@team6220/ui`.
- The Wix integration needs **React 18** (`@wix/astro` peers on `^18.3.1`), so don't use React 19 here.
