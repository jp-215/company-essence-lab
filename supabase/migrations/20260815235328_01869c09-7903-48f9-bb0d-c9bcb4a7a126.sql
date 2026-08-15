ALTER TABLE public.review_sessions
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.ad_videos
  ADD COLUMN IF NOT EXISTS media_status text NOT NULL DEFAULT 'storyboard',
  ADD COLUMN IF NOT EXISTS media_provider text;

ALTER TABLE public.session_judges
  ADD COLUMN IF NOT EXISTS reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_adhoc boolean NOT NULL DEFAULT false;

ALTER TABLE public.video_votes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.video_comments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.feedback_syntheses
  ADD COLUMN IF NOT EXISTS engine text NOT NULL DEFAULT 'deterministic';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ad_videos_media_status_check'
  ) THEN
    ALTER TABLE public.ad_videos ADD CONSTRAINT ad_videos_media_status_check
      CHECK (media_status IN ('storyboard', 'queued', 'processing', 'ready', 'failed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS video_votes_judge_video_idx
  ON public.video_votes (session_judge_id, video_id);
CREATE UNIQUE INDEX IF NOT EXISTS video_comments_judge_video_idx
  ON public.video_comments (session_judge_id, video_id);
CREATE UNIQUE INDEX IF NOT EXISTS session_judges_token_idx
  ON public.session_judges (invite_token);
CREATE INDEX IF NOT EXISTS session_judges_session_idx
  ON public.session_judges (session_id, status);
CREATE INDEX IF NOT EXISTS ad_videos_session_idx
  ON public.ad_videos (session_id, display_order);

CREATE TABLE IF NOT EXISTS public.terac_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.review_sessions(id) ON DELETE CASCADE,
  session_judge_id uuid REFERENCES public.session_judges(id) ON DELETE CASCADE,
  kind text NOT NULL,
  to_email text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  driver text NOT NULL DEFAULT 'log',
  provider_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terac_email_log_kind_check CHECK (kind IN ('invite', 'reminder', 'session_complete'))
);
CREATE INDEX IF NOT EXISTS terac_email_log_session_idx
  ON public.terac_email_log (session_id, created_at DESC);

GRANT SELECT, INSERT ON public.terac_email_log TO authenticated;
GRANT ALL ON public.terac_email_log TO service_role;
ALTER TABLE public.terac_email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS terac_email_log_owner_all ON public.terac_email_log;
CREATE POLICY terac_email_log_owner_all ON public.terac_email_log FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.review_sessions s
                 WHERE s.id = session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.review_sessions s
                      WHERE s.id = session_id AND s.user_id = auth.uid()));

REVOKE ALL ON public.review_sessions   FROM anon;
REVOKE ALL ON public.ad_videos         FROM anon;
REVOKE ALL ON public.judges            FROM anon;
REVOKE ALL ON public.session_judges    FROM anon;
REVOKE ALL ON public.video_votes       FROM anon;
REVOKE ALL ON public.video_comments    FROM anon;
REVOKE ALL ON public.feedback_syntheses FROM anon;
REVOKE ALL ON public.terac_email_log   FROM anon;

CREATE OR REPLACE FUNCTION public.terac_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS review_sessions_touch ON public.review_sessions;
CREATE TRIGGER review_sessions_touch BEFORE UPDATE ON public.review_sessions
  FOR EACH ROW EXECUTE FUNCTION public.terac_touch_updated_at();

CREATE OR REPLACE FUNCTION public.terac_can_transition(_from text, _to text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (_from, _to) IN (
    ('generating', 'ready'), ('generating', 'closed'),
    ('ready', 'sent'), ('ready', 'closed'),
    ('sent', 'in_review'), ('sent', 'complete'), ('sent', 'closed'),
    ('in_review', 'complete'), ('in_review', 'closed'),
    ('complete', 'synthesized'), ('complete', 'closed'),
    ('synthesized', 'actioned'), ('synthesized', 'closed'),
    ('actioned', 'closed')
  )
$$;

CREATE OR REPLACE FUNCTION public.terac_advance_session(_session_id uuid, _to text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _current text;
BEGIN
  SELECT status INTO _current FROM public.review_sessions WHERE id = _session_id FOR UPDATE;
  IF _current IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF _current = _to THEN RETURN _current; END IF;
  IF NOT public.terac_can_transition(_current, _to) THEN
    RAISE EXCEPTION 'Illegal session transition % -> %', _current, _to;
  END IF;

  UPDATE public.review_sessions
     SET status = _to,
         closed_at = CASE WHEN _to = 'closed' THEN now() ELSE closed_at END
   WHERE id = _session_id;
  RETURN _to;
END; $$;
REVOKE ALL ON FUNCTION public.terac_advance_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.terac_advance_session(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.terac_maybe_complete(_session_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.review_sessions%ROWTYPE;
  _submitted integer;
BEGIN
  SELECT * INTO _s FROM public.review_sessions WHERE id = _session_id FOR UPDATE;
  IF _s.id IS NULL THEN RETURN NULL; END IF;
  IF _s.status NOT IN ('sent', 'in_review') THEN RETURN _s.status; END IF;

  SELECT count(*) INTO _submitted
    FROM public.session_judges WHERE session_id = _session_id AND status = 'submitted';

  IF _submitted >= _s.quorum OR now() >= _s.deadline_at THEN
    UPDATE public.review_sessions SET status = 'complete' WHERE id = _session_id;
    RETURN 'complete';
  END IF;
  RETURN _s.status;
END; $$;
REVOKE ALL ON FUNCTION public.terac_maybe_complete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.terac_maybe_complete(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.terac_sweep_deadlines()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  WITH expired AS (
    UPDATE public.review_sessions SET status = 'complete'
     WHERE status IN ('sent', 'in_review') AND now() >= deadline_at
     RETURNING 1
  ) SELECT count(*) INTO _n FROM expired;
  RETURN _n;
END; $$;
REVOKE ALL ON FUNCTION public.terac_sweep_deadlines() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.terac_sweep_deadlines() TO service_role;

CREATE OR REPLACE FUNCTION public.terac_valid_dimension_scores(_scores jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT _scores IS NULL
      OR (
        jsonb_typeof(_scores) = 'object'
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_each_text(_scores) AS kv(k, v)
          WHERE k NOT IN ('hook_strength', 'pacing', 'product_clarity',
                          'visual_quality', 'cta', 'brand_fit')
             OR v NOT IN ('weak', 'okay', 'strong')
        )
      )
$$;

CREATE OR REPLACE FUNCTION public.terac_resolve_token(_token text)
RETURNS public.session_judges LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sj public.session_judges%ROWTYPE;
  _s  public.review_sessions%ROWTYPE;
BEGIN
  IF _token IS NULL OR length(_token) < 20 THEN RAISE EXCEPTION 'Invalid link'; END IF;

  SELECT * INTO _sj FROM public.session_judges WHERE invite_token = _token;
  IF _sj.id IS NULL THEN RAISE EXCEPTION 'Invalid link'; END IF;

  SELECT * INTO _s FROM public.review_sessions WHERE id = _sj.session_id;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Invalid link'; END IF;
  IF now() >= _s.deadline_at THEN RAISE EXCEPTION 'This review has closed'; END IF;
  IF _s.status NOT IN ('sent', 'in_review') THEN RAISE EXCEPTION 'This review has closed'; END IF;

  RETURN _sj;
END; $$;
REVOKE ALL ON FUNCTION public.terac_resolve_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.terac_resolve_token(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.terac_open_session(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sj public.session_judges%ROWTYPE;
  _s  public.review_sessions%ROWTYPE;
  _order text[];
  _payload jsonb;
BEGIN
  _sj := public.terac_resolve_token(_token);
  SELECT * INTO _s FROM public.review_sessions WHERE id = _sj.session_id;

  IF _sj.video_order IS NULL OR array_length(_sj.video_order, 1) IS NULL THEN
    SELECT array_agg(av.id::text ORDER BY md5(_sj.id::text || av.id::text))
      INTO _order
      FROM public.ad_videos av
     WHERE av.session_id = _s.id;
    UPDATE public.session_judges SET video_order = COALESCE(_order, '{}')
     WHERE id = _sj.id RETURNING * INTO _sj;
  END IF;
  _order := _sj.video_order;

  IF _sj.status = 'invited' THEN
    UPDATE public.session_judges
       SET status = 'opened', opened_at = COALESCE(opened_at, now())
     WHERE id = _sj.id
     RETURNING * INTO _sj;
    PERFORM public.terac_advance_session(_s.id, 'in_review');
    SELECT * INTO _s FROM public.review_sessions WHERE id = _sj.session_id;
  END IF;

  SELECT jsonb_build_object(
    'session', jsonb_build_object(
      'id', _s.id,
      'title', _s.title,
      'status', _s.status,
      'deadline_at', _s.deadline_at,
      'video_count', (SELECT count(*) FROM public.ad_videos WHERE session_id = _s.id)
    ),
    'brand', (
      SELECT jsonb_build_object('name', c.name, 'bio', c.bio, 'mission', c.mission,
                                'logo_url', c.logo_url, 'category', cat.name)
        FROM public.companies c
        JOIN public.categories cat ON cat.id = c.category_id
       WHERE c.id = _s.company_id
    ),
    'judge', jsonb_build_object(
      'session_judge_id', _sj.id,
      'name', (SELECT j.name FROM public.judges j WHERE j.id = _sj.judge_id),
      'status', _sj.status,
      'overall_note', COALESCE(_sj.overall_note, ''),
      'submitted_at', _sj.submitted_at
    ),
    'videos', COALESCE((
      SELECT jsonb_agg(ordered.payload ORDER BY ordered.position)
        FROM (
          SELECT jsonb_build_object(
                   'id', av.id,
                   'concept_title', av.concept_title,
                   'hook_text', av.hook_text,
                   'playback_id', av.playback_id,
                   'thumbnail_url', av.thumbnail_url,
                   'media_status', av.media_status,
                   'version', av.version,
                   'beats', av.generation_spec -> 'shots',
                   'cta', av.generation_spec -> 'cta',
                   'ballot', jsonb_build_object(
                     'is_pick', COALESCE(vv.is_pick, false),
                     'rank', vv.rank,
                     'body', COALESCE(vc.body, ''),
                     'dimension_scores', COALESCE(vc.dimension_scores, '{}'::jsonb)
                   )
                 ) AS payload,
                 COALESCE(array_position(_order, av.id::text), 2147483647) AS position
            FROM public.ad_videos av
            LEFT JOIN public.video_votes vv
              ON vv.video_id = av.id AND vv.session_judge_id = _sj.id
            LEFT JOIN public.video_comments vc
              ON vc.video_id = av.id AND vc.session_judge_id = _sj.id
           WHERE av.session_id = _s.id
        ) AS ordered
    ), '[]'::jsonb)
  ) INTO _payload;

  RETURN _payload;
END; $$;
REVOKE ALL ON FUNCTION public.terac_open_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.terac_open_session(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.terac_save_ballot(
  _token text,
  _video_id uuid,
  _is_pick boolean,
  _body text,
  _dimension_scores jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sj public.session_judges%ROWTYPE;
BEGIN
  _sj := public.terac_resolve_token(_token);
  IF _sj.status = 'submitted' THEN RAISE EXCEPTION 'You have already submitted this review'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ad_videos WHERE id = _video_id AND session_id = _sj.session_id) THEN
    RAISE EXCEPTION 'That video is not part of this review';
  END IF;

  IF NOT public.terac_valid_dimension_scores(_dimension_scores) THEN
    RAISE EXCEPTION 'Unrecognised dimension score';
  END IF;

  INSERT INTO public.video_votes (session_judge_id, video_id, is_pick)
  VALUES (_sj.id, _video_id, COALESCE(_is_pick, false))
  ON CONFLICT (session_judge_id, video_id)
  DO UPDATE SET is_pick = COALESCE(_is_pick, false), updated_at = now();

  INSERT INTO public.video_comments (session_judge_id, video_id, body, dimension_scores)
  VALUES (_sj.id, _video_id, COALESCE(_body, ''), COALESCE(_dimension_scores, '{}'::jsonb))
  ON CONFLICT (session_judge_id, video_id)
  DO UPDATE SET body = COALESCE(_body, ''),
                dimension_scores = COALESCE(_dimension_scores, '{}'::jsonb),
                updated_at = now();

  RETURN jsonb_build_object('saved', true, 'video_id', _video_id);
END; $$;
REVOKE ALL ON FUNCTION public.terac_save_ballot(text, uuid, boolean, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.terac_save_ballot(text, uuid, boolean, text, jsonb) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.terac_submit_ballot(
  _token text,
  _ranks jsonb,
  _overall_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sj public.session_judges%ROWTYPE;
  _status text;
BEGIN
  _sj := public.terac_resolve_token(_token);
  IF _sj.status = 'submitted' THEN RAISE EXCEPTION 'You have already submitted this review'; END IF;

  IF _ranks IS NOT NULL AND jsonb_typeof(_ranks) = 'array' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(_ranks) AS e
       WHERE NOT EXISTS (
         SELECT 1 FROM public.ad_videos av
          WHERE av.id = (e ->> 'video_id')::uuid AND av.session_id = _sj.session_id
       )
    ) THEN
      RAISE EXCEPTION 'Ranked a video outside this review';
    END IF;

    INSERT INTO public.video_votes (session_judge_id, video_id, is_pick, rank)
    SELECT _sj.id, (e ->> 'video_id')::uuid, true, (e ->> 'rank')::integer
      FROM jsonb_array_elements(_ranks) AS e
    ON CONFLICT (session_judge_id, video_id)
    DO UPDATE SET rank = EXCLUDED.rank, is_pick = true, updated_at = now();
  END IF;

  UPDATE public.session_judges
     SET status = 'submitted', submitted_at = now(), overall_note = COALESCE(_overall_note, '')
   WHERE id = _sj.id;

  _status := public.terac_maybe_complete(_sj.session_id);
  RETURN jsonb_build_object('submitted', true, 'session_status', _status);
END; $$;
REVOKE ALL ON FUNCTION public.terac_submit_ballot(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.terac_submit_ballot(text, jsonb, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.terac_claim_session(
  _public_token text,
  _name text,
  _email text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.review_sessions%ROWTYPE;
  _judge_id uuid;
  _token text;
BEGIN
  IF _name IS NULL OR btrim(_name) = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF _email IS NULL OR position('@' in _email) < 2 THEN RAISE EXCEPTION 'A valid email is required'; END IF;

  SELECT * INTO _s FROM public.review_sessions WHERE public_token = _public_token;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Invalid link'; END IF;
  IF now() >= _s.deadline_at OR _s.status NOT IN ('sent', 'in_review') THEN
    RAISE EXCEPTION 'This review has closed';
  END IF;

  SELECT id INTO _judge_id FROM public.judges
   WHERE lower(btrim(email)) = lower(btrim(_email)) AND owner_id = _s.user_id;

  IF _judge_id IS NULL THEN
    INSERT INTO public.judges (owner_id, name, email)
    VALUES (_s.user_id, btrim(_name), lower(btrim(_email)))
    RETURNING id INTO _judge_id;
  END IF;

  SELECT invite_token INTO _token FROM public.session_judges
   WHERE session_id = _s.id AND judge_id = _judge_id;

  IF _token IS NULL THEN
    _token := encode(gen_random_bytes(32), 'hex');
    INSERT INTO public.session_judges (session_id, judge_id, invite_token, is_adhoc)
    VALUES (_s.id, _judge_id, _token, true);
  END IF;

  RETURN jsonb_build_object('invite_token', _token);
END; $$;
REVOKE ALL ON FUNCTION public.terac_claim_session(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.terac_claim_session(text, text, text) TO anon, authenticated, service_role;