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
  v_event text;
begin
  if TG_OP = 'DELETE' then
    v_target_id := OLD.user_id;
    v_event := 'ADMIN_ACCESS_REVOKED';
  else
    v_target_id := NEW.user_id;
    v_event := 'ADMIN_ACCESS_GRANTED';
  end if;
  if v_actor_id is not null then
    select username into v_actor_username from public.profiles where id = v_actor_id;
  end if;
  select username into v_target_username from public.profiles where id = v_target_id;
  insert into public.action_logs(event_key,category,actor_user_id,actor_username,target_user_id,target_username,details,outcome)
  values (v_event,'system',v_actor_id,v_actor_username,v_target_id,v_target_username,jsonb_build_object('table','admin_users'),'success');
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function public.capture_admin_access_log() from public, anon, authenticated;

create trigger action_log_admin_users after insert or delete on public.admin_users
for each row execute function public.capture_admin_access_log();

create trigger action_log_app_state after insert or update or delete on public.app_state
for each row execute function public.capture_action_log();
