-- RLS and RPC tests for public.employees. Plain pgTAP, so both `npm run test:db`
-- and `supabase test db` can run it. Everything happens in one rolled-back transaction.
begin;

select plan(36);

-- Fixtures. Fixed ids start with b0000000, so they cannot clash with the dev seed.
--   ...0a admin       ...01 employee (40 h)   ...02 employee (32 h)   ...03 workshop
--   ...04 employee, ended yesterday           ...05 admin, ended yesterday
--   ...06 employee, last day is today         ...07 user without an employees row
insert into auth.users (id, email)
select ('b0000000-0000-4000-8000-0000000000' || n)::uuid, 'test-' || n || '@jd-autoservice.test'
from unnest(array['0a', '01', '02', '03', '04', '05', '06', '07']) as n;

insert into public.employees (user_id, name, role, contract_hours_per_week, end_date)
values
  ('b0000000-0000-4000-8000-00000000000a', 'Test admin', 'admin', null, null),
  ('b0000000-0000-4000-8000-000000000001', 'Test employee one', 'employee', 40, null),
  ('b0000000-0000-4000-8000-000000000002', 'Test employee two', 'employee', 32, null),
  ('b0000000-0000-4000-8000-000000000003', 'Test workshop', 'workshop', null, null),
  ('b0000000-0000-4000-8000-000000000004', 'Test ended employee', 'employee', 24,
     (now() at time zone 'Europe/Amsterdam')::date - 1),
  ('b0000000-0000-4000-8000-000000000005', 'Test ended admin', 'admin', null,
     (now() at time zone 'Europe/Amsterdam')::date - 1),
  ('b0000000-0000-4000-8000-000000000006', 'Test last day', 'employee', 16,
     (now() at time zone 'Europe/Amsterdam')::date);

-- Personas. These set the same GUCs PostgREST sets for a request.
create function pg_temp.act_as(p_uid uuid, p_claims jsonb default '{}'::jsonb) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    (jsonb_build_object('sub', p_uid, 'role', 'authenticated') || p_claims)::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.act_as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Our migration revokes execute on new functions, and the personas call these helpers
-- while already acting as another role.
grant execute on function pg_temp.act_as(uuid, jsonb) to public;
grant execute on function pg_temp.act_as_anon() to public;

-- ---------------------------------------------------------------------------
-- Catalog checks. These also guard every table and function added later.
-- ---------------------------------------------------------------------------

select columns_are(
  'public', 'employees',
  array['user_id', 'name', 'role', 'contract_hours_per_week', 'end_date'],
  'employees has exactly the agreed columns'
);

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'RLS is enabled on every table in public'
);

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and not exists (select 1 from pg_policy p where p.polrelid = c.oid) $$,
  'every table in public has at least one explicit policy'
);

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as c where c like 'search_path=%'
       ) $$,
  'every SECURITY DEFINER function has a fixed search_path'
);

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef
       and has_function_privilege('anon', p.oid, 'execute') $$,
  'anon cannot execute any SECURITY DEFINER function'
);

select ok(
  not has_table_privilege('anon', 'public.employees', 'select')
  and not has_table_privilege('anon', 'public.employees', 'insert')
  and not has_table_privilege('anon', 'public.employees', 'update')
  and not has_table_privilege('anon', 'public.employees', 'delete'),
  'anon has no privileges on employees'
);

select ok(
  not has_table_privilege('authenticated', 'public.employees', 'insert')
  and not has_table_privilege('authenticated', 'public.employees', 'update')
  and not has_table_privilege('authenticated', 'public.employees', 'delete'),
  'authenticated has no write privileges on employees'
);

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------

select pg_temp.act_as_anon();

select throws_ok(
  $$ select * from public.employees $$,
  '42501', null,
  'anon cannot read employees'
);

select throws_ok(
  $$ select public.admin_update_employee('b0000000-0000-4000-8000-000000000001'::uuid, 'x'::text,
       'employee'::public.app_role, 40::numeric, null::date) $$,
  '42501', null,
  'anon cannot call the admin RPC'
);

-- ---------------------------------------------------------------------------
-- employee
-- ---------------------------------------------------------------------------

select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');

select results_eq(
  $$ select user_id from public.employees $$,
  $$ values ('b0000000-0000-4000-8000-000000000001'::uuid) $$,
  'employee sees exactly their own row'
);

select is_empty(
  $$ select 1 from public.employees where user_id = 'b0000000-0000-4000-8000-000000000002' $$,
  'employee cannot read a colleague by id'
);

select throws_ok(
  $$ insert into public.employees (user_id, name, role)
     values ('b0000000-0000-4000-8000-000000000007', 'x', 'admin') $$,
  '42501', null,
  'employee cannot insert'
);

select throws_ok(
  $$ update public.employees set role = 'admin' where user_id = 'b0000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'employee cannot update, not even their own role'
);

select throws_ok(
  $$ delete from public.employees where user_id = 'b0000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'employee cannot delete'
);

select throws_ok(
  $$ select public.admin_update_employee('b0000000-0000-4000-8000-000000000002'::uuid, 'x'::text,
       'employee'::public.app_role, 40::numeric, null::date) $$,
  '42501', 'not allowed',
  'employee cannot call the admin RPC'
);

-- ---------------------------------------------------------------------------
-- workshop: never sees hours of any employee
-- ---------------------------------------------------------------------------

select pg_temp.act_as('b0000000-0000-4000-8000-000000000003');

select results_eq(
  $$ select user_id from public.employees $$,
  $$ values ('b0000000-0000-4000-8000-000000000003'::uuid) $$,
  'workshop sees only its own row'
);

select is(
  (select count(*) from public.employees where contract_hours_per_week is not null),
  0::bigint,
  'workshop sees no contract hours of anyone'
);

select throws_ok(
  $$ select public.admin_update_employee('b0000000-0000-4000-8000-000000000001'::uuid, 'x'::text,
       'employee'::public.app_role, 40::numeric, null::date) $$,
  '42501', 'not allowed',
  'workshop cannot call the admin RPC'
);

-- ---------------------------------------------------------------------------
-- admin
-- ---------------------------------------------------------------------------

select pg_temp.act_as('b0000000-0000-4000-8000-00000000000a');

select is(
  (select count(*) from public.employees where user_id::text like 'b0000000-%'),
  7::bigint,
  'admin sees every employee row'
);

select throws_ok(
  $$ insert into public.employees (user_id, name, role)
     values ('b0000000-0000-4000-8000-000000000007', 'x', 'employee') $$,
  '42501', null,
  'admin cannot insert directly either'
);

select throws_ok(
  $$ update public.employees set name = 'x' where user_id = 'b0000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'admin cannot update directly either'
);

select lives_ok(
  $$ select public.admin_update_employee('b0000000-0000-4000-8000-000000000001'::uuid, '  Sem V  '::text,
       'employee'::public.app_role, 36::numeric, null::date) $$,
  'admin can correct a row through the RPC'
);

select is(
  (select name || ' / ' || contract_hours_per_week::text from public.employees
   where user_id = 'b0000000-0000-4000-8000-000000000001'),
  'Sem V / 36.0',
  'the RPC saved the trimmed name and the hours'
);

select throws_ok(
  $$ select public.admin_update_employee('b0000000-0000-4000-8000-000000000001'::uuid, 'x'::text,
       'employee'::public.app_role, 61::numeric, null::date) $$,
  '22023', null,
  'the RPC rejects more than 60 contract hours'
);

select throws_ok(
  $$ select public.admin_update_employee('b0000000-0000-4000-8000-000000000001'::uuid, '   '::text,
       'employee'::public.app_role, 40::numeric, null::date) $$,
  '22023', null,
  'the RPC rejects an empty name'
);

select throws_ok(
  $$ select public.admin_update_employee('b0000000-0000-4000-8000-000000000001'::uuid, 'x'::text,
       null::public.app_role, 40::numeric, null::date) $$,
  '22023', null,
  'the RPC rejects a missing role'
);

select throws_ok(
  $$ select public.admin_update_employee('b0000000-0000-4000-8000-000000000003'::uuid, 'x'::text,
       'workshop'::public.app_role, 8::numeric, null::date) $$,
  '22023', null,
  'the RPC rejects contract hours on the workshop account'
);

select throws_ok(
  $$ select public.admin_update_employee('b0000000-0000-4000-8000-0000000000ff'::uuid, 'x'::text,
       'employee'::public.app_role, 40::numeric, null::date) $$,
  'P0002', null,
  'the RPC rejects an unknown employee'
);

select throws_ok(
  $$ select public.admin_update_employee('b0000000-0000-4000-8000-00000000000a'::uuid, 'Test admin'::text,
       'employee'::public.app_role, null::numeric, null::date) $$,
  '22023', null,
  'an admin cannot demote themselves'
);

select throws_ok(
  $$ select public.admin_update_employee('b0000000-0000-4000-8000-00000000000a'::uuid, 'Test admin'::text,
       'admin'::public.app_role, null::numeric, current_date + 30) $$,
  '22023', null,
  'an admin cannot set an end date on themselves'
);

-- ---------------------------------------------------------------------------
-- ended accounts, accounts without a row, and spoofed claims
-- ---------------------------------------------------------------------------

select pg_temp.act_as('b0000000-0000-4000-8000-000000000004');

select is_empty(
  $$ select 1 from public.employees $$,
  'an employee past their end date sees nothing'
);

select pg_temp.act_as('b0000000-0000-4000-8000-000000000005');

select is_empty(
  $$ select 1 from public.employees $$,
  'an admin past their end date sees nothing'
);

select throws_ok(
  $$ select public.admin_update_employee('b0000000-0000-4000-8000-000000000001'::uuid, 'x'::text,
       'employee'::public.app_role, 40::numeric, null::date) $$,
  '42501', 'not allowed',
  'an admin past their end date cannot call the admin RPC'
);

select pg_temp.act_as('b0000000-0000-4000-8000-000000000006');

select results_eq(
  $$ select user_id from public.employees $$,
  $$ values ('b0000000-0000-4000-8000-000000000006'::uuid) $$,
  'on the last day itself an employee still sees their own row'
);

-- Claims the client could influence: user_metadata is user-editable, app_metadata is not,
-- and neither may grant a role. The role only comes from the employees table.
select pg_temp.act_as(
  'b0000000-0000-4000-8000-000000000007',
  '{"role":"authenticated","user_metadata":{"role":"admin"},"app_metadata":{"role":"admin"}}'::jsonb
);

select is_empty(
  $$ select 1 from public.employees $$,
  'a user without an employees row sees nothing, whatever the claims say'
);

select pg_temp.act_as(
  'b0000000-0000-4000-8000-000000000002',
  '{"user_metadata":{"role":"admin"},"app_metadata":{"role":"admin"}}'::jsonb
);

select is(
  (select count(*) from public.employees),
  1::bigint,
  'an employee claiming admin in user_metadata or app_metadata still sees one row'
);

reset role;
select * from finish();
rollback;
