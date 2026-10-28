-- Community moderation foundation: automated flags are review signals, not proof.
alter table public.card_reviews
  add column if not exists moderation_status text not null default 'approved'
  check (moderation_status in ('approved', 'pending_review', 'hidden'));

create table if not exists public.moderation_queue (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('card_review', 'profile')),
  content_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  content_excerpt text not null,
  reason_codes text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'dismissed', 'actioned')),
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.user_warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  policy_area text not null check (policy_area in ('username', 'community_review', 'harassment', 'spam', 'impersonation', 'other')),
  related_queue_id uuid references public.moderation_queue(id) on delete set null,
  issued_by uuid not null references auth.users(id) on delete restrict,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists moderation_queue_status_created_idx
  on public.moderation_queue (status, created_at desc);
create index if not exists user_warnings_user_created_idx
  on public.user_warnings (user_id, created_at desc);

alter table public.moderation_queue enable row level security;
alter table public.user_warnings enable row level security;

drop policy if exists "Admins read moderation queue" on public.moderation_queue;
create policy "Admins read moderation queue" on public.moderation_queue
  for select to authenticated using (private.is_admin());
drop policy if exists "Admins update moderation queue" on public.moderation_queue;
create policy "Admins update moderation queue" on public.moderation_queue
  for update to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists "Admins read warnings" on public.user_warnings;
create policy "Admins read warnings" on public.user_warnings
  for select to authenticated using (private.is_admin());
drop policy if exists "Users read own warnings" on public.user_warnings;
create policy "Users read own warnings" on public.user_warnings
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Admins issue warnings" on public.user_warnings;
create policy "Admins issue warnings" on public.user_warnings
  for insert to authenticated with check (
    issued_by = (select auth.uid()) and private.is_admin()
  );
drop policy if exists "Users acknowledge own warnings" on public.user_warnings;
create policy "Users acknowledge own warnings" on public.user_warnings
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, update on public.moderation_queue to authenticated;
grant select, insert, update on public.user_warnings to authenticated;
revoke all on public.moderation_queue from anon;
revoke all on public.user_warnings from anon;

create or replace function private.flag_review_for_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text;
  reasons text[] := '{}';
begin
  normalized := lower(regexp_replace(coalesce(new.reviewer_name, '') || ' ' || coalesce(new.review_text, ''), '[^a-zA-Z0-9]+', '', 'g'));

  if normalized ~ '(motherfucker|asshole|arsehole|bullshit|fuck|shit|bitch|bastard|cunt|faggot|nigger|nigga|kike|chink|spic|wetback|kurva|fasz|geci|picsa|kocsog|buzi|bazd|baszd|heilhitler|whitepower|alqaeda|alqaida|isis|daesh)' then
    reasons := array_append(reasons, 'potentially_offensive_or_hateful_language');
  end if;
  if length(coalesce(new.review_text, '')) > 700 or
     lower(coalesce(new.review_text, '')) ~ '(https?://|www\.|buy now|free money|crypto giveaway)' then
    reasons := array_append(reasons, 'potential_spam');
  end if;
  if lower(coalesce(new.reviewer_name, '')) ~ '(uflmb|strikerz).*(admin|moderator|official|staff|support)' then
    reasons := array_append(reasons, 'potential_impersonation');
  end if;

  if cardinality(reasons) > 0 then
    new.moderation_status := 'pending_review';
  else
    new.moderation_status := 'approved';
  end if;
  return new;
end;
$$;

revoke all on function private.flag_review_for_moderation() from public, anon, authenticated;
drop trigger if exists card_reviews_moderation_check on public.card_reviews;
create trigger card_reviews_moderation_check
  before insert or update of reviewer_name, review_text on public.card_reviews
  for each row execute function private.flag_review_for_moderation();

create or replace function private.enqueue_flagged_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text;
  reasons text[] := '{}';
begin
  if new.moderation_status <> 'pending_review' then
    return new;
  end if;

  normalized := lower(regexp_replace(coalesce(new.reviewer_name, '') || ' ' || coalesce(new.review_text, ''), '[^a-zA-Z0-9]+', '', 'g'));
  if normalized ~ '(motherfucker|asshole|arsehole|bullshit|fuck|shit|bitch|bastard|cunt|faggot|nigger|nigga|kike|chink|spic|wetback|kurva|fasz|geci|picsa|kocsog|buzi|bazd|baszd|heilhitler|whitepower|alqaeda|alqaida|isis|daesh)' then reasons := array_append(reasons, 'potentially_offensive_or_hateful_language'); end if;
  if length(coalesce(new.review_text, '')) > 700 or lower(coalesce(new.review_text, '')) ~ '(https?://|www\.|buy now|free money|crypto giveaway)' then reasons := array_append(reasons, 'potential_spam'); end if;
  if lower(coalesce(new.reviewer_name, '')) ~ '(uflmb|strikerz).*(admin|moderator|official|staff|support)' then reasons := array_append(reasons, 'potential_impersonation'); end if;

  insert into public.moderation_queue(content_type, content_id, display_name, content_excerpt, reason_codes)
  values ('card_review', new.id::text, left(coalesce(new.reviewer_name, 'Member'), 40), left(coalesce(new.review_text, ''), 500), reasons);
  return new;
end;
$$;

revoke all on function private.enqueue_flagged_review() from public, anon, authenticated;
drop trigger if exists card_reviews_moderation_queue on public.card_reviews;
create trigger card_reviews_moderation_queue
  after insert or update of moderation_status on public.card_reviews
  for each row when (new.moderation_status = 'pending_review')
  execute function private.enqueue_flagged_review();

drop policy if exists "Public can read reviews" on public.card_reviews;
create policy "Public can read approved reviews" on public.card_reviews
  for select to anon, authenticated using (moderation_status = 'approved');

-- User-facing warnings are only issued by an authorized administrator after review.

-- Only verified administrators may change review visibility after manual review.
drop policy if exists "Admins moderate community reviews" on public.card_reviews;
create policy "Admins moderate community reviews" on public.card_reviews
  for update to authenticated using (private.is_admin()) with check (private.is_admin());
grant update (moderation_status) on public.card_reviews to authenticated;
