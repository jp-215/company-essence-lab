CREATE OR REPLACE FUNCTION public.terac_claim_session(_public_token text, _name text, _email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
    _token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.session_judges (session_id, judge_id, invite_token, is_adhoc)
    VALUES (_s.id, _judge_id, _token, true);
  END IF;

  RETURN jsonb_build_object('invite_token', _token);
END; $$;
REVOKE ALL ON FUNCTION public.terac_claim_session(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.terac_claim_session(text, text, text) TO anon, authenticated, service_role;