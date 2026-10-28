-- Correctly distinguish role-only names with numeric suffixes from leetspeak
-- and preserve legitimate fan names such as StrikerzSupporter.
create or replace function private.username_policy_error(p_username text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_normalized text;
  v_raw_compact text;
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,24}$' then
    return 'USERNAME_POLICY: Username must be 3-24 characters using only letters, numbers, and underscores.';
  end if;

  v_raw_compact := regexp_replace(lower(p_username), '[^a-z0-9]', '', 'g');
  v_normalized := translate(lower(p_username), '0134578@$', 'oieastbas');
  v_normalized := regexp_replace(v_normalized, '[^a-z0-9]', '', 'g');

  if v_normalized ~ '(motherfucker|motherfuck|asshole|arsehole|bullshit|fuck|shit|bitch|bastard|cunt|pussy|whore|slut|faggot|nigger|nigga|kike|chink|spic|wetback|tranny|dyke|kurva|fasz|geci|picsa|kocsog|buzi|bazd|baszd|szar|scheisse|arschloch|hurensohn|mierda|puta|cabron|joder|putain|connard|heilhitler|whitepower|whitepride|aryannation|alqaeda|alqaida|daesh|isil)' then
    return 'USERNAME_POLICY: This username contains a prohibited offensive, hateful, or extremist term.';
  end if;

  -- Avoid broad substring matching for ISIS, which would also reject words such as "crisis".
  if v_normalized ~ '^isis' or v_normalized = 'kkk' then
    return 'USERNAME_POLICY: This username contains a prohibited extremist organization reference.';
  end if;

  -- Fan identifiers are allowed; role claims combined with a brand are not.
  if v_normalized ~ '(uflmb|ufl|strikerz)'
     and (
       v_normalized ~ '(administrator|admin|moderator|modteam|staff|employee|official|verified|developer|devteam|security|representative|owner)'
       or (v_normalized ~ 'support$' and v_normalized !~ 'supporter')
     ) then
    return 'USERNAME_POLICY: Fan names are allowed, but usernames must not imply official, admin, staff, or employee status.';
  end if;

  if v_raw_compact ~ '^(administrator|admin|moderator|modteam|staff|employee|official|verified|developer|devteam|security|representative|owner)[0-9]*$' then
    return 'USERNAME_POLICY: Usernames that imply administrator, official, staff, or employee status are not allowed.';
  end if;

  return null;
end;
$$;

revoke all on function private.username_policy_error(text) from public, anon, authenticated;
