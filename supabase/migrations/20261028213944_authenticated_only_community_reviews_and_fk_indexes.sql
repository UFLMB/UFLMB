-- Make community review posting account-bound and reject anonymous writes.
ALTER TABLE public.card_reviews
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS card_reviews_user_created_idx
  ON public.card_reviews (user_id, created_at DESC);

DROP POLICY IF EXISTS "Public can submit reviews" ON public.card_reviews;
DROP POLICY IF EXISTS "Authenticated members can submit reviews" ON public.card_reviews;
CREATE POLICY "Authenticated members can submit reviews"
  ON public.card_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = (SELECT auth.uid())
        AND p.username = reviewer_name
    )
    AND length(trim(reviewer_name)) BETWEEN 1 AND 40
    AND rating BETWEEN 1 AND 5
    AND length(review_text) <= 1000
  );

REVOKE INSERT ON public.card_reviews FROM anon;
GRANT SELECT ON public.card_reviews TO anon, authenticated;
GRANT INSERT ON public.card_reviews TO authenticated;

-- Preserve account linkage when a submitted review is flagged for moderation.
CREATE OR REPLACE FUNCTION private.enqueue_flagged_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized text;
  reasons text[] := '{}';
BEGIN
  IF new.moderation_status <> 'pending_review' THEN
    RETURN new;
  END IF;

  normalized := lower(regexp_replace(coalesce(new.reviewer_name, '') || ' ' || coalesce(new.review_text, ''), '[^a-zA-Z0-9]+', '', 'g'));
  IF normalized ~ '(motherfucker|asshole|arsehole|bullshit|fuck|shit|bitch|bastard|cunt|faggot|nigger|nigga|kike|chink|spic|wetback|kurva|fasz|geci|picsa|kocsog|buzi|bazd|baszd|heilhitler|whitepower|alqaeda|alqaida|isis|daesh)' THEN reasons := array_append(reasons, 'potentially_offensive_or_hateful_language'); END IF;
  IF length(coalesce(new.review_text, '')) > 700 OR lower(coalesce(new.review_text, '')) ~ '(https?://|www\.|buy now|free money|crypto giveaway)' THEN reasons := array_append(reasons, 'potential_spam'); END IF;
  IF lower(coalesce(new.reviewer_name, '')) ~ '(uflmb|strikerz).*(admin|moderator|official|staff|support)' THEN reasons := array_append(reasons, 'potential_impersonation'); END IF;

  INSERT INTO public.moderation_queue(content_type, content_id, user_id, display_name, content_excerpt, reason_codes)
  VALUES ('card_review', new.id::text, new.user_id, left(coalesce(new.reviewer_name, 'Member'), 40), left(coalesce(new.review_text, ''), 500), reasons);
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_flagged_review() FROM PUBLIC, anon, authenticated;

-- Cover frequently joined foreign-key columns reported by the Performance Advisor.
CREATE INDEX IF NOT EXISTS moderation_queue_reviewed_by_idx ON public.moderation_queue (reviewed_by);
CREATE INDEX IF NOT EXISTS moderation_queue_user_id_idx ON public.moderation_queue (user_id);
CREATE INDEX IF NOT EXISTS support_messages_sender_id_idx ON public.support_messages (sender_id);
CREATE INDEX IF NOT EXISTS user_warnings_issued_by_idx ON public.user_warnings (issued_by);
CREATE INDEX IF NOT EXISTS user_warnings_related_queue_id_idx ON public.user_warnings (related_queue_id);
