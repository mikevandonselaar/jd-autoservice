-- Inspection checklists and inspections.
--
-- The owner (admin) manages part types and checklists. A part type (for example "Remmen")
-- holds the reasons a mechanic can pick for a fault, so they are set once for every checklist.
-- A checklist is a named list of blocks and points; a point has a part type and optional
-- measurements. A mechanic (employee or admin, on their own account) picks a checklist when
-- starting an inspection, and the inspection copies it. Later edits never change past inspections.
--
-- The workshop role has no access: everyone inspects from their own account.
-- Reads go through RLS, writes through the RPC functions below. Every change is saved at once,
-- so a draft survives a reload or a switch of device.

create type public.item_status as enum ('open', 'ok', 'repaired', 'advice', 'fault');
create type public.advice_term as enum ('next_service', 'few_months');
create type public.inspection_status as enum ('draft', 'completed');
-- Tread depth gets worse as it goes down, moisture in brake fluid as it goes up.
create type public.measurement_direction as enum ('lower_is_worse', 'higher_is_worse');

-- ---------------------------------------------------------------------------
-- Part types and checklists (templates)
-- ---------------------------------------------------------------------------

create table public.part_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 40),
  -- Suggested reasons for a fault, in screen order. "Anders" with free text is always offered.
  reasons text[] not null default '{}' check (cardinality(reasons) <= 12)
);

create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.checklist_blocks (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort integer not null,
  unique (checklist_id, sort)
);

create table public.checklist_points (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.checklist_blocks (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  part_type_id uuid references public.part_types (id) on delete set null,
  sort integer not null,
  unique (block_id, sort)
);

create index checklist_points_part_type_id_idx on public.checklist_points (part_type_id);

-- A measurement belongs to a point, for example the four tyres of "Banden".
-- Beyond fault_limit a value suggests a fault, beyond advice_limit an advice. Beyond means
-- below for lower_is_worse and above for higher_is_worse; the limit itself is still fine.
create table public.checklist_measurements (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references public.checklist_points (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 20),
  unit text not null check (char_length(btrim(unit)) between 1 and 10),
  direction public.measurement_direction not null default 'lower_is_worse',
  advice_limit numeric(6, 2) check (advice_limit between 0 and 9999),
  fault_limit numeric(6, 2) check (fault_limit between 0 and 9999),
  sort integer not null,
  unique (point_id, sort),
  constraint checklist_measurements_limits check (
    fault_limit is null or advice_limit is null
    or (direction = 'lower_is_worse' and fault_limit <= advice_limit)
    or (direction = 'higher_is_worse' and fault_limit >= advice_limit)
  )
);

-- ---------------------------------------------------------------------------
-- Inspections, with their own copy of the checklist
-- ---------------------------------------------------------------------------

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  -- Upper case as typed, for example K-482-NV. plate_key drops the dashes, to find earlier visits.
  plate text not null check (plate ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' and char_length(plate) <= 12),
  plate_key text not null generated always as (replace(plate, '-', '')) stored,
  odometer_km integer not null check (odometer_km between 0 and 2000000),
  -- The name is copied, so the inspection still says which list it used after a delete.
  checklist_id uuid references public.checklists (id) on delete set null,
  checklist_name text not null,
  mechanic_id uuid not null references public.employees (user_id) on delete restrict,
  status public.inspection_status not null default 'draft',
  note text check (char_length(note) <= 1000),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint inspections_completed_at check ((status = 'completed') = (completed_at is not null))
);

create index inspections_plate_key_idx on public.inspections (plate_key, completed_at desc);
create index inspections_mechanic_id_idx on public.inspections (mechanic_id);
create index inspections_checklist_id_idx on public.inspections (checklist_id);

create table public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  block_name text not null,
  block_sort integer not null,
  label text not null,
  sort integer not null,
  -- Copied from the part type at the start.
  reason_options text[] not null default '{}',
  status public.item_status not null default 'open',
  -- Only an advice has a term. "Fix now" is a fault: the customer gets a call.
  term public.advice_term,
  reason text check (char_length(reason) <= 200),
  unique (inspection_id, block_sort, sort),
  constraint inspection_items_term check ((status = 'advice') = (term is not null))
);

create table public.inspection_readings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inspection_items (id) on delete cascade,
  label text not null,
  unit text not null,
  direction public.measurement_direction not null,
  advice_limit numeric(6, 2),
  fault_limit numeric(6, 2),
  sort integer not null,
  value numeric(6, 2) check (value between 0 and 9999),
  unique (item_id, sort)
);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- True for the roles that inspect cars: employee and admin, while employed.
create function private.can_inspect()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(private.current_app_role() in ('employee', 'admin'), false)
$$;

revoke all on function private.can_inspect() from public, anon;
grant execute on function private.can_inspect() to authenticated;

alter table public.part_types enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_blocks enable row level security;
alter table public.checklist_points enable row level security;
alter table public.checklist_measurements enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_items enable row level security;
alter table public.inspection_readings enable row level security;

-- Reads only. Mechanics read every inspection, because the history of a car (last mileage,
-- open advice) comes from colleagues' inspections too. There is nothing about hours in here.
grant select on
  public.part_types, public.checklists, public.checklist_blocks, public.checklist_points,
  public.checklist_measurements, public.inspections, public.inspection_items, public.inspection_readings
to authenticated;

create policy part_types_select on public.part_types
  for select to authenticated using ((select private.can_inspect()));
create policy checklists_select on public.checklists
  for select to authenticated using ((select private.can_inspect()));
create policy checklist_blocks_select on public.checklist_blocks
  for select to authenticated using ((select private.can_inspect()));
create policy checklist_points_select on public.checklist_points
  for select to authenticated using ((select private.can_inspect()));
create policy checklist_measurements_select on public.checklist_measurements
  for select to authenticated using ((select private.can_inspect()));
create policy inspections_select on public.inspections
  for select to authenticated using ((select private.can_inspect()));
create policy inspection_items_select on public.inspection_items
  for select to authenticated using ((select private.can_inspect()));
create policy inspection_readings_select on public.inspection_readings
  for select to authenticated using ((select private.can_inspect()));

-- ---------------------------------------------------------------------------
-- Private helpers, only called from the RPC functions and this migration
-- ---------------------------------------------------------------------------

-- A required text field of a JSON object, trimmed, 1 to p_max characters.
create function private.json_text(p_object jsonb, p_key text, p_max integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text;
begin
  if jsonb_typeof(p_object -> p_key) is distinct from 'string' then
    raise exception '% is required', p_key using errcode = '22023';
  end if;
  v_value := btrim(p_object ->> p_key);
  if char_length(v_value) not between 1 and p_max then
    raise exception '% must be 1 to % characters', p_key, p_max using errcode = '22023';
  end if;
  return v_value;
end;
$$;

-- An optional limit of a JSON object: absent or null, or a number from 0 to 9999.
create function private.json_limit(p_object jsonb, p_key text)
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
  if v_value not between 0 and 9999 then
    raise exception '% must be between 0 and 9999', p_key using errcode = '22023';
  end if;
  return v_value;
end;
$$;

-- Writes the blocks, points and measurements of a checklist that has none yet.
-- p_blocks: [{"name": "...", "points": [{"label": "...", "part_type": "Banden", "measurements": [
--   {"label": "LV", "unit": "mm", "direction": "lower_is_worse", "advice_limit": 4, "fault_limit": 1.6}]}]}]
-- part_type is the name of an existing part type, or absent. direction defaults to lower_is_worse.
-- The order in the arrays is the order on screen.
create function private.write_checklist_blocks(p_checklist_id uuid, p_blocks jsonb)
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
        if (v_direction = 'lower_is_worse' and v_fault > v_advice)
           or (v_direction = 'higher_is_worse' and v_fault < v_advice) then
          raise exception 'the fault limit must lie beyond the advice limit' using errcode = '22023';
        end if;

        insert into public.checklist_measurements
          (point_id, label, unit, direction, advice_limit, fault_limit, sort)
        values (
          v_point_id,
          private.json_text(v_measurement, 'label', 20),
          private.json_text(v_measurement, 'unit', 10),
          v_direction,
          v_advice,
          v_fault,
          v_measurement_sort
        );
      end loop;
    end loop;
  end loop;
end;
$$;

-- Raises unless the caller may change this inspection: it is a draft, and the caller is its
-- mechanic or an admin. Locks the row, so a change cannot race with completing it.
create function private.assert_editable(p_inspection_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1
  from public.inspections i
  where i.id = p_inspection_id
    and i.status = 'draft'
    and (i.mechanic_id = (select auth.uid()) or private.current_app_role() = 'admin')
  for update;

  if not found then
    raise exception 'inspection not found or not editable' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function private.json_text(jsonb, text, integer) from public, anon, authenticated;
revoke all on function private.json_limit(jsonb, text) from public, anon, authenticated;
revoke all on function private.write_checklist_blocks(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.assert_editable(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: part types and checklists (admin)
-- ---------------------------------------------------------------------------

-- Creates a part type (p_id null) or replaces its name and reasons. Returns its id.
-- Inspections already started keep the reasons they copied.
create function public.admin_save_part_type(p_id uuid, p_name text, p_reasons text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := btrim(p_name);
  v_reasons text[];
begin
  if private.current_app_role() is distinct from 'admin' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 40 then
    raise exception 'name must be 1 to 40 characters' using errcode = '22023';
  end if;
  if p_reasons is null or cardinality(p_reasons) > 12 then
    raise exception 'give at most 12 reasons' using errcode = '22023';
  end if;

  select coalesce(array_agg(btrim(r) order by n), '{}') into v_reasons
  from unnest(p_reasons) with ordinality as u (r, n);

  if exists (select 1 from unnest(v_reasons) as r where r is null or char_length(r) not between 1 and 40) then
    raise exception 'a reason is 1 to 40 characters' using errcode = '22023';
  end if;
  if (select count(distinct lower(r)) from unnest(v_reasons) as r) <> cardinality(v_reasons) then
    raise exception 'reasons must be unique' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.part_types (name, reasons) values (v_name, v_reasons) returning id into v_id;
  else
    update public.part_types set name = v_name, reasons = v_reasons where id = p_id returning id into v_id;
    if not found then
      raise exception 'part type not found' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

-- Points of this type keep working, without suggested reasons.
create function public.admin_delete_part_type(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_app_role() is distinct from 'admin' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  delete from public.part_types where id = p_id;
  if not found then
    raise exception 'part type not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Creates a checklist (p_id null) or replaces the name and contents of an existing one.
-- Returns its id. Inspections already started keep their own copy.
create function public.admin_save_checklist(p_id uuid, p_name text, p_blocks jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := btrim(p_name);
begin
  if private.current_app_role() is distinct from 'admin' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 60 then
    raise exception 'name must be 1 to 60 characters' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.checklists (name) values (v_name) returning id into v_id;
  else
    update public.checklists set name = v_name where id = p_id returning id into v_id;
    if not found then
      raise exception 'checklist not found' using errcode = 'P0002';
    end if;
    delete from public.checklist_blocks where checklist_id = v_id;
  end if;

  perform private.write_checklist_blocks(v_id, p_blocks);
  return v_id;
end;
$$;

create function public.admin_delete_checklist(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_app_role() is distinct from 'admin' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  delete from public.checklists where id = p_id;
  if not found then
    raise exception 'checklist not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: inspections (employee and admin)
-- ---------------------------------------------------------------------------

-- Starts a draft inspection by the caller, with a copy of the checklist. Returns its id.
create function public.start_inspection(p_checklist_id uuid, p_plate text, p_odometer_km integer)
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
    (item_id, label, unit, direction, advice_limit, fault_limit, sort)
  select i.id, m.label, m.unit, m.direction, m.advice_limit, m.fault_limit, m.sort
  from public.checklist_blocks b
  join public.checklist_points p on p.block_id = b.id
  join public.checklist_measurements m on m.point_id = p.id
  join public.inspection_items i on i.inspection_id = v_id and i.block_sort = b.sort and i.sort = p.sort
  where b.checklist_id = p_checklist_id;

  return v_id;
end;
$$;

-- Sets the result of one or more points of the same inspection, for a tap or "Rest goed".
-- Setting them back to open is the undo. The reason is dropped for open and ok.
create function public.set_item_results(
  p_item_ids uuid[],
  p_status public.item_status,
  p_term public.advice_term,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wanted integer;
  v_found integer;
  v_inspections integer;
  v_inspection_id uuid;
begin
  if not private.can_inspect() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status is null then
    raise exception 'status is required' using errcode = '22023';
  end if;
  if (p_status = 'advice') <> (p_term is not null) then
    raise exception 'an advice needs a term, other results have none' using errcode = '22023';
  end if;
  if char_length(p_reason) > 200 then
    raise exception 'reason is at most 200 characters' using errcode = '22023';
  end if;

  select count(distinct id) into v_wanted from unnest(p_item_ids) as id;
  if v_wanted not between 1 and 200 then
    raise exception 'give 1 to 200 points' using errcode = '22023';
  end if;

  select count(*), count(distinct i.inspection_id), min(i.inspection_id::text)::uuid
  into v_found, v_inspections, v_inspection_id
  from public.inspection_items i
  where i.id = any (p_item_ids);

  if v_found <> v_wanted or v_inspections <> 1 then
    raise exception 'points not found, or not of one inspection' using errcode = 'P0002';
  end if;

  perform private.assert_editable(v_inspection_id);

  update public.inspection_items
  set status = p_status,
      term = p_term,
      reason = case when p_status in ('open', 'ok') then null else nullif(btrim(p_reason), '') end
  where id = any (p_item_ids);
end;
$$;

-- Saves one measured value. Null clears it.
create function public.set_reading(p_reading_id uuid, p_value numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inspection_id uuid;
begin
  if not private.can_inspect() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_value is not null and (p_value < 0 or p_value > 9999 or p_value <> round(p_value, 2)) then
    raise exception 'value must be between 0 and 9999, with at most 2 decimals' using errcode = '22023';
  end if;

  select i.inspection_id into v_inspection_id
  from public.inspection_readings r
  join public.inspection_items i on i.id = r.item_id
  where r.id = p_reading_id;

  if not found then
    raise exception 'reading not found' using errcode = 'P0002';
  end if;

  perform private.assert_editable(v_inspection_id);

  update public.inspection_readings set value = p_value where id = p_reading_id;
end;
$$;

-- Completes a draft once no point is open. The note is for the front desk.
create function public.complete_inspection(p_inspection_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_inspect() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if char_length(p_note) > 1000 then
    raise exception 'note is at most 1000 characters' using errcode = '22023';
  end if;

  perform private.assert_editable(p_inspection_id);

  if exists (
    select 1 from public.inspection_items i
    where i.inspection_id = p_inspection_id and i.status = 'open'
  ) then
    raise exception 'some points are still open' using errcode = '22023';
  end if;

  update public.inspections
  set status = 'completed',
      completed_at = now(),
      note = nullif(btrim(p_note), '')
  where id = p_inspection_id;
end;
$$;

-- Throws away a draft, for an inspection started by mistake.
create function public.discard_inspection(p_inspection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_inspect() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  perform private.assert_editable(p_inspection_id);

  delete from public.inspections where id = p_inspection_id;
end;
$$;

revoke all on function public.admin_save_part_type(uuid, text, text[]) from public, anon;
revoke all on function public.admin_delete_part_type(uuid) from public, anon;
revoke all on function public.admin_save_checklist(uuid, text, jsonb) from public, anon;
revoke all on function public.admin_delete_checklist(uuid) from public, anon;
revoke all on function public.start_inspection(uuid, text, integer) from public, anon;
revoke all on function public.set_item_results(uuid[], public.item_status, public.advice_term, text)
  from public, anon;
revoke all on function public.set_reading(uuid, numeric) from public, anon;
revoke all on function public.complete_inspection(uuid, text) from public, anon;
revoke all on function public.discard_inspection(uuid) from public, anon;

grant execute on function public.admin_save_part_type(uuid, text, text[]) to authenticated;
grant execute on function public.admin_delete_part_type(uuid) to authenticated;
grant execute on function public.admin_save_checklist(uuid, text, jsonb) to authenticated;
grant execute on function public.admin_delete_checklist(uuid) to authenticated;
grant execute on function public.start_inspection(uuid, text, integer) to authenticated;
grant execute on function public.set_item_results(uuid[], public.item_status, public.advice_term, text)
  to authenticated;
grant execute on function public.set_reading(uuid, numeric) to authenticated;
grant execute on function public.complete_inspection(uuid, text) to authenticated;
grant execute on function public.discard_inspection(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Starting configuration: part types and "Grote beurt", based on the paper form
-- "grote beurt checklist". Configuration, not test data, so it belongs in production too.
-- The owner changes all of it in the app.
-- ---------------------------------------------------------------------------

insert into public.part_types (name, reasons)
values
  ('Remmen', '{Versleten,Groeven,Roestrand,"Scheef afgesleten","Remklauw vast"}'),
  ('Banden', '{"Profiel te laag",Beschadigd,"Ouderdom / scheurtjes","Ongelijk afgesleten"}'),
  ('Ophanging en besturing', '{Speling,Versleten,Lekt,Gebroken,Geluid}'),
  ('Rubbers en hoezen', '{Gescheurd,Poreus,Lekt}'),
  ('Leidingen en slangen', '{Lekt,Poreus,Corrosie,Beschadigd}'),
  ('Lekkage', '{Zweet,Lekt,Druppelt}'),
  ('Vloeistoffen', '{"Te laag",Vervuild,"Vervangen volgens interval"}'),
  ('Accu', '{Zwak,Defect,"Corrosie op polen"}'),
  ('Riemen', '{Scheurtjes,Versleten,"Spanning niet goed",Geluid}'),
  ('Uitlaat', '{Lek,Doorgeroest,"Ophanging los",Geluid}'),
  ('Elektrisch en verlichting', '{"Lamp defect","Werkt niet",Storing,Foutcode}'),
  ('Ruiten en wissers', '{"Wisserblad versleten",Ster,Scheur,"Sproeier werkt niet"}'),
  ('Carrosserie', '{Roest,Doorgeroest,Beschadigd}'),
  ('Algemeen', '{Defect,Versleten,Beschadigd,Ontbreekt}');

do $$
declare
  v_id uuid;
begin
  insert into public.checklists (name) values ('Grote beurt') returning id into v_id;
  perform private.write_checklist_blocks(v_id, $json$
[
  {"name": "In en om de auto", "points": [
    {"label": "Testrit vooraf", "part_type": "Algemeen"},
    {"label": "Foutcodes uitlezen", "part_type": "Elektrisch en verlichting"},
    {"label": "Remmentest", "part_type": "Remmen"},
    {"label": "Verlichting buiten", "part_type": "Elektrisch en verlichting"},
    {"label": "Interieurverlichting en dashboard", "part_type": "Elektrisch en verlichting"},
    {"label": "Claxon", "part_type": "Elektrisch en verlichting"},
    {"label": "Ruitenwissers en sproeiers", "part_type": "Ruiten en wissers"},
    {"label": "Ruiten en spiegels", "part_type": "Ruiten en wissers"},
    {"label": "Aanjager en ventilatie", "part_type": "Elektrisch en verlichting"},
    {"label": "Schakelaars en elektrische ruiten", "part_type": "Elektrisch en verlichting"},
    {"label": "Gordels", "part_type": "Algemeen"}
  ]},
  {"name": "Onder de motorkap", "points": [
    {"label": "Accu", "part_type": "Accu", "measurements": [
      {"label": "Spanning", "unit": "V", "direction": "lower_is_worse", "advice_limit": 12.4, "fault_limit": 12.0}
    ]},
    {"label": "Riemen", "part_type": "Riemen"},
    {"label": "Vloeistofniveaus", "part_type": "Vloeistoffen"},
    {"label": "Remvloeistof", "part_type": "Vloeistoffen", "measurements": [
      {"label": "Vocht", "unit": "%", "direction": "higher_is_worse", "advice_limit": 1, "fault_limit": 2}
    ]},
    {"label": "Airco", "part_type": "Algemeen"},
    {"label": "Slangen", "part_type": "Leidingen en slangen"},
    {"label": "Olielekkage bovenkant motor", "part_type": "Lekkage"}
  ]},
  {"name": "Onder de auto", "points": [
    {"label": "Uitlaat en ophanging", "part_type": "Uitlaat"},
    {"label": "Aandrijfas- en stuurhoezen", "part_type": "Rubbers en hoezen"},
    {"label": "Remleidingen", "part_type": "Leidingen en slangen"},
    {"label": "Draagarmen, fusees en bussen", "part_type": "Ophanging en besturing"},
    {"label": "Schokdempers en veren", "part_type": "Ophanging en besturing"},
    {"label": "Olielekkage motor en versnellingsbak", "part_type": "Lekkage"},
    {"label": "Corrosie bodem en dorpels", "part_type": "Carrosserie"}
  ]},
  {"name": "Wielen en remmen", "points": [
    {"label": "Remmen voor", "part_type": "Remmen", "measurements": [
      {"label": "Voering", "unit": "mm", "advice_limit": 3.0, "fault_limit": 1.5}
    ]},
    {"label": "Remmen achter", "part_type": "Remmen", "measurements": [
      {"label": "Voering", "unit": "mm", "advice_limit": 3.0, "fault_limit": 1.5}
    ]},
    {"label": "Remslangen", "part_type": "Leidingen en slangen"},
    {"label": "Wiellagers", "part_type": "Ophanging en besturing"},
    {"label": "Stuurkogels en spoorstangeinden", "part_type": "Ophanging en besturing"},
    {"label": "Banden", "part_type": "Banden", "measurements": [
      {"label": "LV", "unit": "mm", "advice_limit": 4.0, "fault_limit": 1.6},
      {"label": "RV", "unit": "mm", "advice_limit": 4.0, "fault_limit": 1.6},
      {"label": "LA", "unit": "mm", "advice_limit": 4.0, "fault_limit": 1.6},
      {"label": "RA", "unit": "mm", "advice_limit": 4.0, "fault_limit": 1.6}
    ]},
    {"label": "Bandenspanning", "part_type": "Banden"}
  ]},
  {"name": "Eindcontrole", "points": [
    {"label": "Servicereset", "part_type": "Algemeen"},
    {"label": "Onderhoudshistorie bijgewerkt", "part_type": "Algemeen"},
    {"label": "Proefrit na de beurt", "part_type": "Algemeen"},
    {"label": "Forte brandstofadditief", "part_type": "Algemeen"},
    {"label": "Wielmoeren nagetrokken", "part_type": "Algemeen"},
    {"label": "Vloeistoffen nagekeken", "part_type": "Vloeistoffen"},
    {"label": "Batterij autosleutel", "part_type": "Elektrisch en verlichting"},
    {"label": "Reservewiel of bandenreparatieset", "part_type": "Banden", "measurements": [
      {"label": "Profiel", "unit": "mm", "advice_limit": 4.0, "fault_limit": 1.6}
    ]},
    {"label": "Handrem", "part_type": "Remmen"}
  ]}
]
$json$::jsonb);
end;
$$;
