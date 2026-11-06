-- Photos of a point that is not good. See docs/plan-fotos.md.
--
-- The files live in the private bucket inspection-photos at {inspection_id}/{item_id}/{photo_id}.jpg,
-- made smaller on the phone first (the free plan cannot transform images). public.inspection_photos
-- lists them; its id is the photo_id of the path.
--
-- Rule: there is never a row without a file. The app uploads the file first and then registers it
-- with add_item_photo; to remove one it calls delete_item_photo first and then deletes the file.
-- A file without a row can stay behind when a step fails halfway: nobody sees it, it only takes room.
-- Files are never deleted with SQL, because that leaves the object in the store: the app deletes
-- them through the Storage API, which the delete policy below allows.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspection-photos', 'inspection-photos', false, 1048576, array['image/jpeg']);

create table public.inspection_photos (
  id uuid primary key,
  item_id uuid not null references public.inspection_items (id) on delete cascade,
  path text not null unique,
  created_by uuid not null references public.employees (user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create index inspection_photos_item_id_idx on public.inspection_photos (item_id);
create index inspection_photos_created_by_idx on public.inspection_photos (created_by);

-- Reads only, like the other inspection tables. Writes go through the RPC functions below.
alter table public.inspection_photos enable row level security;
grant select on public.inspection_photos to authenticated;

create policy inspection_photos_select on public.inspection_photos
  for select to authenticated using ((select private.can_inspect()));

-- ---------------------------------------------------------------------------
-- Private helpers for the storage policies
-- ---------------------------------------------------------------------------

-- The three uuids of a photo path, or null when the path has another form. Matching first means a
-- wrong path is refused instead of failing on a cast.
create function private.photo_path_parts(p_name text)
returns uuid[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts text[];
begin
  v_parts := regexp_match(
    coalesce(p_name, ''),
    '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/'
    '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/'
    '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jpg$'
  );
  if v_parts is null then
    return null;
  end if;
  return array[v_parts[1]::uuid, v_parts[2]::uuid, v_parts[3]::uuid];
end;
$$;

-- True when the caller may upload a file at this path: the point belongs to the inspection in the
-- path, and that inspection is a draft the caller may change (its mechanic, or an admin). At most
-- 6 files per point: the RPC allows 3 photos, the rest is room for retries after a failure.
create function private.can_add_photo(p_name text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_parts uuid[] := private.photo_path_parts(p_name);
begin
  if v_parts is null or not private.can_inspect() then
    return false;
  end if;
  return exists (
      select 1
      from public.inspection_items i
      join public.inspections n on n.id = i.inspection_id
      where i.id = v_parts[2]
        and n.id = v_parts[1]
        and n.status = 'draft'
        and (n.mechanic_id = (select auth.uid()) or private.current_app_role() = 'admin')
    )
    and (
      select count(*)
      from storage.objects o
      where o.bucket_id = 'inspection-photos'
        and o.name like v_parts[1]::text || '/' || v_parts[2]::text || '/%'
    ) < 6;
end;
$$;

-- True when the caller may delete the file at this path. Never while a photo row points to it, so a
-- registered photo always has its file. Otherwise: the uploader, an admin, the mechanic of the
-- draft, or anyone who inspects once the inspection is gone (thrown away, the rows went with it).
create function private.can_remove_photo(p_name text, p_owner_id text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_parts uuid[] := private.photo_path_parts(p_name);
begin
  if v_parts is null or not private.can_inspect() then
    return false;
  end if;
  if exists (select 1 from public.inspection_photos p where p.path = p_name) then
    return false;
  end if;
  return p_owner_id = (select auth.uid())::text
    or private.current_app_role() = 'admin'
    or exists (
      select 1 from public.inspections n
      where n.id = v_parts[1] and n.status = 'draft' and n.mechanic_id = (select auth.uid())
    )
    or not exists (select 1 from public.inspections n where n.id = v_parts[1]);
end;
$$;

revoke all on function private.photo_path_parts(text) from public, anon;
revoke all on function private.can_add_photo(text) from public, anon;
revoke all on function private.can_remove_photo(text, text) from public, anon;
grant execute on function private.photo_path_parts(text) to authenticated;
grant execute on function private.can_add_photo(text) to authenticated;
grant execute on function private.can_remove_photo(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage policies. Only for this bucket; there is no update policy, so a file can never be
-- overwritten (no upsert) or moved.
-- ---------------------------------------------------------------------------

create policy inspection_photos_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'inspection-photos' and (select private.can_inspect()));

create policy inspection_photos_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inspection-photos' and private.can_add_photo(name));

create policy inspection_photos_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'inspection-photos' and private.can_remove_photo(name, owner_id));

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------

-- Registers an uploaded file as a photo of a point. The file must be in the bucket at a path of
-- this point, uploaded by the caller. At most 3 photos per point. Returns the id of the photo.
create function public.add_item_photo(p_item_id uuid, p_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parts uuid[] := private.photo_path_parts(p_path);
  v_inspection_id uuid;
begin
  if not private.can_inspect() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_parts is null or v_parts[2] is distinct from p_item_id then
    raise exception 'the path is not a photo path of this point' using errcode = '22023';
  end if;

  select i.inspection_id into v_inspection_id from public.inspection_items i where i.id = p_item_id;
  if not found or v_inspection_id <> v_parts[1] then
    raise exception 'point not found' using errcode = 'P0002';
  end if;

  -- Locks the inspection, so two photos at once cannot both pass the count below.
  perform private.assert_editable(v_inspection_id);

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'inspection-photos'
      and o.name = p_path
      and o.owner_id = (select auth.uid())::text
  ) then
    raise exception 'photo file not found' using errcode = 'P0002';
  end if;

  if (select count(*) from public.inspection_photos p where p.item_id = p_item_id) >= 3 then
    raise exception 'a point has at most 3 photos' using errcode = '22023';
  end if;

  insert into public.inspection_photos (id, item_id, path, created_by)
  values (v_parts[3], p_item_id, p_path, (select auth.uid()));

  return v_parts[3];
end;
$$;

-- Removes a photo of a draft. Returns the path, so the app can delete the file next.
create function public.delete_item_photo(p_photo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_inspection_id uuid;
begin
  if not private.can_inspect() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select p.path, i.inspection_id into v_path, v_inspection_id
  from public.inspection_photos p
  join public.inspection_items i on i.id = p.item_id
  where p.id = p_photo_id;

  if not found then
    raise exception 'photo not found' using errcode = 'P0002';
  end if;

  perform private.assert_editable(v_inspection_id);

  delete from public.inspection_photos where id = p_photo_id;
  return v_path;
end;
$$;

revoke all on function public.add_item_photo(uuid, text) from public, anon;
revoke all on function public.delete_item_photo(uuid) from public, anon;
grant execute on function public.add_item_photo(uuid, text) to authenticated;
grant execute on function public.delete_item_photo(uuid) to authenticated;
