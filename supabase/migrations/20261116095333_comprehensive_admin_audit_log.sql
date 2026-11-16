-- Expand the existing Action Log into a field-level audit trail.
-- Sensitive values and private message bodies are deliberately excluded.

create schema if not exists private;

create or replace function private.audit_jsonb_diff(
  p_old jsonb,
  p_new jsonb,
  p_prefix text default ''
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, private
as $$
declare
  v_key text;
  v_old_value jsonb;
  v_new_value jsonb;
  v_path text;
  v_result jsonb := '[]'::jsonb;
  v_nested jsonb;
begin
  for v_key in
    select key
    from (
      select jsonb_object_keys(case when jsonb_typeof(p_old) = 'object' then p_old else '{}'::jsonb end) as key
      union
      select jsonb_object_keys(case when jsonb_typeof(p_new) = 'object' then p_new else '{}'::jsonb end) as key
    ) keys
    order by key
  loop
    if lower(v_key) ~ '(password|token|secret|credential|authorization|cookie|session|private_key|api_key|message_body|^body$|^content$)' then
      continue;
    end if;
    if v_key in ('id', 'created_at', 'updated_at') then
      continue;
    end if;

    v_old_value := p_old -> v_key;
    v_new_value := p_new -> v_key;
    v_path := case when p_prefix = '' then v_key else p_prefix || '.' || v_key end;

    if jsonb_typeof(v_old_value) = 'object' and jsonb_typeof(v_new_value) = 'object' then
      v_nested := private.audit_jsonb_diff(v_old_value, v_new_value, v_path);
      v_result := v_result || v_nested;
    elsif v_old_value is distinct from v_new_value then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'field', v_path,
        'from', v_old_value,
        'to', v_new_value
      ));
    end if;
  end loop;
  return v_result;
end;
$$;

revoke all on function private.audit_jsonb_diff(jsonb, jsonb, text) from public, anon, authenticated;

create or replace function public.capture_action_log()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_username text;
  v_target_id uuid;
  v_target_username text;
  v_target_label text;
  v_event text;
  v_category text;
  v_section text;
  v_old jsonb := case when TG_OP = 'INSERT' then '{}'::jsonb else to_jsonb(OLD) end;
  v_new jsonb := case when TG_OP = 'DELETE' then '{}'::jsonb else to_jsonb(NEW) end;
  v_changes jsonb;
  v_details jsonb;
begin
  -- The moderation Edge Function records these operations with the verified
  -- administrator identity. Avoid creating a second anonymous trigger entry.
  if TG_TABLE_NAME = 'account_suspensions' and v_actor_id is null then
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;

  if v_actor_id is not null then
    select p.username into v_actor_username from public.profiles p where p.id = v_actor_id;
  end if;

  v_changes := private.audit_jsonb_diff(v_old, v_new, '');

  if TG_OP = 'UPDATE' and jsonb_array_length(v_changes) = 0 then
    return NEW;
  end if;

  if TG_TABLE_NAME = 'profiles' then
    v_target_id := coalesce(nullif(v_new->>'id',''), nullif(v_old->>'id',''))::uuid;
    v_target_username := coalesce(v_new->>'username', v_old->>'username');
    v_target_label := coalesce(v_new->>'username', v_old->>'username');
    v_category := 'profile';
    v_section := 'Account Management / Profile';
    v_event := case TG_OP when 'INSERT' then 'ACCOUNT_CREATED' when 'DELETE' then 'ACCOUNT_PROFILE_REMOVED' else 'PROFILE_UPDATED' end;
  elsif TG_TABLE_NAME = 'user_warnings' then
    v_target_id := coalesce(nullif(v_new->>'user_id',''), nullif(v_old->>'user_id',''))::uuid;
    v_category := 'moderation';
    v_section := 'Moderation & Warnings / User Warnings';
    v_event := case TG_OP when 'INSERT' then 'WARNING_ISSUED' when 'DELETE' then 'WARNING_REMOVED' else 'WARNING_UPDATED' end;
  elsif TG_TABLE_NAME = 'account_suspensions' then
    v_target_id := coalesce(nullif(v_new->>'user_id',''), nullif(v_old->>'user_id',''))::uuid;
    v_category := 'moderation';
    v_section := 'Account Management / Suspensions';
    v_event := case TG_OP when 'INSERT' then 'ACCOUNT_SUSPENDED' when 'DELETE' then 'ACCOUNT_RESTORED' else 'SUSPENSION_UPDATED' end;
  elsif TG_TABLE_NAME = 'card_reviews' then
    v_target_id := coalesce(nullif(v_new->>'user_id',''), nullif(v_old->>'user_id',''))::uuid;
    v_category := 'community';
    v_section := 'Community Reviews';
    v_event := case TG_OP when 'INSERT' then 'REVIEW_SUBMITTED' when 'DELETE' then 'REVIEW_DELETED' else 'REVIEW_UPDATED' end;
  elsif TG_TABLE_NAME = 'moderation_queue' then
    v_target_id := coalesce(nullif(v_new->>'user_id',''), nullif(v_old->>'user_id',''))::uuid;
    v_category := 'moderation';
    v_section := 'Moderation Center / Review Queue';
    v_event := case TG_OP when 'INSERT' then 'MODERATION_CASE_CREATED' when 'DELETE' then 'MODERATION_CASE_DELETED' else 'MODERATION_CASE_UPDATED' end;
  elsif TG_TABLE_NAME = 'support_conversations' then
    v_target_id := coalesce(nullif(v_new->>'user_id',''), nullif(v_old->>'user_id',''))::uuid;
    v_category := 'support';
    v_section := 'Support / Conversations';
    v_event := case TG_OP when 'INSERT' then 'SUPPORT_CONVERSATION_CREATED' when 'DELETE' then 'SUPPORT_CONVERSATION_DELETED' else 'SUPPORT_CONVERSATION_UPDATED' end;
  elsif TG_TABLE_NAME = 'support_messages' then
    v_target_id := coalesce(nullif(v_new->>'sender_id',''), nullif(v_old->>'sender_id',''))::uuid;
    v_category := 'support';
    v_section := 'Support / Messages';
    v_event := case TG_OP when 'INSERT' then 'SUPPORT_MESSAGE_SENT' when 'DELETE' then 'SUPPORT_MESSAGE_DELETED' else 'SUPPORT_MESSAGE_UPDATED' end;
  elsif TG_TABLE_NAME = 'cards' then
    v_category := 'content';
    v_section := 'Players / Card Database';
    v_event := case TG_OP when 'INSERT' then 'CARD_CREATED' when 'DELETE' then 'CARD_DELETED' else 'CARD_UPDATED' end;
    v_target_label := coalesce(v_new->>'player_name', v_old->>'player_name');
  elsif TG_TABLE_NAME = 'user_preferences' then
    v_target_id := coalesce(nullif(v_new->>'user_id',''), nullif(v_old->>'user_id',''))::uuid;
    v_category := 'profile';
    v_section := 'User Preferences';
    v_event := case TG_OP when 'INSERT' then 'PREFERENCES_CREATED' when 'DELETE' then 'PREFERENCES_DELETED' else 'PREFERENCES_UPDATED' end;
  elsif TG_TABLE_NAME = 'site_settings' then
    v_category := 'system';
    v_section := 'Admin / Branding & Site Settings';
    v_event := case TG_OP when 'INSERT' then 'SITE_SETTINGS_CREATED' when 'DELETE' then 'SITE_SETTINGS_DELETED' else 'SITE_SETTINGS_UPDATED' end;
    v_target_label := coalesce(v_new->>'id', v_old->>'id');
    v_changes := private.audit_jsonb_diff(coalesce(v_old->'payload','{}'::jsonb), coalesce(v_new->'payload','{}'::jsonb), 'payload');
  elsif TG_TABLE_NAME = 'app_state' then
    v_category := 'system';
    v_section := 'Admin / Shared Database & App State';
    v_event := case TG_OP when 'INSERT' then 'APP_STATE_CREATED' when 'DELETE' then 'APP_STATE_DELETED' else 'APP_STATE_UPDATE' end;
    v_target_label := coalesce(v_new->>'id', v_old->>'id');
    v_changes := private.audit_jsonb_diff(coalesce(v_old->'payload','{}'::jsonb), coalesce(v_new->'payload','{}'::jsonb), 'payload');
  else
    v_category := 'system';
    v_section := 'System / ' || TG_TABLE_NAME;
    v_event := upper(TG_TABLE_NAME) || '_' || TG_OP;
  end if;

  if TG_OP = 'UPDATE' and jsonb_array_length(v_changes) = 0 then
    return NEW;
  end if;

  if v_target_id is not null and v_target_username is null then
    select p.username into v_target_username from public.profiles p where p.id = v_target_id;
  end if;
  if v_actor_username is null and v_actor_id = v_target_id then
    v_actor_username := v_target_username;
  end if;

  v_details := jsonb_build_object(
    'section', v_section,
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'source', 'database_trigger',
    'target_id', coalesce(v_target_id::text, v_new->>'id', v_old->>'id'),
    'target_label', coalesce(v_target_label, v_target_username),
    'changes', v_changes
  );

  insert into public.action_logs(event_key,category,actor_user_id,actor_username,target_user_id,target_username,details,outcome)
  values (v_event,v_category,v_actor_id,v_actor_username,v_target_id,v_target_username,v_details,'success');

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

revoke all on function public.capture_action_log() from public, anon, authenticated;

create or replace function public.capture_admin_access_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_username text;
  v_target_id uuid;
  v_target_username text;
  v_access_level text := case when TG_TABLE_NAME = 'admin_viewers' then 'read_only_admin_viewer' else 'admin' end;
  v_event text;
begin
  if TG_OP = 'DELETE' then
    v_target_id := OLD.user_id;
    v_event := case when TG_TABLE_NAME = 'admin_viewers' then 'ADMIN_VIEWER_ACCESS_REVOKED' else 'ADMIN_ACCESS_REVOKED' end;
  else
    v_target_id := NEW.user_id;
    v_event := case when TG_TABLE_NAME = 'admin_viewers' then 'ADMIN_VIEWER_ACCESS_GRANTED' else 'ADMIN_ACCESS_GRANTED' end;
  end if;

  if v_actor_id is not null then
    select username into v_actor_username from public.profiles where id = v_actor_id;
  end if;
  select username into v_target_username from public.profiles where id = v_target_id;

  insert into public.action_logs(event_key,category,actor_user_id,actor_username,target_user_id,target_username,details,outcome)
  values (
    v_event, 'system', v_actor_id, v_actor_username, v_target_id, v_target_username,
    jsonb_build_object('section','Admin / Access Control','table',TG_TABLE_NAME,'operation',TG_OP,'access_level',v_access_level,'source','database_trigger'),
    'success'
  );

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

revoke all on function public.capture_admin_access_log() from public, anon, authenticated;

drop trigger if exists action_log_admin_viewers on public.admin_viewers;
create trigger action_log_admin_viewers after insert or delete on public.admin_viewers
for each row execute function public.capture_admin_access_log();
