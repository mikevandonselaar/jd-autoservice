-- Projects created with "automatic RLS" get public.rls_auto_enable(), a SECURITY DEFINER event
-- trigger function that enables RLS on new tables in public. It is created before our default
-- privileges apply, so it keeps the platform grants to anon and authenticated. An event trigger
-- function cannot be called directly, but no SECURITY DEFINER function may be executable by
-- anon. Revoking execute does not affect the event trigger itself.
--
-- Projects created without that option do not have the function, hence the check.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
