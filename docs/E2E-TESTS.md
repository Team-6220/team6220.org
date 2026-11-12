# Browser smoke tests (e2e)

Automated checks that open the **built** site (`dist/`) in a real browser (Chromium, through
[Playwright](https://playwright.dev)) and click around like a visitor. They catch what typechecking can't: a page that
404s, a broken link, a missing image, a console error, a menu that goes to the wrong page, a phone layout that scrolls
sideways.

They live in `e2e/`. They do not change the site, and they are **not** part of the required `ci` check.

## Run them

```sh
pnpm install
pnpm exec playwright install chromium      # once per machine (add --with-deps on a fresh Linux box)
pnpm test:e2e:build                        # builds dist/ and dist-mock/, then runs the tests
```

After that, while iterating:

```sh
pnpm test:e2e                              # needs dist/ and dist-mock/ from the last build
pnpm test:e2e -- apps                      # only test files whose name contains "apps"
pnpm test:e2e -- -g "Robots"               # only tests with "Robots" in their title
pnpm test:e2e -- --ui                      # Playwright's UI: watch, step and time-travel through a test
pnpm exec playwright show-report           # the HTML report of the last run (CI also uploads it when a test fails)
```

`pnpm test:e2e` serves the build itself (`e2e/serve.mjs`, a tiny static server that acts like GitHub Pages:
`/about` redirects once to `/about/`, a missing file is a 404). Nothing is deployed and no real service is called:
requests to other sites (Google Fonts, Wix) are answered locally so a flaky network can't fail a test.

Two builds are tested:

| Folder | Built with | Used for |
| --- | --- | --- |
| `dist/` | `pnpm build` (what is deployed) | Everything |
| `dist-mock/` | `pnpm build:e2e-mock` (`PUBLIC_INVENTORY_BACKEND=mock`) | The inventory's `?demo=signed-out` / `?demo=pending` modes. The deployed build talks to Wix and ignores `?demo=` for inventory, so these modes only exist on a mock build |

Environment variables (all optional): `E2E_PORT` / `E2E_MOCK_PORT` (default 4322 / 4323), `E2E_BASE` (serve the site
under a sub-path such as `/preview/`; the site itself is built for `/`, so this is only for experiments),
`E2E_CHROMIUM=/path/to/chrome` (use that browser; in sandboxes that ship their own Chromium it is found through
`PLAYWRIGHT_BROWSERS_PATH`).

## What is tested

| File | What it checks |
| --- | --- |
| `tests/pages.spec.ts` | For **every** `dist/**/index.html` (the list is read from the build, so a new page is covered automatically): HTTP 200; no `console.error` and no uncaught page error; no failed requests to this site; every internal link returns 200 and every `#anchor` link points at an element that exists; every image loads |
| `tests/nav.spec.ts` | The menu is exactly `sites/main/data/nav.ts` (labels, links, order, plus Log In); clicking each tab and dropdown link lands on the right page; external links open in a new tab with `rel=noopener`; the Summer Camp tab and home banner follow `SUMMER_CAMP_ENABLED`, and `/summer-camp` exists either way |
| `tests/apps.spec.ts` | `/apps` shows the sign-in prompt and the public app cards from `apps/dashboard/src/apps.ts`; every app in that list is in the built dashboard; signed-out `/apps/attendance` and `/apps/inventory` show the sign-in prompt; attendance `?demo=` modes; inventory `?demo=` modes (mock build) |
| `tests/old-anchors.spec.ts` | Every old one-page address (`/#about`, `/#photos-<album>` ...) from `sites/main/data/old-anchors.ts` lands on its new page |
| `tests/responsive.spec.ts` | At a phone size (390x844) no page is wider than the screen and the MENU button works; with reduced motion the pages load and the intro doesn't cover the page; the normal intro ends and the menu works after it |

The home page's intro animation is skipped in most tests (it plays once per browser session and would slow every
click); `playIntro` tests cover it.

### Known gaps (allow-list)

`e2e/known-missing-images.ts` lists images that are known to be missing so they don't fail the run. Right now that is
everything under `/gal/` (gallery photos are not in git, issue #8). The tests report how many of those are missing. When
the photos are in place, delete the entry and the tests enforce that every gallery image loads. Add to that file only
with a comment that says why and which issue tracks it.

Other limits to know about:

- **Signed-in screens are not tested.** Signing in needs a real Wix login. The member apps are tested signed out and in
  their `?demo=` modes only. Cards that need a sign-in (Attendance, Inventory, planned apps) are checked against the
  built dashboard JavaScript, not on screen.
- **Summer camp "on" state:** `SUMMER_CAMP_ENABLED` is a build-time constant, so a run tests whichever value is in the
  source. Flip it, rebuild and rerun to see the other state.
- Only Chromium, only the built static site (not `pnpm dev`).
- External links (Instagram, GitHub, ...) are not visited; that would make the tests depend on other people's sites.

## In CI

`.github/workflows/e2e.yml` (**E2E** on the pull request) installs Chromium with
`pnpm exec playwright install --with-deps chromium`, builds the site twice, and runs `pnpm test:e2e`. It is a separate
workflow, so the required `ci` job stays unchanged and fast. It is not a required check; ask the web team before
making it one. On a failure the HTML report and traces are attached to the run (Actions run page, "Artifacts").

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `dist/ not found` / `dist-mock/ not found` | The tests need the builds: `pnpm test:e2e:build` |
| `browserType.launch: Executable doesn't exist` | `pnpm exec playwright install chromium` (on Linux add `--with-deps`), or point `E2E_CHROMIUM` at a Chrome/Chromium |
| `Error: http://127.0.0.1:4322/ is already used` | An old server is running. Stop it, or change `E2E_PORT` |
| A test fails only on `images load` or `failed requests` for `/gal/...` | Not expected: those are allow-listed. If the path is different, the image is really missing: fix it or, if it's tracked in an issue, add it to `known-missing-images.ts` with a comment |
| `?demo=pending` on inventory shows the sign-in prompt in the browser | You are on the deployed build. `?demo=` for inventory only works on a mock build: `PUBLIC_INVENTORY_BACKEND=mock pnpm build` (see `apps/inventory/README.md`) |
| A test passes locally and fails in CI (or the other way round) | Open the report (`pnpm exec playwright show-report`, or download `playwright-report` from the failed run) and look at the trace: it shows every step, the page at that moment, and the console |
| The nav tests can't click a menu item | The home page intro is covering it. Tests skip it with the `g6220-intro` session flag (see `e2e/helpers.ts`); if the intro was changed, update that |
