create table public.action_logs (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  category text not null check (category in ('auth','profile','moderation','community','support','content','system')),
  actor_user_id uuid,
  actor_username text,
  target_user_id uuid,
  target_username text,
  details jsonb not null default '{}'::jsonb,
  outcome text not null default 'success' check (outcome in ('success','failed','pending')),
  created_at timestamptz not null default now()
);

create index action_logs_created_at_idx on public.action_logs (created_at desc, id desc);
create index action_logs_event_key_idx on public.action_logs (event_key);
create index action_logs_actor_user_id_idx on public.action_logs (actor_user_id);
create index action_logs_target_user_id_idx on public.action_logs (target_user_id);
create index action_logs_category_created_at_idx on public.action_logs (category, created_at desc);

alter table public.action_logs enable row level security;
revoke all on public.action_logs from anon, authenticated;
grant select on public.action_logs to authenticated;
grant all on public.action_logs to service_role;

create policy "Admins can read the action log"
on public.action_logs for select to authenticated
using (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));

create or replace function public.capture_action_log()
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
  v_event text;
  v_category text;
  v_details jsonb := '{}'::jsonb;
  v_old jsonb := case when TG_OP = 'INSERT' then '{}'::jsonb else to_jsonb(OLD) end;
  v_new jsonb := case when TG_OP = 'DELETE' then '{}'::jsonb else to_jsonb(NEW) end;
begin
  if v_actor_id is not null then
    select p.username into v_actor_username from public.profiles p where p.id = v_actor_id;
  end if;

  if TG_TABLE_NAME = 'profiles' then
    v_target_id := coalesce(nullif(v_new->>'id',''), nullif(v_old->>'id',''))::uuid;
    v_target_username := coalesce(v_new->>'username', v_old->>'username');
    v_category := 'profile';
    if TG_OP = 'INSERT' then
      v_event := 'ACCOUNT_CREATED';
      v_details := jsonb_build_object('profile_logo', v_new->>'profile_logo');
    elsif TG_OP = 'DELETE' then
      v_event := 'ACCOUNT_PROFILE_REMOVED';
      v_details := jsonb_build_object('username', v_old->>'username');
    else
      v_event := 'PROFILE_UPDATED';
      v_details := jsonb_build_object('old_username', v_old->>'username', 'new_username', v_new->>'username',
        'old_profile_logo', v_old->>'profile_logo', 'new_profile_logo', v_new->>'profile_logo');
    end if;
  elsif TG_TABLE_NAME = 'user_warnings' then
    v_target_id := coalesce(nullif(v_new->>'user_id',''), nullif(v_old->>'user_id',''))::uuid;
    v_category := 'moderation';
    v_event := case TG_OP when 'INSERT' then 'WARNING_ISSUED' when 'DELETE' then 'WARNING_REMOVED' else 'WARNING_UPDATED' end;
    v_details := jsonb_build_object('reason', coalesce(v_new->>'reason',v_old->>'reason'), 'policy_area', coalesce(v_new->>'policy_area',v_old->>'policy_area'));
  elsif TG_TABLE_NAME = 'account_suspensions' then
    v_target_id := coalesce(nullif(v_new->>'user_id',''), nullif(v_old->>'user_id',''))::uuid;
    v_category := 'moderation';
    v_event := case TG_OP when 'INSERT' then 'ACCOUNT_SUSPENDED' when 'DELETE' then 'ACCOUNT_RESTORED' else 'SUSPENSION_UPDATED' end;
    v_details := jsonb_build_object('reason', coalesce(v_new->>'reason',v_old->>'reason'));
  elsif TG_TABLE_NAME = 'card_reviews' then
    v_target_id := coalesce(nullif(v_new->>'user_id',''), nullif(v_old->>'user_id',''))::uuid;
    v_category := 'community';
    v_event := case TG_OP when 'INSERT' then 'REVIEW_SUBMITTED' when 'DELETE' then 'REVIEW_DELETED' else 'REVIEW_UPDATED' end;
    v_details := jsonb_build_object('card_id',coalesce(v_new->>'card_id',v_old->>'card_id'),'rating',coalesce(v_new->>'rating',v_old->>'rating'),'moderation_status',coalesce(v_new->>'moderation_status',v_old->>'moderation_status'));
  elsif TG_TABLE_NAME = 'moderation_queue' then
    v_target_id := coalesce(nullif(v_new->>'user_id',''), nullif(v_old->>'user_id',''))::uuid;
    v_category := 'moderation';
    v_event := case TG_OP when 'INSERT' then 'MODERATION_CASE_CREATED' when 'DELETE' then 'MODERATION_CASE_DELETED' else 'MODERATION_CASE_UPDATED' end;
    v_details := jsonb_build_object('content_type',coalesce(v_new->>'content_type',v_old->>'content_type'),'status',coalesce(v_new->>'status',v_old->>'status'),'reason_codes',coalesce(v_new->'reason_codes',v_old->'reason_codes'));
  elsif TG_TABLE_NAME = 'support_conversations' then
    v_target_id := coalesce(nullif(v_new->>'user_id',''), nullif(v_old->>'user_id',''))::uuid;
    v_category := 'support';
    v_event := case TG_OP when 'INSERT' then 'SUPPORT_CONVERSATION_CREATED' when 'DELETE' then 'SUPPORT_CONVERSATION_DELETED' else 'SUPPORT_CONVERSATION_UPDATED' end;
    v_details := jsonb_build_object('conversation_id',coalesce(v_new->>'id',v_old->>'id'),'category',coalesce(v_new->>'category',v_old->>'category'),'status',coalesce(v_new->>'status',v_old->>'status'));
  elsif TG_TABLE_NAME = 'support_messages' then
    v_target_id := coalesce(nullif(v_new->>'sender_id',''), nullif(v_old->>'sender_id',''))::uuid;
    v_category := 'support';
    v_event := case TG_OP when 'INSERT' then 'SUPPORT_MESSAGE_SENT' when 'DELETE' then 'SUPPORT_MESSAGE_DELETED' else 'SUPPORT_MESSAGE_UPDATED' end;
    v_details := jsonb_build_object('conversation_id',coalesce(v_new->>'conversation_id',v_old->>'conversation_id'),'sender_role',coalesce(v_new->>'sender_role',v_old->>'sender_role'));
  elsif TG_TABLE_NAME = 'cards' then
    v_category := 'content';
    v_event := case TG_OP when 'INSERT' then 'CARD_CREATED' when 'DELETE' then 'CARD_DELETED' else 'CARD_UPDATED' end;
    v_details := jsonb_build_object('card_id',coalesce(v_new->>'id',v_old->>'id'),'player_name',coalesce(v_new->>'player_name',v_old->>'player_name'),'overall_rating',coalesce(v_new->>'overall_rating',v_old->>'overall_rating'));
  elsif TG_TABLE_NAME = 'user_preferences' then
    v_target_id := coalesce(nullif(v_new->>'user_id',''), nullif(v_old->>'user_id',''))::uuid;
    v_category := 'profile';
    v_event := case TG_OP when 'INSERT' then 'PREFERENCES_CREATED' when 'DELETE' then 'PREFERENCES_DELETED' else 'PREFERENCES_UPDATED' end;
    v_details := jsonb_build_object('favorites_count',jsonb_array_length(coalesce(v_new->'favorites','[]'::jsonb)),'compare_count',jsonb_array_length(coalesce(v_new->'compare_ids','[]'::jsonb)));
  elsif TG_TABLE_NAME = 'site_settings' then
    v_category := 'system';
    v_event := 'SITE_SETTINGS_UPDATED';
    v_details := jsonb_build_object('setting_id',coalesce(v_new->>'id',v_old->>'id'));
  else
    v_category := 'system';
    v_event := upper(TG_TABLE_NAME) || '_' || TG_OP;
    v_details := jsonb_build_object('table',TG_TABLE_NAME);
  end if;

  if v_target_id is not null and v_target_username is null then
    select p.username into v_target_username from public.profiles p where p.id = v_target_id;
  end if;
  if v_actor_username is null and v_actor_id = v_target_id then
    v_actor_username := v_target_username;
  end if;

  insert into public.action_logs(event_key,category,actor_user_id,actor_username,target_user_id,target_username,details,outcome)
  values (v_event,v_category,v_actor_id,v_actor_username,v_target_id,v_target_username,v_details,'success');

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

revoke all on function public.capture_action_log() from public, anon, authenticated;

create trigger action_log_profiles after insert or update or delete on public.profiles for each row execute function public.capture_action_log();
create trigger action_log_user_warnings after insert or update or delete on public.user_warnings for each row execute function public.capture_action_log();
create trigger action_log_account_suspensions after insert or update or delete on public.account_suspensions for each row execute function public.capture_action_log();
create trigger action_log_card_reviews after insert or update or delete on public.card_reviews for each row execute function public.capture_action_log();
create trigger action_log_moderation_queue after insert or update or delete on public.moderation_queue for each row execute function public.capture_action_log();
create trigger action_log_support_conversations after insert or update or delete on public.support_conversations for each row execute function public.capture_action_log();
create trigger action_log_support_messages after insert or update or delete on public.support_messages for each row execute function public.capture_action_log();
create trigger action_log_cards after insert or update or delete on public.cards for each row execute function public.capture_action_log();
create trigger action_log_user_preferences after insert or update or delete on public.user_preferences for each row execute function public.capture_action_log();
create trigger action_log_site_settings after insert or update or delete on public.site_settings for each row execute function public.capture_action_log();

insert into public.action_logs(event_key,category,actor_user_id,actor_username,target_user_id,target_username,details,outcome,created_at)
select case a.action when 'suspend' then 'ACCOUNT_SUSPENDED' when 'restore' then 'ACCOUNT_RESTORED' when 'delete' then 'ACCOUNT_BANNED' else 'ACCOUNT_MODERATION_' || upper(a.action) end,
  'moderation', a.performed_by, actor.username, a.target_user_id, a.target_username,
  jsonb_build_object('reason',a.reason,'legacy_audit_id',a.id,'legacy_action',a.action),
  case a.outcome when 'completed' then 'success' when 'failed' then 'failed' else 'pending' end, a.created_at
from public.account_moderation_audit a
left join public.profiles actor on actor.id = a.performed_by;

insert into public.action_logs(event_key,category,target_user_id,details,outcome,created_at)
select 'ACCOUNT_SUSPENDED','moderation',s.user_id,jsonb_build_object('reason',s.reason,'legacy_source','account_suspensions'),'success',s.suspended_at
from public.account_suspensions s
where not exists (select 1 from public.action_logs l where l.event_key='ACCOUNT_SUSPENDED' and l.target_user_id=s.user_id);
