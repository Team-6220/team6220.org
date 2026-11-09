-- GoldSim backend schema (PRD §14, §15). The backend stores data only; all simulation is client-side.
-- Every table has row-level security. Team data is visible and editable only by team members.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now()
);

-- Settings are private to the user (controller bindings, units, theme).
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (octet_length(settings::text) <= 65536),
  updated_at timestamptz not null default now()
);

-- Create a profile on sign-up. Only an email and a display name are stored (PRD §14.6).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1), 'Member'), 60)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Teams, memberships, invites, join requests
-- ---------------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  type text not null check (type in ('frc_team', 'group')),
  team_number integer check (team_number between 1 and 99999), -- self-declared, unverified
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked boolean not null default false
);

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz
);
create unique index join_requests_one_pending on public.join_requests (team_id, user_id) where status = 'pending';

-- Membership helpers. security definer so policies can call them without recursive RLS.
create function public.is_member(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where team_id = p_team and user_id = auth.uid());
$$;

create function public.is_admin(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where team_id = p_team and user_id = auth.uid() and role = 'admin');
$$;

create function public.shares_team(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships a join public.memberships b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- ---------------------------------------------------------------------------
-- Team documents (designs, driver profiles, recordings, test runs, calibration, imported files)
-- ---------------------------------------------------------------------------

create table public.team_docs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  kind text not null check (kind in ('design', 'driverProfile', 'recording', 'testRun', 'calibration', 'importedFile')),
  name text not null check (char_length(name) between 1 and 120),
  data jsonb not null,
  version integer not null default 1,
  size_bytes integer generated always as (octet_length(data::text)) stored,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Size caps per kind; mirrored in packages/data-layer/src/limits.ts.
  check (
    (kind = 'design' and octet_length(data::text) <= 262144) or
    (kind = 'driverProfile' and octet_length(data::text) <= 65536) or
    (kind = 'recording' and octet_length(data::text) <= 5242880) or
    (kind = 'testRun' and octet_length(data::text) <= 2097152) or
    (kind = 'calibration' and octet_length(data::text) <= 524288) or
    (kind = 'importedFile' and octet_length(data::text) <= 1048576)
  )
);
create index team_docs_team_kind_idx on public.team_docs (team_id, kind, updated_at desc);

create table public.doc_versions (
  doc_id uuid not null references public.team_docs (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  version integer not null,
  name text not null,
  data jsonb not null,
  saved_by uuid references auth.users (id) on delete set null,
  saved_at timestamptz not null default now(),
  primary key (doc_id, version)
);

-- Per-user write log for server-side rate limiting.
create table public.write_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index write_log_user_at_idx on public.write_log (user_id, at desc);

create function public.check_rate_limit() returns void
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then return; end if;
  delete from public.write_log where user_id = auth.uid() and at < now() - interval '1 minute';
  select count(*) into n from public.write_log where user_id = auth.uid();
  if n >= 120 then
    raise exception 'rate_limited: Too many saves in a short time. Wait a moment and try again.';
  end if;
  insert into public.write_log (user_id) values (auth.uid());
end $$;

-- Quotas (PRD §14.7); mirrored in limits.ts TEAM_QUOTAS.
create function public.team_docs_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare n_docs integer; n_runs integer; total bigint;
begin
  perform public.check_rate_limit();
  select count(*), count(*) filter (where kind = 'testRun'), coalesce(sum(size_bytes), 0)
    into n_docs, n_runs, total from public.team_docs where team_id = new.team_id;
  if n_docs >= 2000 then raise exception 'quota: This team has reached its document limit. Delete old items first.'; end if;
  if new.kind = 'testRun' and n_runs >= 500 then raise exception 'quota: This team has reached its test-run limit. Delete old test runs first.'; end if;
  if total + octet_length(new.data::text) > 209715200 then raise exception 'quota: This team is out of storage.'; end if;
  new.version := 1;
  new.created_by := auth.uid();
  new.updated_by := auth.uid();
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;

create function public.team_docs_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare total bigint;
begin
  perform public.check_rate_limit();
  if new.team_id <> old.team_id or new.kind <> old.kind then
    raise exception 'invalid: A document cannot move between teams or change kind.';
  end if;
  -- Optimistic concurrency: clients send version = old.version + 1 and filter on the old version.
  if new.version <> old.version + 1 then
    raise exception 'invalid: Version mismatch; reload the document.';
  end if;
  select coalesce(sum(size_bytes), 0) into total from public.team_docs where team_id = new.team_id and id <> old.id;
  if total + octet_length(new.data::text) > 209715200 then raise exception 'quota: This team is out of storage.'; end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;

-- Version history for designs (PRD §9.1).
create function public.team_docs_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'design' then
    insert into public.doc_versions (doc_id, team_id, version, name, data, saved_by, saved_at)
    values (new.id, new.team_id, new.version, new.name, new.data, new.updated_by, new.updated_at)
    on conflict do nothing;
  end if;
  return new;
end $$;

create trigger team_docs_bi before insert on public.team_docs for each row execute function public.team_docs_before_insert();
create trigger team_docs_bu before update on public.team_docs for each row execute function public.team_docs_before_update();
create trigger team_docs_ai after insert or update on public.team_docs for each row execute function public.team_docs_history();

-- ---------------------------------------------------------------------------
-- Published snapshots (public, immutable copies). Owners are kept in a separate private table so
-- anonymous publishing hides the team publicly (the backend still knows, PRD §14.6).
-- ---------------------------------------------------------------------------

create table public.published_snapshots (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  tags text[] not null default '{}',
  game_id text,
  attribution jsonb, -- null = anonymous
  payload jsonb not null check (octet_length(payload::text) <= 10485760),
  meta jsonb not null default '{}'::jsonb,
  license text not null,
  created_at timestamptz not null default now()
);
create index published_snapshots_game_idx on public.published_snapshots (game_id, created_at desc);
create index published_snapshots_tags_idx on public.published_snapshots using gin (tags);

create table public.snapshot_owners (
  snapshot_id uuid primary key references public.published_snapshots (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  published_by uuid references auth.users (id) on delete set null,
  source_test_run uuid references public.team_docs (id) on delete set null
);
create index snapshot_owners_team_idx on public.snapshot_owners (team_id);

-- Deleting a team removes its public snapshots too.
create function public.snapshot_owner_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.published_snapshots where id = old.snapshot_id;
  return old;
end $$;
create trigger snapshot_owners_ad after delete on public.snapshot_owners for each row execute function public.snapshot_owner_deleted();

-- ---------------------------------------------------------------------------
-- Views (security_invoker: base-table RLS applies)
-- ---------------------------------------------------------------------------

create view public.team_members with (security_invoker = true) as
  select m.team_id, m.user_id, m.role, m.joined_at, p.display_name
  from public.memberships m left join public.profiles p on p.id = m.user_id;

create view public.join_requests_view with (security_invoker = true) as
  select r.id, r.team_id, r.user_id, r.status, r.created_at, p.display_name
  from public.join_requests r left join public.profiles p on p.id = r.user_id;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.teams enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.join_requests enable row level security;
alter table public.team_docs enable row level security;
alter table public.doc_versions enable row level security;
alter table public.write_log enable row level security;
alter table public.published_snapshots enable row level security;
alter table public.snapshot_owners enable row level security;

-- profiles: yourself, plus people you share a team with (display names only are stored here).
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_team(id) or exists (
    select 1 from public.join_requests r where r.user_id = profiles.id and public.is_admin(r.team_id)));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy settings_all on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- teams: members read; admins rename/delete; creation goes through create_team().
create policy teams_select on public.teams for select to authenticated using (public.is_member(id));
create policy teams_update on public.teams for update to authenticated using (public.is_admin(id)) with check (public.is_admin(id));
create policy teams_delete on public.teams for delete to authenticated using (public.is_admin(id));

-- memberships: members read; changes go through RPCs that keep at least one admin.
create policy memberships_select on public.memberships for select to authenticated using (public.is_member(team_id));

-- invites: admins only; joining by code goes through request_join().
create policy invites_select on public.invites for select to authenticated using (public.is_admin(team_id));
create policy invites_update on public.invites for update to authenticated using (public.is_admin(team_id)) with check (public.is_admin(team_id));

-- join requests: your own, or the team's admins.
create policy join_requests_select on public.join_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin(team_id));

-- team documents: members read and write.
create policy team_docs_select on public.team_docs for select to authenticated using (public.is_member(team_id));
create policy team_docs_insert on public.team_docs for insert to authenticated with check (public.is_member(team_id));
create policy team_docs_update on public.team_docs for update to authenticated using (public.is_member(team_id)) with check (public.is_member(team_id));
create policy team_docs_delete on public.team_docs for delete to authenticated using (public.is_member(team_id));

create policy doc_versions_select on public.doc_versions for select to authenticated using (public.is_member(team_id));

-- write_log: no direct access (written by security definer functions).

-- published snapshots: anyone can read, nobody writes directly (publish_snapshot / unpublish_snapshot).
create policy snapshots_public_read on public.published_snapshots for select to anon, authenticated using (true);
create policy snapshot_owners_select on public.snapshot_owners for select to authenticated using (public.is_member(team_id));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.create_team(p_name text, p_type text, p_team_number integer default null)
returns setof public.teams
language plpgsql security definer set search_path = public as $$
declare t public.teams;
begin
  if auth.uid() is null then raise exception 'forbidden: Sign in first.'; end if;
  perform public.check_rate_limit();
  insert into public.teams (name, type, team_number, created_by)
  values (trim(p_name), p_type, p_team_number, auth.uid()) returning * into t;
  insert into public.memberships (team_id, user_id, role) values (t.id, auth.uid(), 'admin');
  return next t;
end $$;

create function public.set_member_role(p_team uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare v_role text; admins integer;
begin
  if not public.is_admin(p_team) then raise exception 'forbidden: Only team admins can change roles.'; end if;
  if p_role not in ('admin', 'member') then raise exception 'invalid: Unknown role.'; end if;
  select role into v_role from public.memberships where team_id = p_team and user_id = p_user;
  if v_role is null then raise exception 'not_found: That person is not on this team.'; end if;
  select count(*) into admins from public.memberships where team_id = p_team and role = 'admin';
  if v_role = 'admin' and p_role = 'member' and admins = 1 then
    raise exception 'forbidden: A team needs at least one admin. Make someone else admin first.';
  end if;
  update public.memberships set role = p_role where team_id = p_team and user_id = p_user;
end $$;

create function public.remove_member(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare target_role text; admins integer;
begin
  if not public.is_member(p_team) then raise exception 'not_found: Team not found.'; end if;
  if p_user <> auth.uid() and not public.is_admin(p_team) then
    raise exception 'forbidden: Only team admins can remove members.';
  end if;
  select role into target_role from public.memberships where team_id = p_team and user_id = p_user;
  if target_role is null then raise exception 'not_found: That person is not on this team.'; end if;
  select count(*) into admins from public.memberships where team_id = p_team and role = 'admin';
  if target_role = 'admin' and admins = 1 then
    raise exception 'forbidden: A team needs at least one admin. Make someone else admin first, or delete the team.';
  end if;
  delete from public.memberships where team_id = p_team and user_id = p_user;
end $$;

create function public.create_invite(p_team uuid, p_days integer default 14)
returns setof public.invites
language plpgsql security definer set search_path = public as $$
declare inv public.invites; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i integer;
begin
  if not public.is_admin(p_team) then raise exception 'forbidden: Only team admins can create invites.'; end if;
  perform public.check_rate_limit();
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.invites where code = c);
  end loop;
  insert into public.invites (team_id, code, created_by, expires_at)
  values (p_team, c, auth.uid(), now() + make_interval(days => greatest(1, least(p_days, 90))))
  returning * into inv;
  return next inv;
end $$;

create function public.request_join(p_code text)
returns setof public.join_requests
language plpgsql security definer set search_path = public as $$
declare inv public.invites; req public.join_requests;
begin
  if auth.uid() is null then raise exception 'forbidden: Sign in first.'; end if;
  perform public.check_rate_limit();
  select * into inv from public.invites where code = upper(trim(p_code));
  if inv.id is null or inv.revoked or inv.expires_at < now() then
    raise exception 'not_found: That invite code is not valid or has expired. Ask your team admin for a new one.';
  end if;
  if exists (select 1 from public.memberships where team_id = inv.team_id and user_id = auth.uid()) then
    raise exception 'invalid: You are already on this team.';
  end if;
  select * into req from public.join_requests where team_id = inv.team_id and user_id = auth.uid() and status = 'pending';
  if req.id is null then
    insert into public.join_requests (team_id, user_id) values (inv.team_id, auth.uid()) returning * into req;
  end if;
  return next req;
end $$;

create function public.decide_join_request(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare req public.join_requests;
begin
  select * into req from public.join_requests where id = p_request;
  if req.id is null or not public.is_admin(req.team_id) then raise exception 'not_found: Request not found.'; end if;
  if req.status <> 'pending' then raise exception 'invalid: That request was already decided.'; end if;
  update public.join_requests
    set status = case when p_approve then 'approved' else 'denied' end, decided_by = auth.uid(), decided_at = now()
    where id = p_request;
  if p_approve then
    insert into public.memberships (team_id, user_id, role) values (req.team_id, req.user_id, 'member')
    on conflict do nothing;
  end if;
end $$;

create function public.publish_snapshot(
  p_team uuid, p_test_run uuid, p_title text, p_description text, p_tags text[],
  p_include jsonb, p_anonymous boolean, p_license text
) returns setof public.published_snapshots
language plpgsql security definer set search_path = public as $$
declare run public.team_docs; t public.teams; snap public.published_snapshots; payload jsonb := '{}'::jsonb;
begin
  if not public.is_admin(p_team) then raise exception 'not_found: Team not found.'; end if;
  perform public.check_rate_limit();
  select * into run from public.team_docs where id = p_test_run and team_id = p_team and kind = 'testRun';
  if run.id is null then raise exception 'not_found: Test run not found in this team.'; end if;
  select * into t from public.teams where id = p_team;
  if coalesce((p_include ->> 'stats')::boolean, false) then
    payload := payload || jsonb_build_object('stats', coalesce(run.data -> 'summary', 'null'::jsonb));
  end if;
  if coalesce((p_include ->> 'designs')::boolean, false) then
    payload := payload || jsonb_build_object('designs', coalesce(run.data -> 'designs', '[]'::jsonb));
  end if;
  if coalesce((p_include ->> 'replays')::boolean, false) then
    payload := payload || jsonb_build_object('replays', coalesce((
      select jsonb_agg(d.data) from public.team_docs d
      where d.team_id = p_team and d.kind = 'recording'
        and d.id::text in (select jsonb_array_elements_text(coalesce(run.data -> 'replayIds', '[]'::jsonb)))
    ), '[]'::jsonb));
  end if;
  insert into public.published_snapshots (title, description, tags, game_id, attribution, payload, meta, license)
  values (
    trim(p_title), coalesce(p_description, ''), coalesce(p_tags, '{}'), run.data ->> 'gameId',
    case when p_anonymous then null
      else jsonb_build_object('teamName', t.name, 'teamNumber', t.team_number, 'verified', false) end,
    payload,
    jsonb_strip_nulls(jsonb_build_object(
      'engineVersion', run.data -> 'engineVersion', 'schemaVersion', run.data -> 'schemaVersion',
      'seeds', run.data -> 'seeds', 'settings', run.data -> 'settings')),
    coalesce(nullif(p_license, ''), 'CC BY 4.0')
  ) returning * into snap;
  insert into public.snapshot_owners (snapshot_id, team_id, published_by, source_test_run)
  values (snap.id, p_team, auth.uid(), run.id);
  return next snap;
end $$;

create function public.unpublish_snapshot(p_snapshot uuid) returns void
language plpgsql security definer set search_path = public as $$
declare owner_team uuid;
begin
  select team_id into owner_team from public.snapshot_owners where snapshot_id = p_snapshot;
  if owner_team is null or not public.is_admin(owner_team) then raise exception 'not_found: Published test not found.'; end if;
  delete from public.published_snapshots where id = p_snapshot;
end $$;

-- Deletes the caller's account. Teams where they are the only member are deleted; being the only
-- admin of a team with other members is refused (PRD §14.6 export/delete).
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare r record;
begin
  if auth.uid() is null then raise exception 'forbidden: Sign in first.'; end if;
  for r in
    select m.team_id, t.name,
      (select count(*) from public.memberships x where x.team_id = m.team_id) as members,
      (select count(*) from public.memberships x where x.team_id = m.team_id and x.role = 'admin') as admins
    from public.memberships m join public.teams t on t.id = m.team_id
    where m.user_id = auth.uid() and m.role = 'admin'
  loop
    if r.members > 1 and r.admins = 1 then
      raise exception 'forbidden: You are the only admin of "%". Make someone else admin first.', r.name;
    end if;
  end loop;
  delete from public.teams t where exists (
    select 1 from public.memberships m where m.team_id = t.id and m.user_id = auth.uid()
  ) and (select count(*) from public.memberships x where x.team_id = t.id) = 1;
  delete from auth.users where id = auth.uid();
end $$;

-- Lock down: only the RPCs above are callable by clients; helper functions are not exposed directly.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_team(text, text, integer),
  public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid),
  public.create_invite(uuid, integer),
  public.request_join(text),
  public.decide_join_request(uuid, boolean),
  public.publish_snapshot(uuid, uuid, text, text, text[], jsonb, boolean, text),
  public.unpublish_snapshot(uuid),
  public.delete_my_account(),
  public.is_member(uuid),
  public.is_admin(uuid),
  public.shares_team(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: large replays/logs (team-private) with a 10 MB cap. Paths start with the team id.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-files', 'team-files', false, 10485760, array['application/json', 'application/x-ndjson', 'application/gzip'])
on conflict (id) do nothing;

create policy team_files_select on storage.objects for select to authenticated
  using (bucket_id = 'team-files' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy team_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'team-files' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy team_files_update on storage.objects for update to authenticated
  using (bucket_id = 'team-files' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy team_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'team-files' and public.is_member(((storage.foldername(name))[1])::uuid));
