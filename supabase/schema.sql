-- UFLMB shared backend schema (Supabase / PostgreSQL)
-- Run in Supabase SQL Editor after creating a project.
-- Never put the service-role key in the browser or in this repository.

create extension if not exists pgcrypto;

create table if not exists public.cards (
  id text primary key,
  player_name text not null check (length(trim(player_name)) > 0),
  overall_rating integer not null check (overall_rating between 1 and 999),
  positions text[] not null check (cardinality(positions) > 0),
  nation text not null check (length(trim(nation)) > 0),
  card_name text,
  club text,
  stats jsonb not null default '{}'::jsonb,
  perks text[] not null default '{}',
  image_url text,
  source_url text not null check (source_url ~* '^https?://'),
  verified_at date not null,
  is_demo boolean not null default false,
  event text,
  position_category text,
  date_of_birth text,
  height_cm numeric,
  weight_kg numeric,
  foot text,
  weak_foot integer,
  skill_moves integer,
  source_image_path text,
  source_data jsonb not null default '{}'::jsonb,
  source_status text not null default 'imported-unverified'
    check (source_status in ('verified', 'imported-unverified')),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_reviews (
  id uuid primary key default gen_random_uuid(),
  card_id text not null references public.cards(id) on delete cascade,
  reviewer_name text not null check (length(trim(reviewer_name)) between 1 and 40),
  user_id uuid references auth.users(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  review_text text not null default '' check (length(review_text) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists card_reviews_card_id_idx on public.card_reviews(card_id);
create index if not exists card_reviews_user_created_idx on public.card_reviews(user_id, created_at desc);
create index if not exists cards_verified_at_idx on public.cards(verified_at desc);

-- Admin allowlist. Add only trusted Supabase auth user IDs here.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.cards enable row level security;
alter table public.card_reviews enable row level security;
alter table public.admin_users enable row level security;

-- Keep the SECURITY DEFINER authorization helper in a non-exposed schema.
-- The Data API should never expose this helper as a callable public RPC.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_uflmb_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function private.is_uflmb_admin() from public, anon, authenticated;
grant execute on function private.is_uflmb_admin() to authenticated;

-- Public read access for the card gallery and reviews.
drop policy if exists "Public can read cards" on public.cards;
create policy "Public can read cards" on public.cards for select to anon, authenticated using (true);
drop policy if exists "Public can read reviews" on public.card_reviews;
create policy "Public can read reviews" on public.card_reviews for select to anon, authenticated using (true);

-- Only explicitly allowlisted admins may create, edit, or delete card records.
drop policy if exists "Authenticated users can add cards" on public.cards;
drop policy if exists "Authenticated users can update cards" on public.cards;
drop policy if exists "Authenticated users can delete cards" on public.cards;
drop policy if exists "UFLMB admins can add cards" on public.cards;
create policy "UFLMB admins can add cards" on public.cards
  for insert to authenticated with check (private.is_uflmb_admin());
drop policy if exists "UFLMB admins can update cards" on public.cards;
create policy "UFLMB admins can update cards" on public.cards
  for update to authenticated using (private.is_uflmb_admin()) with check (private.is_uflmb_admin());
drop policy if exists "UFLMB admins can delete cards" on public.cards;
create policy "UFLMB admins can delete cards" on public.cards
  for delete to authenticated using (private.is_uflmb_admin());

-- The browser may read only its own allowlist row after authentication.
-- No browser role can insert, update, or delete allowlist entries.
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
drop policy if exists "Admins can read own allowlist entry" on public.admin_users;
create policy "Admins can read own allowlist entry" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

-- Remove the helper from public if this schema is reapplied over an older setup.
drop function if exists public.is_uflmb_admin();


-- One primary cloud snapshot for non-card private app data (bookmarks and squad assignments).
-- Only trusted admins can read or write it; browser-local storage remains a recovery cache.
create table if not exists public.app_state (
  id text primary key check (id = 'primary'),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_state enable row level security;
revoke all on public.app_state from anon, authenticated;
grant select, insert, update on public.app_state to authenticated;
drop policy if exists "UFLMB admins can read app state" on public.app_state;
create policy "UFLMB admins can read app state" on public.app_state
  for select to authenticated using (private.is_uflmb_admin());
drop policy if exists "UFLMB admins can insert app state" on public.app_state;
create policy "UFLMB admins can insert app state" on public.app_state
  for insert to authenticated with check (private.is_uflmb_admin());
drop policy if exists "UFLMB admins can update app state" on public.app_state;
create policy "UFLMB admins can update app state" on public.app_state
  for update to authenticated using (private.is_uflmb_admin()) with check (private.is_uflmb_admin());

-- Guests may read approved reviews but cannot submit content.
-- Authenticated reviews must be linked to the signed-in account.
drop policy if exists "Public can submit reviews" on public.card_reviews;
drop policy if exists "Authenticated members can submit reviews" on public.card_reviews;
create policy "Authenticated members can submit reviews" on public.card_reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and length(trim(reviewer_name)) between 1 and 40
    and rating between 1 and 5
    and length(review_text) <= 1000
  );

grant select on public.cards to anon, authenticated;
grant insert, update, delete on public.cards to authenticated;
revoke insert on public.card_reviews from anon;
grant select on public.card_reviews to anon, authenticated;
grant insert on public.card_reviews to authenticated;

-- Shared site appearance is public-readable so every visitor gets the same branding.
-- Only allowlisted admins may publish or update the shared settings.
create table if not exists public.site_settings (
  id text primary key check (id = 'branding'),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;
drop policy if exists "Public can read shared branding" on public.site_settings;
create policy "Public can read shared branding" on public.site_settings
  for select to anon, authenticated using (true);
drop policy if exists "UFLMB admins can insert shared branding" on public.site_settings;
create policy "UFLMB admins can insert shared branding" on public.site_settings
  for insert to authenticated with check (private.is_uflmb_admin());
drop policy if exists "UFLMB admins can update shared branding" on public.site_settings;
create policy "UFLMB admins can update shared branding" on public.site_settings
  for update to authenticated using (private.is_uflmb_admin()) with check (private.is_uflmb_admin());

-- Defense in depth: guests are read-only across all exposed public tables.
-- Only the public catalogue, approved reviews, and shared branding are readable.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON public.cards, public.card_reviews, public.site_settings TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;


-- Optional read-only administrator viewer role. Viewers can inspect admin
-- records but do not satisfy the existing admin write predicates.
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
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (select 1 from public.admin_viewers av where av.user_id = (select auth.uid()));
$$;
revoke all on function private.is_admin_viewer() from public, anon, authenticated;
grant execute on function private.is_admin_viewer() to authenticated;

create policy "Admin viewers can read admin allowlist" on public.admin_users
  for select to authenticated using ((select private.is_admin_viewer()));
create policy "Admin viewers can read app state" on public.app_state
  for select to authenticated using ((select private.is_admin_viewer()));
create policy "Admin viewers can read all community reviews" on public.card_reviews
  for select to authenticated using ((select private.is_admin_viewer()));
create policy "Admin viewers can read moderation queue" on public.moderation_queue
  for select to authenticated using ((select private.is_admin_viewer()));
create policy "Admin viewers can read all profiles" on public.profiles
  for select to authenticated using ((select private.is_admin_viewer()));
create policy "Admin viewers can read action log" on public.action_logs
  for select to authenticated using ((select private.is_admin_viewer()));
create policy "Admin viewers can read support inbox state" on public.support_admin_conversation_state
  for select to authenticated using ((select private.is_admin_viewer()));
create policy "Admin viewers can read all support conversations" on public.support_conversations
  for select to authenticated using ((select private.is_admin_viewer()));
create policy "Admin viewers can read all support messages" on public.support_messages
  for select to authenticated using ((select private.is_admin_viewer()));
create policy "Admin viewers can read all user warnings" on public.user_warnings
  for select to authenticated using ((select private.is_admin_viewer()));
create policy "Admin viewers can read dashboard visits" on public.admin_dashboard_visits
  for select to authenticated using ((select private.is_admin_viewer()));


-- Enforce strict read-only behavior for admin viewers on member-owned records.
do $$
declare t text; cmd text; policy_name text;
begin
  foreach t in array array['profiles','user_preferences','card_reviews','support_conversations','support_messages','user_warnings'] loop
    foreach cmd in array array['INSERT','UPDATE','DELETE'] loop
      policy_name := 'Admin viewers blocked from ' || lower(cmd) || ' on ' || t;
      if cmd = 'INSERT' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (not (select private.is_admin_viewer()))', policy_name, t);
      elsif cmd = 'UPDATE' then
        execute format('create policy %I on public.%I as restrictive for update to authenticated using (not (select private.is_admin_viewer())) with check (not (select private.is_admin_viewer()))', policy_name, t);
      else
        execute format('create policy %I on public.%I as restrictive for delete to authenticated using (not (select private.is_admin_viewer()))', policy_name, t);
      end if;
    end loop;
  end loop;
end
$$;
create policy "Admin viewers blocked from updating notifications"
  on public.notifications as restrictive for update to authenticated
  using (not (select private.is_admin_viewer())) with check (not (select private.is_admin_viewer()));
create policy "Admin viewers blocked from creating dashboard visits"
  on public.admin_dashboard_visits as restrictive for insert to authenticated
  with check (not (select private.is_admin_viewer()));
create policy "Admin viewers blocked from updating dashboard visits"
  on public.admin_dashboard_visits as restrictive for update to authenticated
  using (not (select private.is_admin_viewer())) with check (not (select private.is_admin_viewer()));
create policy "Admin viewers blocked from deleting dashboard visits"
  on public.admin_dashboard_visits as restrictive for delete to authenticated
  using (not (select private.is_admin_viewer()));


-- Blanket read-only enforcement for admin viewers on every RLS-protected
-- public table, plus Storage object mutations.
do $$
declare t record; cmd text; policy_name text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relname <> 'admin_viewers'
  loop
    foreach cmd in array array['INSERT','UPDATE','DELETE'] loop
      policy_name := 'admin_viewers_no_' || lower(cmd);
      if cmd='INSERT' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (not (select private.is_admin_viewer()))',policy_name,t.relname);
      elsif cmd='UPDATE' then
        execute format('create policy %I on public.%I as restrictive for update to authenticated using (not (select private.is_admin_viewer())) with check (not (select private.is_admin_viewer()))',policy_name,t.relname);
      else
        execute format('create policy %I on public.%I as restrictive for delete to authenticated using (not (select private.is_admin_viewer()))',policy_name,t.relname);
      end if;
    end loop;
  end loop;
end
$$;
create policy "Admin viewers cannot upload storage objects" on storage.objects
  as restrictive for insert to authenticated with check (not (select private.is_admin_viewer()));
create policy "Admin viewers cannot update storage objects" on storage.objects
  as restrictive for update to authenticated using (not (select private.is_admin_viewer()))
  with check (not (select private.is_admin_viewer()));
create policy "Admin viewers cannot delete storage objects" on storage.objects
  as restrictive for delete to authenticated using (not (select private.is_admin_viewer()));
