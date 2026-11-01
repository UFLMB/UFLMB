-- A viewer account is read-only even for ordinary member-owned records.
-- Restrictive policies are combined with existing permissive policies,
-- so trusted full admins retain their existing write access.
do $$
declare
  t text;
  cmd text;
  policy_name text;
begin
  foreach t in array array['profiles','user_preferences','card_reviews','support_conversations','support_messages','user_warnings'] loop
    foreach cmd in array array['INSERT','UPDATE','DELETE'] loop
      policy_name := 'Admin viewers blocked from ' || lower(cmd) || ' on ' || t;
      execute format('drop policy if exists %I on public.%I', policy_name, t);
      if cmd = 'INSERT' then
        execute format(
          'create policy %I on public.%I as restrictive for insert to authenticated with check (not (select private.is_admin_viewer()))',
          policy_name, t
        );
      elsif cmd = 'UPDATE' then
        execute format(
          'create policy %I on public.%I as restrictive for update to authenticated using (not (select private.is_admin_viewer())) with check (not (select private.is_admin_viewer()))',
          policy_name, t
        );
      else
        execute format(
          'create policy %I on public.%I as restrictive for delete to authenticated using (not (select private.is_admin_viewer()))',
          policy_name, t
        );
      end if;
    end loop;
  end loop;
end
$$;

drop policy if exists "Admin viewers blocked from updating notifications" on public.notifications;
create policy "Admin viewers blocked from updating notifications"
  on public.notifications as restrictive for update to authenticated
  using (not (select private.is_admin_viewer()))
  with check (not (select private.is_admin_viewer()));

drop policy if exists "Admin viewers blocked from creating dashboard visits" on public.admin_dashboard_visits;
create policy "Admin viewers blocked from creating dashboard visits"
  on public.admin_dashboard_visits as restrictive for insert to authenticated
  with check (not (select private.is_admin_viewer()));
drop policy if exists "Admin viewers blocked from updating dashboard visits" on public.admin_dashboard_visits;
create policy "Admin viewers blocked from updating dashboard visits"
  on public.admin_dashboard_visits as restrictive for update to authenticated
  using (not (select private.is_admin_viewer()))
  with check (not (select private.is_admin_viewer()));
drop policy if exists "Admin viewers blocked from deleting dashboard visits" on public.admin_dashboard_visits;
create policy "Admin viewers blocked from deleting dashboard visits"
  on public.admin_dashboard_visits as restrictive for delete to authenticated
  using (not (select private.is_admin_viewer()));