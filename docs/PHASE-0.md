# Phase 0 checklist

Mirrors Phase 0 of the [Headless Migration Plan](MIGRATION-PLAN.md), which lives in this repo and is edited by pull request. **Done** items are in this repo already. **You** items need a
GitHub or Wix admin: they are organization or site settings that can't be changed from code.

## Done in the repo

- [x] Monorepo: pnpm workspaces, Astro 7 site at the root, `apps/*` and `packages/*` (`ui`, `data`)
- [x] Homepage ported from the approved preview (markup, CSS, scripts and assets split into files; student photos are served from `PUBLIC_MEDIA_BASE`, not git)
- [x] `ci.yml`: install, typecheck, tests, build on every pull request (job name `ci`)
- [x] `pages.yml`: deploys `dist/` to GitHub Pages on every push to `main`
- [x] `public/CNAME` set to `dev.team6220.org`
- [x] `CODEOWNERS`, Dependabot (npm and Actions), pull request template
- [x] Typecheck and build pass; the built page loads in Chrome with no script errors

## You: GitHub (in this order)

1. **Photo consent first.** See [PHOTOS.md](PHOTOS.md). Then make the repo public:
   Settings → General → Danger Zone → Change visibility. On the free plan, Pages and branch rules only work on
   public repos.
2. **Org owners and 2FA.** Org → People: make `losalfrc@gmail.com`, `operations@team6220.org` and
   `programming@team6220.org` owners (use the GitHub accounts tied to those emails). Turn on 2FA for each and
   store recovery codes where two leads or a mentor can reach them.
3. **Create the `webmasters` team.** Org → Teams → New team, add the web admins, then give it **Write** access to
   this repo (repo Settings → Collaborators and teams). `CODEOWNERS` points at `@Team-6220/webmasters` and is
   ignored until the team exists.
4. **Protect `main`.** Repo Settings → Rules → Rulesets → New branch ruleset:
   - Target: default branch
   - Require a pull request, **1 approval**, and **Require review from Code Owners**
   - Require status check **`ci`** (it appears in the list after one pull request has run)
   - Block force pushes and deletions
5. **Turn on security scanning.** Settings → Code security: Dependabot alerts and security updates, secret
   scanning, and push protection.
6. **Enable Pages.** Settings → Pages → Source: **GitHub Actions**. Then re-run the last workflow in the Actions
   tab (the first commit skipped CI on purpose).
7. **Test address.**
   1. Org Settings → Pages → Add a domain: `dev.team6220.org` (or `team6220.org`). GitHub shows a TXT record;
      add it in Wix → Domains → team6220.org → Manage DNS Records.
   2. In the same place add a **CNAME**: host `dev`, value `team-6220.github.io`.
   3. In the repo's Pages settings, confirm the custom domain `dev.team6220.org` (the `CNAME` file sets it) and
      tick **Enforce HTTPS** when it becomes available.
   Don't touch the existing A, CNAME or MX records. The main site and team email must keep working.

## You: Wix

8. Add the three web admin accounts as admins on the Wix site, with 2FA on.
9. Dashboard → Settings → Development & integrations → **Headless settings** → create a headless (OAuth) client.
   Allow `https://dev.team6220.org` and `http://localhost:4321` as domains and redirect URIs.
   The client ID is committed in `packages/data/src/config.ts` (it identifies the site and is not a secret).
10. **Wix Members:** Settings → **Site member settings** → **Signup & login security** → *Who can be a site member?*
    → **Only people I manually approve** → Save. New members then show up in the Member List for approval.
    There is no separate "Member Authentication app" to install. Google sign-in is run by Wix itself (no Google
    keys needed) and is wired up when the login page is built in Phase 1.
11. Settings → Site member settings → **Member badges** → Manage Badges: create **Team Member**,
    **Attendance Admin**, **Inventory Manager**, **Web Admin**.

## You: one-day Wix CLI test (before building much)

Confirm the repo layout works with the Wix CLI. Check these four things from the plan's risk list:

- [ ] Link this workspace-based repo with `@wix/cli` (`wix login`, then follow the headless project link steps).
      If it fails, fall back to `src/apps/` folders instead of the `apps/` workspaces.
- [ ] Wix's reserved URL paths don't collide with `/apps` or `/api`.
- [ ] Whether `wix release` can run non-interactively from GitHub Actions (until confirmed, a Web Admin releases
      from a laptop).
- [ ] A service worker works on Wix hosting (needed for offline scouting).

## Next (Phase 1)

Split the homepage into Astro components, then build the remaining public pages, the `/apps` dashboard with
login, and move in GoldSim and WingIt with `git subtree add` so their history is kept.
