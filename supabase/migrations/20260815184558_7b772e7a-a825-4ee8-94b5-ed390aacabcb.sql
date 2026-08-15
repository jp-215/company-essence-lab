CREATE TABLE public.trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_key text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'tiktok',
  source_url text NOT NULL DEFAULT '',
  author text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  hashtags text[] NOT NULL DEFAULT '{}',
  music text NOT NULL DEFAULT '',
  format text NOT NULL DEFAULT '',
  query text NOT NULL DEFAULT '',
  views bigint NOT NULL DEFAULT 0,
  likes bigint NOT NULL DEFAULT 0,
  comments bigint NOT NULL DEFAULT 0,
  shares bigint NOT NULL DEFAULT 0,
  engagement_rate numeric NOT NULL DEFAULT 0,
  trend_score numeric NOT NULL DEFAULT 0,
  posted_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.trends TO anon;
GRANT SELECT ON public.trends TO authenticated;
GRANT ALL ON public.trends TO service_role;
ALTER TABLE public.trends ENABLE ROW LEVEL SECURITY;
CREATE POLICY trends_public_read ON public.trends FOR SELECT USING (true);

CREATE INDEX trends_score_idx ON public.trends (trend_score DESC);
CREATE INDEX trends_platform_idx ON public.trends (platform);
CREATE INDEX trends_hashtags_idx ON public.trends USING gin (hashtags);

CREATE TRIGGER trends_set_updated_at BEFORE UPDATE ON public.trends
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.category_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  trend_key text NOT NULL REFERENCES public.trends(trend_key) ON DELETE CASCADE,
  relevance_rank integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, trend_key)
);

GRANT SELECT ON public.category_trends TO anon;
GRANT SELECT ON public.category_trends TO authenticated;
GRANT ALL ON public.category_trends TO service_role;
ALTER TABLE public.category_trends ENABLE ROW LEVEL SECURITY;
CREATE POLICY category_trends_public_read ON public.category_trends FOR SELECT USING (true);

CREATE INDEX category_trends_category_idx ON public.category_trends (category_id, relevance_rank);

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
  ORDER BY ct.relevance_rank ASC, t.trend_score DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 24), 1), 200)
$$;