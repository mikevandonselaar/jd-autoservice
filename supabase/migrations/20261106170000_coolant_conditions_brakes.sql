-- Feedback from the workshop on the first version of the inspection:
--
-- 1. Coolant is measured too: the freezing point in °C, so a value can be below zero.
-- 2. Extra points for older cars or a high mileage, for example coolant from 10 years. A point can
--    have a minimum age and a minimum mileage; it is only copied into an inspection when the car
--    meets one of them. The age comes from the build year, which the mechanic gives at the start.
-- 3. Brake discs and brake pads are separate points, each with its own reasons.

-- ---------------------------------------------------------------------------
-- 1. Values below zero
-- ---------------------------------------------------------------------------

alter table public.checklist_measurements
  drop constraint checklist_measurements_advice_limit_check,
  drop constraint checklist_measurements_fault_limit_check,
  add constraint checklist_measurements_advice_limit_check check (advice_limit between -9999 and 9999),
  add constraint checklist_measurements_fault_limit_check check (fault_limit between -9999 and 9999);

alter table public.inspection_readings
  drop constraint inspection_readings_value_check,
  add constraint inspection_readings_value_check check (value between -9999 and 9999);

-- An optional limit of a JSON object: absent or null, or a number from -9999 to 9999.
create or replace function private.json_limit(p_object jsonb, p_key text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value numeric;
begin
  if coalesce(jsonb_typeof(p_object -> p_key), 'null') = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_object -> p_key) <> 'number' then
    raise exception '% must be a number', p_key using errcode = '22023';
  end if;
  v_value := (p_object ->> p_key)::numeric;
  if v_value not between -9999 and 9999 then
    raise exception '% must be between -9999 and 9999', p_key using errcode = '22023';
  end if;
  return v_value;
end;
$$;

-- Same as before, with values from -9999.
create or replace function public.set_reading(p_reading_id uuid, p_value numeric, p_or_more boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inspection_id uuid;
  v_or_more_value numeric;
begin
  if not private.can_inspect() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_value is not null and (p_value < -9999 or p_value > 9999 or p_value <> round(p_value, 2)) then
    raise exception 'value must be between -9999 and 9999, with at most 2 decimals' using errcode = '22023';
  end if;
  if coalesce(p_or_more, false) and p_value is null then
    raise exception 'an "or more" value needs a value' using errcode = '22023';
  end if;

  select i.inspection_id, r.or_more_value into v_inspection_id, v_or_more_value
  from public.inspection_readings r
  join public.inspection_items i on i.id = r.item_id
  where r.id = p_reading_id;

  if not found then
    raise exception 'reading not found' using errcode = 'P0002';
  end if;
  if coalesce(p_or_more, false) and v_or_more_value is distinct from p_value then
    raise exception 'this measurement has no "or more" value of %', p_value using errcode = '22023';
  end if;

  perform private.assert_editable(v_inspection_id);

  update public.inspection_readings
  set value = p_value, or_more = coalesce(p_or_more, false)
  where id = p_reading_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Points for older cars or a high mileage
-- ---------------------------------------------------------------------------

-- Both null: always. Otherwise the point applies from this age or from this mileage, whichever
-- comes first, like a maintenance interval.
alter table public.checklist_points
  add column min_age_years integer check (min_age_years between 1 and 100),
  add column min_odometer_km integer check (min_odometer_km between 1 and 2000000);

-- Copied with the point, so the screen can say why it is there ("vanaf 10 jaar").
alter table public.inspection_items
  add column min_age_years integer,
  add column min_odometer_km integer;

-- Null for inspections from before this migration.
alter table public.inspections
  add column build_year integer check (build_year between 1900 and 2100);

-- An optional whole number of a JSON object: absent or null, or p_min to p_max.
create function private.json_int(p_object jsonb, p_key text, p_min integer, p_max integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value numeric;
begin
  if coalesce(jsonb_typeof(p_object -> p_key), 'null') = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_object -> p_key) <> 'number' then
    raise exception '% must be a number', p_key using errcode = '22023';
  end if;
  v_value := (p_object ->> p_key)::numeric;
  if v_value <> trunc(v_value) or v_value not between p_min and p_max then
    raise exception '% must be a whole number from % to %', p_key, p_min, p_max using errcode = '22023';
  end if;
  return v_value::integer;
end;
$$;

revoke all on function private.json_int(jsonb, text, integer, integer) from public, anon, authenticated;

-- Same as before, plus the optional min_age_years and min_odometer_km of a point, and an
-- "or more" value of at least 0.
create or replace function private.write_checklist_blocks(p_checklist_id uuid, p_blocks jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_block jsonb;
  v_block_sort bigint;
  v_block_id uuid;
  v_point jsonb;
  v_point_sort bigint;
  v_point_id uuid;
  v_part_type_id uuid;
  v_measurement jsonb;
  v_measurement_sort bigint;
  v_direction public.measurement_direction;
  v_advice numeric;
  v_fault numeric;
  v_or_more numeric;
begin
  if jsonb_typeof(p_blocks) is distinct from 'array' or jsonb_array_length(p_blocks) not between 1 and 20 then
    raise exception 'a checklist has 1 to 20 blocks' using errcode = '22023';
  end if;

  for v_block, v_block_sort in select value, ordinality from jsonb_array_elements(p_blocks) with ordinality loop
    if jsonb_typeof(v_block -> 'points') is distinct from 'array'
       or jsonb_array_length(v_block -> 'points') not between 1 and 60 then
      raise exception 'a block has 1 to 60 points' using errcode = '22023';
    end if;

    insert into public.checklist_blocks (checklist_id, name, sort)
    values (p_checklist_id, private.json_text(v_block, 'name', 60), v_block_sort)
    returning id into v_block_id;

    for v_point, v_point_sort in
      select value, ordinality from jsonb_array_elements(v_block -> 'points') with ordinality
    loop
      if coalesce(jsonb_typeof(v_point -> 'measurements'), 'array') <> 'array'
         or jsonb_array_length(coalesce(v_point -> 'measurements', '[]')) > 10 then
        raise exception 'a point has at most 10 measurements' using errcode = '22023';
      end if;

      v_part_type_id := null;
      if coalesce(jsonb_typeof(v_point -> 'part_type'), 'null') <> 'null' then
        select t.id into v_part_type_id
        from public.part_types t
        where t.name = private.json_text(v_point, 'part_type', 40);
        if not found then
          raise exception 'unknown part type %', v_point ->> 'part_type' using errcode = '22023';
        end if;
      end if;

      insert into public.checklist_points (block_id, label, part_type_id, sort, min_age_years, min_odometer_km)
      values (
        v_block_id,
        private.json_text(v_point, 'label', 80),
        v_part_type_id,
        v_point_sort,
        private.json_int(v_point, 'min_age_years', 1, 100),
        private.json_int(v_point, 'min_odometer_km', 1, 2000000)
      )
      returning id into v_point_id;

      for v_measurement, v_measurement_sort in
        select value, ordinality
        from jsonb_array_elements(coalesce(v_point -> 'measurements', '[]')) with ordinality
      loop
        if coalesce(v_measurement ->> 'direction', 'lower_is_worse') not in ('lower_is_worse', 'higher_is_worse') then
          raise exception 'direction is lower_is_worse or higher_is_worse' using errcode = '22023';
        end if;
        v_direction := coalesce(v_measurement ->> 'direction', 'lower_is_worse')::public.measurement_direction;
        v_advice := private.json_limit(v_measurement, 'advice_limit');
        v_fault := private.json_limit(v_measurement, 'fault_limit');
        v_or_more := private.json_limit(v_measurement, 'or_more_value');
        if (v_direction = 'lower_is_worse' and v_fault > v_advice)
           or (v_direction = 'higher_is_worse' and v_fault < v_advice) then
          raise exception 'the fault limit must lie beyond the advice limit' using errcode = '22023';
        end if;
        if v_or_more is not null
           and (v_direction <> 'lower_is_worse' or v_advice is null or v_or_more < v_advice or v_or_more < 0) then
          raise exception 'the "or more" value needs a lower-is-worse measurement and lies at or above the advice limit and 0'
            using errcode = '22023';
        end if;

        insert into public.checklist_measurements
          (point_id, label, unit, direction, advice_limit, fault_limit, or_more_value, sort)
        values (
          v_point_id,
          private.json_text(v_measurement, 'label', 20),
          private.json_text(v_measurement, 'unit', 10),
          v_direction,
          v_advice,
          v_fault,
          v_or_more,
          v_measurement_sort
        );
      end loop;
    end loop;
  end loop;
end;
$$;

-- Starts a draft inspection by the caller, with a copy of the checklist. Returns its id.
-- p_build_year decides, with the mileage, which points for older cars come along. Null means
-- unknown: then they all come along, because checking too much is better than too little.
drop function public.start_inspection(uuid, text, integer);

create function public.start_inspection(
  p_checklist_id uuid,
  p_plate text,
  p_odometer_km integer,
  p_build_year integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plate text := upper(regexp_replace(coalesce(p_plate, ''), '\s', '', 'g'));
  v_this_year integer := extract(year from now() at time zone 'Europe/Amsterdam')::integer;
  v_age integer;
  v_checklist_name text;
  v_id uuid;
begin
  if not private.can_inspect() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_plate !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' or char_length(replace(v_plate, '-', '')) > 8 then
    raise exception 'invalid licence plate' using errcode = '22023';
  end if;
  if p_odometer_km is null or p_odometer_km not between 0 and 2000000 then
    raise exception 'odometer must be between 0 and 2000000 km' using errcode = '22023';
  end if;
  if p_build_year not between 1900 and v_this_year + 1 then
    raise exception 'build year must be between 1900 and %', v_this_year + 1 using errcode = '22023';
  end if;
  v_age := v_this_year - p_build_year;

  select c.name into v_checklist_name from public.checklists c where c.id = p_checklist_id;
  if not found then
    raise exception 'checklist not found' using errcode = 'P0002';
  end if;

  insert into public.inspections (plate, odometer_km, build_year, checklist_id, checklist_name, mechanic_id)
  values (v_plate, p_odometer_km, p_build_year, p_checklist_id, v_checklist_name, (select auth.uid()))
  returning id into v_id;

  insert into public.inspection_items
    (inspection_id, block_name, block_sort, label, sort, reason_options, min_age_years, min_odometer_km)
  select v_id, b.name, b.sort, p.label, p.sort, coalesce(t.reasons, '{}'), p.min_age_years, p.min_odometer_km
  from public.checklist_blocks b
  join public.checklist_points p on p.block_id = b.id
  left join public.part_types t on t.id = p.part_type_id
  where b.checklist_id = p_checklist_id
    and (
      (p.min_age_years is null and p.min_odometer_km is null)
      or v_age is null
      or v_age >= p.min_age_years
      or p_odometer_km >= p.min_odometer_km
    );

  -- Only the readings of the points that came along: the join on the items leaves out the rest.
  insert into public.inspection_readings
    (item_id, label, unit, direction, advice_limit, fault_limit, or_more_value, sort)
  select i.id, m.label, m.unit, m.direction, m.advice_limit, m.fault_limit, m.or_more_value, m.sort
  from public.checklist_blocks b
  join public.checklist_points p on p.block_id = b.id
  join public.checklist_measurements m on m.point_id = p.id
  join public.inspection_items i on i.inspection_id = v_id and i.block_sort = b.sort and i.sort = p.sort
  where b.checklist_id = p_checklist_id;

  return v_id;
end;
$$;

revoke all on function public.start_inspection(uuid, text, integer, integer) from public, anon;
grant execute on function public.start_inspection(uuid, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3 and 1. Starting configuration: brake discs and pads apart, and coolant
-- ---------------------------------------------------------------------------

insert into public.part_types (name, reasons)
values
  ('Remblokken', '{Versleten,"Scheef afgesleten",Verglaasd,"Remklauw vast"}'),
  ('Remschijven', '{"Onder minimale dikte",Groeven,Roestrand,Slag,Scheurtjes}'),
  ('Koelsysteem', '{"Vorstbescherming te laag","Niveau te laag",Vervuild,Lekt}')
on conflict (name) do nothing;

do $$
declare
  v_point record;
  v_id uuid;
begin
  -- "Remmen voor" becomes "Remblokken voor" (with the lining measurement), and "Remschijven voor"
  -- comes right after it. Last point first, so the positions still to do do not shift.
  for v_point in
    select p.id, p.block_id, p.sort, p.label
    from public.checklist_points p
    where p.label in ('Remmen voor', 'Remmen achter')
    order by p.block_id, p.sort desc
  loop
    -- Two steps, because the position is unique within a block.
    update public.checklist_points set sort = sort + 10000 where block_id = v_point.block_id and sort > v_point.sort;
    update public.checklist_points set sort = sort - 9999 where block_id = v_point.block_id and sort > 10000;

    update public.checklist_points
    set label = replace(v_point.label, 'Remmen', 'Remblokken'),
        part_type_id = (select t.id from public.part_types t where t.name = 'Remblokken')
    where id = v_point.id;

    insert into public.checklist_points (block_id, label, part_type_id, sort)
    values (
      v_point.block_id,
      replace(v_point.label, 'Remmen', 'Remschijven'),
      (select t.id from public.part_types t where t.name = 'Remschijven'),
      v_point.sort + 1
    );
  end loop;

  -- Coolant: in "Grote beurt" for every car, after the brake fluid; in "Kleine beurt" from 10 years,
  -- after the fluid levels. The freezing point should be -25 °C or lower.
  for v_point in
    select p.id, p.block_id, p.sort, c.name as checklist
    from public.checklist_points p
    join public.checklist_blocks b on b.id = p.block_id
    join public.checklists c on c.id = b.checklist_id
    where (c.name = 'Grote beurt' and p.label = 'Remvloeistof')
       or (c.name = 'Kleine beurt' and p.label = 'Vloeistofniveaus')
  loop
    continue when exists (
      select 1 from public.checklist_points p where p.block_id = v_point.block_id and p.label = 'Koelvloeistof'
    );

    update public.checklist_points set sort = sort + 10000 where block_id = v_point.block_id and sort > v_point.sort;
    update public.checklist_points set sort = sort - 9999 where block_id = v_point.block_id and sort > 10000;

    insert into public.checklist_points (block_id, label, part_type_id, sort, min_age_years)
    values (
      v_point.block_id,
      'Koelvloeistof',
      (select t.id from public.part_types t where t.name = 'Koelsysteem'),
      v_point.sort + 1,
      case when v_point.checklist = 'Kleine beurt' then 10 end
    )
    returning id into v_id;

    insert into public.checklist_measurements (point_id, label, unit, direction, advice_limit, fault_limit, sort)
    values (v_id, 'Vriespunt', '°C', 'higher_is_worse', -25, -15, 1);
  end loop;
end;
$$;
