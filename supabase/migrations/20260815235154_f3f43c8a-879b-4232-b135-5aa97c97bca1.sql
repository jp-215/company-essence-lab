ALTER TABLE public.trends
  ADD COLUMN IF NOT EXISTS duplicate_of text NULL REFERENCES public.trends(trend_key) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS trends_canonical_idx ON public.trends (trend_score DESC)
  WHERE duplicate_of IS NULL;

ALTER TABLE public.word_of_mouth
  ADD COLUMN IF NOT EXISTS duplicate_of text NULL REFERENCES public.word_of_mouth(wom_key) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536);
CREATE INDEX IF NOT EXISTS word_of_mouth_embedding_idx ON public.word_of_mouth
  USING hnsw (embedding extensions.vector_cosine_ops);

CREATE TABLE IF NOT EXISTS public.trend_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  trend_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('impression', 'tap', 'remix', 'skip')),
  surface text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.trend_interactions TO authenticated;
GRANT ALL ON public.trend_interactions TO service_role;
ALTER TABLE public.trend_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trend_interactions_owner_insert ON public.trend_interactions;
CREATE POLICY trend_interactions_owner_insert ON public.trend_interactions
FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS trend_interactions_owner_select ON public.trend_interactions;
CREATE POLICY trend_interactions_owner_select ON public.trend_interactions
FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS trend_interactions_company_idx
  ON public.trend_interactions (company_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS trend_interactions_trend_idx
  ON public.trend_interactions (trend_key, action);

CREATE OR REPLACE FUNCTION public.recommend_company_trends_v2(
  _company_id uuid,
  _limit integer DEFAULT 12,
  _seed integer DEFAULT 1,
  _pool integer DEFAULT 120,
  _query_embedding extensions.vector(1536) DEFAULT NULL,
  _exclude_keys text[] DEFAULT '{}'
)
RETURNS TABLE(trend_key text, platform text, title text, caption text, hashtags text[],
              music text, format text, source_url text, author text,
              views bigint, likes bigint, comments bigint, shares bigint,
              engagement_rate numeric, trend_score numeric, posted_at timestamptz,
              similarity double precision, combined_score double precision)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH q AS (
    SELECT COALESCE(_query_embedding, k.embedding) AS v
    FROM public.companies c
    LEFT JOIN public.company_knowledge k ON k.company_id = c.id
    WHERE c.id = _company_id
  ),
  pool AS (
    SELECT t.trend_key, t.platform, t.title, t.caption, t.hashtags, t.music, t.format,
           t.source_url, t.author, t.views, t.likes, t.comments, t.shares,
           t.engagement_rate, t.trend_score, t.posted_at,
           1 - (t.embedding <=> q.v) AS similarity
    FROM public.trends t, q
    WHERE t.embedding IS NOT NULL
      AND q.v IS NOT NULL
      AND t.duplicate_of IS NULL
      AND NOT (t.trend_key = ANY(COALESCE(_exclude_keys, '{}')))
    ORDER BY t.embedding <=> q.v
    LIMIT LEAST(GREATEST(COALESCE(_pool, 120), 20), 200)
  ),
  scored AS (
    SELECT p.*,
      percent_rank() OVER (ORDER BY p.similarity) AS sim_pr,
      percent_rank() OVER (ORDER BY
        ( LEAST(LOG(10, GREATEST(p.views, 1)::numeric) / 8, 1) * 0.5
        + LEAST(COALESCE((p.likes + 2 * p.comments + 3 * p.shares)::numeric
                         / NULLIF(p.views, 0)::numeric, 0), 0.25) * 2
        + EXP(- GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(p.posted_at, now() - interval '90 days'))) / 86400.0, 0) / 120.0) * 0.25 )
      ) AS vir_pr,
      ((hashtext(p.trend_key || ':' || _seed::text)::bigint + 2147483649) / 4294967297.0) AS u
    FROM pool p
  )
  SELECT s.trend_key, s.platform, s.title, s.caption, s.hashtags, s.music, s.format,
         s.source_url, s.author, s.views, s.likes, s.comments, s.shares,
         s.engagement_rate, s.trend_score, s.posted_at, s.similarity,
         (0.6 * s.sim_pr + 0.4 * s.vir_pr) AS combined_score
  FROM scored s
  ORDER BY POWER(s.u, 1.0 / GREATEST(0.6 * s.sim_pr + 0.4 * s.vir_pr, 0.05)) DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 12), 1), 50)
$$;

REVOKE ALL ON FUNCTION public.recommend_company_trends_v2(uuid, integer, integer, integer, extensions.vector, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recommend_company_trends_v2(uuid, integer, integer, integer, extensions.vector, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recommend_community_trends(
  _company_id uuid,
  _limit integer DEFAULT 12,
  _days integer DEFAULT 60
)
RETURNS TABLE(trend_key text, community_score double precision, remixer_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH me AS (
    SELECT c.id, c.category_id, k.embedding
    FROM public.companies c
    LEFT JOIN public.company_knowledge k ON k.company_id = c.id
    WHERE c.id = _company_id
  ),
  sim_peers AS (
    SELECT k.company_id, GREATEST(1 - (k.embedding <=> me.embedding), 0)::double precision AS csim
    FROM public.company_knowledge k, me
    WHERE me.embedding IS NOT NULL
      AND k.company_id <> me.id
      AND k.embedding IS NOT NULL
    ORDER BY k.embedding <=> me.embedding
    LIMIT 15
  ),
  peers AS (
    SELECT company_id, MAX(csim) AS csim FROM (
      SELECT company_id, csim FROM sim_peers
      UNION ALL
      SELECT c2.id, 0.4::double precision FROM public.companies c2, me
      WHERE c2.category_id = me.category_id AND c2.id <> me.id
    ) u
    GROUP BY company_id
  ),
  signals AS (
    SELECT ti.trend_key,
           SUM((CASE ti.action WHEN 'remix' THEN 3 WHEN 'tap' THEN 2 ELSE 0 END)::double precision
               * (0.5 + p.csim)) AS score,
           COUNT(DISTINCT ti.company_id) FILTER (WHERE ti.action = 'remix') AS remixers
    FROM public.trend_interactions ti
    JOIN peers p ON p.company_id = ti.company_id
    WHERE ti.created_at > now() - make_interval(days => COALESCE(_days, 60))
      AND ti.action IN ('tap', 'remix')
    GROUP BY ti.trend_key
    UNION ALL
    SELECT r.trend_key, COUNT(*)::double precision * 2.0, COUNT(DISTINCT r.company_id)
    FROM public.company_remixes r
    JOIN peers p ON p.company_id = r.company_id
    WHERE r.trend_key IS NOT NULL
    GROUP BY r.trend_key
  )
  SELECT s.trend_key, SUM(s.score) AS community_score, MAX(s.remixers) AS remixer_count
  FROM signals s
  JOIN public.trends t ON t.trend_key = s.trend_key AND t.duplicate_of IS NULL
  WHERE s.trend_key NOT IN (
    SELECT r.trend_key FROM public.company_remixes r
    WHERE r.company_id = _company_id AND r.trend_key IS NOT NULL
  )
  GROUP BY s.trend_key
  ORDER BY community_score DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 12), 1), 50)
$$;

REVOKE ALL ON FUNCTION public.recommend_community_trends(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recommend_community_trends(uuid, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.trend_social_proof(_trend_keys text[])
RETURNS TABLE(trend_key text, remix_count bigint, tap_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT k.trend_key,
         COUNT(DISTINCT s.company_id) FILTER (WHERE s.action = 'remix') AS remix_count,
         COUNT(DISTINCT s.company_id) FILTER (WHERE s.action = 'tap') AS tap_count
  FROM unnest(COALESCE(_trend_keys, '{}')) AS k(trend_key)
  LEFT JOIN (
    SELECT ti.trend_key, ti.company_id, ti.action FROM public.trend_interactions ti
    WHERE ti.action IN ('remix', 'tap')
    UNION ALL
    SELECT r.trend_key, r.company_id, 'remix' FROM public.company_remixes r
    WHERE r.trend_key IS NOT NULL
  ) s ON s.trend_key = k.trend_key
  GROUP BY k.trend_key
$$;

REVOKE ALL ON FUNCTION public.trend_social_proof(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trend_social_proof(text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_trend_duplicates(_threshold double precision DEFAULT 0.95)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions
AS $$
DECLARE
  _marked integer;
BEGIN
  WITH pairs AS (
    SELECT a.trend_key AS a_key, a.trend_score AS a_score,
           n.trend_key AS b_key, n.trend_score AS b_score,
           1 - (a.embedding <=> n.embedding) AS sim
    FROM public.trends a
    JOIN LATERAL (
      SELECT b.trend_key, b.trend_score, b.embedding
      FROM public.trends b
      WHERE b.trend_key <> a.trend_key
        AND b.embedding IS NOT NULL
        AND b.duplicate_of IS NULL
      ORDER BY b.embedding <=> a.embedding
      LIMIT 8
    ) n ON true
    WHERE a.embedding IS NOT NULL AND a.duplicate_of IS NULL
  ),
  losers AS (
    SELECT DISTINCT ON (l.loser) l.loser, l.winner FROM (
      SELECT CASE WHEN (a_score, a_key) >= (b_score, b_key) THEN b_key ELSE a_key END AS loser,
             CASE WHEN (a_score, a_key) >= (b_score, b_key) THEN a_key ELSE b_key END AS winner
      FROM pairs
      WHERE sim > _threshold
    ) l
    ORDER BY l.loser, l.winner
  )
  UPDATE public.trends t SET duplicate_of = losers.winner
  FROM losers
  WHERE t.trend_key = losers.loser AND t.duplicate_of IS NULL;
  GET DIAGNOSTICS _marked = ROW_COUNT;

  FOR i IN 1..3 LOOP
    UPDATE public.trends t SET duplicate_of = c.duplicate_of
    FROM public.trends c
    WHERE t.duplicate_of = c.trend_key AND c.duplicate_of IS NOT NULL;
    EXIT WHEN NOT FOUND;
  END LOOP;

  RETURN _marked;
END
$$;

REVOKE ALL ON FUNCTION public.mark_trend_duplicates(double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_trend_duplicates(double precision) TO service_role;

CREATE OR REPLACE FUNCTION public.company_word_of_mouth_v2(
  _company_id uuid,
  _limit integer DEFAULT 12,
  _seed integer DEFAULT 1,
  _pool integer DEFAULT 120,
  _query_embedding extensions.vector(1536) DEFAULT NULL,
  _exclude_keys text[] DEFAULT '{}'
)
RETURNS TABLE(wom_key text, platform text, source_url text, author text, author_handle text,
              title text, content text, hashtags text[], topic text, theme text, sentiment text,
              views bigint, likes bigint, replies bigint, reposts bigint,
              engagement_rate numeric, buzz_score numeric, posted_at timestamptz,
              similarity double precision, combined_score double precision)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH q AS (
    SELECT COALESCE(_query_embedding, k.embedding) AS v
    FROM public.companies c
    LEFT JOIN public.company_knowledge k ON k.company_id = c.id
    WHERE c.id = _company_id
  ),
  pool AS (
    SELECT w.wom_key, w.platform, w.source_url, w.author, w.author_handle,
           w.title, w.content, w.hashtags, w.topic, w.theme, w.sentiment,
           w.views, w.likes, w.replies, w.reposts, w.engagement_rate,
           w.buzz_score, w.posted_at,
           1 - (w.embedding <=> q.v) AS similarity
    FROM public.word_of_mouth w, q
    WHERE w.embedding IS NOT NULL
      AND q.v IS NOT NULL
      AND w.duplicate_of IS NULL
      AND NOT (w.wom_key = ANY(COALESCE(_exclude_keys, '{}')))
    ORDER BY w.embedding <=> q.v
    LIMIT LEAST(GREATEST(COALESCE(_pool, 120), 20), 200)
  ),
  scored AS (
    SELECT p.*,
      percent_rank() OVER (ORDER BY p.similarity) AS sim_pr,
      percent_rank() OVER (ORDER BY p.buzz_score) AS buzz_pr,
      ((hashtext(p.wom_key || ':' || _seed::text)::bigint + 2147483649) / 4294967297.0) AS u
    FROM pool p
  )
  SELECT s.wom_key, s.platform, s.source_url, s.author, s.author_handle,
         s.title, s.content, s.hashtags, s.topic, s.theme, s.sentiment,
         s.views, s.likes, s.replies, s.reposts, s.engagement_rate,
         s.buzz_score, s.posted_at, s.similarity,
         (0.5 * s.sim_pr + 0.5 * s.buzz_pr) AS combined_score
  FROM scored s
  ORDER BY POWER(s.u, 1.0 / GREATEST(0.5 * s.sim_pr + 0.5 * s.buzz_pr, 0.05)) DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 12), 1), 50)
$$;

REVOKE ALL ON FUNCTION public.company_word_of_mouth_v2(uuid, integer, integer, integer, extensions.vector, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_word_of_mouth_v2(uuid, integer, integer, integer, extensions.vector, text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.company_word_of_mouth(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_word_of_mouth(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.company_trends(_company_id uuid, _limit integer DEFAULT 24)
RETURNS TABLE(trend_key text, platform text, title text, caption text, hashtags text[],
              format text, source_url text, author text, views bigint, likes bigint,
              engagement_rate numeric, trend_score numeric, relevance_rank integer)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT t.trend_key, t.platform, t.title, t.caption, t.hashtags, t.format, t.source_url,
         t.author, t.views, t.likes, t.engagement_rate, t.trend_score, ct.relevance_rank
  FROM public.companies c
  JOIN public.category_trends ct ON ct.category_id = c.category_id
  JOIN public.trends t ON t.trend_key = ct.trend_key
  WHERE c.id = _company_id
    AND t.duplicate_of IS NULL
  ORDER BY ct.relevance_rank ASC, t.trend_score DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 24), 1), 200)
$$;