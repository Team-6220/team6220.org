# team6220.org

Website and team apps for **FRC Team 6220, the Golden Griffins** (Los Alamitos High School).

One repository holds the public website and every team app. It is being moved from the Wix Studio
editor to a coded site that uses Wix as the backend (Wix-managed headless). The plan, in order:

| Phase | Where it runs | Status |
| --- | --- | --- |
| 0. Setup | | **Done** ([docs/PHASE-0.md](docs/PHASE-0.md), [Wix CLI test](docs/WIX-CLI-SPIKE.md)) |
| 1. Prototype | GitHub Pages at `dev.team6220.org` | In progress: homepage live; apps and pages next; styling waits for branding guidelines |
| 2. Migration preview | Wix hosting, hidden preview | Not started |
| 3. Switch over | `team6220.org` | Before kickoff (early January 2027) |

The real `team6220.org` stays on Wix, untouched, until the last step of Phase 3.

The full plan is [docs/MIGRATION-PLAN.md](docs/MIGRATION-PLAN.md).

## Run it

Needs Node 22 (`.nvmrc`) and [pnpm](https://pnpm.io/installation).

```sh
pnpm install
pnpm dev        # http://localhost:4321
pnpm check      # typecheck
pnpm build      # outputs dist/ (also builds GoldSim and WingIt into dist/apps/, see apps/README.md)
```

## Layout

```
src/pages/          Astro routes (thin; content comes from sites/ and apps/)
src/layouts/        BaseLayout: the shared page shell (favicon, viewport)
sites/main/         The public website: content, styles, scripts, media (see its README)
apps/<name>/        One folder per team app, with its own media/ (see apps/README.md)
packages/assets/    Shared logos, fonts and favicon that anyone may use
packages/ui         Shared brand styles and components
packages/data       The only code that talks to Wix / Apps Script
integrations/       Build helpers (sync-media copies media to where the browser finds it; build-apps builds the imported apps)
docs/               Migration plan, Phase 0 checklist, photo policy
.github/            CI, Pages deploy, CODEOWNERS, Dependabot
```

Media lives next to what uses it: `sites/main/media`, `apps/<name>/media`, or `packages/assets` when shared.
It is published at `/assets/main/...`, `/assets/<app>/...` and `/assets/shared/...`.

## Working here

- Every change goes through a pull request with one review; `main` deploys automatically.
- This repo is public. **Never commit** API keys, passcodes or `.env` files, and never commit photos of
  students that haven't been cleared ([docs/PHOTOS.md](docs/PHOTOS.md)). Photos currently live in `sites/main/media/team` (see [docs/PHOTOS.md](docs/PHOTOS.md)).
- Apps never import the Wix SDK; they call `@team6220/data`.

## Version notes

- **Astro 7** and **React 18**: `@wix/astro` requires `astro ^7.2` and `react ^18.3`.
- **TypeScript 6**: `astro check` does not support TypeScript 7 yet.
- `pnpm-workspace.yaml` pins `@emnapi/runtime` to 1.11.3 because Astro's checker crashes with the 2.0 beta that
  pnpm otherwise picks. Remove the override once `@astrojs/check` fixes it.

## License

Code is [MIT](LICENSE). Logos, photos, site text and other media are © Los Al Robotics (FRC Team 6220), all rights reserved, and
third-party material keeps its own license. See [NOTICE.md](NOTICE.md) for exactly what is and isn't covered.
