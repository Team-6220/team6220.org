# Self-hosting the GoldSim backend

GoldSim's backend only stores data: sign-in, team workspaces, saved designs and results, and published tests. All simulation runs in the browser (PRD §6, §14). The default deployment is one hosted Supabase project run by Team 6220 for every team; forks can run their own with these steps.

Everything the backend needs is in the repo:

| Path | What it is |
|---|---|
| `supabase/migrations/` | Tables, row-level security (RLS) policies, RPC functions, quota triggers, storage bucket |
| `supabase/tests/rls.test.sql` | pgTAP tests proving team data is invisible to non-members and published tests are read-only |
| `supabase/config.toml` | Local development config (`npx supabase start`) |
| `packages/data-layer/` | The `DataLayer` interface the app uses, with `SupabaseDataLayer` and an in-memory `MemoryDataLayer` |

## 1. Before you launch: verify the free tier (PRD §14.8)

Check these on supabase.com/pricing **on the day you set up**, and write the answers into `docs/decisions/`:

- [ ] Database size limit, file storage limit, and egress limit on the free plan.
- [ ] Monthly active user limit for Auth.
- [ ] Whether free projects pause after a period of inactivity, and how to un-pause (a paused project means nobody can sign in or save).
- [ ] Number of free projects per organization.
- [ ] What happens when a limit is hit (read-only? blocked?), and the cost of the next plan up.
- [ ] Who owns the Supabase organization (use a team-owned account, not a student's personal one), and who else has admin access. Add at least one mentor.

GoldSim keeps usage small: per-team quotas (2,000 documents, 500 test runs, 200 MB) and per-user write rate limits are enforced in the database and mirrored in `packages/data-layer/src/limits.ts`. Change both together.

## 2. Create the project

1. Sign in at supabase.com with the team-owned account and create a project (choose a region near your users). Save the database password in the team's password manager.
2. Install the CLI locally: `npx supabase --version` (no global install needed).
3. Link and push the schema from the repo root:
   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
4. Run the RLS tests against a local copy before trusting the policies (needs Docker Desktop running):
   ```sh
   npx supabase start
   npx supabase test db
   npx supabase stop
   ```

## 3. Configure sign-in (PRD §14.5)

GoldSim stores no passwords. In the dashboard under **Authentication**:

1. **Email (magic link):** enabled. Turn off "Confirm email" if you want one-click magic links. Optionally set up custom SMTP so magic-link emails come from the team domain and aren't rate-limited by the built-in sender.
2. **Google:** create an OAuth client in Google Cloud Console (type "Web application"). Add the Supabase callback URL shown on the Google provider page as an authorized redirect URI. Paste the client id and secret into Supabase. This works with Team 6220 Google Workspace accounts and any other Google account.
3. **URL configuration:** set the site URL to the production app URL, and add **every origin that serves the app** to the redirect allowlist:
   - `http://localhost:5173` (dev server) and `http://localhost:4173` (preview)
   - `https://hossharman.github.io/GoldSim/` (GitHub Pages now)
   - `https://<subdomain>.team6220.org/` (later, once the subdomain exists)
   - PR preview URLs, if you deploy them

## 4. Configure the web app

The web app reads two build-time variables. Put them in `packages/web/.env.local` for development and in GitHub Actions secrets/variables for the Pages build:

```sh
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

- Only the **anon** key goes in the client. It is public by design; RLS does the enforcement.
- **Never** put the `service_role` key in the web app, the repo, or a GitHub Pages build.
- The app creates the client and hands it to the data layer:
  ```ts
  import { createClient } from "@supabase/supabase-js";
  import { SupabaseDataLayer, type SupabaseLike } from "@goldsim/data-layer";
  const dl = new SupabaseDataLayer(createClient(url, anonKey) as unknown as SupabaseLike);
  ```
- With no variables set, the app should fall back to guest mode (`MemoryDataLayer`, nothing saved).

## 5. Operating it

- **Remove content or disable an account:** use the dashboard (Table Editor / Authentication). There is no in-app moderation (PRD §15.3).
- **Backups and export:** `npx supabase db dump --data-only > backup.sql`. Users and admins can also export their own data from the app.
- **Schema changes:** add a new file under `supabase/migrations/`, run `npx supabase test db` locally, then `npx supabase db push`. Never edit an already-applied migration.

## 6. Checklist: moving the repo or changing domains (PRD §18.2)

When the repo moves from `HossHarman/GoldSim` to the Team 6220 organization, the GitHub Pages URL changes. When the team6220.org subdomain goes live, the origin changes again. Each time:

- [ ] Add the new origin to Supabase **Authentication → URL configuration → Redirect URLs** (keep the old one until the move is done, then remove it).
- [ ] Update the **Site URL** if the production URL changed.
- [ ] Add the new origin to the Google OAuth client's authorized JavaScript origins.
- [ ] Re-create the `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` Actions secrets or variables in the new repo.
- [ ] Update `additional_redirect_urls` in `supabase/config.toml`.
- [ ] Sign in on the new URL with both Google and a magic link to confirm.
