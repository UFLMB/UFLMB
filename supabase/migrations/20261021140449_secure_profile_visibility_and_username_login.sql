-- Store a normalized unique username for case-insensitive username sign-in.
-- The generated column always mirrors lower(username), preventing clients from
-- submitting a normalized value that does not match the visible username.
alter table public.profiles
  add column if not exists username_normalized text generated always as (lower(username)) stored;
alter table public.profiles
  add constraint profiles_username_normalized_key unique (username_normalized);

revoke all on public.profiles from anon, authenticated;
grant select, update on public.profiles to authenticated;
revoke all on public.user_preferences from anon, authenticated;
grant select, insert, update on public.user_preferences to authenticated;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "Users can read own preferences" on public.user_preferences;
create policy "Users can read own preferences" on public.user_preferences for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own preferences" on public.user_preferences;
create policy "Users can insert own preferences" on public.user_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own preferences" on public.user_preferences;
create policy "Users can update own preferences" on public.user_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
