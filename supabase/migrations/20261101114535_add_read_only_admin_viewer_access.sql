create table if not exists public.admin_viewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_viewers enable row level security;
revoke all on public.admin_viewers from anon, authenticated;
grant select on public.admin_viewers to authenticated;
drop policy if exists "Admin viewers can read own access row" on public.admin_viewers;
create policy "Admin viewers can read own access row"
  on public.admin_viewers for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.is_admin_viewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.admin_viewers av
      where av.user_id = (select auth.uid())
    );
$$;
revoke all on function private.is_admin_viewer() from public, anon, authenticated;
grant execute on function private.is_admin_viewer() to authenticated;

-- Read-only visibility for the admin workspace. Existing write policies continue
-- to use the original admin predicates and therefore exclude admin viewers.
drop policy if exists "Admin viewers can read admin allowlist" on public.admin_users;
create policy "Admin viewers can read admin allowlist"
  on public.admin_users for select to authenticated
  using ((select private.is_admin_viewer()));

drop policy if exists "Admin viewers can read app state" on public.app_state;
create policy "Admin viewers can read app state"
  on public.app_state for select to authenticated
  using ((select private.is_admin_viewer()));

drop policy if exists "Admin viewers can read all community reviews" on public.card_reviews;
create policy "Admin viewers can read all community reviews"
  on public.card_reviews for select to authenticated
  using ((select private.is_admin_viewer()));

drop policy if exists "Admin viewers can read moderation queue" on public.moderation_queue;
create policy "Admin viewers can read moderation queue"
  on public.moderation_queue for select to authenticated
  using ((select private.is_admin_viewer()));

drop policy if exists "Admin viewers can read all profiles" on public.profiles;
create policy "Admin viewers can read all profiles"
  on public.profiles for select to authenticated
  using ((select private.is_admin_viewer()));

drop policy if exists "Admin viewers can read action log" on public.action_logs;
create policy "Admin viewers can read action log"
  on public.action_logs for select to authenticated
  using ((select private.is_admin_viewer()));

drop policy if exists "Admin viewers can read support inbox state" on public.support_admin_conversation_state;
create policy "Admin viewers can read support inbox state"
  on public.support_admin_conversation_state for select to authenticated
  using ((select private.is_admin_viewer()));

drop policy if exists "Admin viewers can read all support conversations" on public.support_conversations;
create policy "Admin viewers can read all support conversations"
  on public.support_conversations for select to authenticated
  using ((select private.is_admin_viewer()));

drop policy if exists "Admin viewers can read all support messages" on public.support_messages;
create policy "Admin viewers can read all support messages"
  on public.support_messages for select to authenticated
  using ((select private.is_admin_viewer()));

drop policy if exists "Admin viewers can read all user warnings" on public.user_warnings;
create policy "Admin viewers can read all user warnings"
  on public.user_warnings for select to authenticated
  using ((select private.is_admin_viewer()));

drop policy if exists "Admin viewers can read dashboard visits" on public.admin_dashboard_visits;
create policy "Admin viewers can read dashboard visits"
  on public.admin_dashboard_visits for select to authenticated
  using ((select private.is_admin_viewer()));