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

-- Do not expose or allow browser writes to the admin allowlist.
revoke all on public.admin_users from anon, authenticated;

-- Remove the helper from public if this schema is reapplied over an older setup.
drop function if exists public.is_uflmb_admin();

-- Public reviews are still open for initial community testing. Apply anti-spam
-- controls (captcha, rate limits, moderation) before promoting this widely.
drop policy if exists "Public can submit reviews" on public.card_reviews;
create policy "Public can submit reviews" on public.card_reviews
  for insert to anon, authenticated
  with check (
    length(trim(reviewer_name)) between 1 and 40
    and rating between 1 and 5
    and length(review_text) <= 1000
  );

grant select on public.cards to anon, authenticated;
grant insert, update, delete on public.cards to authenticated;
grant select, insert on public.card_reviews to anon, authenticated;
