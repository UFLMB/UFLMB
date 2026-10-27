-- Ensure username sign-in uses the same normalized value as the visible username.
-- The trigger also prevents a client from supplying a mismatched normalized username.
create or replace function public.normalize_profile_username()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.username_normalized := lower(trim(new.username));
  return new;
end;
$$;

drop trigger if exists normalize_profile_username on public.profiles;
create trigger normalize_profile_username
before insert or update of username on public.profiles
for each row execute function public.normalize_profile_username();

update public.profiles
set username_normalized = lower(trim(username))
where username_normalized is distinct from lower(trim(username));

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare requested_username text;
begin
  requested_username := coalesce(new.raw_user_meta_data ->> 'username', '');
  if requested_username !~ '^[A-Za-z0-9_]{3,24}$' then
    requested_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;
  insert into public.profiles (id, username, username_normalized)
  values (new.id, requested_username, lower(trim(requested_username)))
  on conflict (id) do nothing;
  return new;
end;
$$;
