create or replace function private.notify_important_action_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient record;
  event_title text;
  event_body text;
begin
  if new.event_key = 'ACCOUNT_SUSPENDED' then
    event_title := 'Account suspended';
    event_body := coalesce(new.target_username, 'A member') || ' was suspended.';
  elsif new.event_key = 'ACCOUNT_RESTORED' then
    event_title := 'Account restored';
    event_body := coalesce(new.target_username, 'A member') || ' was restored.';
  elsif new.event_key = 'SITE_SETTINGS_UPDATED' then
    event_title := 'Site settings updated';
    event_body := coalesce(new.actor_username, 'An administrator') || ' updated the site settings.';
  else
    return new;
  end if;

  for recipient in
    select user_id from public.admin_users
    where user_id is distinct from new.actor_user_id
  loop
    insert into public.notifications(user_id, title, body, type, metadata)
    values (recipient.user_id, event_title, event_body, 'admin_event',
      jsonb_build_object('action_log_id', new.id, 'event_key', new.event_key));
  end loop;

  if new.event_key in ('ACCOUNT_SUSPENDED', 'ACCOUNT_RESTORED')
     and new.target_user_id is not null
     and new.target_user_id is distinct from new.actor_user_id then
    insert into public.notifications(user_id, title, body, type, metadata)
    values (new.target_user_id, 'Account status updated', event_body, 'account',
      jsonb_build_object('action_log_id', new.id, 'event_key', new.event_key));
  end if;
  return new;
end;
$$;
revoke all on function private.notify_important_action_log() from public, anon, authenticated;
drop trigger if exists notify_important_action_log_insert on public.action_logs;
create trigger notify_important_action_log_insert
after insert on public.action_logs
for each row
when (new.event_key in ('ACCOUNT_SUSPENDED', 'ACCOUNT_RESTORED', 'SITE_SETTINGS_UPDATED'))
execute function private.notify_important_action_log();