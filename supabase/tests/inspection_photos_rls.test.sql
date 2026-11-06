-- RLS, storage policy and RPC tests for the photos of a point. Plain pgTAP, so both
-- `npm run test:db` and `supabase test db` can run it. Everything happens in one rolled-back
-- transaction; the files are only rows in storage.objects, nothing reaches the object store.
begin;

select plan(40);

-- Fixtures. Fixed ids start with d0000000, so they cannot clash with the dev seed or other tests.
--   ...0a admin   ...01 employee   ...02 employee   ...03 workshop   ...04 employee, ended yesterday
insert into auth.users (id, email)
select ('d0000000-0000-4000-8000-0000000000' || n)::uuid, 'photo-' || n || '@jd-autoservice.test'
from unnest(array['0a', '01', '02', '03', '04']) as n;

insert into public.employees (user_id, name, role, contract_hours_per_week, end_date)
values
  ('d0000000-0000-4000-8000-00000000000a', 'Photo admin', 'admin', null, null),
  ('d0000000-0000-4000-8000-000000000001', 'Photo employee one', 'employee', 40, null),
  ('d0000000-0000-4000-8000-000000000002', 'Photo employee two', 'employee', 32, null),
  ('d0000000-0000-4000-8000-000000000003', 'Photo workshop', 'workshop', null, null),
  ('d0000000-0000-4000-8000-000000000004', 'Photo ended employee', 'employee', 24,
     (now() at time zone 'Europe/Amsterdam')::date - 1);

create function pg_temp.act_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
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

-- Ids and paths made during the test are kept in settings, which every role can read.
create function pg_temp.saved(p_key text) returns uuid
language sql as $$ select current_setting('test.' || p_key)::uuid $$;

-- A photo path under a saved inspection and point, with a fixed photo id.
create function pg_temp.path(p_insp text, p_item text, p_photo text) returns text
language sql as $$
  select pg_temp.saved(p_insp) || '/' || pg_temp.saved(p_item) || '/d0000000-0000-4000-8000-0000000f0' || p_photo || '.jpg'
$$;

-- An upload as the Storage API does it: a row in storage.objects owned by the caller.
create function pg_temp.upload(p_name text) returns void
language sql as $$
  insert into storage.objects (bucket_id, name, owner_id)
  values ('inspection-photos', p_name, (select auth.uid())::text)
$$;

-- A delete as the Storage API does it, as the caller. Returns how many files the policies let go.
create function pg_temp.remove(p_name text) returns bigint
language plpgsql as $$
declare
  v_count bigint;
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'inspection-photos' and name = p_name;
  get diagnostics v_count = row_count;
  perform set_config('storage.allow_delete_query', 'false', true);
  return v_count;
end;
$$;

-- As postgres, past RLS: is the file there?
create function pg_temp.file_exists(p_name text) returns boolean
language sql security definer as $$
  select exists (select 1 from storage.objects where bucket_id = 'inspection-photos' and name = p_name)
$$;

grant execute on function pg_temp.act_as(uuid) to public;
grant execute on function pg_temp.act_as_anon() to public;
grant execute on function pg_temp.saved(text) to public;
grant execute on function pg_temp.path(text, text, text) to public;
grant execute on function pg_temp.upload(text) to public;
grant execute on function pg_temp.remove(text) to public;
grant execute on function pg_temp.file_exists(text) to public;

-- Inspections to work with: one of employee one with two points, one of employee two.
select set_config('test.checklist', (select id::text from public.checklists where name = 'Grote beurt'), true);

select pg_temp.act_as('d0000000-0000-4000-8000-000000000001');
select set_config('test.insp', public.start_inspection(pg_temp.saved('checklist'), 'ZZ-001-P', 1000)::text, true);
select set_config('test.item',
  (select id::text from public.inspection_items where inspection_id = pg_temp.saved('insp') order by block_sort, sort limit 1), true);
select set_config('test.item2',
  (select id::text from public.inspection_items where inspection_id = pg_temp.saved('insp') order by block_sort, sort offset 1 limit 1), true);

select pg_temp.act_as('d0000000-0000-4000-8000-000000000002');
select set_config('test.insp2', public.start_inspection(pg_temp.saved('checklist'), 'ZZ-002-P', 2000)::text, true);
select set_config('test.item3',
  (select id::text from public.inspection_items where inspection_id = pg_temp.saved('insp2') order by block_sort, sort limit 1), true);

reset role;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

select is(
  (select public::text || ' ' || file_size_limit || ' ' || array_to_string(allowed_mime_types, ',')
   from storage.buckets where id = 'inspection-photos'),
  'false 1048576 image/jpeg',
  'the bucket is private, takes at most 1 MB and only JPEG'
);

select ok(
  not has_table_privilege('anon', 'public.inspection_photos', 'select, insert, update, delete'),
  'anon has no privileges on inspection_photos'
);

select ok(
  not has_table_privilege('authenticated', 'public.inspection_photos', 'insert, update, delete'),
  'authenticated has no write privileges on inspection_photos'
);

select ok(
  not has_function_privilege('anon', 'public.add_item_photo(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.delete_item_photo(uuid)', 'execute'),
  'anon cannot run the photo functions'
);

select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and cmd = 'UPDATE'
       and policyname like 'inspection_photos%' $$,
  'there is no update policy, so a file cannot be overwritten or moved'
);

-- ---------------------------------------------------------------------------
-- employee one: own draft
-- ---------------------------------------------------------------------------

select pg_temp.act_as('d0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ select pg_temp.upload(pg_temp.path('insp', 'item', '001')) $$,
  'employee uploads a file to a point of their own draft'
);

select is(
  public.add_item_photo(pg_temp.saved('item'), pg_temp.path('insp', 'item', '001')),
  'd0000000-0000-4000-8000-0000000f0001'::uuid,
  'add_item_photo registers it, with the id from the path'
);

select is(
  (select created_by from public.inspection_photos where id = 'd0000000-0000-4000-8000-0000000f0001'),
  'd0000000-0000-4000-8000-000000000001'::uuid,
  'the photo row names the employee'
);

select throws_ok(
  $$ select pg_temp.upload(pg_temp.saved('insp') || '/' || pg_temp.saved('item') || '/photo.png') $$,
  '42501', null,
  'a path of another form is refused'
);

select throws_ok(
  $$ select pg_temp.upload(pg_temp.path('insp', 'item3', '002')) $$,
  '42501', null,
  'a point of another inspection under this inspection is refused'
);

select throws_ok(
  $$ select pg_temp.upload(pg_temp.path('insp2', 'item3', '003')) $$,
  '42501', null,
  'employee cannot upload to the draft of a colleague'
);

select throws_ok(
  $$ select public.add_item_photo(pg_temp.saved('item'), pg_temp.path('insp', 'item', '009')) $$,
  'P0002', 'photo file not found',
  'add_item_photo refuses a path without a file'
);

select throws_ok(
  $$ select public.add_item_photo(pg_temp.saved('item2'), pg_temp.path('insp', 'item', '001')) $$,
  '22023', 'the path is not a photo path of this point',
  'add_item_photo refuses a path of another point'
);

select throws_ok(
  $$ select public.add_item_photo(pg_temp.saved('item'), pg_temp.path('insp', 'item', '001')) $$,
  '23505', null,
  'the same file cannot be registered twice'
);

select lives_ok(
  $$ select pg_temp.upload(pg_temp.path('insp', 'item', '002'));
     select public.add_item_photo(pg_temp.saved('item'), pg_temp.path('insp', 'item', '002'));
     select pg_temp.upload(pg_temp.path('insp', 'item', '003'));
     select public.add_item_photo(pg_temp.saved('item'), pg_temp.path('insp', 'item', '003')) $$,
  'employee adds a second and a third photo'
);

select lives_ok(
  $$ select pg_temp.upload(pg_temp.path('insp', 'item', '004')) $$,
  'a fourth file can still be uploaded, as room for a retry'
);

select throws_ok(
  $$ select public.add_item_photo(pg_temp.saved('item'), pg_temp.path('insp', 'item', '004')) $$,
  '22023', 'a point has at most 3 photos',
  'add_item_photo refuses a fourth photo'
);

select lives_ok(
  $$ select pg_temp.upload(pg_temp.path('insp', 'item', '005'));
     select pg_temp.upload(pg_temp.path('insp', 'item', '006')) $$,
  'up to 6 files per point'
);

select throws_ok(
  $$ select pg_temp.upload(pg_temp.path('insp', 'item', '007')) $$,
  '42501', null,
  'a seventh file for the same point is refused'
);

select is(
  pg_temp.remove(pg_temp.path('insp', 'item', '001')),
  0::bigint,
  'a file with a photo row cannot be deleted'
);

select is(
  public.delete_item_photo('d0000000-0000-4000-8000-0000000f0001'),
  pg_temp.path('insp', 'item', '001'),
  'delete_item_photo removes the row and returns the path'
);

select is(
  pg_temp.remove(pg_temp.path('insp', 'item', '001')),
  1::bigint,
  'then the file can be deleted'
);

select is(
  pg_temp.remove(pg_temp.path('insp', 'item', '004')),
  1::bigint,
  'a file that was never registered can be deleted by its uploader'
);

-- ---------------------------------------------------------------------------
-- employee two: own draft, and the photos of a colleague
-- ---------------------------------------------------------------------------

select pg_temp.act_as('d0000000-0000-4000-8000-000000000002');

select lives_ok(
  $$ select pg_temp.upload(pg_temp.path('insp2', 'item3', '011'));
     select public.add_item_photo(pg_temp.saved('item3'), pg_temp.path('insp2', 'item3', '011'));
     select pg_temp.upload(pg_temp.path('insp2', 'item3', '012')) $$,
  'employee two adds a photo to their own draft, and uploads one more file'
);

select is(
  (select count(*) from public.inspection_photos p
   join public.inspection_items i on i.id = p.item_id
   where i.inspection_id = pg_temp.saved('insp')),
  2::bigint,
  'employee two sees the photos of a colleague, like the rest of their inspections'
);

select throws_ok(
  $$ select public.delete_item_photo('d0000000-0000-4000-8000-0000000f0002') $$,
  'P0002', null,
  'employee two cannot remove a photo from the draft of a colleague'
);

select is(
  pg_temp.remove(pg_temp.path('insp', 'item', '005')),
  0::bigint,
  'employee two cannot delete a file in the draft of a colleague'
);

-- ---------------------------------------------------------------------------
-- workshop, anon and an ended employee: nothing
-- ---------------------------------------------------------------------------

select pg_temp.act_as('d0000000-0000-4000-8000-000000000003');

select is_empty($$ select 1 from public.inspection_photos $$, 'workshop sees no photo rows');
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'inspection-photos' $$,
  'workshop sees no photo files'
);
select throws_ok(
  $$ select pg_temp.upload(pg_temp.path('insp', 'item2', '021')) $$,
  '42501', null,
  'workshop cannot upload'
);
select throws_ok(
  $$ select public.add_item_photo(pg_temp.saved('item'), pg_temp.path('insp', 'item', '002')) $$,
  '42501', 'not allowed',
  'workshop cannot register a photo'
);

select pg_temp.act_as_anon();

select throws_ok(
  $$ select 1 from public.inspection_photos $$,
  '42501', null,
  'anon cannot read photo rows'
);
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'inspection-photos' $$,
  'anon sees no photo files'
);

select pg_temp.act_as('d0000000-0000-4000-8000-000000000004');

select throws_ok(
  $$ select pg_temp.upload(pg_temp.path('insp', 'item2', '031')) $$,
  '42501', null,
  'an ended employee cannot upload'
);

-- ---------------------------------------------------------------------------
-- admin: the draft of an employee
-- ---------------------------------------------------------------------------

select pg_temp.act_as('d0000000-0000-4000-8000-00000000000a');

select lives_ok(
  $$ select pg_temp.upload(pg_temp.path('insp', 'item2', '041'));
     select public.add_item_photo(pg_temp.saved('item2'), pg_temp.path('insp', 'item2', '041')) $$,
  'admin adds a photo to the draft of an employee'
);

select is(
  public.delete_item_photo('d0000000-0000-4000-8000-0000000f0041'),
  pg_temp.path('insp', 'item2', '041'),
  'admin removes it again'
);

-- ---------------------------------------------------------------------------
-- A completed inspection is fixed
-- ---------------------------------------------------------------------------

select pg_temp.act_as('d0000000-0000-4000-8000-000000000001');

select public.set_item_results(array(select id from public.inspection_items where inspection_id = pg_temp.saved('insp')), 'ok', null, null);
select public.complete_inspection(pg_temp.saved('insp'), null);

select throws_ok(
  $$ select pg_temp.upload(pg_temp.path('insp', 'item2', '051')) $$,
  '42501', null,
  'no uploads to a completed inspection'
);

select throws_ok(
  $$ select public.delete_item_photo('d0000000-0000-4000-8000-0000000f0002') $$,
  'P0002', 'inspection not found or not editable',
  'no photo can be removed from a completed inspection'
);

-- ---------------------------------------------------------------------------
-- A thrown-away draft: the rows go with it, the files can then be deleted
-- ---------------------------------------------------------------------------

select pg_temp.act_as('d0000000-0000-4000-8000-000000000002');

select public.discard_inspection(pg_temp.saved('insp2'));

select is(
  pg_temp.remove(pg_temp.path('insp2', 'item3', '011')),
  1::bigint,
  'after throwing the draft away its files can be deleted'
);

reset role;

select ok(
  not pg_temp.file_exists(pg_temp.path('insp2', 'item3', '011'))
    and pg_temp.file_exists(pg_temp.path('insp2', 'item3', '012')),
  'only the deleted file is gone'
);

select * from finish();
rollback;
