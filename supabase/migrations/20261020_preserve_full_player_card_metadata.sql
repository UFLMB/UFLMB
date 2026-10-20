-- Additive migration: preserve the full source CSV metadata during Supabase sync.
-- Safe to run on an existing database; no existing rows are deleted or rewritten.
alter table public.cards
  add column if not exists event text,
  add column if not exists position_category text,
  add column if not exists date_of_birth text,
  add column if not exists height_cm numeric,
  add column if not exists weight_kg numeric,
  add column if not exists foot text,
  add column if not exists weak_foot integer,
  add column if not exists skill_moves integer,
  add column if not exists source_image_path text,
  add column if not exists source_data jsonb not null default '{}'::jsonb,
  add column if not exists source_status text not null default 'imported-unverified'
    check (source_status in ('verified', 'imported-unverified'));
