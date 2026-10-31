-- Restrict support submissions to permanent accounts and remove excess table privileges.
-- Supabase anonymous Auth users also use the authenticated Postgres role, so the
-- restrictive policies explicitly reject JWTs with is_anonymous = true.

REVOKE ALL PRIVILEGES ON TABLE public.support_conversations, public.support_messages
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE public.support_conversations TO authenticated;
GRANT UPDATE (status, updated_at) ON TABLE public.support_conversations TO authenticated;
GRANT SELECT, INSERT ON TABLE public.support_messages TO authenticated;

-- Preserve trusted server-side administration.
GRANT ALL PRIVILEGES ON TABLE public.support_conversations, public.support_messages TO service_role;

DROP POLICY IF EXISTS "Support conversations require permanent accounts" ON public.support_conversations;
CREATE POLICY "Support conversations require permanent accounts"
  ON public.support_conversations AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT (auth.jwt() ->> 'is_anonymous')::boolean) IS FALSE);

DROP POLICY IF EXISTS "Support messages require permanent accounts" ON public.support_messages;
CREATE POLICY "Support messages require permanent accounts"
  ON public.support_messages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT (auth.jwt() ->> 'is_anonymous')::boolean) IS FALSE);
