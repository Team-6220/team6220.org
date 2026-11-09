# TODO: move GoldSim's backend from Supabase to Wix CMS

**Decision (Nov 2026): the team is not using Supabase.** GoldSim must be changed completely to store and
authenticate through the team website's Wix backend (Wix CMS collections + Wix Members), through
`packages/data` in the monorepo root. Everything below is open. Tracking issue: see the GitHub issue titled
"GoldSim: replace Supabase with Wix CMS (full backend rewrite)".

Where Supabase is used today: `packages/data-layer/src/supabase.ts` (adapter), `limits.ts`, `index.ts`;
`packages/web/src/ui/notice.ts`; `supabase/` (config, one migration, RLS tests); docs `PRD.md` (sections 14, 15, 18),
`IMPLEMENTATION_PLAN.md`, `SELF-HOSTING.md`, `README.md`, `CHANGELOG.md`.

## 0. Decisions needed first (these shape everything)

- [ ] **Who can sign in?** The site's Wix Members is for approved team members only. GoldSim's PRD assumes teams
      from anywhere sign up. Pick one: (a) GoldSim stays public and local-only for outsiders, accounts and cloud
      save only for Team 6220 members; (b) a separate open Wix Members signup for GoldSim (changes the site's login
      rules); (c) outside teams get nothing cloud-side, only JSON export/import.
- [ ] **Does GoldSim keep "teams" and "workspaces"?** Wix has no row-level security, so team isolation has to be
      enforced in `/api` code, not by the database. Decide whether multi-team support is still a goal.
- [ ] **Public published snapshots (PRD 15)**: keep (public read-only CMS collection) or drop for now.
- [ ] **Self-hosting (docs/SELF-HOSTING.md)**: the PRD promised self-hosting on Supabase. Drop it, or keep a
      static, local-only build.
- [ ] Confirm the Phase 1 vs Phase 2 split: in Phase 1 (GitHub Pages) the browser talks to Wix with the headless
      client; per-user permissions are only as strong as the CMS collection permissions. Don't put anything private
      there until Phase 2 `/api` endpoints exist.

## 1. Map the data model (supabase/migrations/20261025000000_init.sql)

| Supabase table / bucket | Wix replacement | Notes |
| --- | --- | --- |
| `profiles` | Wix Members (profile fields) | display name only; no passwords stored by GoldSim |
| `user_settings` | CMS `goldsim_user_settings`, one item per member | controller bindings, units, theme, sound |
| `teams`, `memberships`, `invites`, `join_requests` | CMS collections or Wix badges/roles | depends on decision above; roles = badges |
| `team_docs` | CMS `goldsim_docs` (JSON field or file link) | designs, driver profiles, strategies, recordings |
| `doc_versions` | CMS `goldsim_doc_versions` | version history; watch item size limits |
| `write_log` | CMS `goldsim_write_log` or drop | check what it is used for (rate limits / audit) |
| `published_snapshots`, `snapshot_owners` | CMS `goldsim_snapshots` (public read) | immutable once published |
| Storage bucket `team_files` | Wix Media Manager | recordings, PathPlanner files, images |
| SQL functions (`is_member`, `is_admin`, quotas) | `/api/goldsim/*` endpoint code | Phase 2; server checks badges |
| Realtime / sync | polling or revision checks | no realtime assumption |

- [ ] Write the collection schemas (fields, types, permissions) in `packages/data` and document them.
- [ ] Check Wix CMS limits against real GoldSim documents (item size, JSON depth, collection and request quotas);
      large recordings probably belong in Media Manager with a link in the CMS item.
- [ ] Decide ID and versioning scheme (Wix items have `_id`, `_updatedDate`; replace Postgres `version` columns).

## 2. Code changes

- [ ] Add a Wix adapter in `packages/data` that implements GoldSim's `data-layer` interface
      (`packages/data-layer/src/types.ts`). GoldSim must not import the Wix SDK directly (monorepo rule).
- [ ] Replace `packages/data-layer/src/supabase.ts` with the adapter; keep `memory.ts` (local mode) and `outbox.ts`
      (offline queue) and re-test the outbox against Wix errors and rate limits.
- [ ] Rework sign-in UI and session handling (issue: "Supabase: sign-in UI, session handling and guest mode") to use
      Wix Members login. Guest mode must still work with no network.
- [ ] Rework `limits.ts` (quotas and abuse protection, PRD 14.7) to match what Wix can enforce.
- [ ] Update `packages/web/src/ui/notice.ts` wording.
- [ ] Update save/sync behavior (PRD 14.9) for Wix's consistency model; handle conflicts.
- [ ] Remove `@supabase/*` dependencies from `package.json` / `package-lock.json`.

## 3. Remove Supabase

- [ ] Delete `supabase/` (config, migration, RLS tests) once the data model is mapped.
- [ ] Replace the RLS tests with permission tests for the CMS collections (or `/api` endpoint tests in Phase 2).
- [ ] Remove or rewrite `docs/SELF-HOSTING.md`; update PRD sections 14, 15 and 18, IMPLEMENTATION_PLAN.md,
      README.md and add a CHANGELOG entry.
- [ ] Remove Supabase from CI and any deploy docs.

## 4. Mount on the team site

- [ ] Build GoldSim to static files and serve it at `/apps/goldsim` (see apps/README.md).
- [ ] Redirect the old GitHub Pages address to `/apps/goldsim`.
- [ ] Phase 2: move any privileged logic (team membership checks, publishing) into `/api/goldsim/*`.

## 5. Related old issues (the Supabase ones are superseded)

Retitle or close them once this migration is planned: the issues titled "Supabase: ..." (stand up the hosted
project, RLS tests in CI, sign-in UI, team workspace UI, save designs, save recordings, save user settings,
privacy policy, public data, team-to-team sharing, plus "Verify team numbers" and "Repo transfer").
