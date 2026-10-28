-- Add per-user profile logos with server-side authorization for the administrator-only logo.
alter table public.profiles
  add column if not exists profile_logo text not null default 'default';

alter table public.profiles
  drop constraint if exists profiles_profile_logo_check;
alter table public.profiles
  add constraint profiles_profile_logo_check
  check (profile_logo in ('default', 'star', 'ball', 'bolt', 'shield', 'admin'));

-- Keep username/profile logo updates limited to safe, user-editable profile fields.
revoke update on public.profiles from authenticated;
grant update (username, profile_logo, updated_at) on public.profiles to authenticated;

create or replace function private.enforce_profile_logo_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_logo = 'admin' and not private.is_uflmb_admin() then
    raise exception 'The administrator logo is restricted to verified administrators.'
      using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.enforce_profile_logo_permissions() from public, anon, authenticated;

drop trigger if exists enforce_profile_logo_permissions on public.profiles;
create trigger enforce_profile_logo_permissions
before insert or update on public.profiles
for each row execute function private.enforce_profile_logo_permissions();

-- Reapply safe grants when this migration is run after the existing profile migration.
grant select on public.profiles to authenticated;
