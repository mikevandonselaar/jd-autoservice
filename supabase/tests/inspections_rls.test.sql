-- RLS and RPC tests for checklists and inspections. Plain pgTAP, so both `npm run test:db`
-- and `supabase test db` can run it. Everything happens in one rolled-back transaction.
begin;

select plan(84);

-- Fixtures. Fixed ids start with c0000000, so they cannot clash with the dev seed.
--   ...0a admin   ...01 employee   ...02 employee   ...03 workshop   ...04 employee, ended yesterday
insert into auth.users (id, email)
select ('c0000000-0000-4000-8000-0000000000' || n)::uuid, 'insp-' || n || '@jd-autoservice.test'
from unnest(array['0a', '01', '02', '03', '04']) as n;

insert into public.employees (user_id, name, role, contract_hours_per_week, end_date)
values
  ('c0000000-0000-4000-8000-00000000000a', 'Test admin', 'admin', null, null),
  ('c0000000-0000-4000-8000-000000000001', 'Test employee one', 'employee', 40, null),
  ('c0000000-0000-4000-8000-000000000002', 'Test employee two', 'employee', 32, null),
  ('c0000000-0000-4000-8000-000000000003', 'Test workshop', 'workshop', null, null),
  ('c0000000-0000-4000-8000-000000000004', 'Test ended employee', 'employee', 24,
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

grant execute on function pg_temp.act_as(uuid) to public;
grant execute on function pg_temp.act_as_anon() to public;

-- Ids created during the test are kept in settings, which every role can read.
create function pg_temp.saved(p_key text) returns uuid
language sql as $$ select current_setting('test.' || p_key)::uuid $$;
grant execute on function pg_temp.saved(text) to public;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

select is_empty(
  $$ select t from unnest(array['part_types', 'checklists', 'checklist_blocks', 'checklist_points',
       'checklist_measurements', 'inspections', 'inspection_items', 'inspection_readings']) as t
     where has_table_privilege('anon', 'public.' || t, 'select, insert, update, delete') $$,
  'anon has no privileges on the inspection tables'
);

select is_empty(
  $$ select t from unnest(array['part_types', 'checklists', 'checklist_blocks', 'checklist_points',
       'checklist_measurements', 'inspections', 'inspection_items', 'inspection_readings']) as t
     where has_table_privilege('authenticated', 'public.' || t, 'insert, update, delete') $$,
  'authenticated has no write privileges on the inspection tables'
);

select is(
  (select count(*) from public.checklist_points p
   join public.checklist_blocks b on b.id = p.block_id
   join public.checklists c on c.id = b.checklist_id
   where c.name = 'Grote beurt'),
  44::bigint,
  'Grote beurt has 44 points'
);

select is(
  (select count(*) from public.checklist_measurements m
   join public.checklist_points p on p.id = m.point_id
   join public.checklist_blocks b on b.id = p.block_id
   join public.checklists c on c.id = b.checklist_id
   where c.name = 'Grote beurt'),
  10::bigint,
  'Grote beurt has 10 measurements'
);

select is(
  (select string_agg(p.label, ', ' order by p.sort) from public.checklist_points p
   join public.checklist_blocks b on b.id = p.block_id
   join public.checklists c on c.id = b.checklist_id
   where c.name = 'Grote beurt' and b.name = 'Wielen en remmen' and p.sort <= 4),
  'Remblokken voor, Remschijven voor, Remblokken achter, Remschijven achter',
  'brake pads and brake discs are separate points'
);

select is(
  (select coalesce(p.min_age_years::text, '-') from public.checklist_points p
   join public.checklist_blocks b on b.id = p.block_id
   join public.checklists c on c.id = b.checklist_id
   where c.name = 'Kleine beurt' and p.label = 'Koelvloeistof'),
  '10',
  'Kleine beurt measures the coolant from 10 years'
);

select set_config('test.checklist', (select id::text from public.checklists where name = 'Grote beurt'), true);

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------

select pg_temp.act_as_anon();

select throws_ok(
  $$ select * from public.checklists $$,
  '42501', null,
  'anon cannot read checklists'
);

select throws_ok(
  $$ select public.start_inspection(pg_temp.saved('checklist'), 'K-482-NV', 1000) $$,
  '42501', null,
  'anon cannot start an inspection'
);

-- ---------------------------------------------------------------------------
-- workshop: no access to inspections at all
-- ---------------------------------------------------------------------------

select pg_temp.act_as('c0000000-0000-4000-8000-000000000003');

select is_empty($$ select 1 from public.checklists $$, 'workshop sees no checklists');
select is_empty($$ select 1 from public.part_types $$, 'workshop sees no part types');

select throws_ok(
  $$ select public.start_inspection(pg_temp.saved('checklist'), 'K-482-NV', 1000) $$,
  '42501', 'not allowed',
  'workshop cannot start an inspection'
);

-- ---------------------------------------------------------------------------
-- employee one: a whole inspection
-- ---------------------------------------------------------------------------

select pg_temp.act_as('c0000000-0000-4000-8000-000000000001');

select is(
  (select count(*) from public.checklists where name = 'Grote beurt'),
  1::bigint,
  'employee sees the checklists'
);

select ok(
  set_config('test.insp', public.start_inspection(pg_temp.saved('checklist'), ' k-482-nv ', 148352)::text, true)
    is not null,
  'employee starts an inspection'
);

select is(
  (select plate || ' ' || plate_key || ' ' || odometer_km || ' ' || status || ' ' || checklist_name
   from public.inspections where id = pg_temp.saved('insp')),
  'K-482-NV K482NV 148352 draft Grote beurt',
  'the plate is normalised and the inspection is a draft'
);

select is(
  (select mechanic_id from public.inspections where id = pg_temp.saved('insp')),
  'c0000000-0000-4000-8000-000000000001'::uuid,
  'the caller is the mechanic'
);

select is(
  (select count(*) filter (where status = 'open') from public.inspection_items
   where inspection_id = pg_temp.saved('insp')),
  44::bigint,
  'without a build year the inspection copied all 44 points, all open'
);

select is(
  (select count(*) from public.inspection_readings r
   join public.inspection_items i on i.id = r.item_id
   where i.inspection_id = pg_temp.saved('insp')),
  10::bigint,
  'the inspection copied the 10 measurements'
);

select is(
  (select reason_options[1] from public.inspection_items
   where inspection_id = pg_temp.saved('insp') and label = 'Remblokken voor'),
  'Versleten',
  'a point copied the reasons of its part type'
);

select is(
  (select r.direction::text || ' ' || r.advice_limit || ' ' || r.fault_limit
   from public.inspection_readings r join public.inspection_items i on i.id = r.item_id
   where i.inspection_id = pg_temp.saved('insp') and i.label = 'Remvloeistof'),
  'higher_is_worse 1.00 2.00',
  'a measurement copied its direction and limits'
);

select throws_ok(
  $$ select public.start_inspection(pg_temp.saved('checklist'), 'K 482/NV', 1000) $$,
  '22023', null,
  'start rejects a plate with other characters'
);

select throws_ok(
  $$ select public.start_inspection(pg_temp.saved('checklist'), 'K-482-NV', -1) $$,
  '22023', null,
  'start rejects a negative mileage'
);

select throws_ok(
  $$ select public.start_inspection('c0000000-0000-4000-8000-0000000000ff', 'K-482-NV', 1000) $$,
  'P0002', null,
  'start rejects an unknown checklist'
);

select set_config('test.item1', (select id::text from public.inspection_items
  where inspection_id = pg_temp.saved('insp') order by block_sort, sort limit 1), true);
select set_config('test.item2', (select id::text from public.inspection_items
  where inspection_id = pg_temp.saved('insp') order by block_sort, sort offset 1 limit 1), true);
select set_config('test.reading', (select r.id::text from public.inspection_readings r
  join public.inspection_items i on i.id = r.item_id
  where i.inspection_id = pg_temp.saved('insp') order by i.block_sort, i.sort, r.sort limit 1), true);

select lives_ok(
  $$ select public.set_item_results(array[pg_temp.saved('item1')], 'ok', null, 'ignored') $$,
  'employee sets a point to ok'
);

select lives_ok(
  $$ select public.set_item_results(array[pg_temp.saved('item2')], 'advice', 'next_service', '  Versleten  ') $$,
  'employee sets a point to advice with a term'
);

select is(
  (select coalesce(a.reason, '-') || ' / ' || b.status || ' ' || b.term || ' ' || b.reason
   from public.inspection_items a, public.inspection_items b
   where a.id = pg_temp.saved('item1') and b.id = pg_temp.saved('item2')),
  '- / advice next_service Versleten',
  'ok drops the reason, advice keeps the trimmed reason and the term'
);

select throws_ok(
  $$ select public.set_item_results(array[pg_temp.saved('item1')], 'advice', null, null) $$,
  '22023', null,
  'an advice without a term is rejected'
);

select throws_ok(
  $$ select public.set_item_results(array[pg_temp.saved('item1')], 'fault', 'few_months', null) $$,
  '22023', null,
  'a term on anything but an advice is rejected'
);

select throws_ok(
  $$ select public.set_item_results(array['c0000000-0000-4000-8000-0000000000ff'::uuid], 'ok', null, null) $$,
  'P0002', null,
  'an unknown point is rejected'
);

select lives_ok(
  $$ select public.set_reading(pg_temp.saved('reading'), 1.4) $$,
  'employee saves a measurement'
);

select is(
  (select value from public.inspection_readings where id = pg_temp.saved('reading')),
  1.40::numeric,
  'the measurement is stored'
);

select throws_ok(
  $$ select public.set_reading(pg_temp.saved('reading'), 1.234) $$,
  '22023', null,
  'a measurement with three decimals is rejected'
);

select is(
  (select count(*) from public.inspection_readings r join public.inspection_items i on i.id = r.item_id
   where i.inspection_id = pg_temp.saved('insp') and r.or_more_value = 5),
  4::bigint,
  'the four tyres copied the "5 or more" value'
);

select set_config('test.tyre', (select r.id::text from public.inspection_readings r
  join public.inspection_items i on i.id = r.item_id
  where i.inspection_id = pg_temp.saved('insp') and r.label = 'LV'), true);

select lives_ok(
  $$ select public.set_reading(pg_temp.saved('tyre'), 5, true) $$,
  'employee saves "5 or more"'
);

select is(
  (select value || ' ' || or_more from public.inspection_readings where id = pg_temp.saved('tyre')),
  '5.00 true',
  'the value is stored with the "or more" flag'
);

select throws_ok(
  $$ select public.set_reading(pg_temp.saved('tyre'), 4.5, true) $$,
  '22023', null,
  '"or more" is rejected for another value than the one of the measurement'
);

select throws_ok(
  $$ select public.set_reading(pg_temp.saved('tyre'), null, true) $$,
  '22023', null,
  '"or more" without a value is rejected'
);

select lives_ok(
  $$ select public.set_reading(pg_temp.saved('tyre'), 4.5) $$,
  'employee types an exact value over "5 or more"'
);

select is(
  (select value || ' ' || or_more from public.inspection_readings where id = pg_temp.saved('tyre')),
  '4.50 false',
  'an exact value clears the "or more" flag'
);

select set_config('test.coolant', (select r.id::text from public.inspection_readings r
  join public.inspection_items i on i.id = r.item_id
  where i.inspection_id = pg_temp.saved('insp') and i.label = 'Koelvloeistof'), true);

select lives_ok(
  $$ select public.set_reading(pg_temp.saved('coolant'), -20) $$,
  'employee saves a freezing point below zero'
);

select is(
  (select value from public.inspection_readings where id = pg_temp.saved('coolant')),
  -20.00::numeric,
  'the value below zero is stored'
);

select throws_ok(
  $$ update public.inspection_items set status = 'ok' where inspection_id = pg_temp.saved('insp') $$,
  '42501', null,
  'employee cannot update points directly'
);

select throws_ok(
  $$ select public.complete_inspection(pg_temp.saved('insp'), null) $$,
  '22023', null,
  'an inspection with open points cannot be completed'
);

select throws_ok(
  $$ select public.admin_save_checklist(null, 'Testlijst', '[{"name":"A","points":[{"label":"B"}]}]') $$,
  '42501', 'not allowed',
  'employee cannot create a checklist'
);

select throws_ok(
  $$ select public.admin_save_part_type(null, 'Koppeling', '{Slipt}') $$,
  '42501', 'not allowed',
  'employee cannot create a part type'
);

-- ---------------------------------------------------------------------------
-- employee two: reads a colleague's inspection, cannot change it
-- ---------------------------------------------------------------------------

select pg_temp.act_as('c0000000-0000-4000-8000-000000000002');

select is(
  (select count(*) from public.inspections where id = pg_temp.saved('insp')),
  1::bigint,
  'a colleague can read the inspection, for the history of the car'
);

select throws_ok(
  $$ select public.set_item_results(array[pg_temp.saved('item1')], 'fault', null, null) $$,
  'P0002', null,
  'a colleague cannot change the points'
);

select throws_ok(
  $$ select public.discard_inspection(pg_temp.saved('insp')) $$,
  'P0002', null,
  'a colleague cannot discard the inspection'
);

-- ---------------------------------------------------------------------------
-- employee one: complete, then it is final
-- ---------------------------------------------------------------------------

select pg_temp.act_as('c0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ select public.set_item_results(
       (select array_agg(id) from public.inspection_items
        where inspection_id = pg_temp.saved('insp') and status = 'open'),
       'ok', null, null) $$,
  'employee sets every open point to ok at once'
);

select lives_ok(
  $$ select public.complete_inspection(pg_temp.saved('insp'), '  Klant wacht.  ') $$,
  'employee completes the inspection'
);

select is(
  (select status || ' ' || note || ' ' || (completed_at is not null)
   from public.inspections where id = pg_temp.saved('insp')),
  'completed Klant wacht. true',
  'the inspection is completed with the trimmed note'
);

select throws_ok(
  $$ select public.set_item_results(array[pg_temp.saved('item1')], 'fault', null, null) $$,
  'P0002', null,
  'a completed inspection cannot be changed'
);

select set_config('test.insp2', public.start_inspection(pg_temp.saved('checklist'), 'AB-12-CD', 5000)::text, true);

select lives_ok(
  $$ select public.discard_inspection(pg_temp.saved('insp2')) $$,
  'employee discards their own draft'
);

select is_empty(
  $$ select 1 from public.inspections where id = pg_temp.saved('insp2') $$,
  'the discarded draft is gone, points included'
);

-- ---------------------------------------------------------------------------
-- admin: manage part types and checklists
-- ---------------------------------------------------------------------------

select pg_temp.act_as('c0000000-0000-4000-8000-00000000000a');

select ok(
  set_config('test.part', public.admin_save_part_type(null, ' Koppeling ', '{" Slipt ",Rammelt}')::text, true)
    is not null,
  'admin creates a part type'
);

select is(
  (select name || ': ' || array_to_string(reasons, ', ') from public.part_types where id = pg_temp.saved('part')),
  'Koppeling: Slipt, Rammelt',
  'the name and the reasons are trimmed and keep their order'
);

select throws_ok(
  $$ select public.admin_save_part_type(null, 'Fout', '{Lekt,lekt}') $$,
  '22023', null,
  'duplicate reasons are rejected'
);

select throws_ok(
  $$ select public.admin_save_part_type(null, 'Fout', '{Lekt,"  "}') $$,
  '22023', null,
  'an empty reason is rejected'
);

select ok(
  set_config('test.small', public.admin_save_checklist(null, ' Testlijst ', $json$
    [{"name": "Onder de motorkap", "points": [{"label": "Accu", "part_type": "Koppeling"}, {"label": "Olie"}]},
     {"name": "Wielen", "points": [{"label": "Banden", "measurements": [
       {"label": "LV", "unit": "mm", "advice_limit": 4, "fault_limit": 1.6}]}]}]
  $json$)::text, true) is not null,
  'admin creates a checklist'
);

select is(
  (select string_agg(b.sort || ':' || b.name || '/' || p.sort || ':' || p.label, ', ' order by b.sort, p.sort)
   from public.checklist_blocks b join public.checklist_points p on p.block_id = b.id
   where b.checklist_id = pg_temp.saved('small')),
  '1:Onder de motorkap/1:Accu, 1:Onder de motorkap/2:Olie, 2:Wielen/1:Banden',
  'blocks and points keep the order of the arrays'
);

select ok(
  set_config('test.aged', public.admin_save_checklist(null, 'Leeftijdslijst', $json$
    [{"name": "A", "points": [{"label": "Altijd"},
      {"label": "Oud", "min_age_years": 10},
      {"label": "Veel km", "min_odometer_km": 150000},
      {"label": "Oud of veel km", "min_age_years": 8, "min_odometer_km": 200000}]}]
  $json$)::text, true) is not null,
  'admin creates a checklist with points for older cars'
);

select set_config('test.this_year', extract(year from now() at time zone 'Europe/Amsterdam')::text, true);

select set_config('test.young', public.start_inspection(
  pg_temp.saved('aged'), 'ZZ-01-AA', 50000, current_setting('test.this_year')::integer - 3)::text, true);
select set_config('test.old', public.start_inspection(
  pg_temp.saved('aged'), 'ZZ-02-AA', 50000, current_setting('test.this_year')::integer - 12)::text, true);
select set_config('test.far', public.start_inspection(
  pg_temp.saved('aged'), 'ZZ-03-AA', 160000, current_setting('test.this_year')::integer - 3)::text, true);

select is(
  (select string_agg(label, ', ' order by sort) from public.inspection_items where inspection_id = pg_temp.saved('young')),
  'Altijd',
  'a young car with a low mileage only gets the points for every car'
);

select is(
  (select string_agg(label, ', ' order by sort) from public.inspection_items where inspection_id = pg_temp.saved('old')),
  'Altijd, Oud, Oud of veel km',
  'an old car also gets the points from its age'
);

select is(
  (select string_agg(label, ', ' order by sort) from public.inspection_items where inspection_id = pg_temp.saved('far')),
  'Altijd, Veel km',
  'a high mileage also gets the points from that mileage'
);

select is(
  (select min_age_years || '/' || min_odometer_km || ' ' || i.build_year
   from public.inspection_items t join public.inspections i on i.id = t.inspection_id
   where t.inspection_id = pg_temp.saved('old') and t.label = 'Oud of veel km'),
  '8/200000 ' || (current_setting('test.this_year')::integer - 12),
  'the inspection keeps the build year, and its points the age and mileage they apply from'
);

select throws_ok(
  $$ select public.start_inspection(pg_temp.saved('aged'), 'ZZ-04-AA', 1000, 1800) $$,
  '22023', null,
  'start rejects a build year before 1900'
);

select throws_ok(
  $$ select public.admin_save_checklist(null, 'Fout', '[{"name": "A", "points": [{"label": "B", "min_age_years": 0}]}]') $$,
  '22023', null,
  'a minimum age of 0 years is rejected'
);

select throws_ok(
  $$ select public.admin_save_checklist(null, 'Fout', '[{"name": "A", "points": [{"label": "B", "min_odometer_km": 1.5}]}]') $$,
  '22023', null,
  'a minimum mileage that is not a whole number is rejected'
);

select throws_ok(
  $$ select public.admin_save_checklist(null, 'Leeg', '[]') $$,
  '22023', null,
  'a checklist without blocks is rejected'
);

select throws_ok(
  $$ select public.admin_save_checklist(null, 'Fout', '[{"name": "A", "points": []}]') $$,
  '22023', null,
  'a block without points is rejected'
);

select throws_ok(
  $$ select public.admin_save_checklist(null, 'Fout', '[{"name": "A", "points": [{"label": "B",
       "measurements": [{"label": "LV", "unit": "mm", "advice_limit": 1, "fault_limit": 2}]}]}]') $$,
  '22023', null,
  'a fault limit above the advice limit is rejected when lower is worse'
);

select throws_ok(
  $$ select public.admin_save_checklist(null, 'Fout', '[{"name": "A", "points": [{"label": "B",
       "measurements": [{"label": "Vocht", "unit": "%", "direction": "higher_is_worse",
         "advice_limit": 2, "fault_limit": 1}]}]}]') $$,
  '22023', null,
  'a fault limit below the advice limit is rejected when higher is worse'
);

select throws_ok(
  $$ select public.admin_save_checklist(null, 'Fout', '[{"name": "A", "points": [{"label": "B",
       "measurements": [{"label": "X", "unit": "mm", "direction": "sideways"}]}]}]') $$,
  '22023', null,
  'an unknown direction is rejected'
);

select throws_ok(
  $$ select public.admin_save_checklist(null, 'Fout', '[{"name": "A", "points": [{"label": "B",
       "measurements": [{"label": "LV", "unit": "mm", "advice_limit": 4, "fault_limit": 1.6,
         "or_more_value": 3}]}]}]') $$,
  '22023', null,
  'an "or more" value below the advice limit is rejected'
);

select throws_ok(
  $$ select public.admin_save_checklist(null, 'Fout', '[{"name": "A", "points": [{"label": "B",
       "measurements": [{"label": "Vocht", "unit": "%", "direction": "higher_is_worse",
         "advice_limit": 1, "fault_limit": 2, "or_more_value": 3}]}]}]') $$,
  '22023', null,
  'an "or more" value is rejected when higher is worse'
);

select lives_ok(
  $$ select public.admin_save_checklist(null, 'Bandenlijst', '[{"name": "A", "points": [{"label": "Banden",
       "measurements": [{"label": "LV", "unit": "mm", "advice_limit": 4, "fault_limit": 1.6,
         "or_more_value": 5}]}]}]') $$,
  'admin saves a measurement with an "or more" value'
);

select is(
  (select m.or_more_value from public.checklist_measurements m
   join public.checklist_points p on p.id = m.point_id
   join public.checklist_blocks b on b.id = p.block_id
   join public.checklists c on c.id = b.checklist_id where c.name = 'Bandenlijst'),
  5.00::numeric,
  'the "or more" value is stored'
);

select throws_ok(
  $$ select public.admin_save_checklist(null, 'Fout', '[{"name": "A", "points": [{"label": "B", "part_type": "Bestaat niet"}]}]') $$,
  '22023', null,
  'an unknown part type is rejected'
);

select lives_ok(
  $$ select public.admin_delete_part_type(pg_temp.saved('part')) $$,
  'admin deletes a part type'
);

select is(
  (select count(*) from public.checklist_points p join public.checklist_blocks b on b.id = p.block_id
   where b.checklist_id = pg_temp.saved('small') and p.part_type_id is null),
  3::bigint,
  'the points of a deleted part type stay, without a type'
);

select lives_ok(
  $$ select public.admin_save_checklist(pg_temp.saved('checklist'), 'Grote beurt',
       '[{"name": "Alles", "points": [{"label": "Een punt"}]}]') $$,
  'admin replaces the contents of a checklist'
);

select is(
  (select count(*) from public.inspection_items where inspection_id = pg_temp.saved('insp')),
  44::bigint,
  'a completed inspection keeps its own 44 points after the checklist changed'
);

select lives_ok(
  $$ select public.admin_delete_checklist(pg_temp.saved('checklist')) $$,
  'admin deletes a checklist'
);

select is(
  (select coalesce(checklist_id::text, 'null') || ' ' || checklist_name
   from public.inspections where id = pg_temp.saved('insp')),
  'null Grote beurt',
  'after deleting the checklist the inspection keeps its name'
);

-- ---------------------------------------------------------------------------
-- ended employee
-- ---------------------------------------------------------------------------

select pg_temp.act_as('c0000000-0000-4000-8000-000000000004');

select throws_ok(
  $$ select public.start_inspection(pg_temp.saved('small'), 'K-482-NV', 1000) $$,
  '42501', 'not allowed',
  'an employee past their end date cannot start an inspection'
);

reset role;
select * from finish();
rollback;
