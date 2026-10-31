-- Defense in depth: support conversations and messages are available only to authenticated members.
-- The existing RLS policies also target the authenticated role and bind each submission
-- to auth.uid(); this removes any inherited/default table privileges from anonymous users.

REVOKE ALL PRIVILEGES ON TABLE public.support_conversations, public.support_messages FROM PUBLIC, anon;

GRANT SELECT, INSERT ON TABLE public.support_conversations TO authenticated;
GRANT UPDATE (status, updated_at) ON TABLE public.support_conversations TO authenticated;
GRANT SELECT, INSERT ON TABLE public.support_messages TO authenticated;

-- Preserve trusted backend administration while removing the anonymous API surface.
GRANT ALL PRIVILEGES ON TABLE public.support_conversations, public.support_messages TO service_role;

DROP POLICY IF EXISTS "Users create own support conversations" ON public.support_conversations;
CREATE POLICY "Users create own support conversations"
  ON public.support_conversations FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND (SELECT auth.uid()) = user_id
    AND status = 'open'
  );

DROP POLICY IF EXISTS "Users send messages in own support conversations" ON public.support_messages;
CREATE POLICY "Users send messages in own support conversations"
  ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND sender_id = (SELECT auth.uid())
    AND sender_role = 'user'
    AND EXISTS (
      SELECT 1
      FROM public.support_conversations c
      WHERE c.id = conversation_id
        AND c.user_id = (SELECT auth.uid())
    )
  );
