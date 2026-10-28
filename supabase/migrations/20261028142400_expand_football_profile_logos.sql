-- Expand the allowed football-themed profile icon values while preserving legacy choices.
alter table public.profiles
  drop constraint if exists profiles_profile_logo_check;

alter table public.profiles
  add constraint profiles_profile_logo_check
  check (profile_logo in (
    'default', 'star', 'ball', 'bolt', 'shield', 'admin',
    'striker', 'keeper', 'defender', 'playmaker', 'boots',
    'jersey', 'stadium', 'trophy', 'goal'
  ));
