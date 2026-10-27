-- Initial UFLMB shared database schema.
-- Later migrations add shared branding, extended card metadata and user profiles.

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
  updated_at timestamptz not null default now()
);

create table if not exists public.card_reviews (
  id uuid primary key default gen_random_uuid(),
  card_id text not null references public.cards(id) on delete cascade,
  reviewer_name text not null check (length(trim(reviewer_name)) between 1 and 40),
  rating smallint not null check (rating between 1 and 5),
  review_text text not null default '' check (length(review_text) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists card_reviews_card_id_idx on public.card_reviews(card_id);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.app_state (
  id text primary key check (id = 'primary'),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

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
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function private.is_uflmb_admin() from public, anon, authenticated;
grant execute on function private.is_uflmb_admin() to authenticated;

alter table public.cards enable row level security;
alter table public.card_reviews enable row level security;
alter table public.admin_users enable row level security;
alter table public.app_state enable row level security;

drop policy if exists "Public can read cards" on public.cards;
create policy "Public can read cards" on public.cards for select to anon, authenticated using (true);
drop policy if exists "UFLMB admins can add cards" on public.cards;
create policy "UFLMB admins can add cards" on public.cards for insert to authenticated with check (private.is_uflmb_admin());
drop policy if exists "UFLMB admins can update cards" on public.cards;
create policy "UFLMB admins can update cards" on public.cards for update to authenticated using (private.is_uflmb_admin()) with check (private.is_uflmb_admin());
drop policy if exists "UFLMB admins can delete cards" on public.cards;
create policy "UFLMB admins can delete cards" on public.cards for delete to authenticated using (private.is_uflmb_admin());

drop policy if exists "Public can read reviews" on public.card_reviews;
create policy "Public can read reviews" on public.card_reviews for select to anon, authenticated using (true);
drop policy if exists "Public can submit reviews" on public.card_reviews;
create policy "Public can submit reviews" on public.card_reviews for insert to anon, authenticated with check (
  length(trim(reviewer_name)) between 1 and 40 and rating between 1 and 5 and length(review_text) <= 1000
);

revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
drop policy if exists "Admins can read own allowlist entry" on public.admin_users;
create policy "Admins can read own allowlist entry" on public.admin_users for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.app_state from anon, authenticated;
grant select, insert, update on public.app_state to authenticated;
drop policy if exists "UFLMB admins can read app state" on public.app_state;
create policy "UFLMB admins can read app state" on public.app_state for select to authenticated using (private.is_uflmb_admin());
drop policy if exists "UFLMB admins can insert app state" on public.app_state;
create policy "UFLMB admins can insert app state" on public.app_state for insert to authenticated with check (private.is_uflmb_admin());
drop policy if exists "UFLMB admins can update app state" on public.app_state;
create policy "UFLMB admins can update app state" on public.app_state for update to authenticated using (private.is_uflmb_admin()) with check (private.is_uflmb_admin());

grant select on public.cards to anon, authenticated;
grant insert, update, delete on public.cards to authenticated;
grant select, insert on public.card_reviews to anon, authenticated;
