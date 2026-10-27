-- User profiles and per-account favorites/compare state.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  favorites text[] not null default '{}',
  compare_ids text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint user_preferences_compare_limit check (cardinality(compare_ids) <= 3)
);

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare requested_username text;
begin
  requested_username := coalesce(new.raw_user_meta_data ->> 'username', '');
  if requested_username !~ '^[A-Za-z0-9_]{3,24}$' then
    requested_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;
  insert into public.profiles (id, username) values (new.id, requested_username) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute function public.create_profile_for_new_user();
