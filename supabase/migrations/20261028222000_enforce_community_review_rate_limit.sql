-- Enforce a database-level per-account review rate limit (5 submissions per hour).
-- This protects the public API even if a client-side check is bypassed.
CREATE OR REPLACE FUNCTION private.enforce_community_review_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recent_count integer;
BEGIN
  -- Keep service-role/system inserts that are not tied to a user unaffected.
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize inserts per account so concurrent requests cannot bypass the cap.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.user_id::text, 0)
  );

  SELECT count(*)::integer
    INTO recent_count
    FROM public.card_reviews AS r
   WHERE r.user_id = NEW.user_id
     AND r.created_at >= pg_catalog.now() - interval '1 hour';

  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'Review rate limit exceeded. Try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_community_review_rate_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS card_reviews_rate_limit ON public.card_reviews;
CREATE TRIGGER card_reviews_rate_limit
  BEFORE INSERT ON public.card_reviews
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_community_review_rate_limit();
