-- Enforce username safety on the database, not only in browser validation.
-- Fan identifiers such as UFLPlayer, StrikerzFan and PlayerUFL remain permitted.
-- Names that impersonate official/admin/staff roles and curated abusive/extremist terms are rejected.

create or replace function private.username_policy_error(p_username text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_normalized text;
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,24}$' then
    return 'USERNAME_POLICY: Username must be 3-24 characters using only letters, numbers, and underscores.';
  end if;

  v_normalized := translate(lower(p_username), '0134578@$', 'oieastbas');
  v_normalized := regexp_replace(v_normalized, '[^a-z0-9]', '', 'g');

  if v_normalized ~ '(motherfucker|motherfuck|asshole|arsehole|bullshit|fuck|shit|bitch|bastard|cunt|pussy|whore|slut|faggot|nigger|nigga|kike|chink|spic|wetback|tranny|dyke|kurva|fasz|geci|picsa|kocsog|buzi|bazd|baszd|szar|scheisse|arschloch|hurensohn|mierda|puta|cabron|joder|putain|connard|heilhitler|whitepower|whitepride|aryannation|isis|isil|daesh|alqaeda|alqaida|kkk)' then
    return 'USERNAME_POLICY: This username contains a prohibited offensive, hateful, or extremist term.';
  end if;

  if v_normalized ~ '(uflmb|ufl|strikerz)'
     and v_normalized ~ '(administrator|admin|moderator|modteam|staff|employee|official|verified|developer|devteam|security|representative|owner)' then
    return 'USERNAME_POLICY: Fan names are allowed, but usernames must not imply official, admin, staff, or employee status.';
  end if;

  if v_normalized ~ '^(administrator|admin|moderator|modteam|staff|employee|official|verified|developer|devteam|security|representative|owner)[0-9]*$' then
    return 'USERNAME_POLICY: Usernames that imply administrator, official, staff, or employee status are not allowed.';
  end if;

  return null;
end;
$$;

revoke all on function private.username_policy_error(text) from public, anon, authenticated;

create or replace function public.enforce_profile_username_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_error text;
begin
  v_error := private.username_policy_error(new.username);
  if v_error is not null then
    raise exception '%', v_error using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_profile_username_policy() from public, anon, authenticated;

drop trigger if exists enforce_profile_username_policy on public.profiles;
create trigger enforce_profile_username_policy
before insert or update of username on public.profiles
for each row execute function public.enforce_profile_username_policy();
