-- Account suspension, access restrictions, and an auditable admin action trail.
create table if not exists public.account_suspensions (
  user_id uuid primary key,
  reason text not null check (length(trim(reason)) between 10 and 500),
  suspended_by uuid not null,
  suspended_at timestamptz not null default now()
);

create table if not exists public.account_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('suspend', 'restore', 'delete')),
  target_user_id uuid not null,
  target_username text not null,
  performed_by uuid not null,
  reason text not null check (length(trim(reason)) between 10 and 500),
  outcome text not null default 'pending' check (outcome in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists account_moderation_audit_created_at_idx
  on public.account_moderation_audit (created_at desc);
create index if not exists account_moderation_audit_target_idx
  on public.account_moderation_audit (target_user_id, created_at desc);

alter table public.account_suspensions enable row level security;
alter table public.account_moderation_audit enable row level security;
revoke all on public.account_suspensions from anon, authenticated;
revoke all on public.account_moderation_audit from anon, authenticated;

-- This helper deliberately keeps administrators active and requires ordinary members
-- to have a profile and no active suspension row.
create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select auth.uid() is not null
    and (
      exists (select 1 from public.admin_users au where au.user_id = auth.uid())
      or (
        exists (select 1 from public.profiles p where p.id = auth.uid())
        and not exists (select 1 from public.account_suspensions s where s.user_id = auth.uid())
      )
    );
$$;

revoke all on function private.is_active_user() from public, anon;
grant execute on function private.is_active_user() to authenticated;

-- Restrictive policies layer on top of existing ownership/admin policies.
-- They prevent an existing JWT from continuing to use account-scoped APIs after suspension.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'admin_users',
    'user_preferences',
    'support_conversations',
    'support_messages',
    'moderation_queue',
    'user_warnings',
    'card_reviews'
  ]
  loop
    execute format('drop policy if exists "Require active account" on public.%I', table_name);
    execute format(
      'create policy "Require active account" on public.%I as restrictive for all to authenticated using (private.is_active_user()) with check (private.is_active_user())',
      table_name
    );
  end loop;
end $$;
