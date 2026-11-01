-- Enforce a blanket no-write boundary for admin viewers on every RLS-protected
-- public table. This also covers tables added after the initial viewer migration.
do $$
declare
  t record;
  cmd text;
  policy_name text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and c.relname <> 'admin_viewers'
  loop
    foreach cmd in array array['INSERT','UPDATE','DELETE'] loop
      policy_name := 'admin_viewers_no_' || lower(cmd);
      execute format('drop policy if exists %I on public.%I', policy_name, t.relname);
      if cmd = 'INSERT' then
        execute format(
          'create policy %I on public.%I as restrictive for insert to authenticated with check (not (select private.is_admin_viewer()))',
          policy_name, t.relname
        );
      elsif cmd = 'UPDATE' then
        execute format(
          'create policy %I on public.%I as restrictive for update to authenticated using (not (select private.is_admin_viewer())) with check (not (select private.is_admin_viewer()))',
          policy_name, t.relname
        );
      else
        execute format(
          'create policy %I on public.%I as restrictive for delete to authenticated using (not (select private.is_admin_viewer()))',
          policy_name, t.relname
        );
      end if;
    end loop;
  end loop;
end
$$;

-- Storage mutations are separately governed by storage.objects RLS.
drop policy if exists "Admin viewers cannot upload storage objects" on storage.objects;
create policy "Admin viewers cannot upload storage objects"
  on storage.objects as restrictive for insert to authenticated
  with check (not (select private.is_admin_viewer()));
drop policy if exists "Admin viewers cannot update storage objects" on storage.objects;
create policy "Admin viewers cannot update storage objects"
  on storage.objects as restrictive for update to authenticated
  using (not (select private.is_admin_viewer()))
  with check (not (select private.is_admin_viewer()));
drop policy if exists "Admin viewers cannot delete storage objects" on storage.objects;
create policy "Admin viewers cannot delete storage objects"
  on storage.objects as restrictive for delete to authenticated
  using (not (select private.is_admin_viewer()));