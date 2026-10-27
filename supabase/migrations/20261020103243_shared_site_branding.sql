-- Shared appearance settings: public-readable, trusted-admin writable.
create table if not exists public.site_settings (
  id text primary key check (id = 'branding'),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;

drop policy if exists "Public can read shared branding" on public.site_settings;
create policy "Public can read shared branding" on public.site_settings for select to anon, authenticated using (true);
drop policy if exists "UFLMB admins can insert shared branding" on public.site_settings;
create policy "UFLMB admins can insert shared branding" on public.site_settings for insert to authenticated with check (private.is_uflmb_admin());
drop policy if exists "UFLMB admins can update shared branding" on public.site_settings;
create policy "UFLMB admins can update shared branding" on public.site_settings for update to authenticated using (private.is_uflmb_admin()) with check (private.is_uflmb_admin());
