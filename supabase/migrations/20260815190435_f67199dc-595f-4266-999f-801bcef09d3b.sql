ALTER TABLE public.company_remixes DROP CONSTRAINT IF EXISTS company_remixes_prescript_key_fkey;
ALTER TABLE public.company_remixes ALTER COLUMN prescript_key DROP NOT NULL;
ALTER TABLE public.company_remixes ADD COLUMN IF NOT EXISTS trend_key text;
ALTER TABLE public.company_remixes ADD COLUMN IF NOT EXISTS source_url text NOT NULL DEFAULT '';
ALTER TABLE public.company_remixes ADD COLUMN IF NOT EXISTS trend_title text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS company_remixes_trend_key_idx ON public.company_remixes (trend_key);