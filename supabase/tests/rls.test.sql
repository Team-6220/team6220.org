-- Row-level security tests (PRD §20 "Backend tests"). Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Test users
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-00000000000a', 'alice@team6220.org', '{}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{}', 'authenticated', 'authenticated');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select is((select count(*)::int from public.profiles), 2, 'profiles are created on sign-up');

set local role authenticated;

-- Alice creates a team and a design
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table ids as select (select id from public.create_team('Golden Griffins', 'frc_team', 6220)) as team_id;
grant select on ids to authenticated;
select is((select role from public.memberships where team_id = (select team_id from ids)), 'admin', 'creator is admin');
insert into public.team_docs (team_id, kind, name, data)
values ((select team_id from ids), 'design', 'Bot', '{"schemaVersion":1,"name":"Bot"}');
select is((select version from public.team_docs where name = 'Bot'), 1, 'new docs start at version 1');
select is((select count(*)::int from public.doc_versions), 1, 'design history starts');

-- Bob is not a member
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.teams), 0, 'non-member cannot see the team');
select is((select count(*)::int from public.team_docs), 0, 'non-member cannot see team docs');
select is((select count(*)::int from public.doc_versions), 0, 'non-member cannot see history');
select throws_ok(
  $$ insert into public.team_docs (team_id, kind, name, data) values ((select team_id from ids), 'design', 'X', '{}') $$,
  '42501', null, 'non-member cannot insert team docs');
update public.team_docs set name = 'hacked', version = 2 where name = 'Bot';
delete from public.team_docs where name = 'Bot';
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is((select name from public.team_docs where kind = 'design'), 'Bot', 'non-member update/delete affected nothing');

-- Invite flow
create temp table inv as select code from public.create_invite((select team_id from ids), 7);
grant select on inv to authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.create_invite((select team_id from ids), 7) $$, 'P0001', null, 'members/outsiders cannot create invites');
create temp table req as select id from public.request_join((select code from inv));
grant select on req to authenticated;
select is((select count(*)::int from public.team_docs), 0, 'pending request grants no access');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.decide_join_request((select id from req), true) $$, 'admin approves');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.team_docs), 1, 'approved member sees team docs');

-- Optimistic concurrency: stale version updates nothing
update public.team_docs set name = 'Bot v2', version = 2 where name = 'Bot' and version = 1;
update public.team_docs set name = 'stale', version = 2 where name = 'Bot v2' and version = 1;
select is((select name from public.team_docs where kind = 'design'), 'Bot v2', 'stale save does not overwrite');
select throws_ok($$ update public.team_docs set version = 9 where kind = 'design' $$, 'P0001', null, 'version must increase by one');

-- Members cannot do admin actions
select throws_ok($$ select public.set_member_role((select team_id from ids), '00000000-0000-0000-0000-00000000000b', 'admin') $$,
  'P0001', null, 'member cannot promote themselves');
delete from public.teams;
select is((select count(*)::int from public.teams), 1, 'member cannot delete the team');

-- Publishing: admin only, public read-only
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.team_docs (team_id, kind, name, data)
values ((select team_id from ids), 'testRun', 'Sweep', '{"gameId":"rebuilt-2026","summary":{"mean":88}}');
select lives_ok($$
  select public.publish_snapshot((select team_id from ids), (select id from public.team_docs where kind = 'testRun'),
    'Public test', '', '{}', '{"stats": true}', true, 'CC BY 4.0') $$, 'admin publishes');
reset role;
set local role anon;
select is((select count(*)::int from public.published_snapshots where attribution is null), 1, 'anyone can read published tests; anonymous hides the team');
select is((select count(*)::int from public.snapshot_owners), 0, 'anon cannot see who owns a snapshot');

select * from finish();
rollback;
