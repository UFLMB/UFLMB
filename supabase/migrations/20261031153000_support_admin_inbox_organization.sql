-- Admin-only Gmail-style organization for support conversations.
-- These markers are intentionally isolated from support_conversations so members
-- cannot read or modify archive, star, or administrator read-state metadata.
CREATE TABLE IF NOT EXISTS public.support_admin_conversation_state (
  conversation_id uuid PRIMARY KEY REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  is_archived boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_admin_conversation_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.support_admin_conversation_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.support_admin_conversation_state TO authenticated;
GRANT UPDATE (is_archived, is_starred, read_at, updated_at) ON TABLE public.support_admin_conversation_state TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.support_admin_conversation_state TO service_role;

DROP POLICY IF EXISTS "Admins read support inbox state" ON public.support_admin_conversation_state;
CREATE POLICY "Admins read support inbox state"
  ON public.support_admin_conversation_state FOR SELECT TO authenticated
  USING (private.is_admin());

DROP POLICY IF EXISTS "Admins create support inbox state" ON public.support_admin_conversation_state;
CREATE POLICY "Admins create support inbox state"
  ON public.support_admin_conversation_state FOR INSERT TO authenticated
  WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS "Admins update support inbox state" ON public.support_admin_conversation_state;
CREATE POLICY "Admins update support inbox state"
  ON public.support_admin_conversation_state FOR UPDATE TO authenticated
  USING (private.is_admin())
  WITH CHECK (private.is_admin());

CREATE INDEX IF NOT EXISTS support_admin_conversation_state_archived_idx
  ON public.support_admin_conversation_state (is_archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_admin_conversation_state_starred_idx
  ON public.support_admin_conversation_state (is_starred, updated_at DESC);
