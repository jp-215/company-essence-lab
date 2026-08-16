CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.image_signals (
  image_key TEXT PRIMARY KEY,
  model TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  signal_quality TEXT NOT NULL DEFAULT 'high',
  usable BOOLEAN NOT NULL DEFAULT TRUE,
  blockers TEXT[] NOT NULL DEFAULT '{}',
  copy_roles JSONB NOT NULL DEFAULT '{}'::jsonb,
  sentiment JSONB NOT NULL DEFAULT '{}'::jsonb,
  texture JSONB NOT NULL DEFAULT '{}'::jsonb,
  composition JSONB NOT NULL DEFAULT '{}'::jsonb,
  motion JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.image_signals TO authenticated;
GRANT SELECT ON public.image_signals TO anon;
GRANT ALL ON public.image_signals TO service_role;

ALTER TABLE public.image_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Image signals are readable by everyone"
  ON public.image_signals FOR SELECT
  USING (true);

CREATE INDEX image_signals_status_idx ON public.image_signals (status);

CREATE TABLE public.video_briefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  lane TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'fast',
  duration_seconds INTEGER NOT NULL DEFAULT 8,
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  image_keys TEXT[] NOT NULL DEFAULT '{}',
  trend_keys TEXT[] NOT NULL DEFAULT '{}',
  brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  engine_job_id TEXT,
  engine_video_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_briefs TO authenticated;
GRANT ALL ON public.video_briefs TO service_role;

ALTER TABLE public.video_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their video briefs"
  ON public.video_briefs FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX video_briefs_company_idx ON public.video_briefs (company_id, created_at DESC);

CREATE TRIGGER update_image_signals_updated_at
  BEFORE UPDATE ON public.image_signals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER update_video_briefs_updated_at
  BEFORE UPDATE ON public.video_briefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();