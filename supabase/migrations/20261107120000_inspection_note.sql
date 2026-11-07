-- The note for the front desk is saved while typing, like every other tap, instead of only
-- when completing. complete_inspection keeps its note argument and still saves it last.

-- Saves the note of a draft. Empty or blank clears it.
create function public.set_inspection_note(p_inspection_id uuid, p_note text)
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

  update public.inspections
  set note = nullif(btrim(p_note), '')
  where id = p_inspection_id;
end;
$$;

revoke all on function public.set_inspection_note(uuid, text) from public, anon;
grant execute on function public.set_inspection_note(uuid, text) to authenticated;
