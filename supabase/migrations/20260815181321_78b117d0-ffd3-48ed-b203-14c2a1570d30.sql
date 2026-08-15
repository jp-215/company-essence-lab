-- Vira prescript library: 100 general-purpose viral ad prescripts,
-- mapped to categories via the prescript primary identifier key.
CREATE TABLE public.prescripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescript_key text NOT NULL UNIQUE,
  title text NOT NULL,
  platform text NOT NULL,
  format text NOT NULL,
  angle text NOT NULL,
  hook text NOT NULL,
  rationale text NOT NULL DEFAULT '',
  script text NOT NULL,
  cta text NOT NULL DEFAULT '',
  trend_score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.prescripts TO anon, authenticated;
GRANT ALL ON public.prescripts TO service_role;
ALTER TABLE public.prescripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY prescripts_public_read ON public.prescripts FOR SELECT USING (true);

CREATE TABLE public.category_prescripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  prescript_key text NOT NULL REFERENCES public.prescripts(prescript_key) ON DELETE CASCADE,
  relevance_rank integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, prescript_key)
);
CREATE INDEX category_prescripts_category_idx ON public.category_prescripts (category_id, relevance_rank);
CREATE INDEX category_prescripts_key_idx ON public.category_prescripts (prescript_key);
GRANT SELECT ON public.category_prescripts TO anon, authenticated;
GRANT ALL ON public.category_prescripts TO service_role;
ALTER TABLE public.category_prescripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY category_prescripts_public_read ON public.category_prescripts FOR SELECT USING (true);

-- Owner-scoped remixes of a prescript for one company.
CREATE TABLE public.company_remixes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  prescript_key text NOT NULL REFERENCES public.prescripts(prescript_key) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT '',
  hook text NOT NULL DEFAULT '',
  script text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  hashtags text[] NOT NULL DEFAULT '{}',
  differentiator text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_remixes_company_idx ON public.company_remixes (company_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_remixes TO authenticated;
GRANT ALL ON public.company_remixes TO service_role;
ALTER TABLE public.company_remixes ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_remixes_owner_all ON public.company_remixes FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER company_remixes_set_updated_at BEFORE UPDATE ON public.company_remixes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Mapping protocol: prescripts available to a company through its category.
CREATE OR REPLACE FUNCTION public.company_prescripts(_company_id uuid, _limit integer DEFAULT 24)
RETURNS TABLE(prescript_key text, title text, platform text, format text, angle text,
              hook text, rationale text, script text, cta text, trend_score numeric,
              relevance_rank integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p.prescript_key, p.title, p.platform, p.format, p.angle, p.hook, p.rationale,
         p.script, p.cta, p.trend_score, cp.relevance_rank
  FROM public.companies c
  JOIN public.category_prescripts cp ON cp.category_id = c.category_id
  JOIN public.prescripts p ON p.prescript_key = cp.prescript_key
  WHERE c.id = _company_id
  ORDER BY cp.relevance_rank ASC, p.trend_score DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 24), 1), 100)
$$;

-- Seed 100 general-purpose prescripts deterministically, keyed VIRA-PS-001..100
WITH fmt AS (
  SELECT * FROM unnest(ARRAY['ugc_testimonial','founder_story','unboxing','before_after','problem_solution','street_interview','day_in_the_life','asmr_demo','listicle','duet_reaction']) WITH ORDINALITY AS f(format, fi)
), ang AS (
  SELECT * FROM unnest(
    ARRAY['Pain-first hook','Price objection flip','Social proof stack','Founder credibility','Contrarian take','Transformation timeline','Curiosity gap','Ritual framing','Gift positioning','Comparison grid'],
    ARRAY['Name the frustration in the first second, then reveal the product as relief.',
          'Compare the cost of the old way against the product over one month.',
          'Rapid-fire cuts of real customers with on-screen quotes.',
          'Founder explains why the category is broken and what they changed.',
          'State the popular advice, disagree, then prove it with the product.',
          'Day 1 vs day 30 with timestamps and identical framing.',
          'Tease the result, withhold the mechanism until the mid-point.',
          'Position the product inside an existing daily habit.',
          'Frame the product as the obvious gift for a specific person.',
          'Side-by-side against the generic alternative on four criteria.'],
    ARRAY['POV: you finally stopped settling in this category',
          '$8 vs $80: the honest test',
          'Nobody talks about this — here is the fix',
          'I built this because every option failed me',
          'Stop buying the popular one until you watch this',
          '30 days, same camera angle, real result',
          'This is why your current one keeps failing you',
          'The 20-second routine that actually stuck',
          'The gift everyone screenshots this year',
          'Watch me put the viral option head to head']
  ) WITH ORDINALITY AS a(angle, rationale, hook, ai)
)
INSERT INTO public.prescripts (prescript_key, title, platform, format, angle, hook, rationale, script, cta, trend_score)
SELECT
  'VIRA-PS-' || lpad((( (fi-1)*10 + ai ))::text, 3, '0'),
  a.angle || ' — ' || replace(f.format, '_', ' '),
  (ARRAY['tiktok','instagram','youtube','facebook'])[1 + ((fi + ai) % 4)],
  f.format,
  a.angle,
  a.hook,
  a.rationale,
  '0-2s hook: ' || a.hook || E'\n'
  || '2-5s agitate: show the failure state of the old way in one unbroken shot.' || E'\n'
  || '5-12s reveal: product in hand, one clear benefit said out loud.' || E'\n'
  || '12-20s proof: metric, review screenshot, or side-by-side comparison.' || E'\n'
  || '20-25s objection: answer the top comment objection on screen.' || E'\n'
  || '25-28s CTA: ' || (ARRAY['Shop the link in bio','Tap to try it risk-free','Use code VIRA for your first order','Comment SEND and we DM the link','Grab yours before the restock sells out','Book the 2-minute fit quiz'])[1 + ((fi * ai) % 6)],
  (ARRAY['Shop the link in bio','Tap to try it risk-free','Use code VIRA for your first order','Comment SEND and we DM the link','Grab yours before the restock sells out','Book the 2-minute fit quiz'])[1 + ((fi * ai) % 6)],
  round(0.55 + (((fi * 7 + ai * 3) % 40)::numeric / 100), 2)
FROM fmt f CROSS JOIN ang a
ON CONFLICT (prescript_key) DO NOTHING;

-- Mapping protocol: every category is mapped to prescripts by primary identifier key.
INSERT INTO public.category_prescripts (category_id, prescript_key, relevance_rank)
SELECT c.id, p.prescript_key,
       1 + ((abs(hashtext(c.slug || p.prescript_key)) % 3))
FROM public.categories c
CROSS JOIN public.prescripts p
WHERE abs(hashtext(c.slug || p.prescript_key)) % 100 < 40
ON CONFLICT (category_id, prescript_key) DO NOTHING;

-- Safety net: guarantee at least 12 prescripts per category.
INSERT INTO public.category_prescripts (category_id, prescript_key, relevance_rank)
SELECT c.id, p.prescript_key, 3
FROM public.categories c
JOIN LATERAL (
  SELECT prescript_key FROM public.prescripts p2
  WHERE NOT EXISTS (
    SELECT 1 FROM public.category_prescripts cp WHERE cp.category_id = c.id AND cp.prescript_key = p2.prescript_key
  )
  ORDER BY p2.trend_score DESC LIMIT 12
) p ON true
WHERE (SELECT count(*) FROM public.category_prescripts cp2 WHERE cp2.category_id = c.id) < 12
ON CONFLICT (category_id, prescript_key) DO NOTHING;