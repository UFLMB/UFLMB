-- Preserve expanded player-card metadata in the shared database.
alter table public.cards add column if not exists event text;
alter table public.cards add column if not exists position_category text;
alter table public.cards add column if not exists date_of_birth text;
alter table public.cards add column if not exists height_cm numeric;
alter table public.cards add column if not exists weight_kg numeric;
alter table public.cards add column if not exists foot text;
alter table public.cards add column if not exists weak_foot integer;
alter table public.cards add column if not exists skill_moves integer;
alter table public.cards add column if not exists source_image_path text;
alter table public.cards add column if not exists source_data jsonb not null default '{}'::jsonb;
alter table public.cards add column if not exists source_status text not null default 'imported-unverified';
alter table public.cards drop constraint if exists cards_source_status_check;
alter table public.cards add constraint cards_source_status_check check (source_status in ('verified', 'imported-unverified'));
create index if not exists cards_verified_at_idx on public.cards(verified_at desc);
