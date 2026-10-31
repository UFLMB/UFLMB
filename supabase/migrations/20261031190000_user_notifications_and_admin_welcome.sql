create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  type text not null default 'info',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;
alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users mark own notifications read" on public.notifications;
create policy "Users mark own notifications read" on public.notifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.admin_dashboard_visits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.admin_dashboard_visits enable row level security;
grant select, insert, update on public.admin_dashboard_visits to authenticated;
drop policy if exists "Admins read own dashboard visit" on public.admin_dashboard_visits;
create policy "Admins read own dashboard visit" on public.admin_dashboard_visits for select to authenticated using ((select auth.uid()) = user_id and (select private.is_admin()));
drop policy if exists "Admins create own dashboard visit" on public.admin_dashboard_visits;
create policy "Admins create own dashboard visit" on public.admin_dashboard_visits for insert to authenticated with check ((select auth.uid()) = user_id and (select private.is_admin()));
drop policy if exists "Admins update own dashboard visit" on public.admin_dashboard_visits;
create policy "Admins update own dashboard visit" on public.admin_dashboard_visits for update to authenticated using ((select auth.uid()) = user_id and (select private.is_admin())) with check ((select auth.uid()) = user_id and (select private.is_admin()));

create or replace function private.trim_read_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
  where n.user_id = new.user_id
    and n.read_at is not null
    and n.id not in (
      select keep_row.id from public.notifications keep_row
      where keep_row.user_id = new.user_id and keep_row.read_at is not null
      order by keep_row.created_at desc, keep_row.id desc
      offset 20
    );
  return new;
end;
$$;
revoke all on function private.trim_read_notifications() from public, anon, authenticated;
drop trigger if exists trim_read_notifications_after_change on public.notifications;
create trigger trim_read_notifications_after_change
after insert or update of read_at on public.notifications
for each row execute function private.trim_read_notifications();

create or replace function private.notify_support_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation public.support_conversations%rowtype;
  recipient record;
begin
  select * into conversation from public.support_conversations where id = new.conversation_id;
  if not found then return new; end if;

  if new.sender_role = 'user' then
    for recipient in select user_id from public.admin_users loop
      insert into public.notifications(user_id, title, body, type, metadata)
      values (recipient.user_id, 'New support message', left(coalesce(conversation.subject, 'A user sent a message'), 140), 'support', jsonb_build_object('conversation_id', conversation.id, 'message_id', new.id));
    end loop;
  elsif new.sender_role = 'admin' then
    insert into public.notifications(user_id, title, body, type, metadata)
    values (conversation.user_id, 'Support replied', left(coalesce(conversation.subject, 'Your support conversation has a reply'), 140), 'support', jsonb_build_object('conversation_id', conversation.id, 'message_id', new.id));
  end if;
  return new;
end;
$$;
revoke all on function private.notify_support_message() from public, anon, authenticated;
drop trigger if exists notify_support_message_insert on public.support_messages;
create trigger notify_support_message_insert
after insert on public.support_messages
for each row execute function private.notify_support_message();
