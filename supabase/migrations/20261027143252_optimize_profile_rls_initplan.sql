-- Optimize auth.uid() calls in profile/preference RLS policies.
-- Wrapping auth.uid() in a scalar SELECT lets PostgreSQL evaluate it once per
-- statement instead of re-evaluating it for each row. Authorization behavior
-- is unchanged.

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users can read own preferences" on public.user_preferences;
create policy "Users can read own preferences"
  on public.user_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own preferences" on public.user_preferences;
create policy "Users can insert own preferences"
  on public.user_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own preferences" on public.user_preferences;
create policy "Users can update own preferences"
  on public.user_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
