CREATE TABLE public.image_remixes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_key text NOT NULL REFERENCES public.image_assets(image_key) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ready',
  headline text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  prompt text NOT NULL DEFAULT '',
  source_ocr_text text NOT NULL DEFAULT '',
  storage_path text,
  provider text NOT NULL DEFAULT 'gemini-image',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX image_remixes_owner_idx ON public.image_remixes (owner_id, created_at DESC);
CREATE INDEX image_remixes_company_idx ON public.image_remixes (company_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_remixes TO authenticated;
GRANT ALL ON public.image_remixes TO service_role;

ALTER TABLE public.image_remixes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their image remixes"
  ON public.image_remixes FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER image_remixes_updated_at
  BEFORE UPDATE ON public.image_remixes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Owners read their remixed image files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'remix-images' AND (storage.foldername(name))[1] = auth.uid()::text);