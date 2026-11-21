# docs/

The project's documentation now lives in the **wiki**: https://github.com/Team-6220/team6220.org/wiki

Start at the [Home page](https://github.com/Team-6220/team6220.org/wiki/Home). It has the "I want to..." table, a first-day
checklist, and links to every guide (how it fits together, deploy and CI, Wix setup, adding an app, troubleshooting, the
operations apps, and the history of the 2026 move to Wix hosting).

This folder keeps only the files that scripts read and check:

| File | What it is |
| --- | --- |
| `redirects.json` | The source of truth for old-address redirects. Edit it, then run `pnpm redirects:csv` and `pnpm redirects:check` |
| `redirects.csv` | Generated from `redirects.json` (the format Wix's URL Redirect Manager imports) |
| `REDIRECTS.md` | Generated tables of old addresses and where they go |

The wiki is its own git repository (`Team-6220/team6220.org.wiki`). If you change how something works in this repo, update the
matching wiki page in the same sitting.
