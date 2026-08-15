CREATE TABLE public.image_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_key text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'instagram',
  source_url text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  thumbnail_url text NOT NULL DEFAULT '',
  author text NOT NULL DEFAULT '',
  author_handle text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  hashtags text[] NOT NULL DEFAULT '{}',
  format text NOT NULL DEFAULT 'image',
  query text NOT NULL DEFAULT '',
  likes bigint NOT NULL DEFAULT 0,
  comments bigint NOT NULL DEFAULT 0,
  engagement_rate numeric NOT NULL DEFAULT 0,
  buzz_score numeric NOT NULL DEFAULT 0,
  posted_at timestamp with time zone,
  raw jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.image_assets TO anon;
GRANT SELECT ON public.image_assets TO authenticated;
GRANT ALL ON public.image_assets TO service_role;
ALTER TABLE public.image_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Image assets are public to read" ON public.image_assets FOR SELECT USING (true);
CREATE TRIGGER image_assets_set_updated_at BEFORE UPDATE ON public.image_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.category_image_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  image_key text NOT NULL REFERENCES public.image_assets(image_key) ON DELETE CASCADE,
  relevance_rank integer NOT NULL DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (category_id, image_key)
);

GRANT SELECT ON public.category_image_assets TO anon;
GRANT SELECT ON public.category_image_assets TO authenticated;
GRANT ALL ON public.category_image_assets TO service_role;
ALTER TABLE public.category_image_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Category image links are public to read" ON public.category_image_assets FOR SELECT USING (true);

CREATE INDEX image_assets_buzz_idx ON public.image_assets (buzz_score DESC);
CREATE INDEX category_image_assets_category_idx ON public.category_image_assets (category_id, relevance_rank);

CREATE OR REPLACE FUNCTION public.company_image_assets(_company_id uuid, _limit integer DEFAULT 24)
RETURNS TABLE(image_key text, platform text, source_url text, image_url text, thumbnail_url text, author text, author_handle text, title text, caption text, hashtags text[], likes bigint, comments bigint, engagement_rate numeric, buzz_score numeric, posted_at timestamp with time zone, relevance_rank integer)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT i.image_key, i.platform, i.source_url, i.image_url, i.thumbnail_url, i.author, i.author_handle,
         i.title, i.caption, i.hashtags, i.likes, i.comments, i.engagement_rate, i.buzz_score,
         i.posted_at, ci.relevance_rank
  FROM public.companies c
  JOIN public.category_image_assets ci ON ci.category_id = c.category_id
  JOIN public.image_assets i ON i.image_key = ci.image_key
  WHERE c.id = _company_id
  ORDER BY ci.relevance_rank ASC, i.buzz_score DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 24), 1), 200)
$$;