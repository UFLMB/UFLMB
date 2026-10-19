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
  source_url text not null,
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

alter table public.cards enable row level security;
alter table public.card_reviews enable row level security;

-- Anyone can read the public card database and reviews.
drop policy if exists "Public can read cards" on public.cards;
create policy "Public can read cards" on public.cards for select using (true);
drop policy if exists "Public can read reviews" on public.card_reviews;
create policy "Public can read reviews" on public.card_reviews for select using (true);

-- Only signed-in Supabase users may maintain card records.
drop policy if exists "Authenticated users can add cards" on public.cards;
create policy "Authenticated users can add cards" on public.cards for insert to authenticated with check (true);
drop policy if exists "Authenticated users can update cards" on public.cards;
create policy "Authenticated users can update cards" on public.cards for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated users can delete cards" on public.cards;
create policy "Authenticated users can delete cards" on public.cards for delete to authenticated using (true);

-- Public reviews are allowed for initial community testing; apply anti-spam controls
-- (captcha, rate limits, verified accounts) before promoting this to a large audience.
drop policy if exists "Public can submit reviews" on public.card_reviews;
create policy "Public can submit reviews" on public.card_reviews for insert to anon, authenticated with check (true);
