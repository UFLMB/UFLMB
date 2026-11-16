-- Extend the audit trail to the admin-only support inbox organization table.
-- Message bodies are not stored in this event; only state-field diffs are captured.

create or replace function public.capture_support_inbox_state_action_log()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_username text;
  v_old jsonb := case when TG_OP = 'INSERT' then '{}'::jsonb else to_jsonb(OLD) end;
  v_new jsonb := case when TG_OP = 'DELETE' then '{}'::jsonb else to_jsonb(NEW) end;
  v_changes jsonb;
  v_conversation_id text;
  v_event text;
begin
  v_changes := private.audit_jsonb_diff(v_old, v_new, '');

  if TG_OP = 'UPDATE' and jsonb_array_length(v_changes) = 0 then
    return NEW;
  end if;

  if v_actor_id is not null then
    select p.username into v_actor_username
    from public.profiles p
    where p.id = v_actor_id;
  end if;

  v_conversation_id := coalesce(v_new->>'conversation_id', v_old->>'conversation_id');
  v_event := case TG_OP
    when 'INSERT' then 'SUPPORT_INBOX_STATE_CREATED'
    when 'DELETE' then 'SUPPORT_INBOX_STATE_DELETED'
    else 'SUPPORT_INBOX_STATE_UPDATED'
  end;

  insert into public.action_logs(
    event_key, category, actor_user_id, actor_username, details, outcome
  )
  values (
    v_event,
    'support',
    v_actor_id,
    v_actor_username,
    jsonb_build_object(
      'section', 'Support / Inbox Organization',
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'source', 'database_trigger',
      'target_id', v_conversation_id,
      'target_label', v_conversation_id,
      'changes', v_changes
    ),
    'success'
  );

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

revoke all on function public.capture_support_inbox_state_action_log() from public, anon, authenticated;

drop trigger if exists action_log_support_admin_conversation_state on public.support_admin_conversation_state;
create trigger action_log_support_admin_conversation_state
after insert or update or delete on public.support_admin_conversation_state
for each row execute function public.capture_support_inbox_state_action_log();
