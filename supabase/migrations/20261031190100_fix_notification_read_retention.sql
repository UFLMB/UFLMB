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
      select keep_row.id
      from public.notifications keep_row
      where keep_row.user_id = new.user_id
        and keep_row.read_at is not null
      order by keep_row.created_at desc, keep_row.id desc
      limit 20
    );
  return new;
end;
$$;
revoke all on function private.trim_read_notifications() from public, anon, authenticated;