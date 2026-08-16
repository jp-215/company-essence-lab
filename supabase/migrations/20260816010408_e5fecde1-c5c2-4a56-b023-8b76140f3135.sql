CREATE OR REPLACE FUNCTION public.terac_open_session(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sj public.session_judges%ROWTYPE;
  _s  public.review_sessions%ROWTYPE;
  _order uuid[];
  _payload jsonb;
BEGIN
  _sj := public.terac_resolve_token(_token);
  SELECT * INTO _s FROM public.review_sessions WHERE id = _sj.session_id;

  IF _sj.video_order IS NULL OR array_length(_sj.video_order, 1) IS NULL THEN
    SELECT array_agg(av.id ORDER BY md5(_sj.id::text || av.id::text))
      INTO _order
      FROM public.ad_videos av
     WHERE av.session_id = _s.id;
    UPDATE public.session_judges SET video_order = COALESCE(_order, '{}'::uuid[])
     WHERE id = _sj.id RETURNING * INTO _sj;
  END IF;
  _order := _sj.video_order::uuid[];

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
                   'playback_url', av.playback_url,
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
                 COALESCE(array_position(_order, av.id), 2147483647) AS position
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