-- Employees, roles and the first RLS policies.
--
-- Roles:
--   employee  reads only their own row
--   admin     reads every row, corrects rows through admin_update_employee()
--   workshop  shared tablet account, reads only its own row (never anyone's hours)
--
-- The role comes from this table only, never from the JWT or user metadata.

-- New objects in public must be granted explicitly, whatever the platform default is.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres
  revoke execute on functions from public;

-- Helper functions live in a schema the Data API does not expose.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create type public.app_role as enum ('employee', 'admin', 'workshop');

create table public.employees (
  user_id uuid primary key references auth.users (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  role public.app_role not null,
  contract_hours_per_week numeric(4, 1) check (contract_hours_per_week between 0 and 60),
  -- Last day of employment, inclusive. After it the user has no role and no access.
  end_date date,
  -- The shared tablet account has no hours to protect.
  constraint employees_workshop_no_hours check (role <> 'workshop' or contract_hours_per_week is null)
);

alter table public.employees enable row level security;

-- Role of the current user, or null when there is no employee row or it has ended.
-- SECURITY DEFINER so policies can read employees without recursing into RLS.
create function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select e.role
  from public.employees e
  where e.user_id = (select auth.uid())
    and (e.end_date is null or e.end_date >= (now() at time zone 'Europe/Amsterdam')::date)
$$;

revoke all on function private.current_app_role() from public, anon;
grant execute on function private.current_app_role() to authenticated;

-- Reads only. Writes go through RPC functions, so there is no insert/update/delete grant.
grant select on public.employees to authenticated;

create policy employees_select_own on public.employees
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.current_app_role()) is not null
  );

create policy employees_select_admin on public.employees
  for select to authenticated
  using ((select private.current_app_role()) = 'admin');

-- The admin corrects a row. All fields are sent, null clears hours and end date.
create function public.admin_update_employee(
  p_user_id uuid,
  p_name text,
  p_role public.app_role,
  p_contract_hours_per_week numeric,
  p_end_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if private.current_app_role() is distinct from 'admin' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'user id is required' using errcode = '22023';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 100 then
    raise exception 'name must be 1 to 100 characters' using errcode = '22023';
  end if;
  if p_role is null then
    raise exception 'role is required' using errcode = '22023';
  end if;
  if p_contract_hours_per_week is not null
     and p_contract_hours_per_week not between 0 and 60 then
    raise exception 'contract hours must be between 0 and 60' using errcode = '22023';
  end if;
  if p_role = 'workshop' and p_contract_hours_per_week is not null then
    raise exception 'the workshop account has no contract hours' using errcode = '22023';
  end if;

  -- An admin cannot lock themselves out.
  if p_user_id = v_caller and (p_role <> 'admin' or p_end_date is not null) then
    raise exception 'you cannot demote or end your own account' using errcode = '22023';
  end if;

  update public.employees
  set name = btrim(p_name),
      role = p_role,
      contract_hours_per_week = p_contract_hours_per_week,
      end_date = p_end_date
  where user_id = p_user_id;

  if not found then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_update_employee(uuid, text, public.app_role, numeric, date)
  from public, anon;
grant execute on function public.admin_update_employee(uuid, text, public.app_role, numeric, date)
  to authenticated;
