-- A measurement can have an "or more" value, for example 5 mm for tyres. From there on the exact
-- value does not matter, so the mechanic taps one key ("5 or more") instead of measuring each tyre.
-- The reading then stores that value with the flag or_more, so the screens can say "≥ 5" and not
-- claim a measured 5.

alter table public.checklist_measurements
  add column or_more_value numeric(6, 2) check (or_more_value between 0 and 9999),
  add constraint checklist_measurements_or_more check (
    or_more_value is null
    or (direction = 'lower_is_worse' and advice_limit is not null and or_more_value >= advice_limit)
  );

alter table public.inspection_readings
  add column or_more_value numeric(6, 2) check (or_more_value between 0 and 9999),
  add column or_more boolean not null default false,
  add constraint inspection_readings_or_more check (
    not or_more or (or_more_value is not null and value = or_more_value)
  );

-- The tyres of the starting checklists: 5 mm or more is plenty above the advice limit.
update public.checklist_measurements
set or_more_value = 5
where label in ('LV', 'RV', 'LA', 'RA')
  and unit = 'mm'
  and direction = 'lower_is_worse'
  and advice_limit is not null
  and advice_limit <= 5;

-- Same as before, plus the optional or_more_value of a measurement.
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

      insert into public.checklist_points (block_id, label, part_type_id, sort)
      values (v_block_id, private.json_text(v_point, 'label', 80), v_part_type_id, v_point_sort)
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
           and (v_direction <> 'lower_is_worse' or v_advice is null or v_or_more < v_advice) then
          raise exception 'the "or more" value needs a lower-is-worse measurement and lies at or above the advice limit'
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

-- Same as before, plus the or_more_value copied to the readings.
create or replace function public.start_inspection(p_checklist_id uuid, p_plate text, p_odometer_km integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plate text := upper(regexp_replace(coalesce(p_plate, ''), '\s', '', 'g'));
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

  select c.name into v_checklist_name from public.checklists c where c.id = p_checklist_id;
  if not found then
    raise exception 'checklist not found' using errcode = 'P0002';
  end if;

  insert into public.inspections (plate, odometer_km, checklist_id, checklist_name, mechanic_id)
  values (v_plate, p_odometer_km, p_checklist_id, v_checklist_name, (select auth.uid()))
  returning id into v_id;

  insert into public.inspection_items (inspection_id, block_name, block_sort, label, sort, reason_options)
  select v_id, b.name, b.sort, p.label, p.sort, coalesce(t.reasons, '{}')
  from public.checklist_blocks b
  join public.checklist_points p on p.block_id = b.id
  left join public.part_types t on t.id = p.part_type_id
  where b.checklist_id = p_checklist_id;

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

-- Saves one measured value. Null clears it. p_or_more says the value is "this or more": only
-- allowed when it equals the or_more_value of the measurement.
drop function public.set_reading(uuid, numeric);

create function public.set_reading(p_reading_id uuid, p_value numeric, p_or_more boolean default false)
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
  if p_value is not null and (p_value < 0 or p_value > 9999 or p_value <> round(p_value, 2)) then
    raise exception 'value must be between 0 and 9999, with at most 2 decimals' using errcode = '22023';
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

revoke all on function public.set_reading(uuid, numeric, boolean) from public, anon;
grant execute on function public.set_reading(uuid, numeric, boolean) to authenticated;
