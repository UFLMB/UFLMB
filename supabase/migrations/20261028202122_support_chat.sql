-- Private support inbox. Community moderation does not automatically inspect support messages.
create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 3 and 120),
  category text not null default 'general' check (category in ('general', 'bug', 'account', 'feedback')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('user', 'admin')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists support_conversations_user_updated_idx
  on public.support_conversations (user_id, updated_at desc);
create index if not exists support_conversations_status_updated_idx
  on public.support_conversations (status, updated_at desc);
create index if not exists support_messages_conversation_created_idx
  on public.support_messages (conversation_id, created_at asc);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "Users read own support conversations" on public.support_conversations;
create policy "Users read own support conversations"
  on public.support_conversations for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Admins read all support conversations" on public.support_conversations;
create policy "Admins read all support conversations"
  on public.support_conversations for select to authenticated
  using (private.is_admin());

drop policy if exists "Users create own support conversations" on public.support_conversations;
create policy "Users create own support conversations"
  on public.support_conversations for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'open');

drop policy if exists "Admins update support conversation status" on public.support_conversations;
create policy "Admins update support conversation status"
  on public.support_conversations for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists "Users read messages in own support conversations" on public.support_messages;
create policy "Users read messages in own support conversations"
  on public.support_messages for select to authenticated
  using (
    exists (
      select 1 from public.support_conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "Admins read all support messages" on public.support_messages;
create policy "Admins read all support messages"
  on public.support_messages for select to authenticated
  using (private.is_admin());

drop policy if exists "Users send messages in own support conversations" on public.support_messages;
create policy "Users send messages in own support conversations"
  on public.support_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_role = 'user'
    and exists (
      select 1 from public.support_conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "Admins reply to support conversations" on public.support_messages;
create policy "Admins reply to support conversations"
  on public.support_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_role = 'admin'
    and private.is_admin()
  );

grant select, insert on public.support_conversations to authenticated;
grant update (status, updated_at) on public.support_conversations to authenticated;
grant select, insert on public.support_messages to authenticated;

-- A narrowly scoped trigger updates ordering/status metadata without granting users
-- direct write access to other users' conversations.
create or replace function private.touch_support_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_id is distinct from auth.uid() then
    raise exception 'sender_id must match the authenticated user';
  end if;

  if new.sender_role = 'admin' then
    if not exists (select 1 from public.admin_users a where a.user_id = auth.uid()) then
      raise exception 'administrator access required';
    end if;
    update public.support_conversations
      set updated_at = now(), status = case when status = 'open' then 'in_progress' else status end
      where id = new.conversation_id;
  else
    update public.support_conversations
      set updated_at = now(), status = case when status = 'resolved' then 'open' else status end
      where id = new.conversation_id and user_id = auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function private.touch_support_conversation() from public, anon, authenticated;
drop trigger if exists support_message_touch_conversation on public.support_messages;
create trigger support_message_touch_conversation
  after insert on public.support_messages
  for each row execute function private.touch_support_conversation();
