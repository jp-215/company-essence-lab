DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_sessions_status_check') THEN
    ALTER TABLE public.review_sessions DROP CONSTRAINT review_sessions_status_check;
  END IF;
  ALTER TABLE public.review_sessions ADD CONSTRAINT review_sessions_status_check
    CHECK (status IN ('generating','ready','sent','in_review','complete','synthesized','actioned','closed','open','expired'));
END $$;