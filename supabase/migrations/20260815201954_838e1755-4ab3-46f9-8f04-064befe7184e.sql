-- NOTE: this migration is a byte-duplicate of 20260815195006_951bcce3-... (already applied
-- on the hosted DB). Every statement is guarded so a fresh replay of the folder succeeds.

-- Content-based trend recommendations: embed trends and rank by similarity to a company profile.

ALTER TABLE public.trends ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536);

CREATE INDEX IF NOT EXISTS trends_embedding_idx ON public.trends
USING hnsw (embedding extensions.vector_cosine_ops);

-- Ranks trends for a company by cosine similarity between the trend embedding and either
-- the caller-supplied query embedding or the company's stored knowledge embedding.
-- Two-stage: an HNSW-friendly candidate pool (_limit * 4 nearest neighbours), then a
-- re-rank blending semantic similarity with a virality percentile computed over the pool:
--   combined_score = 0.8 * similarity + 0.2 * percent_rank(trend_score)
CREATE OR REPLACE FUNCTION public.recommend_company_trends(
  _company_id uuid,
  _limit integer DEFAULT 12,
  _query_embedding extensions.vector(1536) DEFAULT NULL
)
RETURNS TABLE(trend_key text, platform text, title text, caption text, hashtags text[],
              format text, source_url text, author text, views bigint, likes bigint,
              engagement_rate numeric, trend_score numeric,
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
    SELECT t.trend_key, t.platform, t.title, t.caption, t.hashtags, t.format, t.source_url,
           t.author, t.views, t.likes, t.engagement_rate, t.trend_score,
           1 - (t.embedding <=> q.v) AS similarity
    FROM public.trends t, q
    WHERE t.embedding IS NOT NULL
      AND q.v IS NOT NULL
    ORDER BY t.embedding <=> q.v
    LIMIT LEAST(GREATEST(COALESCE(_limit, 12), 1), 24) * 4
  )
  SELECT p.trend_key, p.platform, p.title, p.caption, p.hashtags, p.format, p.source_url,
         p.author, p.views, p.likes, p.engagement_rate, p.trend_score,
         p.similarity,
         0.8 * p.similarity + 0.2 * percent_rank() OVER (ORDER BY p.trend_score) AS combined_score
  FROM pool p
  ORDER BY combined_score DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 12), 1), 24)
$$;

REVOKE ALL ON FUNCTION public.recommend_company_trends(uuid, integer, extensions.vector) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recommend_company_trends(uuid, integer, extensions.vector) TO authenticated, service_role;
