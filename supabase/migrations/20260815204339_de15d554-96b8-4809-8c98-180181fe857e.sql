CREATE TABLE public.word_of_mouth (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wom_key text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'twitter',
  source_url text NOT NULL DEFAULT '',
  author text NOT NULL DEFAULT '',
  author_handle text NOT NULL DEFAULT '',
  author_followers bigint NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  hashtags text[] NOT NULL DEFAULT '{}',
  mentions text[] NOT NULL DEFAULT '{}',
  topic text NOT NULL DEFAULT 'trends',
  theme text NOT NULL DEFAULT '',
  sentiment text NOT NULL DEFAULT 'neutral',
  query text NOT NULL DEFAULT '',
  views bigint NOT NULL DEFAULT 0,
  likes bigint NOT NULL DEFAULT 0,
  replies bigint NOT NULL DEFAULT 0,
  reposts bigint NOT NULL DEFAULT 0,
  quotes bigint NOT NULL DEFAULT 0,
  engagement_rate numeric NOT NULL DEFAULT 0,
  buzz_score numeric NOT NULL DEFAULT 0,
  posted_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.word_of_mouth TO anon, authenticated;
GRANT ALL ON public.word_of_mouth TO service_role;
ALTER TABLE public.word_of_mouth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Word of mouth is publicly readable" ON public.word_of_mouth FOR SELECT USING (true);

CREATE INDEX word_of_mouth_buzz_idx ON public.word_of_mouth (buzz_score DESC);
CREATE INDEX word_of_mouth_topic_idx ON public.word_of_mouth (topic);
CREATE INDEX word_of_mouth_hashtags_idx ON public.word_of_mouth USING gin (hashtags);

CREATE TRIGGER word_of_mouth_set_updated_at BEFORE UPDATE ON public.word_of_mouth
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.category_word_of_mouth (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  wom_key text NOT NULL REFERENCES public.word_of_mouth(wom_key) ON DELETE CASCADE,
  relevance_rank integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, wom_key)
);

GRANT SELECT ON public.category_word_of_mouth TO anon, authenticated;
GRANT ALL ON public.category_word_of_mouth TO service_role;
ALTER TABLE public.category_word_of_mouth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Category word of mouth is publicly readable" ON public.category_word_of_mouth FOR SELECT USING (true);

CREATE INDEX category_word_of_mouth_rank_idx ON public.category_word_of_mouth (category_id, relevance_rank);

CREATE OR REPLACE FUNCTION public.company_word_of_mouth(_company_id uuid, _limit integer DEFAULT 24)
RETURNS TABLE(wom_key text, platform text, source_url text, author text, author_handle text,
  title text, content text, hashtags text[], topic text, theme text, sentiment text,
  views bigint, likes bigint, replies bigint, reposts bigint, engagement_rate numeric,
  buzz_score numeric, posted_at timestamptz, relevance_rank integer)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT w.wom_key, w.platform, w.source_url, w.author, w.author_handle,
         w.title, w.content, w.hashtags, w.topic, w.theme, w.sentiment,
         w.views, w.likes, w.replies, w.reposts, w.engagement_rate,
         w.buzz_score, w.posted_at, cw.relevance_rank
  FROM public.companies c
  JOIN public.category_word_of_mouth cw ON cw.category_id = c.category_id
  JOIN public.word_of_mouth w ON w.wom_key = cw.wom_key
  WHERE c.id = _company_id
  ORDER BY cw.relevance_rank ASC, w.buzz_score DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 24), 1), 200)
$$;